import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  DEFAULT_FILE_LIMIT_BYTES,
  MATERIAL_ATTACHMENT_LIMIT_BYTES,
} from './files.constants';
import { FilesService } from './files.service';

describe('FilesService - limites de upload', () => {
  const storedId = new Types.ObjectId().toString();
  const actor: AuthUser = {
    id: new Types.ObjectId().toString(),
    email: 'professor@teste.com',
    role: Role.Professor,
  };
  const fileModel = {
    create: jest.fn().mockImplementation((data: Record<string, unknown>) => ({
      id: storedId,
      ...data,
    })),
  };
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com/bucket',
        R2_BUCKET_NAME: 'bucket',
        R2_ACCESS_KEY_ID: 'test-key',
        R2_SECRET_ACCESS_KEY: 'test-secret',
      };
      return values[key];
    }),
    get: jest.fn((_key: string, fallback: string) => fallback),
  };
  const service = new FilesService(
    fileModel as never,
    config as unknown as ConfigService,
  );
  const clientSend = jest
    .spyOn(
      (
        service as unknown as {
          client: { send: (command: unknown) => Promise<unknown> };
        }
      ).client,
      'send',
    )
    .mockResolvedValue({});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function file(size: number): Express.Multer.File {
    return {
      originalname: 'material.pdf',
      mimetype: 'application/pdf',
      size,
      buffer: Buffer.from('teste'),
    } as Express.Multer.File;
  }

  it('aceita um anexo de material com exatamente 100 MB', async () => {
    await expect(
      service.upload(
        file(MATERIAL_ATTACHMENT_LIMIT_BYTES),
        actor,
        'material-attachment',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: storedId,
        size: MATERIAL_ATTACHMENT_LIMIT_BYTES,
        purpose: 'material-attachment',
      }),
    );
    expect(clientSend).toHaveBeenCalledTimes(1);
  });

  it('recusa um anexo de material acima de 100 MB', async () => {
    await expect(
      service.upload(
        file(MATERIAL_ATTACHMENT_LIMIT_BYTES + 1),
        actor,
        'material-attachment',
      ),
    ).rejects.toThrow('O arquivo excede o limite de 100 MB.');
    expect(clientSend).not.toHaveBeenCalled();
  });

  it('mantém o limite de 50 MB para as demais finalidades', async () => {
    await expect(
      service.upload(file(DEFAULT_FILE_LIMIT_BYTES + 1), actor, 'other'),
    ).rejects.toThrow('O arquivo excede o limite de 50 MB.');
    expect(clientSend).not.toHaveBeenCalled();
  });

  it('recusa upload direto de vídeo em materiais', async () => {
    const video = {
      ...file(1024),
      originalname: 'aula.mp4',
      mimetype: 'video/mp4',
    };
    await expect(
      service.upload(video, actor, 'material-attachment'),
    ).rejects.toThrow(
      'Vídeos de materiais devem ser incorporados por um link do YouTube.',
    );
    expect(clientSend).not.toHaveBeenCalled();
  });
});
