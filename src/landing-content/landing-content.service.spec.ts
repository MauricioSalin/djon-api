import { BadRequestException } from '@nestjs/common';
import {
  LANDING_SECTION_DEFAULTS,
  LandingSectionKey,
} from './landing-content.defaults';
import { LandingContentService } from './landing-content.service';

describe('LandingContentService', () => {
  const model = {
    bulkWrite: jest.fn<Promise<unknown>, [unknown[]]>(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const filesService = {
    extractFileIds: jest.fn(),
    removeFileIds: jest.fn(),
  };
  let service: LandingContentService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new LandingContentService(model as never, filesService as never);
  });

  it('insere as sete seções sem sobrescrever conteúdo existente', async () => {
    model.bulkWrite.mockResolvedValue({});
    await service.onModuleInit();
    const operations = model.bulkWrite.mock.calls[0]?.[0] as Array<{
      updateOne?: {
        filter?: { key?: LandingSectionKey };
        update?: { $setOnInsert?: unknown };
        upsert?: boolean;
      };
    }>;
    expect(operations).toHaveLength(7);
    expect(
      operations.find(
        (operation) =>
          operation.updateOne?.filter?.key === LandingSectionKey.Hero,
      )?.updateOne,
    ).toEqual({
      filter: { key: LandingSectionKey.Hero },
      update: { $setOnInsert: LANDING_SECTION_DEFAULTS[0] },
      upsert: true,
    });
  });

  it('limita tags do hero a quatro', async () => {
    await expect(
      service.update(LandingSectionKey.Hero, {
        data: {
          title: 'Título',
          description: 'Descrição',
          tags: ['1', '2', '3', '4', '5'],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove somente imagens substituídas depois de persistir', async () => {
    const previousId = '64b7abdecf2160b649ab6085';
    const currentId = '64b7abdecf2160b649ab6086';
    model.findOne.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          key: LandingSectionKey.Showcase,
          data: {
            ...LANDING_SECTION_DEFAULTS.find(
              (item) => item.key === LandingSectionKey.Showcase,
            )?.data,
            image: `/api/v1/files/${previousId}`,
          },
        }),
      }),
    });
    model.findOneAndUpdate.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          key: LandingSectionKey.Showcase,
          data: {
            ...LANDING_SECTION_DEFAULTS.find(
              (item) => item.key === LandingSectionKey.Showcase,
            )?.data,
            image: `/api/v1/files/${currentId}`,
          },
        }),
      }),
    });
    filesService.extractFileIds
      .mockReturnValueOnce(new Set([previousId]))
      .mockReturnValueOnce(new Set([currentId]));
    filesService.removeFileIds.mockResolvedValue({ removed: 1, failed: 0 });

    const defaults = LANDING_SECTION_DEFAULTS.find(
      (item) => item.key === LandingSectionKey.Showcase,
    );
    await service.update(LandingSectionKey.Showcase, {
      data: { ...defaults?.data, image: `/api/v1/files/${currentId}` },
    });

    expect(filesService.removeFileIds).toHaveBeenCalledWith([previousId]);
  });
});
