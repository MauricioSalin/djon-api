import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Permission } from '../common/enums/permission.enum';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { actorHasPermission } from '../common/permissions';
import { EquipmentsService } from '../equipments/equipments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnitsService } from '../units/units.service';
import { UsersService } from '../users/users.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import {
  Booking,
  BookingDocument,
  BookingStatus,
  BookingType,
} from './schemas/booking.schema';

const OPENING_MINUTES = 8 * 60;
const CLOSING_MINUTES = 22 * 60;
const SLOT_MINUTES = 30;
const DEFAULT_DURATION_MINUTES = 60;

type ResourceSelection = {
  professorId?: string;
  equipmentId: string;
  resourceKey: string;
  equipmentUnavailableWeekdays: number[];
  equipmentUnavailableFrom: string | null;
  equipmentUnavailableUntil: string | null;
};

type AvailabilityBooking = {
  _id: unknown;
  title?: string;
  date: string;
  time: string;
  durationMinutes?: number;
  professorId?: unknown;
  equipmentId?: unknown;
};

export type ClassLessonScheduleConflict = {
  lessonIndex: number;
  date: string;
  time: string;
  endTime: string;
  kind:
    | 'equipment'
    | 'professor'
    | 'equipment-weekday'
    | 'equipment-period'
    | 'cohort-lesson';
  message: string;
  conflictingBookingId?: string;
  conflictingTitle?: string;
  conflictingLessonIndex?: number;
};

export type ClassLessonScheduleInput = {
  date: string;
  time: string;
};

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    private readonly usersService: UsersService,
    private readonly unitsService: UnitsService,
    private readonly equipmentsService: EquipmentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    dto: CreateBookingDto,
    actor: AuthUser,
    trainingLimitCreditMinutes = 0,
    courseWorkflow = false,
  ) {
    if (
      actor.role !== Role.Student &&
      !courseWorkflow &&
      !this.isBookingManager(actor)
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar a agenda.',
      );
    }
    const studentId = actor.role === Role.Student ? actor.id : dto.studentId;
    if (!studentId) throw new BadRequestException('Aluno é obrigatório.');
    if (
      actor.role !== Role.Student &&
      !(await this.usersService.findActiveByRole(studentId, Role.Student))
    ) {
      throw new BadRequestException('Selecione um aluno ativo.');
    }

    if (actor.role === Role.Student && dto.type !== BookingType.Training) {
      throw new ForbiddenException(
        'Alunos podem solicitar apenas treinos. Aulas são agendadas pelos professores ou pela administração.',
      );
    }

    const unitId = await this.resolveUnitId(dto.unitId);
    this.assertActorUnit(actor, unitId);
    const unit = await this.unitsService.findActiveById(unitId);
    const status =
      actor.role === Role.Student
        ? BookingStatus.Pending
        : BookingStatus.Confirmed;
    const type = dto.type;
    const durationMinutes = dto.durationMinutes ?? DEFAULT_DURATION_MINUTES;
    const selection = await this.resolveResources(
      type,
      dto.professorId,
      dto.equipmentId,
      unitId,
    );

    this.validateSchedule(dto.date, dto.time, durationMinutes, unit?.timezone);
    if (actor.role === Role.Student) {
      this.assertStudentBookingHorizon(dto.date, unit?.timezone);
      await this.assertTrainingLimit(
        studentId,
        durationMinutes,
        trainingLimitCreditMinutes,
      );
    }
    await this.assertAvailable(
      unitId,
      selection,
      dto.date,
      dto.time,
      durationMinutes,
    );
    const locks = this.buildActiveLocks(
      status,
      unitId,
      selection,
      dto.date,
      dto.time,
      durationMinutes,
    );

    try {
      const booking = await this.bookingModel.create({
        ...dto,
        studentId: new Types.ObjectId(studentId),
        professorId: selection.professorId
          ? new Types.ObjectId(selection.professorId)
          : undefined,
        equipmentId: new Types.ObjectId(selection.equipmentId),
        unitId: new Types.ObjectId(unitId),
        resourceKey: selection.resourceKey,
        durationMinutes,
        status,
        type,
        requestedBy: new Types.ObjectId(actor.id),
        ...locks,
        statusHistory: [
          {
            status,
            changedBy: new Types.ObjectId(actor.id),
            changedAt: new Date(),
          },
        ],
      });
      await this.notifyBookingCreated(booking, actor, courseWorkflow);
      return this.findOne(String(booking.id), actor);
    } catch (error: unknown) {
      this.handleConflict(error);
      throw error;
    }
  }

  async findAll(query: QueryBookingsDto, actor: AuthUser) {
    const filter: Record<string, unknown> = {};
    if (actor.role === Role.Student) {
      filter.$or = [
        { studentId: new Types.ObjectId(actor.id) },
        { studentIds: new Types.ObjectId(actor.id) },
      ];
    } else if (query.studentId) {
      filter.$or = [
        { studentId: new Types.ObjectId(query.studentId) },
        { studentIds: new Types.ObjectId(query.studentId) },
      ];
    }
    if (
      actor.role === Role.Professor &&
      !this.hasAnyBookingAdminPermission(actor)
    ) {
      if (!actor.unitId) {
        throw new ForbiddenException('Professor sem unidade vinculada.');
      }
      filter.unitId = new Types.ObjectId(actor.unitId);
    }
    if (query.professorId) {
      filter.professorId = new Types.ObjectId(query.professorId);
    }
    if (
      query.unitId &&
      (actor.role !== Role.Professor ||
        this.hasAnyBookingAdminPermission(actor))
    )
      filter.unitId = new Types.ObjectId(query.unitId);
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.dateFrom || query.dateTo) {
      filter.date = {
        ...(query.dateFrom ? { $gte: query.dateFrom } : {}),
        ...(query.dateTo ? { $lte: query.dateTo } : {}),
      };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .populate('studentId', 'name email whatsapp avatar socials')
        .populate('studentIds', 'name email whatsapp avatar socials')
        .populate('professorId', 'name email avatar unitId')
        .populate('equipmentId', 'name description unitId active')
        .populate('unitId', 'key label shortLabel timezone')
        .sort({ date: 1, time: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean({ virtuals: true })
        .exec(),
      this.bookingModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, actor: AuthUser) {
    this.ensureObjectId(id);
    const booking = await this.bookingModel
      .findById(id)
      .populate('studentId', 'name email whatsapp avatar socials')
      .populate('studentIds', 'name email whatsapp avatar socials')
      .populate('professorId', 'name email avatar unitId')
      .populate('equipmentId', 'name description unitId active')
      .populate('unitId', 'key label shortLabel timezone')
      .lean({ virtuals: true })
      .exec();
    if (!booking) throw new NotFoundException('Agendamento não encontrado.');
    const ownerId = this.referenceId(booking.studentId);
    const classStudentIds = (booking.studentIds ?? []).map((student) =>
      this.referenceId(student),
    );
    if (
      actor.role === Role.Student &&
      ownerId !== actor.id &&
      !classStudentIds.includes(actor.id)
    ) {
      throw new ForbiddenException('Agendamento pertence a outro aluno.');
    }
    if (
      actor.role === Role.Professor &&
      !this.hasAnyBookingAdminPermission(actor) &&
      this.referenceId(booking.unitId) !== actor.unitId
    ) {
      throw new ForbiddenException('Agendamento pertence a outra unidade.');
    }
    return booking;
  }

  async remove(id: string, actor?: AuthUser) {
    this.ensureObjectId(id);
    if (actor) {
      const booking = await this.getDocument(id);
      this.assertActorUnit(actor, String(booking.unitId));
      this.assertCanManageBooking(actor, booking);
    }
    const deleted = await this.bookingModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Agendamento não encontrado.');
    return { id };
  }

  async createClassLesson(
    dto: CreateBookingDto,
    studentIds: string[],
    cohort: { id: string; name: string },
    actor: AuthUser,
  ) {
    const booking = (await this.create(
      { ...dto, studentId: studentIds[0] },
      actor,
      0,
      true,
    )) as { id?: string; _id?: unknown };
    const bookingId = booking.id ?? String(booking._id);
    await this.bookingModel.findByIdAndUpdate(bookingId, {
      studentIds: studentIds.map((id) => new Types.ObjectId(id)),
      isClassLesson: true,
      cohortId: new Types.ObjectId(cohort.id),
      cohortName: cohort.name.trim(),
    });
    return bookingId;
  }

  async linkClassLesson(bookingId: string, lessonId: string) {
    await this.bookingModel.findByIdAndUpdate(bookingId, {
      lessonId: new Types.ObjectId(lessonId),
    });
  }

  async classLessonScheduleConflicts(
    input: {
      unitId: string;
      professorId: string;
      equipmentId: string;
      durationMinutes: number;
      lessons: ClassLessonScheduleInput[];
    },
    actor: AuthUser,
  ): Promise<ClassLessonScheduleConflict[]> {
    const unitId = await this.resolveUnitId(input.unitId);
    this.assertActorUnit(actor, unitId);
    const [unit, selection] = await Promise.all([
      this.unitsService.findActiveById(unitId),
      this.resolveResources(
        BookingType.Lesson,
        input.professorId,
        input.equipmentId,
        unitId,
      ),
    ]);

    for (const lesson of input.lessons) {
      this.validateSchedule(
        lesson.date,
        lesson.time,
        input.durationMinutes,
        unit?.timezone,
      );
    }
    if (!input.lessons.length) return [];

    const dates = input.lessons.map((lesson) => lesson.date).sort();
    const bookings = await this.findAvailabilityBookings(
      unitId,
      dates[0],
      dates[dates.length - 1],
    );
    const conflicts: ClassLessonScheduleConflict[] = [];

    input.lessons.forEach((lesson, lessonIndex) => {
      const endTime = this.minutesToTime(
        this.timeToMinutes(lesson.time) + input.durationMinutes,
      );
      const base = {
        lessonIndex,
        date: lesson.date,
        time: lesson.time,
        endTime,
      };

      if (
        selection.equipmentUnavailableWeekdays.includes(
          this.weekdayOf(lesson.date),
        )
      ) {
        conflicts.push({
          ...base,
          kind: 'equipment-weekday',
          message: 'O equipamento está desativado para este dia da semana.',
        });
      }
      if (
        this.overlapsEquipmentUnavailablePeriod(
          lesson.date,
          lesson.time,
          input.durationMinutes,
          selection,
        )
      ) {
        conflicts.push({
          ...base,
          kind: 'equipment-period',
          message: 'O equipamento está bloqueado neste período.',
        });
      }

      for (const booking of bookings) {
        if (
          booking.date !== lesson.date ||
          !this.overlaps(lesson.time, input.durationMinutes, booking)
        ) {
          continue;
        }
        const sameEquipment =
          this.referenceId(booking.equipmentId) === selection.equipmentId;
        const sameProfessor = Boolean(
          selection.professorId &&
          this.referenceId(booking.professorId) === selection.professorId,
        );
        if (!sameEquipment && !sameProfessor) continue;

        conflicts.push({
          ...base,
          kind: sameEquipment ? 'equipment' : 'professor',
          message: sameEquipment
            ? 'O equipamento já possui um agendamento neste horário.'
            : 'O professor já possui um agendamento neste horário.',
          conflictingBookingId: this.referenceId(booking._id),
          conflictingTitle: booking.title,
        });
      }

      for (
        let previousIndex = 0;
        previousIndex < lessonIndex;
        previousIndex += 1
      ) {
        const previous = input.lessons[previousIndex];
        if (
          previous.date === lesson.date &&
          this.overlaps(lesson.time, input.durationMinutes, {
            _id: '',
            date: previous.date,
            time: previous.time,
            durationMinutes: input.durationMinutes,
          })
        ) {
          conflicts.push({
            ...base,
            kind: 'cohort-lesson',
            message: `O horário se sobrepõe à aula ${previousIndex + 1} desta turma.`,
            conflictingLessonIndex: previousIndex,
          });
        }
      }
    });

    return conflicts;
  }

  async update(id: string, dto: UpdateBookingDto, actor: AuthUser) {
    if (actor.role === Role.Student) {
      throw new ForbiddenException('Aluno deve usar cancelar ou remarcar.');
    }

    const booking = await this.getDocument(id);
    this.assertActorUnit(actor, String(booking.unitId));
    this.assertCanManageBooking(actor, booking);
    const previousStatus = booking.status;
    const status = dto.status ?? booking.status;
    if (
      previousStatus === BookingStatus.Pending &&
      status !== BookingStatus.Pending &&
      !this.isBookingManager(actor)
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para aprovar ou recusar treinos.',
      );
    }
    const studentId = dto.studentId ?? this.referenceId(booking.studentId);
    if (
      dto.status === BookingStatus.Pending &&
      booking.status !== BookingStatus.Pending
    ) {
      throw new BadRequestException(
        'Somente solicitações de treino feitas por alunos podem ficar pendentes.',
      );
    }
    if (
      dto.status === BookingStatus.Rejected &&
      booking.status !== BookingStatus.Pending &&
      booking.status !== BookingStatus.Rejected
    ) {
      throw new BadRequestException(
        'Somente solicitações pendentes podem ser recusadas.',
      );
    }
    if (
      this.isActiveStatus(status) &&
      !(await this.usersService.findActiveByRole(studentId, Role.Student))
    ) {
      throw new BadRequestException('Selecione um aluno ativo.');
    }
    const unitId = await this.resolveUnitId(
      dto.unitId ?? String(booking.unitId),
    );
    const type = dto.type ?? booking.type;
    const professorId = Object.prototype.hasOwnProperty.call(dto, 'professorId')
      ? dto.professorId
      : booking.professorId?.toString();
    const equipmentId = Object.prototype.hasOwnProperty.call(dto, 'equipmentId')
      ? dto.equipmentId
      : booking.equipmentId?.toString();
    const selection = await this.resolveResources(
      type,
      professorId,
      equipmentId,
      unitId,
    );
    if (
      actor.role === Role.Professor &&
      !actorHasPermission(actor, Permission.BookingsManage) &&
      !actorHasPermission(actor, Permission.CoursesManage) &&
      booking.isClassLesson &&
      selection.professorId !== actor.id
    ) {
      throw new ForbiddenException(
        'Professor não pode transferir sua turma para outro professor.',
      );
    }
    const date = dto.date ?? booking.date;
    const time = dto.time ?? booking.time;
    const durationMinutes = dto.durationMinutes ?? booking.durationMinutes;
    const unit = await this.unitsService.findActiveById(unitId);

    this.validateSchedule(date, time, durationMinutes, unit?.timezone);
    if (this.isActiveStatus(status)) {
      await this.assertAvailable(
        unitId,
        selection,
        date,
        time,
        durationMinutes,
        id,
      );
    }

    const changes: Record<string, unknown> = { ...dto };
    delete changes.reason;
    delete changes.resourceKey;
    delete changes.professorId;
    delete changes.equipmentId;
    delete changes.unitId;
    delete changes.studentId;

    Object.assign(booking, {
      ...changes,
      studentId: dto.studentId
        ? new Types.ObjectId(dto.studentId)
        : booking.studentId,
      professorId: selection.professorId
        ? new Types.ObjectId(selection.professorId)
        : undefined,
      equipmentId: new Types.ObjectId(selection.equipmentId),
      unitId: new Types.ObjectId(unitId),
      resourceKey: selection.resourceKey,
      durationMinutes,
      status,
      type,
      ...this.buildActiveLocks(
        status,
        unitId,
        selection,
        date,
        time,
        durationMinutes,
      ),
    });

    if (status !== previousStatus) {
      booking.statusHistory.push({
        status,
        changedBy: new Types.ObjectId(actor.id),
        reason: dto.reason,
        changedAt: new Date(),
      });
    }

    try {
      await booking.save();
      if (
        previousStatus === BookingStatus.Pending &&
        status === BookingStatus.Confirmed &&
        booking.originalBookingId
      ) {
        const original = await this.bookingModel.findById(
          booking.originalBookingId,
        );
        if (original && this.isActiveStatus(original.status)) {
          await this.changeStatus(
            original,
            BookingStatus.Cancelled,
            actor,
            'Substituído por remarcação aprovada.',
            false,
          );
        }
      }
      if (status !== previousStatus) {
        await this.notifyStudent(booking, status, dto.reason);
      }
      return this.findOne(id, actor);
    } catch (error: unknown) {
      this.handleConflict(error);
      throw error;
    }
  }

  async approve(id: string, actor: AuthUser) {
    const booking = await this.getDocument(id);
    this.assertActorUnit(
      actor,
      String(booking.unitId),
      Permission.BookingsReview,
    );
    this.assertCanManageBooking(actor, booking, Permission.BookingsReview);
    if (booking.status !== BookingStatus.Pending) {
      throw new BadRequestException(
        'Somente solicitações pendentes podem ser aprovadas.',
      );
    }
    if (
      !(await this.usersService.findActiveByRole(
        this.referenceId(booking.studentId),
        Role.Student,
      ))
    ) {
      throw new BadRequestException(
        'O aluno está desativado e a solicitação não pode ser aprovada.',
      );
    }
    const unitId = await this.resolveUnitId(String(booking.unitId));
    const unit = await this.unitsService.findActiveById(unitId);
    const selection = await this.resolveResources(
      booking.type,
      booking.professorId?.toString(),
      booking.equipmentId?.toString(),
      unitId,
    );
    this.validateSchedule(
      booking.date,
      booking.time,
      booking.durationMinutes,
      unit?.timezone,
    );
    await this.assertAvailable(
      unitId,
      selection,
      booking.date,
      booking.time,
      booking.durationMinutes,
      id,
    );
    Object.assign(
      booking,
      this.buildActiveLocks(
        BookingStatus.Confirmed,
        unitId,
        selection,
        booking.date,
        booking.time,
        booking.durationMinutes,
      ),
    );
    await this.changeStatus(
      booking,
      BookingStatus.Confirmed,
      actor,
      undefined,
      false,
    );
    if (booking.originalBookingId) {
      const original = await this.bookingModel.findById(
        booking.originalBookingId,
      );
      if (original && this.isActiveStatus(original.status)) {
        await this.changeStatus(
          original,
          BookingStatus.Cancelled,
          actor,
          'Substituído por remarcação aprovada.',
          false,
        );
      }
    }
    await this.notifyStudent(booking, BookingStatus.Confirmed);
    return this.findOne(id, actor);
  }

  async reject(id: string, reason: string | undefined, actor: AuthUser) {
    const booking = await this.getDocument(id);
    this.assertActorUnit(
      actor,
      String(booking.unitId),
      Permission.BookingsReview,
    );
    this.assertCanManageBooking(actor, booking, Permission.BookingsReview);
    if (booking.status !== BookingStatus.Pending) {
      throw new BadRequestException(
        'Somente solicitações pendentes podem ser recusadas.',
      );
    }
    await this.changeStatus(
      booking,
      BookingStatus.Rejected,
      actor,
      reason,
      false,
    );
    await this.notifyStudent(booking, BookingStatus.Rejected, reason);
    return this.findOne(id, actor);
  }

  async cancel(id: string, reason: string | undefined, actor: AuthUser) {
    const booking = await this.getDocument(id);
    this.assertActorUnit(actor, String(booking.unitId));
    if (actor.role !== Role.Student) {
      this.assertCanManageBooking(actor, booking);
    }
    if (actor.role === Role.Student && String(booking.studentId) !== actor.id) {
      throw new ForbiddenException('Agendamento pertence a outro aluno.');
    }
    if (!this.isActiveStatus(booking.status)) return booking;
    await this.changeStatus(
      booking,
      BookingStatus.Cancelled,
      actor,
      reason,
      false,
    );
    if (actor.role === Role.Student) {
      await this.notifyBookingCancelledByStudent(booking, actor);
    } else {
      await this.notifyStudent(booking, BookingStatus.Cancelled, reason);
    }
    return this.findOne(id, actor);
  }

  async reschedule(id: string, dto: CreateBookingDto, actor: AuthUser) {
    const original = await this.getDocument(id);
    this.assertActorUnit(actor, String(original.unitId));
    if (actor.role !== Role.Student)
      this.assertCanManageBooking(actor, original);
    if (
      actor.role === Role.Student &&
      String(original.studentId) !== actor.id
    ) {
      throw new ForbiddenException('Agendamento pertence a outro aluno.');
    }
    const created = await this.create(
      {
        ...dto,
        studentId: String(original.studentId),
        type: dto.type ?? original.type,
        title: dto.title || original.title,
        notes: dto.notes ?? original.notes,
      },
      actor,
      actor.role === Role.Student &&
        original.type === BookingType.Training &&
        this.isActiveStatus(original.status)
        ? original.durationMinutes
        : 0,
    );
    const createdId = this.referenceId(created);
    await this.bookingModel.findByIdAndUpdate(createdId, {
      originalBookingId: original._id,
    });
    return this.findOne(createdId, actor);
  }

  async availability(
    date: string,
    unitId?: string,
    type?: string,
    professorId?: string,
    equipmentId?: string,
    excludeBookingId?: string,
    duration?: string,
    actor?: AuthUser,
  ) {
    this.validateDate(date);
    const resolvedUnitId = await this.resolveUnitId(unitId);
    if (actor) this.assertActorUnit(actor, resolvedUnitId);
    const unit = await this.unitsService.findActiveById(resolvedUnitId);
    const selection = await this.resolveAvailabilityResources(
      type,
      professorId,
      equipmentId,
      resolvedUnitId,
    );
    const durationMinutes = this.resolveDurationMinutes(duration);
    const bookings = await this.findAvailabilityBookings(
      resolvedUnitId,
      date,
      date,
      excludeBookingId,
    );
    const availableTimes = this.availableStartTimes(
      date,
      selection,
      bookings,
      durationMinutes,
      unit?.timezone,
    );
    const allTimes = this.bookingStartTimes(durationMinutes);

    return {
      date,
      unitId: resolvedUnitId,
      resourceKey: selection.resourceKey,
      availableTimes,
      occupiedTimes: allTimes.filter((time) => !availableTimes.includes(time)),
      occupiedEquipment: this.occupiedEquipmentDetails(bookings),
    };
  }

  async monthlyAvailability(
    month: string,
    unitId?: string,
    type?: string,
    professorId?: string,
    equipmentId?: string,
    excludeBookingId?: string,
    duration?: string,
    actor?: AuthUser,
  ) {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('Mês inválido para consultar a agenda.');
    }
    const durationMinutes = this.resolveDurationMinutes(duration);
    const resolvedUnitId = await this.resolveUnitId(unitId);
    if (actor) this.assertActorUnit(actor, resolvedUnitId);
    const unit = await this.unitsService.findActiveById(resolvedUnitId);
    const selection = await this.resolveAvailabilityResources(
      type,
      professorId,
      equipmentId,
      resolvedUnitId,
    );
    const [year, monthNumber] = month.split('-').map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const dateFrom = `${month}-01`;
    const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;
    const bookings = await this.findAvailabilityBookings(
      resolvedUnitId,
      dateFrom,
      dateTo,
      excludeBookingId,
    );
    const availableDates: string[] = [];
    for (let day = 1; day <= lastDay; day += 1) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      if (
        this.availableStartTimes(
          date,
          selection,
          bookings,
          durationMinutes,
          unit?.timezone,
        ).length > 0
      ) {
        availableDates.push(date);
      }
    }
    return { month, unitId: resolvedUnitId, availableDates };
  }

  private async getDocument(id: string) {
    this.ensureObjectId(id);
    const booking = await this.bookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException('Agendamento não encontrado.');
    return booking;
  }

  private async changeStatus(
    booking: BookingDocument,
    status: BookingStatus,
    actor: AuthUser,
    reason?: string,
    notify = true,
  ) {
    const selection: ResourceSelection = {
      professorId: booking.professorId?.toString(),
      equipmentId: booking.equipmentId?.toString() ?? '',
      resourceKey: booking.resourceKey,
      equipmentUnavailableWeekdays: [],
      equipmentUnavailableFrom: null,
      equipmentUnavailableUntil: null,
    };
    booking.status = status;
    Object.assign(
      booking,
      this.buildActiveLocks(
        status,
        String(booking.unitId),
        selection,
        booking.date,
        booking.time,
        booking.durationMinutes,
      ),
    );
    booking.statusHistory.push({
      status,
      changedBy: new Types.ObjectId(actor.id),
      reason,
      changedAt: new Date(),
    });
    try {
      await booking.save();
    } catch (error: unknown) {
      this.handleConflict(error);
      throw error;
    }
    if (notify) await this.notifyStudent(booking, status, reason);
  }

  private async resolveUnitId(unitId?: string) {
    if (unitId) {
      const unit = await this.unitsService.findActiveById(unitId);
      if (!unit) {
        throw new BadRequestException('A unidade selecionada não está ativa.');
      }
      return this.referenceId(unit);
    }
    const unit = await this.unitsService.findDefault();
    if (!unit) throw new BadRequestException('Unidade padrão não cadastrada.');
    return this.referenceId(unit);
  }

  private async resolveAvailabilityResources(
    type: string | undefined,
    professorId: string | undefined,
    equipmentId: string | undefined,
    unitId: string,
  ) {
    if (type !== BookingType.Lesson && type !== BookingType.Training) {
      throw new BadRequestException(
        'Selecione aula ou treino para consultar os horários.',
      );
    }
    return this.resolveResources(type, professorId, equipmentId, unitId);
  }

  private async resolveResources(
    type: BookingType,
    professorId: string | undefined,
    equipmentId: string | undefined,
    unitId: string,
  ): Promise<ResourceSelection> {
    let resolvedProfessorId: string | undefined;
    if (type === BookingType.Lesson) {
      if (!professorId) {
        throw new BadRequestException('Selecione o professor da aula.');
      }
      const professor = await this.usersService.findActiveByRole(
        professorId,
        Role.Professor,
      );
      if (
        !professor ||
        !professor.unitId ||
        this.referenceId(professor.unitId) !== unitId
      ) {
        throw new BadRequestException(
          'O professor selecionado não atende nesta unidade.',
        );
      }
      resolvedProfessorId = professorId;
    }

    if (!equipmentId) {
      throw new BadRequestException('Selecione o equipamento.');
    }
    const equipment = await this.equipmentsService.findActiveById(equipmentId);
    if (this.referenceId(equipment.unitId) !== unitId) {
      throw new BadRequestException(
        'O equipamento não pertence à unidade selecionada.',
      );
    }

    return {
      professorId: resolvedProfessorId,
      equipmentId,
      resourceKey: resolvedProfessorId
        ? `professor:${resolvedProfessorId}|equipment:${equipmentId}`
        : `equipment:${equipmentId}`,
      equipmentUnavailableWeekdays: equipment.unavailableWeekdays ?? [],
      equipmentUnavailableFrom: equipment.unavailableFrom ?? null,
      equipmentUnavailableUntil: equipment.unavailableUntil ?? null,
    };
  }

  private async assertAvailable(
    unitId: string,
    selection: ResourceSelection,
    date: string,
    time: string,
    durationMinutes: number,
    excludeBookingId?: string,
  ) {
    if (selection.equipmentUnavailableWeekdays.includes(this.weekdayOf(date))) {
      throw new ConflictException(
        'Este equipamento não está disponível no dia da semana escolhido.',
      );
    }
    if (
      this.overlapsEquipmentUnavailablePeriod(
        date,
        time,
        durationMinutes,
        selection,
      )
    ) {
      throw new ConflictException(
        'Este equipamento está bloqueado no período escolhido.',
      );
    }
    const bookings = await this.findAvailabilityBookings(
      unitId,
      date,
      date,
      excludeBookingId,
    );
    const conflict = bookings.find(
      (booking) =>
        this.usesSelectedResource(booking, selection) &&
        this.overlaps(time, durationMinutes, booking),
    );
    if (!conflict) return;

    const sameEquipment =
      this.referenceId(conflict.equipmentId) === selection.equipmentId;
    throw new ConflictException(
      sameEquipment
        ? 'Este equipamento já está reservado nesse horário.'
        : 'O professor já possui um agendamento nesse horário.',
    );
  }

  private findAvailabilityBookings(
    unitId: string,
    dateFrom: string,
    dateTo: string,
    excludeBookingId?: string,
  ): Promise<AvailabilityBooking[]> {
    if (excludeBookingId) this.ensureObjectId(excludeBookingId);
    const filter: Record<string, unknown> = {
      unitId: new Types.ObjectId(unitId),
      status: {
        $nin: [BookingStatus.Cancelled, BookingStatus.Rejected],
      },
      date: dateFrom === dateTo ? dateFrom : { $gte: dateFrom, $lte: dateTo },
      ...(excludeBookingId
        ? { _id: { $ne: new Types.ObjectId(excludeBookingId) } }
        : {}),
    };
    return this.bookingModel
      .find(filter)
      .select('_id title date time durationMinutes professorId equipmentId')
      .populate('professorId', 'name')
      .populate('equipmentId', 'name')
      .lean()
      .exec();
  }

  private availableStartTimes(
    date: string,
    selection: ResourceSelection,
    bookings: AvailabilityBooking[],
    durationMinutes: number,
    timezone?: string,
  ) {
    const today = this.todayIso(timezone);
    if (date < today) return [];
    if (selection.equipmentUnavailableWeekdays.includes(this.weekdayOf(date)))
      return [];
    const dayBookings = bookings.filter(
      (booking) =>
        booking.date === date && this.usesSelectedResource(booking, selection),
    );
    const currentMinutes = this.currentMinutes(timezone);
    return this.bookingStartTimes(durationMinutes).filter(
      (time) =>
        (date !== today || this.timeToMinutes(time) > currentMinutes) &&
        !this.overlapsEquipmentUnavailablePeriod(
          date,
          time,
          durationMinutes,
          selection,
        ) &&
        dayBookings.every(
          (booking) => !this.overlaps(time, durationMinutes, booking),
        ),
    );
  }

  private overlapsEquipmentUnavailablePeriod(
    date: string,
    time: string,
    durationMinutes: number,
    selection: ResourceSelection,
  ) {
    const { equipmentUnavailableFrom, equipmentUnavailableUntil } = selection;
    if (!equipmentUnavailableFrom || !equipmentUnavailableUntil) return false;
    const start = `${date}T${time}`;
    const end = `${date}T${this.minutesToTime(
      this.timeToMinutes(time) + durationMinutes,
    )}`;
    return start < equipmentUnavailableUntil && end > equipmentUnavailableFrom;
  }

  private occupiedEquipmentDetails(bookings: AvailabilityBooking[]) {
    return bookings
      .filter((booking) => booking.equipmentId)
      .map((booking) => ({
        bookingId: this.referenceId(booking._id),
        equipmentId: this.referenceId(booking.equipmentId),
        equipmentName: this.referenceLabel(booking.equipmentId),
        date: booking.date,
        time: booking.time,
        endTime: this.minutesToTime(
          this.timeToMinutes(booking.time) +
            (booking.durationMinutes ?? DEFAULT_DURATION_MINUTES),
        ),
      }))
      .sort((left, right) => left.time.localeCompare(right.time));
  }

  private usesSelectedResource(
    booking: AvailabilityBooking,
    selection: ResourceSelection,
  ) {
    return (
      this.referenceId(booking.equipmentId) === selection.equipmentId ||
      Boolean(
        selection.professorId &&
        this.referenceId(booking.professorId) === selection.professorId,
      )
    );
  }

  private overlaps(
    startTime: string,
    durationMinutes: number,
    booking: AvailabilityBooking,
  ) {
    const start = this.timeToMinutes(startTime);
    const end = start + durationMinutes;
    const bookingStart = this.timeToMinutes(booking.time);
    const bookingEnd =
      bookingStart + (booking.durationMinutes ?? DEFAULT_DURATION_MINUTES);
    return start < bookingEnd && end > bookingStart;
  }

  private buildActiveLocks(
    status: BookingStatus,
    unitId: string,
    selection: ResourceSelection,
    date: string,
    time: string,
    durationMinutes: number,
  ) {
    if (!this.isActiveStatus(status)) {
      return {
        activeSlotKey: undefined,
        activeProfessorSlotKeys: undefined,
        activeEquipmentSlotKeys: undefined,
      };
    }
    const slots = this.occupiedSlotTimes(time, durationMinutes);
    return {
      activeSlotKey: `${unitId}:${selection.resourceKey}:${date}:${time}`,
      activeProfessorSlotKeys: selection.professorId
        ? slots.map(
            (slot) =>
              `${unitId}:professor:${selection.professorId}:${date}:${slot}`,
          )
        : undefined,
      activeEquipmentSlotKeys: slots.map(
        (slot) =>
          `${unitId}:equipment:${selection.equipmentId}:${date}:${slot}`,
      ),
    };
  }

  private bookingStartTimes(durationMinutes: number) {
    const lastStart = CLOSING_MINUTES - durationMinutes;
    const times: string[] = [];
    for (
      let minutes = OPENING_MINUTES;
      minutes <= lastStart;
      minutes += SLOT_MINUTES
    ) {
      times.push(this.minutesToTime(minutes));
    }
    return times;
  }

  private occupiedSlotTimes(time: string, durationMinutes: number) {
    const start = this.timeToMinutes(time);
    const slots: string[] = [];
    for (let offset = 0; offset < durationMinutes; offset += SLOT_MINUTES) {
      slots.push(this.minutesToTime(start + offset));
    }
    return slots;
  }

  private validateSchedule(
    date: string,
    time: string,
    durationMinutes: number,
    timezone?: string,
  ) {
    this.validateDate(date);
    if (date < this.todayIso(timezone)) {
      throw new BadRequestException('Escolha uma data de hoje em diante.');
    }
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 30 ||
      durationMinutes > 480 ||
      durationMinutes % SLOT_MINUTES !== 0
    ) {
      throw new BadRequestException(
        'Escolha uma duração entre 30 minutos e 8 horas, em blocos de 30 minutos.',
      );
    }
    const start = this.timeToMinutes(time);
    if (
      !/^([01]\d|2[0-3]):(?:00|30)$/.test(time) ||
      start < OPENING_MINUTES ||
      start + durationMinutes > CLOSING_MINUTES
    ) {
      throw new BadRequestException(
        'Escolha um horário em blocos de 30 minutos entre 08:00 e 22:00.',
      );
    }
  }

  async trainingBalance(actor: AuthUser) {
    if (actor.role !== Role.Student) {
      throw new ForbiddenException(
        'O saldo de treinos está disponível somente para alunos.',
      );
    }
    return this.getTrainingBalance(actor.id);
  }

  private async assertTrainingLimit(
    studentId: string,
    requestedMinutes: number,
    creditMinutes = 0,
  ) {
    const balance = await this.getTrainingBalance(studentId);
    const effectiveReservedMinutes = Math.max(
      0,
      balance.reservedHours * 60 - creditMinutes,
    );
    if (effectiveReservedMinutes + requestedMinutes > balance.limitHours * 60) {
      const remainingHours = Math.max(
        0,
        balance.limitHours - effectiveReservedMinutes / 60,
      );
      throw new BadRequestException(
        `Seu limite permite reservar mais ${remainingHours} ${remainingHours === 1 ? 'hora' : 'horas'} de treino. Reduza a duração ou cancele outro treino futuro.`,
      );
    }
  }

  private async getTrainingBalance(studentId: string) {
    const student = await this.usersService.findActiveByRole(
      studentId,
      Role.Student,
    );
    if (!student) throw new NotFoundException('Aluno não encontrado.');

    const unit = student.unitId
      ? await this.unitsService.findActiveById(String(student.unitId))
      : undefined;
    const bookings = await this.bookingModel
      .find({
        studentId: new Types.ObjectId(studentId),
        type: BookingType.Training,
        status: { $in: [BookingStatus.Pending, BookingStatus.Confirmed] },
        date: { $gte: this.todayIso(unit?.timezone) },
      })
      .select('_id durationMinutes originalBookingId')
      .lean()
      .exec();
    const replacedBookingIds = new Set(
      bookings
        .map((booking) => this.referenceId(booking.originalBookingId))
        .filter(Boolean),
    );
    const reservedMinutes = bookings
      .filter(
        (booking) => !replacedBookingIds.has(this.referenceId(booking._id)),
      )
      .reduce(
        (total, booking) =>
          total + (booking.durationMinutes ?? DEFAULT_DURATION_MINUTES),
        0,
      );
    const limitHours = Number(student.trainingHoursLimit ?? 15);
    const reservedHours = reservedMinutes / 60;
    return {
      limitHours,
      reservedHours,
      remainingHours: Math.max(0, limitHours - reservedHours),
    };
  }

  private resolveDurationMinutes(duration?: string) {
    const durationMinutes =
      duration === undefined ? DEFAULT_DURATION_MINUTES : Number(duration);
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 30 ||
      durationMinutes > 480 ||
      durationMinutes % SLOT_MINUTES !== 0
    ) {
      throw new BadRequestException(
        'Escolha uma duração entre 30 minutos e 8 horas, em blocos de 30 minutos.',
      );
    }
    return durationMinutes;
  }

  private validateDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Data inválida para consultar a agenda.');
    }
  }

  private timeToMinutes(time: string) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
      minutes % 60,
    ).padStart(2, '0')}`;
  }

  private todayIso(timezone = 'America/Sao_Paulo') {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private currentMinutes(timezone = 'America/Sao_Paulo') {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    return value('hour') * 60 + value('minute') + value('second') / 60;
  }

  private weekdayOf(date: string) {
    return new Date(`${date}T12:00:00.000Z`).getUTCDay();
  }

  private assertActorUnit(
    actor: AuthUser,
    unitId: string,
    elevatedPermission = Permission.BookingsManage,
  ) {
    if (
      actor.role === Role.Professor &&
      !actorHasPermission(actor, elevatedPermission) &&
      (!actor.unitId || actor.unitId !== unitId)
    ) {
      throw new ForbiddenException(
        'Professor só pode agendar na própria unidade.',
      );
    }
  }

  private isBookingManager(actor: AuthUser) {
    return actor.role === Role.Admin || actor.role === Role.Professor;
  }

  private isActiveStatus(status: BookingStatus) {
    return (
      status === BookingStatus.Pending || status === BookingStatus.Confirmed
    );
  }

  private assertCanManageBooking(
    actor: AuthUser,
    booking: BookingDocument,
    elevatedPermission = Permission.BookingsManage,
  ) {
    if (!this.isBookingManager(actor)) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar a agenda.',
      );
    }
    if (
      actor.role === Role.Professor &&
      !actorHasPermission(actor, elevatedPermission) &&
      booking.isClassLesson &&
      this.referenceId(booking.professorId) !== actor.id
    ) {
      throw new ForbiddenException(
        'Professor só pode gerenciar as turmas em que é responsável.',
      );
    }
  }

  private hasAnyBookingAdminPermission(actor: AuthUser) {
    return (
      actorHasPermission(actor, Permission.BookingsManage) ||
      actorHasPermission(actor, Permission.BookingsReview)
    );
  }

  private assertStudentBookingHorizon(date: string, timezone?: string) {
    const zone = timezone || 'America/Sao_Paulo';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const today = new Date(
      Date.UTC(value('year'), value('month') - 1, value('day'), 12),
    );
    const weekday = today.getUTCDay();
    const daysUntilEndOfNextWeek = ((7 - weekday) % 7) + 7;
    const limit = new Date(today);
    limit.setUTCDate(today.getUTCDate() + daysUntilEndOfNextWeek);
    const limitIso = limit.toISOString().slice(0, 10);
    if (date > limitIso) {
      throw new BadRequestException(
        'Alunos podem agendar somente até o final da próxima semana.',
      );
    }
  }

  private async notifyBookingCreated(
    booking: BookingDocument,
    actor: AuthUser,
    courseWorkflow: boolean,
  ) {
    if (actor.role === Role.Student) {
      const managers = await this.usersService.findActiveReviewers(
        String(booking.unitId),
      );
      await this.notificationsService.createForRecipients(
        managers.map((manager) => String(manager._id)),
        {
          type: 'booking.requested',
          title: 'Nova solicitação de treino',
          body: `${booking.title} em ${booking.date} às ${booking.time}, por ${booking.durationMinutes / 60} ${booking.durationMinutes === 60 ? 'hora' : 'horas'}.`,
          url: '/dashboard/agenda',
          metadata: { bookingId: String(booking.id) },
        },
      );
      return;
    }

    if (booking.type === BookingType.Lesson && !courseWorkflow) {
      await this.notificationsService.createForRecipients(
        [String(booking.studentId)],
        {
          type: 'lesson.created',
          title: 'Nova aula agendada',
          body: `${booking.title} em ${booking.date} às ${booking.time}.`,
          url: '/dashboard/student/agendar',
          metadata: { bookingId: String(booking.id) },
        },
      );
    }
  }

  private async notifyBookingCancelledByStudent(
    booking: BookingDocument,
    actor: AuthUser,
  ) {
    let recipientIds: string[] = [];
    if (booking.professorId) {
      const professor = await this.usersService.findActiveByRole(
        String(booking.professorId),
        Role.Professor,
      );
      if (professor) recipientIds = [String(professor._id ?? professor.id)];
    }
    if (recipientIds.length === 0) {
      const managers = await this.usersService.findActiveReviewers(
        String(booking.unitId),
      );
      recipientIds = managers.map((manager) => String(manager._id));
    }
    await this.notificationsService.createForRecipients(
      recipientIds.filter((recipientId) => recipientId !== actor.id),
      {
        type: 'booking.cancelled-by-student',
        title: 'Agendamento cancelado pelo aluno',
        body: `${booking.title} em ${booking.date} às ${booking.time}.`,
        url: '/dashboard/agenda',
        metadata: {
          bookingId: String(booking.id),
          studentId: String(booking.studentId),
        },
      },
    );
  }

  private async notifyStudent(
    booking: BookingDocument,
    status: BookingStatus,
    reason?: string,
  ) {
    const label =
      status === BookingStatus.Confirmed
        ? 'aprovado'
        : status === BookingStatus.Rejected
          ? 'recusado'
          : 'cancelado';
    await this.notificationsService.createForRecipients(
      [String(booking.studentId)],
      {
        type: `booking.${status}`,
        title: `Agendamento ${label}`,
        body: `${booking.title} em ${booking.date} às ${booking.time}.${reason ? ` Motivo: ${reason}` : ''}`,
        url: '/dashboard/student/agendar',
        metadata: { bookingId: String(booking.id) },
      },
    );
  }

  private ensureObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Agendamento não encontrado.');
    }
  }

  private referenceId(value: unknown): string {
    if (value instanceof Types.ObjectId) return value.toHexString();
    if (value && typeof value === 'object') {
      if ('_id' in value) return String(value._id);
      if ('id' in value) return String(value.id);
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return '';
  }

  private referenceLabel(value: unknown): string {
    if (value && typeof value === 'object' && 'name' in value) {
      return String(value.name);
    }
    return 'Equipamento';
  }

  private handleConflict(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException(
        'O professor ou equipamento acabou de ser reservado nesse horário. Escolha outro horário.',
      );
    }
  }
}
