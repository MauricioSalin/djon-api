import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'node:child_process';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { BookingType } from '../src/bookings/schemas/booking.schema';
import { Role } from '../src/common/enums/role.enum';
import { configureApp } from '../src/configure-app';
import { EventType } from '../src/events/schemas/event.schema';
import { EquipmentsService } from '../src/equipments/equipments.service';
import { UnitsService } from '../src/units/units.service';
import { UsersService } from '../src/users/users.service';

describe('DJ ON API (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mongoContainerName: string;
  const password = 'SenhaTeste@2026';
  const tokens: Partial<Record<Role, string>> = {};
  let secondStudentToken: string;
  let managedStudentToken: string;
  let managedStudentId: string;
  let bookingId: string;
  let eventId: string;
  let categoryId: string;
  let materialId: string;
  let leadId: string;
  let unitId: string;
  let professorId: string;
  let equipmentId: string;
  let loginIpOctet = 10;

  beforeAll(async () => {
    const databaseName = `djon_e2e_${Date.now()}`;
    mongoContainerName = `djon-api-e2e-${process.pid}`;
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        mongoContainerName,
        '-p',
        '127.0.0.1::27017',
        'mongo:8.0',
      ],
      { stdio: 'pipe' },
    );
    const publishedPort = execFileSync(
      'docker',
      ['port', mongoContainerName, '27017/tcp'],
      { encoding: 'utf8' },
    ).trim();
    const port = publishedPort.slice(publishedPort.lastIndexOf(':') + 1);
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${port}/${databaseName}`;
    process.env.JWT_SECRET = 'e2e-secret-with-at-least-32-characters';
    process.env.JWT_EXPIRES_IN_SECONDS = '3600';
    process.env.API_PREFIX = 'api/v1';
    process.env.SEED_DEFAULT_PASSWORD = password;

    const { AppModule } =
      jest.requireActual<typeof import('../src/app.module')>(
        '../src/app.module',
      );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    configureApp(app);
    await app.init();
    connection = app.get<Connection>(getConnectionToken());

    if (!connection.name.startsWith('djon_e2e_')) {
      throw new Error(`Banco E2E inseguro: ${connection.name}`);
    }

    const unit = await app.get(UnitsService).create({
      key: 'poa',
      label: 'Porto Alegre / RS',
      shortLabel: 'POA',
      address: 'Unidade de teste',
    });
    unitId = String(unit.id);

    const users = app.get(UsersService);
    await users.create({
      name: 'Admin Teste',
      email: 'admin@teste.com',
      password,
      role: Role.Admin,
    });
    const professor = await users.create({
      name: 'Professor Teste',
      email: 'professor@teste.com',
      password,
      role: Role.Professor,
      unitId,
    });
    professorId = String(professor.id);
    await users.create({
      name: 'Aluno Um',
      email: 'aluno1@teste.com',
      password,
      role: Role.Student,
      unitId,
    });
    await users.create({
      name: 'Aluno Dois',
      email: 'aluno2@teste.com',
      password,
      role: Role.Student,
      unitId,
    });
    const equipment = await app.get(EquipmentsService).create({
      name: 'CDJ E2E',
      description: 'Setup usado nos testes automatizados.',
      unitId,
    });
    equipmentId = String(equipment._id);

    for (const [role, email] of [
      [Role.Admin, 'admin@teste.com'],
      [Role.Professor, 'professor@teste.com'],
      [Role.Student, 'aluno1@teste.com'],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
        .send({ email, password })
        .expect(201);
      tokens[role] = response.body.accessToken as string;
    }
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
      .send({ email: 'aluno2@teste.com', password })
      .expect(201);
    secondStudentToken = second.body.accessToken as string;
  }, 120_000);

  afterAll(async () => {
    if (connection?.name.startsWith('djon_e2e_')) {
      await connection.dropDatabase();
    }
    await app?.close();
    if (mongoContainerName) {
      try {
        execFileSync('docker', ['stop', mongoContainerName], { stdio: 'pipe' });
      } catch {
        // O container pode já ter sido encerrado pelo Docker (--rm).
      }
    }
  });

  it('expõe health e recebe lead sem autenticação', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ok'));
    const lead = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({
        firstName: 'Visitante',
        email: 'visitante@teste.com',
        message: 'Quero conhecer o curso.',
        unitKey: 'poa',
      })
      .expect(201)
      .expect(({ body }) => expect(body.received).toBe(true));
    leadId = String(lead.body.id);
  });

  it('permite ao administrador tratar o contato recebido', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.some((lead: { id: string }) => lead.id === leadId)).toBe(
          true,
        ),
      );
    await request(app.getHttpServer())
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ status: 'contatado', internalNotes: 'Contato validado no E2E.' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('contatado'));
  });

  it('protege rotas e aplica RBAC', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(1);
        expect(body.items[0].role).toBe(Role.Professor);
      });
    await request(app.getHttpServer())
      .get('/api/v1/users?role=student')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/users?role=student')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(2));

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        name: 'Sem Senha',
        email: 'sem-senha@teste.com',
        role: Role.Student,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        name: 'Aluno sem unidade',
        email: 'aluno-sem-unidade@teste.com',
        password,
        role: Role.Student,
      })
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe('Unidade é obrigatória para alunos.'),
      );
  });

  it('executa o ciclo administrativo completo de um aluno', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        name: 'Aluno Gerenciado',
        email: 'aluno-gerenciado@teste.com',
        password,
        role: Role.Student,
        unitId,
        whatsapp: '51999990000',
        cpf: '000.000.000-00',
        birthDate: '2000-01-02',
        trainingHoursLimit: 12,
      })
      .expect(201);
    managedStudentId = String(created.body.id);
    expect(created.body.trainingHoursLimit).toBe(12);
    expect(created.body.unitId.id).toBe(unitId);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${managedStudentId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Aluno Gerenciado Atualizado', whatsapp: '51988880000' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('Aluno Gerenciado Atualizado');
        expect(body.whatsapp).toBe('51988880000');
      });

    await request(app.getHttpServer())
      .delete(`/api/v1/users/${managedStudentId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => expect(body.active).toBe(false));

    await request(app.getHttpServer())
      .get('/api/v1/users?includeInactive=true')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => {
        const managed = body.items.find(
          (item: { id: string }) => item.id === managedStudentId,
        );
        expect(managed.active).toBe(false);
        expect(managed.trainingHoursLimit).toBe(12);
      });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
      .send({
        email: 'aluno-gerenciado@teste.com',
        password: 'senha-incorreta',
      })
      .expect(401)
      .expect(({ body }) =>
        expect(body.message).toBe('E-mail ou senha inválidos.'),
      );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
      .send({ email: 'aluno-gerenciado@teste.com', password })
      .expect(403)
      .expect(({ body }) =>
        expect(body.message).toBe(
          'Sua conta está desativada. Entre em contato com a administração para recuperar o acesso.',
        ),
      );

    await request(app.getHttpServer())
      .post(`/api/v1/users/${managedStudentId}/restore`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(201)
      .expect(({ body }) => expect(body.active).toBe(true));

    const login = await app.get(AuthService).login({
      email: 'aluno-gerenciado@teste.com',
      password,
    });
    managedStudentToken = login.accessToken;
  });

  it('envia, substitui e remove avatar e banner do perfil no R2', async () => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const uploadImage = (purpose: 'avatar' | 'banner') =>
      request(app.getHttpServer())
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${managedStudentToken}`)
        .field('purpose', purpose)
        .attach('file', pixel, {
          filename: `${purpose}-${Date.now()}.png`,
          contentType: 'image/png',
        })
        .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${managedStudentToken}`)
      .field('purpose', 'avatar')
      .attach('file', Buffer.from('nao-e-imagem'), {
        filename: 'avatar.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    const firstAvatar = await uploadImage('avatar');
    const banner = await uploadImage('banner');
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${managedStudentToken}`)
      .send({ avatar: firstAvatar.body.url, banner: banner.body.url })
      .expect(200)
      .expect(({ body }) => {
        expect(body.avatar).toBe(firstAvatar.body.url);
        expect(body.banner).toBe(banner.body.url);
      });

    const nextAvatar = await uploadImage('avatar');
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${managedStudentToken}`)
      .send({ avatar: nextAvatar.body.url })
      .expect(200);
    await request(app.getHttpServer())
      .get(String(firstAvatar.body.url))
      .expect(404);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${managedStudentToken}`)
      .send({ avatar: '', banner: '' })
      .expect(200);
    await request(app.getHttpServer())
      .get(String(nextAvatar.body.url))
      .expect(404);
    await request(app.getHttpServer()).get(String(banner.body.url)).expect(404);
  });

  it('altera a própria senha e autentica com a nova credencial', async () => {
    const newPassword = 'NovaSenha@2026';
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ currentPassword: password, newPassword })
      .expect(200)
      .expect(({ body }) => expect(body.changed).toBe(true));
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
      .send({ email: 'aluno1@teste.com', password: newPassword })
      .expect(201);
  });

  it('cadastra e remove uma assinatura de push', async () => {
    const endpoint = 'https://push.example.test/subscription/e2e';
    await request(app.getHttpServer())
      .post('/api/v1/notifications/push-subscriptions')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ endpoint, p256dh: 'chave-publica-e2e', auth: 'auth-e2e' })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/notifications/push-subscriptions')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ endpoint })
      .expect(200);
  });

  it('cria treino pendente, impede conflito e permite aprovação', async () => {
    const forbiddenLesson = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Aula solicitada pelo aluno',
        date: '2030-08-20',
        time: '18:00',
        type: BookingType.Lesson,
        unitId,
        professorId,
        equipmentId,
      });
    expect({
      status: forbiddenLesson.status,
      message: forbiddenLesson.body.message,
    }).toEqual({
      status: 403,
      message:
        'Alunos podem solicitar apenas treinos. Aulas são agendadas pelos professores ou pela administração.',
    });

    await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Treino sem equipamento',
        date: '2030-08-20',
        time: '18:00',
        type: BookingType.Training,
        unitId,
      })
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe('Selecione o equipamento.'),
      );

    const created = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Treino de Beat Match',
        date: '2030-08-20',
        time: '19:00',
        type: BookingType.Training,
        unitId,
        equipmentId,
        durationMinutes: 120,
        notes: 'Revisar transições.',
      })
      .expect(201);
    bookingId = created.body.id as string;
    expect(created.body.type).toBe(BookingType.Training);
    expect(created.body.status).toBe('pendente');
    expect(created.body.durationMinutes).toBe(120);
    expect(created.body.equipmentId.id).toBe(equipmentId);

    await request(app.getHttpServer())
      .get(
        `/api/v1/bookings/availability?date=2030-08-20&unitId=${unitId}&type=treino&equipmentId=${equipmentId}`,
      )
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.occupiedTimes).toContain('19:00'));

    await request(app.getHttpServer())
      .get('/api/v1/bookings/training-balance')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.limitHours).toBe(8);
        expect(body.reservedHours).toBe(2);
        expect(body.remainingHours).toBe(6);
      });

    await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .send({
        title: 'Mesmo horário',
        date: '2030-08-20',
        time: '19:00',
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${bookingId}/approve`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('confirmado'));

    await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some(
            (item: { type: string }) => item.type === 'booking.confirmado',
          ),
        ).toBe(true),
      );
  });

  it('restringe a remoção e exclui o agendamento para a administração', async () => {
    const student = await connection
      .collection('users')
      .findOne({ email: 'aluno1@teste.com' });
    const created = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        studentId: student?._id,
        title: 'Agendamento removível',
        date: '2030-08-26',
        time: '12:00',
        type: BookingType.Training,
        status: 'pendente',
        unitId,
        equipmentId,
      })
      .expect(201);
    expect(created.body.status).toBe('confirmado');
    const removableId = String(created.body.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${removableId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ status: 'pendente' })
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe(
          'Somente solicitações de treino feitas por alunos podem ficar pendentes.',
        ),
      );

    await request(app.getHttpServer())
      .delete(`/api/v1/bookings/${removableId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/bookings/${removableId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(removableId));

    await request(app.getHttpServer())
      .get(`/api/v1/bookings/${removableId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(404);
  });

  it('aprova remarcação por edição e cancela o agendamento original', async () => {
    const original = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        studentId: (
          await connection
            .collection('users')
            .findOne({ email: 'aluno1@teste.com' })
        )?._id,
        title: 'Treino original',
        date: '2030-08-21',
        time: '18:00',
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(201);

    const rescheduled = await request(app.getHttpServer())
      .post(`/api/v1/bookings/${String(original.body.id)}/reschedule`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Treino remarcado',
        date: '2030-08-22',
        time: '18:00',
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${String(rescheduled.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({ status: 'confirmado', notes: 'Aprovado após ajuste.' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('confirmado');
        expect(body.notes).toContain('Aprovado');
      });

    await request(app.getHttpServer())
      .get(`/api/v1/bookings/${String(original.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('cancelado'));
  });

  it('mantém unidades inativas fora da rota pública', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        key: 'temporaria',
        label: 'Temporária',
        shortLabel: 'TMP',
        address: 'Endereço temporário',
        active: true,
      })
      .expect(201);
    expect(created.body.key).toBe('temporaria');
    await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        key: 'TEMPORARIA',
        label: 'Temporária duplicada',
        shortLabel: 'TMP2',
        address: 'Outro endereço',
        active: true,
      })
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toBe('Identificador de unidade já cadastrado.'),
      );
    await request(app.getHttpServer())
      .delete(`/api/v1/units/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/units')
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some((unit: { key: string }) => unit.key === 'temporaria'),
        ).toBe(false),
      );
    await request(app.getHttpServer())
      .get('/api/v1/units/admin/all')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some((unit: { key: string }) => unit.key === 'temporaria'),
        ).toBe(true),
      );
  });

  it('gerencia equipamentos por unidade e oculta os inativos', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/equipments')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        name: 'Controladora temporária',
        description: 'Equipamento para validar o CRUD.',
        unitId,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/equipments')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Controladora temporária', unitId })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/v1/equipments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ description: 'Descrição atualizada.' })
      .expect(200)
      .expect(({ body }) =>
        expect(body.description).toBe('Descrição atualizada.'),
      );

    await request(app.getHttpServer())
      .delete(`/api/v1/equipments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/equipments')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some(
            (equipment: { id: string }) =>
              equipment.id === String(created.body.id),
          ),
        ).toBe(false),
      );

    await request(app.getHttpServer())
      .get('/api/v1/equipments/admin/all')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some(
            (equipment: { id: string }) =>
              equipment.id === String(created.body.id),
          ),
        ).toBe(true),
      );
  });

  it('garante propriedade dos eventos do mural', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Primeiro Gig',
        date: '2030-09-01',
        time: '22:00',
        location: 'Clube Teste',
        instagram: '@clube_teste',
        type: EventType.DjOn,
      })
      .expect(201);
    eventId = created.body.id as string;
    expect(created.body.type).toBe(EventType.Student);

    await request(app.getHttpServer())
      .delete(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ title: 'Primeiro Gig Atualizado' })
      .expect(200)
      .expect(({ body }) => expect(body.title).toContain('Atualizado'));
  });

  it('publica material sanitizado e gerencia categoria', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/v1/materials/categories')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Técnica' })
      .expect(201);
    categoryId = category.body.id as string;

    const material = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({
        title: 'Guia seguro',
        categoryId,
        body: '<h2>Conteúdo</h2><script>alert(1)</script><p>Válido</p>',
      })
      .expect(201);
    materialId = material.body.id as string;
    expect(material.body.body).toContain('<h2>Conteúdo</h2>');
    expect(material.body.body).not.toContain('<script>');

    await request(app.getHttpServer())
      .get(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200);
  });

  it('isola rascunhos por autor e não os expõe aos alunos', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({
        title: '',
        body: '<p>Rascunho privado E2E</p>',
        status: 'draft',
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('draft'));
    const draftId = String(draft.body.id);

    await request(app.getHttpServer())
      .get(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(404);

    await request(app.getHttpServer())
      .get('/api/v1/materials?limit=100')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          draftId,
        ),
      );
    await request(app.getHttpServer())
      .get('/api/v1/materials?limit=100')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).not.toContain(
          draftId,
        ),
      );

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({ title: 'Rascunho atualizado E2E' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('draft'));
    await request(app.getHttpServer())
      .get('/api/v1/search?q=Rascunho%20atualizado%20E2E')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.materials.map((item: { id: string }) => item.id),
        ).not.toContain(draftId),
      );
    await request(app.getHttpServer())
      .delete(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200);
  });

  it('envia, serve e remove arquivo no Cloudflare R2', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .field('purpose', 'other')
      .attach('file', Buffer.from('arquivo-r2-e2e'), {
        filename: 'avatar-e2e.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(uploaded.body.url as string)
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect('Cross-Origin-Resource-Policy', 'cross-origin');

    await request(app.getHttpServer())
      .delete(`/api/v1/files/${String(uploaded.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(uploaded.body.url as string)
      .expect(404);
  });

  it('remove do R2 os arquivos vinculados quando o material é excluído', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .field('purpose', 'material-cover')
      .attach('file', Buffer.from('capa-material-e2e'), {
        filename: 'capa-e2e.png',
        contentType: 'image/png',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({ coverImage: uploaded.body.url })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(uploaded.body.url as string)
      .expect(404);
  });

  it('executa o CRUD completo de material rico, anexos e categorias', async () => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const sourceCategory = await request(app.getHttpServer())
      .post('/api/v1/materials/categories')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Categoria Origem E2E' })
      .expect(201);
    const targetCategory = await request(app.getHttpServer())
      .post('/api/v1/materials/categories')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Categoria Destino E2E' })
      .expect(201);

    const cover = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .field('purpose', 'material-cover')
      .attach('file', pixel, {
        filename: 'capa-completa.png',
        contentType: 'image/png',
      })
      .expect(201);
    const bodyImage = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .field('purpose', 'rich-text')
      .attach('file', pixel, {
        filename: 'imagem-corpo.png',
        contentType: 'image/png',
      })
      .expect(201);
    const attachment = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .field('purpose', 'material-attachment')
      .attach('file', Buffer.from('%PDF-1.4 material e2e'), {
        filename: 'apostila-e2e.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const material = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({
        title: 'Material Completo E2E',
        description: 'Resumo do material completo.',
        categoryId: sourceCategory.body.id,
        coverImage: cover.body.url,
        body: `<h2>Aula completa</h2><p>Conteúdo rico.</p><img src="${bodyImage.body.url}" alt="Imagem do conteúdo">`,
        attachments: [
          {
            legacyId: attachment.body.id,
            name: 'apostila-e2e.pdf',
            type: 'pdf',
            url: attachment.body.url,
            size: '20 B',
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/materials/${String(material.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.title).toBe('Material Completo E2E');
        expect(body.coverImage).toBe(cover.body.url);
        expect(body.body).toContain(bodyImage.body.url);
        expect(body.attachments).toHaveLength(1);
        expect(body.attachments[0].legacyId).toBe(attachment.body.id);
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/${String(material.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({
        title: 'Material Completo Atualizado',
        body: '<p>Nova versão.</p>',
      })
      .expect(200)
      .expect(({ body }) => expect(body.title).toContain('Atualizado'));
    await request(app.getHttpServer())
      .get(String(bodyImage.body.url))
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/categories/${String(sourceCategory.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Categoria Origem Renomeada E2E' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/materials/categories/${String(sourceCategory.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ transferToCategoryId: targetCategory.body.id })
      .expect(200)
      .expect(({ body }) => expect(body.transferredMaterials).toBe(1));
    await request(app.getHttpServer())
      .get(`/api/v1/materials/${String(material.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.categoryId.id).toBe(targetCategory.body.id),
      );

    await request(app.getHttpServer())
      .delete(`/api/v1/materials/${String(material.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200);
    await request(app.getHttpServer()).get(String(cover.body.url)).expect(404);
    await request(app.getHttpServer())
      .get(String(attachment.body.url))
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/materials/categories/${String(targetCategory.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({})
      .expect(200);
  });

  it('valida payloads desconhecidos e busca integrada', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ role: Role.Admin })
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/search?q=Primeiro')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.events.length).toBeGreaterThan(0));
  });

  it('normaliza identificadores e registra auditoria administrativa', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/events/identificador-invalido')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(403);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBeGreaterThan(0);
        expect(body.items[0].id).toBeDefined();
      });
  });
});
