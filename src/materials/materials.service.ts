import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course, CourseDocument } from '../courses/schemas/course.schema';
import { Lesson, LessonDocument } from '../courses/schemas/lesson.schema';
import sanitizeHtml from 'sanitize-html';
import { Role } from '../common/enums/role.enum';
import { Permission } from '../common/enums/permission.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { actorHasPermission } from '../common/permissions';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { QueryMaterialsDto } from './dto/query-materials.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { firstMaterialImage } from './material-cover';
import {
  COURSES_CATEGORY_KEY,
  COURSES_CATEGORY_NAME,
  MaterialCategory,
  MaterialCategoryDocument,
  MaterialCategoryType,
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
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Lesson.name)
    private readonly lessonModel: Model<LessonDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly filesService: FilesService,
  ) {}

  async create(dto: CreateMaterialDto, actor: AuthUser) {
    const status = dto.status ?? MaterialStatus.Published;
    const course = dto.courseId
      ? await this.ensureCourse(dto.courseId, dto.categoryId)
      : undefined;
    const categoryId = course ? String(course.categoryId) : dto.categoryId;
    this.ensurePublishable(status, dto.title, categoryId);
    if (categoryId) await this.ensureCategory(categoryId, Boolean(course));
    const body = this.sanitize(dto.body);
    const material = await this.materialModel.create({
      ...dto,
      title: dto.title?.trim() ?? '',
      ...(categoryId ? { categoryId: new Types.ObjectId(categoryId) } : {}),
      ...(dto.courseId ? { courseId: new Types.ObjectId(dto.courseId) } : {}),
      body,
      coverImage: dto.coverImage || firstMaterialImage(body),
      authorId: new Types.ObjectId(actor.id),
      status,
    });
    if (status === MaterialStatus.Published && !dto.courseId) {
      await this.notifyPublished(material);
    }
    return this.findOne(String(material.id), actor);
  }

  async findAll(query: QueryMaterialsDto, actor: AuthUser) {
    const filter: Record<string, unknown> = this.visibilityFilter(actor);
    if (query.categoryId)
      filter.categoryId = new Types.ObjectId(query.categoryId);
    if (query.courseId) filter.courseId = new Types.ObjectId(query.courseId);
    if (query.authorId) filter.authorId = new Types.ObjectId(query.authorId);
    if (query.search?.trim()) filter.$text = { $search: query.search.trim() };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.materialModel
        .find(filter)
        .populate('categoryId', 'name')
        .populate('courseId', 'name description active')
        .populate('authorId', 'name avatar role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean({ virtuals: true })
        .exec(),
      this.materialModel.countDocuments(filter).exec(),
    ]);
    if (actor.role !== Role.Student) {
      return { items, total, page: query.page, limit: query.limit };
    }
    const courseMaterialIds = items
      .filter((item) => item.courseId)
      .map((item) => item._id);
    const unlocked = courseMaterialIds.length
      ? await this.lessonModel
          .find({
            materialId: { $in: courseMaterialIds },
            attendance: {
              $elemMatch: {
                studentId: new Types.ObjectId(actor.id),
                materialReleased: true,
              },
            },
          })
          .distinct('materialId')
      : [];
    const unlockedIds = new Set(unlocked.map(String));
    return {
      items: items.map((item) => ({
        ...item,
        locked: Boolean(item.courseId && !unlockedIds.has(String(item._id))),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string, actor: AuthUser) {
    const material = await this.materialModel
      .findOne({ _id: id, ...this.visibilityFilter(actor) })
      .populate('categoryId', 'name')
      .populate('courseId', 'name description active')
      .populate('authorId', 'name avatar role')
      .lean({ virtuals: true })
      .exec();
    if (!material) throw new NotFoundException('Material não encontrado.');
    if (
      actor.role === Role.Student &&
      material.courseId &&
      !(await this.isMaterialUnlocked(material._id, actor.id))
    ) {
      throw new ForbiddenException(
        'Este material será liberado após a conclusão da aula.',
      );
    }
    return material;
  }

  async update(id: string, dto: UpdateMaterialDto, actor: AuthUser) {
    const material = await this.getOwned(id, actor, true);
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
    const course = dto.courseId
      ? await this.ensureCourse(dto.courseId, dto.categoryId)
      : undefined;
    const resolvedCategoryId = course
      ? String(course.categoryId)
      : dto.categoryId;
    if (resolvedCategoryId)
      await this.ensureCategory(
        resolvedCategoryId,
        Boolean(course || material.courseId),
      );
    Object.assign(material, {
      ...dto,
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(resolvedCategoryId
        ? { categoryId: new Types.ObjectId(resolvedCategoryId) }
        : {}),
      ...(dto.courseId ? { courseId: new Types.ObjectId(dto.courseId) } : {}),
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
    const material = await this.getOwned(id, actor, true);
    const fileIds = this.filesService.extractFileIds([
      material.coverImage,
      material.body,
      material.attachments,
    ]);
    await material.deleteOne();
    await this.filesService.removeFileIds(fileIds);
    return { id, removed: true };
  }

  async findCategories() {
    await this.ensureCoursesCategory();
    return this.categoryModel.find({ active: true }).sort({ name: 1 }).lean();
  }

  async createCategory(
    name: string,
    type: MaterialCategoryType = MaterialCategoryType.Library,
  ) {
    if (type === MaterialCategoryType.Course) {
      throw new BadRequestException(
        'A categoria Cursos é fixa e criada automaticamente.',
      );
    }
    try {
      return await this.categoryModel.create({ name: name.trim(), type });
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async updateCategory(id: string, name: string) {
    await this.assertCategoryIsEditable(id);
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
    if (
      category.systemKey === COURSES_CATEGORY_KEY ||
      category.type === MaterialCategoryType.Course
    ) {
      throw new BadRequestException(
        'A categoria Cursos não pode ser excluída.',
      );
    }
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

  private async getOwned(
    id: string,
    actor: AuthUser,
    allowCourseProfessor = false,
  ) {
    const material = await this.materialModel.findById(id);
    if (!material) throw new NotFoundException('Material não encontrado.');
    const isOwner = String(material.authorId) === actor.id;
    const canManageAll = actorHasPermission(actor, Permission.MaterialsManage);
    if (!isOwner && material.status === MaterialStatus.Draft) {
      throw new ForbiddenException('Rascunho pertence a outro autor.');
    }
    const canEditCourseMaterial = Boolean(
      allowCourseProfessor &&
      material.courseId &&
      actor.role === Role.Professor,
    );
    if (!isOwner && !canManageAll && !canEditCourseMaterial) {
      throw new ForbiddenException('Material pertence a outro autor.');
    }
    return material;
  }

  private async ensureCategory(id: string, allowCourse = false) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    const category = await this.categoryModel.findOne({
      _id: id,
      active: true,
    });
    if (!category) throw new NotFoundException('Categoria não encontrada.');
    if (!allowCourse && category.type === MaterialCategoryType.Course) {
      throw new BadRequestException(
        'Materiais da categoria Cursos precisam estar vinculados a um curso.',
      );
    }
  }

  private async assertCategoryIsEditable(id: string) {
    const category = await this.categoryModel.findById(id);
    if (!category) throw new NotFoundException('Categoria não encontrada.');
    if (
      category.systemKey === COURSES_CATEGORY_KEY ||
      category.type === MaterialCategoryType.Course
    ) {
      throw new BadRequestException('A categoria Cursos não pode ser editada.');
    }
  }

  private async ensureCoursesCategory() {
    let category = await this.categoryModel.findOne({
      $or: [
        { systemKey: COURSES_CATEGORY_KEY },
        { name: COURSES_CATEGORY_NAME },
      ],
    });
    if (!category) {
      category = await this.categoryModel.create({
        name: COURSES_CATEGORY_NAME,
        type: MaterialCategoryType.Course,
        systemKey: COURSES_CATEGORY_KEY,
        active: true,
      });
    } else {
      category.name = COURSES_CATEGORY_NAME;
      category.type = MaterialCategoryType.Course;
      category.systemKey = COURSES_CATEGORY_KEY;
      category.active = true;
      await category.save();
    }
    await Promise.all([
      this.courseModel.updateMany(
        { categoryId: { $ne: category._id } },
        { $set: { categoryId: category._id } },
      ),
      this.materialModel.updateMany(
        {
          courseId: { $exists: true, $ne: null },
          categoryId: { $ne: category._id },
        },
        { $set: { categoryId: category._id } },
      ),
      this.categoryModel.updateMany(
        {
          _id: { $ne: category._id },
          type: MaterialCategoryType.Course,
        },
        { $set: { active: false } },
      ),
    ]);
    return category;
  }

  private async ensureCourse(id: string, categoryId?: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Curso não encontrado.');
    }
    const course = await this.courseModel.findOne({ _id: id, active: true });
    if (!course) throw new NotFoundException('Curso não encontrado.');
    if (categoryId && String(course.categoryId) !== categoryId) {
      throw new BadRequestException(
        'O curso não pertence à categoria selecionada.',
      );
    }
    return course;
  }

  private isMaterialUnlocked(materialId: Types.ObjectId, studentId: string) {
    return this.lessonModel.exists({
      materialId,
      attendance: {
        $elemMatch: {
          studentId: new Types.ObjectId(studentId),
          materialReleased: true,
        },
      },
    });
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
        'iframe',
      ],
      allowedAttributes: {
        a: ['href', 'target', 'rel'],
        p: ['data-text-align'],
        div: [
          'data-text-align',
          'data-image-layout',
          'data-image-text',
          'data-video-layout',
          'data-video-kind',
          'data-video-transparent',
          'data-video-text',
          'data-video-width',
        ],
        h2: ['data-text-align'],
        h3: ['data-text-align'],
        li: ['data-text-align'],
        blockquote: ['data-text-align'],
        img: ['src', 'alt', 'data-image-width', 'data-image-align'],
        iframe: [
          'src',
          'title',
          'allow',
          'allowfullscreen',
          'allowtransparency',
          'mozallowfullscreen',
          'webkitallowfullscreen',
          'loading',
          'referrerpolicy',
          'xr-spatial-tracking',
          'execution-while-out-of-viewport',
          'execution-while-not-rendered',
          'web-share',
          'data-video-width',
          'data-video-align',
        ],
      },
      allowedSchemes: ['http', 'https'],
      allowedIframeHostnames: [
        'youtube.com',
        'www.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com',
        'sketchfab.com',
        'www.sketchfab.com',
      ],
      exclusiveFilter: (frame) => frame.tag === 'iframe' && !frame.attribs.src,
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
