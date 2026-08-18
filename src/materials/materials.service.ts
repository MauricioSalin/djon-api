import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { QueryMaterialsDto } from './dto/query-materials.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { firstMaterialImage } from './material-cover';
import {
  MaterialCategory,
  MaterialCategoryDocument,
} from './schemas/material-category.schema';
import {
  Material,
  MaterialDocument,
  MaterialStatus,
} from './schemas/material.schema';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectModel(Material.name)
    private readonly materialModel: Model<MaterialDocument>,
    @InjectModel(MaterialCategory.name)
    private readonly categoryModel: Model<MaterialCategoryDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly filesService: FilesService,
  ) {}

  async create(dto: CreateMaterialDto, actor: AuthUser) {
    const status = dto.status ?? MaterialStatus.Published;
    this.ensurePublishable(status, dto.title, dto.categoryId);
    if (dto.categoryId) await this.ensureCategory(dto.categoryId);
    const body = this.sanitize(dto.body);
    const material = await this.materialModel.create({
      ...dto,
      title: dto.title?.trim() ?? '',
      ...(dto.categoryId
        ? { categoryId: new Types.ObjectId(dto.categoryId) }
        : {}),
      body,
      coverImage: dto.coverImage || firstMaterialImage(body),
      authorId: new Types.ObjectId(actor.id),
      status,
    });
    if (status === MaterialStatus.Published) {
      await this.notifyPublished(material);
    }
    return this.findOne(String(material.id), actor);
  }

  async findAll(query: QueryMaterialsDto, actor: AuthUser) {
    const filter: Record<string, unknown> = this.visibilityFilter(actor);
    if (query.categoryId)
      filter.categoryId = new Types.ObjectId(query.categoryId);
    if (query.authorId) filter.authorId = new Types.ObjectId(query.authorId);
    if (query.search?.trim()) filter.$text = { $search: query.search.trim() };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.materialModel
        .find(filter)
        .populate('categoryId', 'name')
        .populate('authorId', 'name avatar role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean({ virtuals: true })
        .exec(),
      this.materialModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, actor: AuthUser) {
    const material = await this.materialModel
      .findOne({ _id: id, ...this.visibilityFilter(actor) })
      .populate('categoryId', 'name')
      .populate('authorId', 'name avatar role')
      .lean({ virtuals: true })
      .exec();
    if (!material) throw new NotFoundException('Material não encontrado.');
    return material;
  }

  async update(id: string, dto: UpdateMaterialDto, actor: AuthUser) {
    const material = await this.getOwned(id, actor);
    const previousStatus = material.status ?? MaterialStatus.Published;
    const nextStatus = dto.status ?? previousStatus;
    const nextTitle = dto.title ?? material.title;
    const nextCategoryId = dto.categoryId ?? String(material.categoryId ?? '');
    this.ensurePublishable(nextStatus, nextTitle, nextCategoryId);
    const previousFileIds = this.filesService.extractFileIds([
      material.coverImage,
      material.body,
      material.attachments,
    ]);
    if (dto.categoryId) await this.ensureCategory(dto.categoryId);
    Object.assign(material, {
      ...dto,
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.categoryId
        ? { categoryId: new Types.ObjectId(dto.categoryId) }
        : {}),
      ...(dto.body !== undefined ? { body: this.sanitize(dto.body) } : {}),
    });
    if (!material.coverImage) {
      material.coverImage = firstMaterialImage(material.body);
    }
    await material.save();
    const currentFileIds = this.filesService.extractFileIds([
      material.coverImage,
      material.body,
      material.attachments,
    ]);
    await this.filesService.removeFileIds(
      [...previousFileIds].filter((fileId) => !currentFileIds.has(fileId)),
    );
    if (
      previousStatus === MaterialStatus.Draft &&
      nextStatus === MaterialStatus.Published
    ) {
      await this.notifyPublished(material);
    }
    return this.findOne(id, actor);
  }

  async remove(id: string, actor: AuthUser) {
    const material = await this.getOwned(id, actor);
    const fileIds = this.filesService.extractFileIds([
      material.coverImage,
      material.body,
      material.attachments,
    ]);
    await material.deleteOne();
    await this.filesService.removeFileIds(fileIds);
    return { id, removed: true };
  }

  findCategories() {
    return this.categoryModel.find({ active: true }).sort({ name: 1 }).lean();
  }

  async createCategory(name: string) {
    try {
      return await this.categoryModel.create({ name: name.trim() });
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async updateCategory(id: string, name: string) {
    try {
      const category = await this.categoryModel.findByIdAndUpdate(
        id,
        { name: name.trim() },
        { returnDocument: 'after', runValidators: true },
      );
      if (!category) throw new NotFoundException('Categoria não encontrada.');
      return category;
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async deleteCategory(id: string, transferToCategoryId?: string) {
    const category = await this.categoryModel.findById(id);
    if (!category) throw new NotFoundException('Categoria não encontrada.');
    const count = await this.materialModel.countDocuments({
      categoryId: category._id,
    });
    if (count > 0) {
      if (!transferToCategoryId || transferToCategoryId === id) {
        throw new BadRequestException(
          'Informe outra categoria para transferir os materiais.',
        );
      }
      await this.ensureCategory(transferToCategoryId);
      await this.materialModel.updateMany(
        { categoryId: category._id },
        { categoryId: new Types.ObjectId(transferToCategoryId) },
      );
    }
    await category.deleteOne();
    return { id, removed: true, transferredMaterials: count };
  }

  private async getOwned(id: string, actor: AuthUser) {
    const material = await this.materialModel.findById(id);
    if (!material) throw new NotFoundException('Material não encontrado.');
    const isOwner = String(material.authorId) === actor.id;
    if (
      (!isOwner && actor.role !== Role.Admin) ||
      (!isOwner && material.status === MaterialStatus.Draft)
    ) {
      throw new ForbiddenException('Material pertence a outro autor.');
    }
    return material;
  }

  private async ensureCategory(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    const exists = await this.categoryModel.exists({ _id: id, active: true });
    if (!exists) throw new NotFoundException('Categoria não encontrada.');
  }

  private ensurePublishable(
    status: MaterialStatus,
    title?: string,
    categoryId?: string,
  ) {
    if (status !== MaterialStatus.Published) return;
    if (!title?.trim()) {
      throw new BadRequestException('Informe o título antes de publicar.');
    }
    if (!categoryId) {
      throw new BadRequestException(
        'Selecione uma categoria antes de publicar.',
      );
    }
  }

  private visibilityFilter(actor: AuthUser): Record<string, unknown> {
    if (actor.role === Role.Student) {
      return { status: { $ne: MaterialStatus.Draft } };
    }
    return {
      $or: [
        { status: { $ne: MaterialStatus.Draft } },
        {
          status: MaterialStatus.Draft,
          authorId: new Types.ObjectId(actor.id),
        },
      ],
    };
  }

  private async notifyPublished(material: MaterialDocument) {
    const students = await this.usersService.findActiveByRoles([Role.Student]);
    await this.notificationsService.createForRecipients(
      students.map((student) => String(student._id)),
      {
        type: 'material.published',
        title: 'Novo material disponível',
        body: material.title,
        url: `/dashboard/material/${String(material.id)}`,
        metadata: { materialId: String(material.id) },
      },
    );
  }

  private sanitize(value?: string) {
    if (!value) return value;
    return sanitizeHtml(value, {
      allowedTags: [
        'p',
        'br',
        'strong',
        'em',
        'h2',
        'h3',
        'ul',
        'ol',
        'li',
        'blockquote',
        'a',
        'img',
        'div',
      ],
      allowedAttributes: {
        a: ['href', 'target', 'rel'],
        p: ['data-text-align'],
        div: ['data-text-align', 'data-image-layout', 'data-image-text'],
        h2: ['data-text-align'],
        h3: ['data-text-align'],
        li: ['data-text-align'],
        blockquote: ['data-text-align'],
        img: ['src', 'alt', 'data-image-width', 'data-image-align'],
      },
      allowedSchemes: ['http', 'https'],
      transformTags: {
        a: sanitizeHtml.simpleTransform('a', {
          rel: 'noopener noreferrer',
          target: '_blank',
        }),
      },
    });
  }

  private handleDuplicate(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException('Categoria já cadastrada.');
    }
  }
}
