import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { Role } from '../src/common/enums/role.enum';
import { configureApp } from '../src/configure-app';
import { MailService } from '../src/mail/mail.service';
import { UsersService } from '../src/users/users.service';
import { SyncService } from '../src/sync/sync.service';

describe('Database change stream -> authenticated live clients', () => {
  let app: INestApplication;
  let replica: MongoMemoryReplSet;
  let connection: Connection;
  let base: string;
  let token: string;
  const controllers: AbortController[] = [];

  beforeAll(async () => {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replica.getUri('djon_sync_test');
    process.env.JWT_SECRET = 'sync-test-secret-with-at-least-32-characters';
    process.env.API_PREFIX = 'api/v1';
    process.env.WEB_PUSH_PUBLIC_KEY = '';
    process.env.WEB_PUSH_PRIVATE_KEY = '';
    const { AppModule } =
      jest.requireActual<typeof import('../src/app.module')>(
        '../src/app.module',
      );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendTemporaryPassword: jest.fn().mockResolvedValue(undefined),
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
    connection = app.get<Connection>(getConnectionToken());
    expect(connection.name).toBe('djon_sync_test');
    await app.get(UsersService).create({
      name: 'Sync Test',
      email: 'sync@example.test',
      password: 'SyncTest@123',
      role: Role.Admin,
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'sync@example.test', password: 'SyncTest@123' })
      .expect(201);
    token = (login.body as { accessToken: string }).accessToken;
  }, 60_000);

  afterAll(async () => {
    controllers.forEach((controller) => controller.abort());
    await app?.close();
    await replica?.stop();
  });

  async function client() {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(`${base}/sync/stream`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('content-encoding')).toBeNull();
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    return {
      close: () => controller.abort(),
      until: async (matches: (frame: string) => boolean) => {
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          for (;;) {
            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              if (matches(frame)) return frame;
            }
            const next = await reader.read();
            if (next.done)
              throw new Error('Stream ended before the expected event');
            buffer += decoder
              .decode(next.value, { stream: true })
              .replace(/\r/g, '');
          }
        } finally {
          clearTimeout(timeout);
        }
      },
    };
  }

  it('rejects anonymous stream connections', async () => {
    await request(app.getHttpServer()).get('/api/v1/sync/stream').expect(401);
  });

  it('notifies two open clients after a committed database update and deletion', async () => {
    const first = await client();
    const second = await client();
    await Promise.all([
      first.until((frame) => frame.includes('event: ready')),
      second.until((frame) => frame.includes('event: ready')),
    ]);
    expect(app.get(SyncService).isConnected()).toBe(true);
    // Direct DB writes also cover other API instances and background jobs.
    const record = await connection
      .db!.collection('events')
      .insertOne({ title: 'Private test marker' });
    const frames = await Promise.all([
      first.until((frame) => frame.includes('"events"')),
      second.until((frame) => frame.includes('"events"')),
    ]);
    frames.forEach((frame) => {
      expect(frame).toContain('event: invalidate');
      expect(frame).not.toContain('Private test marker');
      expect(frame).not.toContain(record.insertedId.toString());
    });
    await connection
      .db!.collection('events')
      .deleteOne({ _id: record.insertedId });
    await first.until((frame) => frame.includes('"events"'));
    first.close();
    second.close();
  });

  it('announces readiness again after reconnect, covering missed changes', async () => {
    const before = await client();
    await before.until((frame) => frame.includes('event: ready'));
    before.close();
    await connection
      .db!.collection('materials')
      .insertOne({ title: 'Changed while suspended' });
    const resumed = await client();
    await resumed.until((frame) => frame.includes('event: ready'));
    resumed.close();
    const health = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect((health.body as { liveSync: boolean }).liveSync).toBe(true);
  });
});
