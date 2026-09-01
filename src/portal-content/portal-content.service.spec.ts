import { BadRequestException } from '@nestjs/common';
import { PortalHeroKey } from './portal-content.defaults';
import { PortalContentService } from './portal-content.service';

describe('PortalContentService', () => {
  const model = {
    bulkWrite: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const filesService = {
    extractFileIds: jest.fn(),
    removeFileIds: jest.fn(),
  };
  let service: PortalContentService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new PortalContentService(model as never, filesService as never);
  });

  it('insere os onze heroes atuais sem sobrescrever configurações existentes', async () => {
    let writtenOperations: unknown;
    model.bulkWrite.mockImplementation((operations: unknown) => {
      writtenOperations = operations;
      return Promise.resolve({});
    });

    await service.onModuleInit();

    const operations = writtenOperations as Array<{
      updateOne: {
        filter: { key: PortalHeroKey; description?: string };
        update: {
          $setOnInsert?: { banner: string | null };
          $set?: { description: string };
        };
      };
    }>;
    expect(operations).toHaveLength(13);
    const insertOperations = operations.filter(
      (operation) => operation.updateOne.update.$setOnInsert,
    );
    expect(insertOperations).toHaveLength(11);
    expect(
      insertOperations.every((operation) =>
        Object.hasOwn(operation.updateOne.update.$setOnInsert, 'banner'),
      ),
    ).toBe(true);
    const migrations = operations.slice(11);
    expect(migrations).toContainEqual({
      updateOne: {
        filter: {
          key: PortalHeroKey.ProfessorHome,
          description: '{{resumo_agendamentos}}',
        },
        update: {
          $set: {
            description:
              'Conduza suas turmas, acompanhe seus alunos e compartilhe sua experiência com a próxima geração de DJs.',
          },
        },
      },
    });
    expect(migrations).toContainEqual({
      updateOne: {
        filter: {
          key: PortalHeroKey.StudentHome,
          description: '{{resumo_aulas}}',
        },
        update: {
          $set: {
            description:
              'Explore seus cursos, acompanhe sua evolução e continue desenvolvendo sua identidade como DJ.',
          },
        },
      },
    });
  });

  it('devolve o conteúdo padrão quando o registro ainda não existe', async () => {
    model.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });

    await expect(service.findOne(PortalHeroKey.Mural)).resolves.toMatchObject({
      key: PortalHeroKey.Mural,
      banner: '/images/mural-hero.png',
      label: 'COMUNIDADE',
    });
  });

  it('persiste a remoção do banner e exclui o arquivo anterior vinculado', async () => {
    const previousBanner = '/api/v1/files/64b7abdecf2160b649ab6085';
    model.findOne.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          key: PortalHeroKey.Mural,
          label: 'COMUNIDADE',
          title: 'Mural de\nEventos.',
          description: 'Descrição atual',
          banner: previousBanner,
        }),
      }),
    });
    model.findOneAndUpdate.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          key: PortalHeroKey.Mural,
          label: 'COMUNIDADE',
          title: 'Mural de\nEventos.',
          description: 'Descrição atual',
          banner: null,
        }),
      }),
    });
    filesService.extractFileIds.mockReturnValue(
      new Set(['64b7abdecf2160b649ab6085']),
    );
    filesService.removeFileIds.mockResolvedValue(undefined);

    await expect(
      service.update(PortalHeroKey.Mural, { banner: null }),
    ).resolves.toMatchObject({ banner: null });

    expect(filesService.extractFileIds).toHaveBeenCalledWith([previousBanner]);
    expect(filesService.removeFileIds).toHaveBeenCalledWith(
      new Set(['64b7abdecf2160b649ab6085']),
    );
  });

  it('rejeita uma chave que não pertence ao catálogo do portal', async () => {
    await expect(service.findOne('site-home')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
