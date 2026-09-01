import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BookingsService } from '../bookings/bookings.service';
import { BookingStatus, BookingType } from '../bookings/schemas/booking.schema';
import { Permission } from '../common/enums/permission.enum';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { actorHasPermission } from '../common/permissions';
import {
  Equipment,
  EquipmentDocument,
} from '../equipments/schemas/equipment.schema';
import {
  COURSES_CATEGORY_KEY,
  COURSES_CATEGORY_NAME,
  MaterialCategory,
  MaterialCategoryDocument,
  MaterialCategoryType,
} from '../materials/schemas/material-category.schema';
import {
  Material,
  MaterialDocument,
  MaterialStatus,
} from '../materials/schemas/material.schema';
import { Unit, UnitDocument } from '../units/schemas/unit.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  ConfigureCohortLessonsDto,
  CreateCohortDto,
  CreateCohortWithLessonsDto,
  UpdateAttendanceDto,
  UpdateCohortDto,
} from './dto/cohort.dto';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { Cohort, CohortDocument, CohortStatus } from './schemas/cohort.schema';
import { Course, CourseDocument } from './schemas/course.schema';
import { Lesson, LessonDocument } from './schemas/lesson.schema';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Cohort.name)
    private readonly cohortModel: Model<CohortDocument>,
    @InjectModel(Lesson.name)
    private readonly lessonModel: Model<LessonDocument>,
    @InjectModel(MaterialCategory.name)
    private readonly categoryModel: Model<MaterialCategoryDocument>,
    @InjectModel(Material.name)
    private readonly materialModel: Model<MaterialDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Unit.name)
    private readonly unitModel: Model<UnitDocument>,
    @InjectModel(Equipment.name)
    private readonly equipmentModel: Model<EquipmentDocument>,
    private readonly bookingsService: BookingsService,
  ) {}

  async findAllCourses(activeOnly = true, actor?: AuthUser) {
    await this.ensureCoursesCategory();
    const mayReadInactive = actorHasPermission(actor, Permission.CoursesManage);
    return this.courseModel
      .find(activeOnly || !mayReadInactive ? { active: true } : {})
      .populate('categoryId', 'name type active systemKey')
      .sort({ name: 1 })
      .lean({ virtuals: true });
  }

  async createCourse(dto: CreateCourseDto, actor: AuthUser) {
    const category = await this.ensureCoursesCategory();
    try {
      const course = await this.courseModel.create({
        ...dto,
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        coverImage: dto.coverImage?.trim() || undefined,
        categoryId: category._id,
        createdBy: new Types.ObjectId(actor.id),
      });
      return this.courseModel
        .findById(course.id)
        .populate('categoryId', 'name type active systemKey')
        .lean({ virtuals: true });
    } catch (error: unknown) {
      this.handleDuplicate(
        error,
        'Já existe um curso com esse nome na categoria.',
      );
      throw error;
    }
  }

  async updateCourse(id: string, dto: UpdateCourseDto, actor?: AuthUser) {
    const existing = await this.courseModel.findById(id);
    if (!existing) throw new NotFoundException('Curso não encontrado.');
    this.assertCourseManageable(existing, actor);
    const course = await this.courseModel.findByIdAndUpdate(
      id,
      {
        ...dto,
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || undefined }
          : {}),
        ...(dto.coverImage !== undefined
          ? { coverImage: dto.coverImage.trim() || undefined }
          : {}),
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!course) throw new NotFoundException('Curso não encontrado.');
    return course;
  }

  async deleteCourse(id: string, actor?: AuthUser) {
    const course = await this.courseModel.findById(id);
    if (!course) throw new NotFoundException('Curso não encontrado.');
    this.assertCourseManageable(course, actor);

    const [cohortCount, materialCount] = await Promise.all([
      this.cohortModel.countDocuments({ courseId: course._id }),
      this.materialModel.countDocuments({ courseId: course._id }),
    ]);
    if (cohortCount > 0 || materialCount > 0) {
      throw new ConflictException(
        'O curso possui aulas ou turmas vinculadas. Remova esses vínculos antes de excluir.',
      );
    }

    await course.deleteOne();
    return { deleted: true };
  }

  async createCohort(dto: CreateCohortDto, actor: AuthUser) {
    const studentIds = [...new Set(dto.studentIds)];
    if (studentIds.length !== dto.studentIds.length) {
      throw new BadRequestException('A lista de alunos contém duplicidades.');
    }
    if (
      actor.role === Role.Professor &&
      !actorHasPermission(actor, Permission.CoursesManage)
    ) {
      if (actor.id !== dto.professorId || actor.unitId !== dto.unitId) {
        throw new ForbiddenException(
          'Professor só pode criar turmas para si na própria unidade.',
        );
      }
    }

    const unitObjectId = new Types.ObjectId(dto.unitId);
    const compatibleUnitIds = [unitObjectId, dto.unitId];
    const [course, unit, professor, equipment, students] = await Promise.all([
      this.courseModel.findOne({ _id: dto.courseId, active: true }),
      this.unitModel.findOne({ _id: unitObjectId, active: true }),
      this.userModel.findOne({
        _id: dto.professorId,
        role: Role.Professor,
        active: true,
        unitId: { $in: compatibleUnitIds },
      }),
      this.equipmentModel.findOne({
        _id: dto.equipmentId,
        unitId: { $in: compatibleUnitIds },
        active: true,
      }),
      this.userModel.countDocuments({
        _id: { $in: studentIds },
        role: Role.Student,
        active: true,
        unitId: { $in: compatibleUnitIds },
      }),
    ]);
    if (!course) throw new BadRequestException('Curso inválido ou inativo.');
    if (!unit) throw new BadRequestException('Unidade inválida ou inativa.');
    if (!professor) {
      throw new BadRequestException('Professor inválido para esta unidade.');
    }
    if (!equipment) {
      throw new BadRequestException('Equipamento inválido para esta unidade.');
    }
    if (students !== studentIds.length) {
      throw new BadRequestException(
        'Todos os alunos devem estar ativos e pertencer à unidade da turma.',
      );
    }

    const cohort = await this.cohortModel.create({
      name: dto.name.trim(),
      courseId: new Types.ObjectId(dto.courseId),
      unitId: new Types.ObjectId(dto.unitId),
      professorId: new Types.ObjectId(dto.professorId),
      equipmentId: new Types.ObjectId(dto.equipmentId),
      studentIds: studentIds.map((id) => new Types.ObjectId(id)),
      lessonCount: dto.lessonCount,
      durationMinutes: dto.durationMinutes,
      status: CohortStatus.Setup,
    });
    return this.findOneCohort(String(cohort.id), actor);
  }

  async createCohortWithLessons(
    dto: CreateCohortWithLessonsDto,
    actor: AuthUser,
  ) {
    if (dto.lessons.length !== dto.lessonCount) {
      throw new BadRequestException(
        `Configure exatamente ${dto.lessonCount} aulas.`,
      );
    }

    const conflicts = await this.bookingsService.classLessonScheduleConflicts(
      {
        unitId: dto.unitId,
        professorId: dto.professorId,
        equipmentId: dto.equipmentId,
        durationMinutes: dto.durationMinutes,
        lessons: dto.lessons.map((lesson) => ({
          date: lesson.date.slice(0, 10),
          time: lesson.time,
        })),
      },
      actor,
    );
    if (conflicts.length) this.throwScheduleConflicts(conflicts);

    let cohortId: string | undefined;
    try {
      const cohort = (await this.createCohort(dto, actor)) as {
        id?: string;
        _id?: unknown;
      };
      cohortId = cohort.id ?? this.referenceId(cohort._id);
      if (!cohortId) {
        throw new Error('A turma criada não retornou um identificador.');
      }
      return await this.configureLessons(
        cohortId,
        { lessons: dto.lessons },
        actor,
      );
    } catch (error) {
      if (cohortId) await this.cohortModel.findByIdAndDelete(cohortId).exec();
      throw error;
    }
  }

  async updateCohort(id: string, dto: UpdateCohortDto, actor: AuthUser) {
    const cohort = await this.getManageableCohort(id, actor);
    cohort.name = dto.name.trim();
    await cohort.save();
    return this.findOneCohort(id, actor);
  }

  async deleteCohort(id: string, actor: AuthUser) {
    const cohort = await this.getManageableCohort(id, actor);
    const lessons = await this.lessonModel
      .find({ cohortId: cohort._id })
      .select('bookingId');

    await Promise.all(
      lessons.map((lesson) =>
        this.bookingsService.remove(String(lesson.bookingId)),
      ),
    );
    await this.lessonModel.deleteMany({ cohortId: cohort._id });
    await cohort.deleteOne();
    return { deleted: true };
  }

  async configureLessons(
    id: string,
    dto: ConfigureCohortLessonsDto,
    actor: AuthUser,
  ) {
    const cohort = await this.getManageableCohort(id, actor);
    if (dto.lessons.length !== cohort.lessonCount) {
      throw new BadRequestException(
        `Configure exatamente ${cohort.lessonCount} aulas.`,
      );
    }
    if (await this.lessonModel.exists({ cohortId: cohort._id })) {
      throw new ConflictException(
        'As aulas desta turma já foram configuradas.',
      );
    }
    const materialIds = dto.lessons.map((lesson) => lesson.materialId);
    if (new Set(materialIds).size !== materialIds.length) {
      throw new BadRequestException(
        'Cada aula deve usar um material diferente.',
      );
    }
    const materials = await this.materialModel.find({
      _id: { $in: materialIds },
      courseId: cohort.courseId,
      status: MaterialStatus.Published,
    });
    if (materials.length !== materialIds.length) {
      throw new BadRequestException(
        'Todas as aulas devem usar materiais publicados deste curso.',
      );
    }

    const conflicts = await this.bookingsService.classLessonScheduleConflicts(
      {
        unitId: String(cohort.unitId),
        professorId: String(cohort.professorId),
        equipmentId: String(cohort.equipmentId),
        durationMinutes: cohort.durationMinutes,
        lessons: dto.lessons.map((lesson) => ({
          date: lesson.date.slice(0, 10),
          time: lesson.time,
        })),
      },
      actor,
    );
    if (conflicts.length) this.throwScheduleConflicts(conflicts);

    const bookingIds: string[] = [];
    try {
      for (const [index, lesson] of dto.lessons.entries()) {
        const material = materials.find(
          (item) => String(item._id) === lesson.materialId,
        );
        const bookingId = await this.bookingsService.createClassLesson(
          {
            studentId: String(cohort.studentIds[0]),
            professorId: String(cohort.professorId),
            equipmentId: String(cohort.equipmentId),
            unitId: String(cohort.unitId),
            title:
              lesson.title?.trim() || material?.title || `Aula ${index + 1}`,
            date: lesson.date.slice(0, 10),
            time: lesson.time,
            durationMinutes: cohort.durationMinutes,
            type: BookingType.Lesson,
            status: BookingStatus.Confirmed,
          },
          cohort.studentIds.map(String),
          { id: String(cohort.id), name: cohort.name },
          actor,
        );
        bookingIds.push(bookingId);
        const createdLesson = await this.lessonModel.create({
          cohortId: cohort._id,
          order: index + 1,
          title: lesson.title?.trim() || material?.title,
          materialId: new Types.ObjectId(lesson.materialId),
          bookingId: new Types.ObjectId(bookingId),
          date: lesson.date.slice(0, 10),
          time: lesson.time,
          durationMinutes: cohort.durationMinutes,
          attendance: cohort.studentIds.map((studentId) => ({
            studentId,
            present: false,
            materialReleased: false,
          })),
        });
        await this.bookingsService.linkClassLesson(
          bookingId,
          String(createdLesson.id),
        );
      }
      cohort.status = CohortStatus.Active;
      await cohort.save();
      return this.findOneCohort(id, actor);
    } catch (error) {
      await Promise.all([
        this.lessonModel.deleteMany({ cohortId: cohort._id }),
        ...bookingIds.map((bookingId) =>
          this.bookingsService.remove(bookingId),
        ),
      ]);
      throw error;
    }
  }

  async findCohorts(actor: AuthUser) {
    const filter: Record<string, unknown> = {};
    if (actor.role === Role.Student) {
      filter.studentIds = new Types.ObjectId(actor.id);
    } else if (
      actor.role === Role.Professor &&
      !actorHasPermission(actor, Permission.CoursesManage) &&
      !actorHasPermission(actor, Permission.AttendanceManage)
    ) {
      filter.professorId = new Types.ObjectId(actor.id);
    }
    const cohorts = await this.cohortModel
      .find(filter)
      .populate('courseId', 'name description coverImage active')
      .populate('unitId', 'label shortLabel timezone')
      .populate('professorId', 'name avatar')
      .populate('equipmentId', 'name')
      .populate('studentIds', 'name projectName avatar email')
      .sort({ createdAt: -1 })
      .lean({ virtuals: true });
    return Promise.all(
      cohorts.map(async (cohort) => ({
        ...cohort,
        progress: await this.progressFor(cohort._id, actor),
      })),
    );
  }

  async findOneCohort(id: string, actor: AuthUser) {
    const cohort = await this.cohortModel
      .findById(id)
      .populate('courseId', 'name description coverImage active')
      .populate('unitId', 'label shortLabel timezone')
      .populate('professorId', 'name avatar')
      .populate('equipmentId', 'name')
      .populate('studentIds', 'name projectName avatar email')
      .lean({ virtuals: true });
    if (!cohort) throw new NotFoundException('Turma não encontrada.');
    this.assertCohortAccess(cohort, actor);
    const lessons = await this.lessonModel
      .find({ cohortId: cohort._id })
      .populate('materialId', 'title description coverImage status')
      .populate('attendance.studentId', 'name projectName avatar')
      .sort({ order: 1 })
      .lean({ virtuals: true });
    const visibleLessons = lessons.map((lesson) => {
      if (actor.role !== Role.Student) return lesson;
      const attendance = lesson.attendance.find(
        (item) => this.referenceId(item.studentId) === actor.id,
      );
      return {
        ...lesson,
        attendance: undefined,
        locked: !attendance?.materialReleased,
        present: Boolean(attendance?.present),
      };
    });
    return {
      ...cohort,
      lessons: visibleLessons,
      progress: await this.progressFor(cohort._id, actor),
    };
  }

  async findStudentObservations(studentId: string, actor?: AuthUser) {
    if (!Types.ObjectId.isValid(studentId)) {
      throw new BadRequestException('Aluno inválido.');
    }
    const studentObjectId = new Types.ObjectId(studentId);
    const student = await this.userModel.exists({
      _id: studentObjectId,
      role: Role.Student,
    });
    if (!student) throw new NotFoundException('Aluno não encontrado.');

    const lessons = await this.lessonModel
      .find({
        attendance: {
          $elemMatch: {
            studentId: studentObjectId,
            observation: { $exists: true, $ne: '' },
          },
        },
      })
      .sort({ date: -1, time: -1 })
      .lean({ virtuals: true });

    if (!lessons.length) return [];

    const cohorts = await this.cohortModel
      .find({
        _id: { $in: lessons.map((lesson) => lesson.cohortId) },
        ...(actor?.role === Role.Professor &&
        !actorHasPermission(actor, Permission.CoursesManage) &&
        !actorHasPermission(actor, Permission.AttendanceManage)
          ? { professorId: new Types.ObjectId(actor.id) }
          : {}),
      })
      .populate('courseId', 'name')
      .populate('professorId', 'name')
      .lean({ virtuals: true });
    const cohortsById = new Map(
      cohorts.map((cohort) => [String(cohort._id), cohort]),
    );

    return lessons.flatMap((lesson) => {
      const attendance = lesson.attendance.find(
        (item) =>
          String(item.studentId) === studentId &&
          Boolean(item.observation?.trim()),
      );
      const cohort = cohortsById.get(String(lesson.cohortId));
      if (!attendance || !cohort) return [];

      const course = cohort.courseId as unknown as { name?: string };
      const professor = cohort.professorId as unknown as { name?: string };
      return [
        {
          id: `${String(lesson._id)}:${studentId}`,
          courseName: course.name ?? 'Curso',
          cohortName: cohort.name,
          lessonId: String(lesson._id),
          lessonOrder: lesson.order,
          lessonTitle: lesson.title,
          date: lesson.date,
          time: lesson.time,
          observation: attendance.observation!.trim(),
          professorName: professor.name,
        },
      ];
    });
  }

  async findStudentCourseProgress(studentId: string, actor: AuthUser) {
    if (!Types.ObjectId.isValid(studentId)) {
      throw new BadRequestException('Aluno inválido.');
    }
    const studentObjectId = new Types.ObjectId(studentId);
    const student = await this.userModel
      .findOne({ _id: studentObjectId, role: Role.Student, active: true })
      .select('showAcademicProgress profileCourseIds')
      .lean()
      .exec();
    if (!student) throw new NotFoundException('Aluno não encontrado.');

    const isOwner = actor.id === studentId;
    if (!isOwner && student.showAcademicProgress === false) return [];

    const cohorts = await this.cohortModel
      .find({ studentIds: studentObjectId })
      .populate('courseId', 'name description coverImage active')
      .lean({ virtuals: true });
    if (!cohorts.length) return [];

    const lessons = await this.lessonModel
      .find({ cohortId: { $in: cohorts.map((cohort) => cohort._id) } })
      .select('cohortId attendance')
      .lean();
    const courseIds = Array.isArray(student.profileCourseIds)
      ? new Set(student.profileCourseIds.map(String))
      : null;
    const progressByCourse = new Map<
      string,
      {
        id: string;
        name: string;
        description?: string;
        coverImage?: string;
        completed: number;
        total: number;
      }
    >();
    const courseIdByCohort = new Map<string, string>();

    for (const cohort of cohorts) {
      const course = cohort.courseId as unknown as {
        _id?: Types.ObjectId;
        id?: string;
        name?: string;
        description?: string;
        coverImage?: string;
      };
      const courseId = String(course?._id ?? course?.id ?? '');
      if (!courseId) continue;
      courseIdByCohort.set(String(cohort._id), courseId);
      if (!progressByCourse.has(courseId)) {
        progressByCourse.set(courseId, {
          id: courseId,
          name: course.name ?? 'Curso',
          description: course.description,
          coverImage: course.coverImage,
          completed: 0,
          total: 0,
        });
      }
    }

    for (const lesson of lessons) {
      const courseId = courseIdByCohort.get(String(lesson.cohortId));
      const progress = courseId ? progressByCourse.get(courseId) : undefined;
      if (!progress) continue;
      progress.total += 1;
      if (
        lesson.attendance.some(
          (item) => String(item.studentId) === studentId && item.present,
        )
      ) {
        progress.completed += 1;
      }
    }

    return [...progressByCourse.values()]
      .map((course) => ({
        ...course,
        percent: course.total
          ? Math.round((course.completed / course.total) * 100)
          : 0,
        visible:
          student.showAcademicProgress !== false &&
          (courseIds === null || courseIds.has(course.id)),
      }))
      .filter((course) => isOwner || course.visible)
      .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
  }

  async updateAttendance(
    lessonId: string,
    dto: UpdateAttendanceDto,
    actor: AuthUser,
  ) {
    const lesson = await this.lessonModel.findById(lessonId);
    if (!lesson) throw new NotFoundException('Aula não encontrada.');
    const cohort = await this.getManageableCohort(
      String(lesson.cohortId),
      actor,
      Permission.AttendanceManage,
    );
    if (!cohort.studentIds.some((id) => String(id) === dto.studentId)) {
      throw new BadRequestException('Aluno não pertence a esta turma.');
    }
    const attendance = lesson.attendance.find(
      (item) => String(item.studentId) === dto.studentId,
    );
    if (!attendance)
      throw new NotFoundException('Registro de presença não encontrado.');
    if (dto.present !== undefined) attendance.present = dto.present;
    if (attendance.present) {
      attendance.materialReleased = true;
    } else if (dto.materialReleased !== undefined) {
      attendance.materialReleased = dto.materialReleased;
    }
    if (dto.observation !== undefined) {
      attendance.observation = dto.observation.trim() || undefined;
    }
    attendance.markedBy = new Types.ObjectId(actor.id);
    attendance.markedAt = new Date();
    await lesson.save();
    return this.findOneCohort(String(cohort.id), actor);
  }

  private async getManageableCohort(
    id: string,
    actor: AuthUser,
    elevatedPermission = Permission.CoursesManage,
  ) {
    const cohort = await this.cohortModel.findById(id);
    if (!cohort) throw new NotFoundException('Turma não encontrada.');
    if (
      actor.role === Role.Professor &&
      !actorHasPermission(actor, elevatedPermission) &&
      (String(cohort.professorId) !== actor.id ||
        String(cohort.unitId) !== actor.unitId)
    ) {
      throw new ForbiddenException(
        'Turma pertence a outro professor ou unidade.',
      );
    }
    return cohort;
  }

  private assertCohortAccess(
    cohort: { professorId: unknown; unitId: unknown; studentIds: unknown[] },
    actor: AuthUser,
  ) {
    if (
      actor.role === Role.Student &&
      !cohort.studentIds.some((id) => this.referenceId(id) === actor.id)
    ) {
      throw new ForbiddenException('Você não participa desta turma.');
    }
    if (
      actor.role === Role.Professor &&
      !actorHasPermission(actor, Permission.CoursesManage) &&
      !actorHasPermission(actor, Permission.AttendanceManage) &&
      (this.referenceId(cohort.professorId) !== actor.id ||
        this.referenceId(cohort.unitId) !== actor.unitId)
    ) {
      throw new ForbiddenException(
        'Turma pertence a outro professor ou unidade.',
      );
    }
  }

  private assertCourseManageable(
    course: Pick<CourseDocument, 'createdBy'>,
    actor?: AuthUser,
  ) {
    if (!actor) return;
    if (
      actor.role === Role.Professor &&
      !actorHasPermission(actor, Permission.CoursesManage) &&
      String(course.createdBy) !== actor.id
    ) {
      throw new ForbiddenException('Curso pertence a outro autor.');
    }
  }

  private async progressFor(cohortId: Types.ObjectId, actor: AuthUser) {
    const lessons = await this.lessonModel
      .find({ cohortId })
      .select('attendance');
    if (!lessons.length) return { completed: 0, total: 0, percent: 0 };
    const completed = lessons.filter((lesson) =>
      lesson.attendance.some((item) =>
        actor.role === Role.Student
          ? String(item.studentId) === actor.id && item.present
          : item.present,
      ),
    ).length;
    return {
      completed,
      total: lessons.length,
      percent: Math.round((completed / lessons.length) * 100),
    };
  }

  private referenceId(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Types.ObjectId) return value.toHexString();
    if (value && typeof value === 'object' && '_id' in value) {
      return this.referenceId(value._id);
    }
    return '';
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

  private handleDuplicate(error: unknown, message: string) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException(message);
    }
  }

  private throwScheduleConflicts(
    conflicts: Awaited<
      ReturnType<BookingsService['classLessonScheduleConflicts']>
    >,
  ): never {
    const lessonCount = new Set(
      conflicts.map((conflict) => conflict.lessonIndex),
    ).size;
    throw new ConflictException({
      code: 'COHORT_SCHEDULE_CONFLICT',
      message:
        lessonCount === 1
          ? 'Uma aula da turma conflita com a agenda atual.'
          : `${lessonCount} aulas da turma conflitam com a agenda atual.`,
      conflicts,
    });
  }
}
