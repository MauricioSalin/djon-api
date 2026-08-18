import { Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { MaterialsService } from './materials.service';
import { MaterialStatus } from './schemas/material.schema';

describe('MaterialsService - capa automática', () => {
  const materialId = new Types.ObjectId().toString();
  const categoryId = new Types.ObjectId().toString();
  const actor: AuthUser = {
    id: new Types.ObjectId().toString(),
    email: 'professor@teste.com',
    role: Role.Professor,
  };
  const materialModel = {
    create: jest.fn().mockImplementation((data: Record<string, unknown>) => ({
      id: materialId,
      title: data.title,
    })),
  };
  const categoryModel = {
    exists: jest.fn().mockResolvedValue(true),
  };
  const usersService = {
    findActiveByRoles: jest.fn().mockResolvedValue([]),
  };
  const notificationsService = {
    createForRecipients: jest.fn().mockResolvedValue(undefined),
  };
  const filesService = {};
  const service = new MaterialsService(
    materialModel as never,
    categoryModel as never,
    usersService as never,
    notificationsService as never,
    filesService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: materialId } as never);
  });

  it('salva a primeira imagem do artigo como capa quando não há capa explícita', async () => {
    await service.create(
      {
        title: 'Material com imagem',
        categoryId,
        body: '<p>Texto</p><img src="/api/v1/files/capa-automatica"><img src="/segunda">',
      },
      actor,
    );

    expect(materialModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        coverImage: '/api/v1/files/capa-automatica',
      }),
    );
  });

  it('mantém a capa escolhida pelo autor', async () => {
    await service.create(
      {
        title: 'Material com capa própria',
        categoryId,
        coverImage: '/api/v1/files/capa-escolhida',
        body: '<img src="/api/v1/files/imagem-do-artigo">',
      },
      actor,
    );

    expect(materialModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        coverImage: '/api/v1/files/capa-escolhida',
      }),
    );
  });

  it('preserva o layout seguro de texto e imagens do artigo', async () => {
    await service.create(
      {
        title: 'Artigo diagramado',
        categoryId,
        body: '<p data-text-align="justify" onclick="alert(1)">Texto</p><div data-image-layout="left"><img src="https://example.com/imagem.jpg" data-image-width="50%" data-image-align="left" style="position:fixed"><div data-image-text="true"><p>Texto lateral</p></div></div>',
      },
      actor,
    );

    const createCalls = materialModel.create.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const createdBody = createCalls[0][0].body as string;
    expect(createdBody).toContain('data-text-align="justify"');
    expect(createdBody).toContain('data-image-width="50%"');
    expect(createdBody).toContain('data-image-align="left"');
    expect(createdBody).toContain('data-image-layout="left"');
    expect(createdBody).toContain('data-image-text="true"');
    expect(createdBody).not.toContain('onclick');
    expect(createdBody).not.toContain('style');
  });

  it('salva rascunho incompleto sem notificar alunos', async () => {
    await service.create(
      {
        title: '',
        body: '<p>Conteúdo em construção</p>',
        status: MaterialStatus.Draft,
      },
      actor,
    );

    expect(materialModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '',
        status: MaterialStatus.Draft,
      }),
    );
    expect(categoryModel.exists).not.toHaveBeenCalled();
    expect(usersService.findActiveByRoles).not.toHaveBeenCalled();
    expect(notificationsService.createForRecipients).not.toHaveBeenCalled();
  });

  it('mantém publicação dependente de título e categoria', async () => {
    await expect(
      service.create(
        {
          title: '',
          status: MaterialStatus.Published,
        },
        actor,
      ),
    ).rejects.toThrow('Informe o título antes de publicar.');

    await expect(
      service.create(
        {
          title: 'Material sem categoria',
          status: MaterialStatus.Published,
        },
        actor,
      ),
    ).rejects.toThrow('Selecione uma categoria antes de publicar.');
  });
});
