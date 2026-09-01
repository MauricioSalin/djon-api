import { Types } from 'mongoose';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { MaterialsService } from './materials.service';
import { MaterialCategoryType } from './schemas/material-category.schema';
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
    findOne: jest.fn().mockResolvedValue({
      _id: new Types.ObjectId(categoryId),
      type: MaterialCategoryType.Library,
    }),
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
    {} as never,
    {} as never,
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

  it('preserva somente vídeos incorporados do YouTube', async () => {
    await service.create(
      {
        title: 'Material com vídeo',
        categoryId,
        body: '<div data-video-layout="left" data-video-width="50%"><iframe src="https://www.youtube-nocookie.com/embed/abcDEF123" title="Aula" loading="lazy" allowfullscreen></iframe></div><iframe src="https://malicioso.example/video"></iframe>',
      },
      actor,
    );

    const createCalls = materialModel.create.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const createdBody = createCalls[0][0].body as string;
    expect(createdBody).toContain('data-video-layout="left"');
    expect(createdBody).toContain('data-video-width="50%"');
    expect(createdBody).toContain(
      'src="https://www.youtube-nocookie.com/embed/abcDEF123"',
    );
    expect(createdBody).not.toContain('malicioso.example');
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
    expect(categoryModel.findOne).not.toHaveBeenCalled();
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

describe('MaterialsService - autoria e edição', () => {
  const authorId = new Types.ObjectId().toString();
  const author: AuthUser = {
    id: authorId,
    email: 'autor@teste.com',
    role: Role.Professor,
  };
  const otherProfessor: AuthUser = {
    id: new Types.ObjectId().toString(),
    email: 'outro-professor@teste.com',
    role: Role.Professor,
  };
  const admin: AuthUser = {
    id: new Types.ObjectId().toString(),
    email: 'admin@teste.com',
    role: Role.Admin,
  };
  const draft = {
    authorId: new Types.ObjectId(authorId),
    status: MaterialStatus.Draft,
  };
  const courseDraft = {
    ...draft,
    courseId: new Types.ObjectId(),
  };
  const published = {
    ...draft,
    status: MaterialStatus.Published,
  };
  const publishedCourseMaterial = {
    ...published,
    courseId: new Types.ObjectId(),
  };
  const materialModel = {
    findById: jest.fn().mockResolvedValue(draft),
  };
  const filesService = {
    extractFileIds: jest.fn().mockReturnValue([]),
    removeFileIds: jest.fn().mockResolvedValue(undefined),
  };
  const service = new MaterialsService(
    materialModel as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    filesService as never,
  );
  const authorization = service as unknown as {
    getOwned(
      id: string,
      actor: AuthUser,
      allowCourseProfessor?: boolean,
    ): Promise<unknown>;
    visibilityFilter(actor: AuthUser): Record<string, unknown>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    materialModel.findById.mockResolvedValue(draft);
  });

  it('impede que o admin edite rascunho de outro autor', async () => {
    await expect(
      authorization.getOwned('material-id', admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite que o professor edite o próprio material', async () => {
    await expect(authorization.getOwned('material-id', author)).resolves.toBe(
      draft,
    );
  });

  it('impede professor de editar material de outro autor', async () => {
    materialModel.findById.mockResolvedValueOnce(published);

    await expect(
      authorization.getOwned('material-id', otherProfessor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite que professor edite aula publicada de outro autor', async () => {
    materialModel.findById.mockResolvedValueOnce(publishedCourseMaterial);

    await expect(
      authorization.getOwned('material-id', otherProfessor, true),
    ).resolves.toBe(publishedCourseMaterial);
  });

  it('mantém rascunho de curso visível e editável somente pelo autor', async () => {
    materialModel.findById.mockResolvedValueOnce(courseDraft);

    await expect(
      authorization.getOwned('material-id', otherProfessor, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite que professor remova aula publicada de outro autor', async () => {
    const removableCourseMaterial = {
      ...publishedCourseMaterial,
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    materialModel.findById.mockResolvedValueOnce(removableCourseMaterial);

    await expect(
      service.remove('material-id', otherProfessor),
    ).resolves.toEqual({ id: 'material-id', removed: true });
    expect(removableCourseMaterial.deleteOne).toHaveBeenCalled();
  });

  it('permite que professor remova o próprio rascunho', async () => {
    const removableDraft = {
      ...draft,
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    materialModel.findById.mockResolvedValueOnce(removableDraft);

    await expect(service.remove('material-id', author)).resolves.toEqual({
      id: 'material-id',
      removed: true,
    });
    expect(removableDraft.deleteOne).toHaveBeenCalled();
  });

  it('impede que professor remova material publicado de outro autor', async () => {
    materialModel.findById.mockResolvedValueOnce(published);

    await expect(
      service.remove('material-id', otherProfessor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite que o admin edite material publicado de outro autor', async () => {
    materialModel.findById.mockResolvedValueOnce(published);

    await expect(authorization.getOwned('material-id', admin)).resolves.toBe(
      published,
    );
  });

  it.each([
    ['admin', admin],
    ['professor', otherProfessor],
  ] as const)('limita rascunhos ao próprio autor para %s', (_label, actor) => {
    const filter = authorization.visibilityFilter(actor) as {
      $or: Array<Record<string, unknown>>;
    };

    expect(filter.$or).toHaveLength(2);
    expect(filter.$or[1]).toEqual({
      status: MaterialStatus.Draft,
      authorId: new Types.ObjectId(actor.id),
    });
  });
});
