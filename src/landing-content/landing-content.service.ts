import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model } from 'mongoose';
import { FilesService } from '../files/files.service';
import { UpdateLandingContentDto } from './dto/update-landing-content.dto';
import {
  LANDING_COLORS,
  LANDING_ICONS,
  LANDING_SECTION_DEFAULTS,
  LANDING_SECTION_KEYS,
  LandingSectionKey,
  landingSectionDefaults,
} from './landing-content.defaults';
import {
  LandingContent,
  LandingContentDocument,
} from './schemas/landing-content.schema';

type Data = Record<string, unknown>;

@Injectable()
export class LandingContentService implements OnModuleInit {
  constructor(
    @InjectModel(LandingContent.name)
    private readonly contentModel: Model<LandingContentDocument>,
    private readonly filesService: FilesService,
  ) {}

  async onModuleInit() {
    await this.contentModel.bulkWrite(
      LANDING_SECTION_DEFAULTS.map((content) => ({
        updateOne: {
          filter: { key: content.key },
          update: { $setOnInsert: content },
          upsert: true,
        },
      })),
    );
  }

  async findAll() {
    const configured = await this.contentModel.find().sort({ key: 1 }).lean();
    const byKey = new Map(configured.map((item) => [item.key, item]));
    return LANDING_SECTION_DEFAULTS.map(
      (defaults) => byKey.get(defaults.key) ?? defaults,
    );
  }

  async findOne(rawKey: string) {
    const key = this.parseKey(rawKey);
    return (
      (await this.contentModel.findOne({ key }).lean().exec()) ??
      landingSectionDefaults(key)
    );
  }

  async update(rawKey: string, dto: UpdateLandingContentDto) {
    const key = this.parseKey(rawKey);
    const data = this.normalize(key, dto.data);
    const previous = await this.findOne(key);
    const updated = await this.contentModel
      .findOneAndUpdate(
        { key },
        { $set: { key, data } },
        { new: true, upsert: true, runValidators: true },
      )
      .lean()
      .exec();
    const previousIds = this.filesService.extractFileIds([previous.data]);
    const currentIds = this.filesService.extractFileIds([updated.data]);
    await this.filesService.removeFileIds(
      [...previousIds].filter((id) => !currentIds.has(id)),
    );
    return updated;
  }

  private parseKey(rawKey: string) {
    if (!LANDING_SECTION_KEYS.has(rawKey as LandingSectionKey)) {
      throw new BadRequestException('Seção do site principal inválida.');
    }
    return rawKey as LandingSectionKey;
  }

  private normalize(key: LandingSectionKey, raw: Data): Data {
    const record = this.record(raw, 'conteúdo');
    switch (key) {
      case LandingSectionKey.Hero:
        return {
          title: this.text(record.title, 120, 'Título'),
          description: this.text(record.description, 600, 'Descrição'),
          tags: this.textList(record.tags, 4, 60, 'Tags'),
        };
      case LandingSectionKey.Lifestyle:
        return {
          badge: this.text(record.badge, 50, 'Badge'),
          title: this.text(record.title, 140, 'Título'),
          description: this.text(record.description, 700, 'Descrição'),
          items: this.textList(record.items, 6, 110, 'Itens'),
          images: this.records(record.images, 4, 4, 'Imagens').map((item) => ({
            image: this.image(item.image, 'Imagem'),
            label: this.text(item.label, 60, 'Label da imagem'),
          })),
        };
      case LandingSectionKey.Courses:
        return {
          courses: this.records(record.courses, 1, 24, 'Cursos').map(
            (item) => ({
              id: this.identifier(item.id),
              color: this.color(item.color),
              label: this.text(item.label, 60, 'Label do curso'),
              title: this.text(item.title, 70, 'Título do curso'),
              description: this.text(
                item.description,
                700,
                'Descrição do curso',
              ),
              image: this.image(item.image, 'Imagem do curso'),
              items: this.textList(item.items, 8, 64, 'Conteúdos do curso'),
            }),
          ),
        };
      case LandingSectionKey.Stats:
        return {
          label: this.text(record.label, 60, 'Label'),
          title: this.text(record.title, 100, 'Título'),
          items: this.records(record.items, 1, 6, 'Cards').map((item) => ({
            id: this.identifier(item.id),
            color: this.color(item.color),
            icon: this.icon(item.icon),
            value: this.text(item.value, 24, 'Valor'),
            title: this.text(item.title, 70, 'Título do card'),
            description: this.text(item.description, 180, 'Descrição do card'),
          })),
        };
      case LandingSectionKey.Showcase:
        return {
          image: this.image(record.image, 'Imagem'),
          imageLabel: this.text(record.imageLabel, 60, 'Label da imagem'),
          label: this.text(record.label, 70, 'Label'),
          title: this.text(record.title, 90, 'Título'),
          description: this.text(record.description, 1200, 'Descrição'),
          items: this.records(record.items, 4, 4, 'Destaques').map((item) => ({
            icon: this.icon(item.icon),
            text: this.text(item.text, 70, 'Texto do destaque'),
          })),
        };
      case LandingSectionKey.Team:
        return {
          label: this.text(record.label, 70, 'Label'),
          title: this.text(record.title, 100, 'Título'),
          description: this.text(record.description, 700, 'Descrição'),
          members: this.records(record.members, 0, 40, 'Equipe').map(
            (item) => ({
              id: this.identifier(item.id),
              color: this.color(item.color),
              image: this.image(item.image, 'Foto'),
              name: this.text(item.name, 70, 'Nome'),
              role: this.text(item.role, 100, 'Função'),
              description: this.text(item.description, 220, 'Descrição'),
            }),
          ),
        };
      case LandingSectionKey.History:
        return {
          label: this.text(record.label, 70, 'Label'),
          title: this.text(record.title, 120, 'Título'),
          description: this.text(record.description, 2400, 'Texto'),
          items: this.records(record.items, 4, 4, 'Marcos').map((item) => ({
            title: this.text(item.title, 30, 'Título do marco'),
            description: this.text(item.description, 120, 'Descrição do marco'),
          })),
        };
    }
  }

  private record(value: unknown, label: string): Data {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${label} inválido.`);
    }
    return value as Data;
  }

  private records(
    value: unknown,
    minimum: number,
    maximum: number,
    label: string,
  ) {
    if (
      !Array.isArray(value) ||
      value.length < minimum ||
      value.length > maximum
    ) {
      throw new BadRequestException(
        `${label} deve conter entre ${minimum} e ${maximum} itens.`,
      );
    }
    return value.map((item) => this.record(item, label));
  }

  private text(value: unknown, maximum: number, label: string) {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.trim().length > maximum
    ) {
      throw new BadRequestException(
        `${label} deve conter até ${maximum} caracteres.`,
      );
    }
    return value.trim();
  }

  private textList(
    value: unknown,
    maximum: number,
    itemMaximum: number,
    label: string,
  ) {
    if (!Array.isArray(value) || value.length > maximum) {
      throw new BadRequestException(
        `${label} aceita no máximo ${maximum} itens.`,
      );
    }
    return value.map((item) => this.text(item, itemMaximum, label));
  }

  private image(value: unknown, label: string) {
    return this.text(value, 1000, label);
  }

  private identifier(value: unknown) {
    if (typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/i.test(value)) {
      return value;
    }
    return randomUUID();
  }

  private color(value: unknown) {
    if (typeof value !== 'string' || !LANDING_COLORS.has(value)) {
      throw new BadRequestException('Cor inválida.');
    }
    return value;
  }

  private icon(value: unknown) {
    if (typeof value !== 'string' || !LANDING_ICONS.has(value)) {
      throw new BadRequestException('Ícone inválido.');
    }
    return value;
  }
}
