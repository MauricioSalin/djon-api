import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FilesService } from '../files/files.service';
import { UpdatePortalContentDto } from './dto/update-portal-content.dto';
import {
  PORTAL_HERO_DEFAULTS,
  PORTAL_HERO_KEYS,
  PORTAL_HERO_LEGACY_DESCRIPTIONS,
  PortalHeroKey,
  portalHeroDefaults,
} from './portal-content.defaults';
import {
  PortalContent,
  PortalContentDocument,
} from './schemas/portal-content.schema';

@Injectable()
export class PortalContentService implements OnModuleInit {
  constructor(
    @InjectModel(PortalContent.name)
    private readonly portalContentModel: Model<PortalContentDocument>,
    private readonly filesService: FilesService,
  ) {}

  async onModuleInit() {
    await this.portalContentModel.bulkWrite([
      ...PORTAL_HERO_DEFAULTS.map((content) => ({
        updateOne: {
          filter: { key: content.key },
          update: { $setOnInsert: content },
          upsert: true,
        },
      })),
      ...PORTAL_HERO_LEGACY_DESCRIPTIONS.map((migration) => ({
        updateOne: {
          filter: {
            key: migration.key,
            description: migration.previous,
          },
          update: { $set: { description: migration.next } },
        },
      })),
    ]);
  }

  async findAll() {
    const configured = await this.portalContentModel
      .find()
      .sort({ key: 1 })
      .lean()
      .exec();
    const byKey = new Map(configured.map((item) => [item.key, item]));
    return PORTAL_HERO_DEFAULTS.map(
      (defaults) => byKey.get(defaults.key) ?? defaults,
    );
  }

  async findOne(rawKey: string) {
    const key = this.parseKey(rawKey);
    return (
      (await this.portalContentModel.findOne({ key }).lean().exec()) ??
      portalHeroDefaults(key)
    );
  }

  async update(rawKey: string, dto: UpdatePortalContentDto) {
    const key = this.parseKey(rawKey);
    const previous = await this.findOne(key);
    const changes = {
      ...(dto.label !== undefined
        ? { label: this.requiredText(dto.label) }
        : {}),
      ...(dto.title !== undefined
        ? { title: this.requiredText(dto.title) }
        : {}),
      ...(dto.description !== undefined
        ? { description: this.requiredText(dto.description) }
        : {}),
      ...(dto.banner !== undefined
        ? { banner: dto.banner?.trim() || null }
        : {}),
    };
    const defaults = portalHeroDefaults(key);
    const next = {
      key,
      label: previous.label ?? defaults.label,
      title: previous.title ?? defaults.title,
      description: previous.description ?? defaults.description,
      banner: previous.banner !== undefined ? previous.banner : defaults.banner,
      ...changes,
    };
    const updated = await this.portalContentModel
      .findOneAndUpdate(
        { key },
        { $set: next },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();

    if (
      dto.banner !== undefined &&
      previous.banner &&
      previous.banner !== updated.banner
    ) {
      const previousIds = this.filesService.extractFileIds([previous.banner]);
      await this.filesService.removeFileIds(previousIds);
    }

    return updated;
  }

  private parseKey(rawKey: string) {
    if (!PORTAL_HERO_KEYS.has(rawKey)) {
      throw new BadRequestException('Hero do portal inválido.');
    }
    return rawKey as PortalHeroKey;
  }

  private requiredText(value: string) {
    const trimmed = value.trim();
    if (!trimmed)
      throw new BadRequestException('O texto não pode ficar vazio.');
    return trimmed;
  }
}
