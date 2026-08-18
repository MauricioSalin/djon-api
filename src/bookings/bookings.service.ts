import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
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
const SLOT_MINUTES = 60;
const DEFAULT_DURATION_MINUTES = 60;

type ResourceSelection = {
  professorId?: string;
  equipmentId: string;
  resourceKey: string;
};

type AvailabilityBooking = {
  _id: unknown;
  date: string;
  time: string;
  durationMinutes?: number;
  professorId?: unknown;
  equipmentId?: unknown;
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
  ) {
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

    this.validateSchedule(dto.date, dto.time, durationMinutes);
    if (actor.role === Role.Student) {
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
      await this.notifyBookingCreated(booking, actor);
      return this.findOne(String(booking.id), actor);
    } catch (error: unknown) {
      this.handleConflict(error);
      throw error;
    }
  }

  async findAll(query: QueryBookingsDto, actor: AuthUser) {
    const filter: Record<string, unknown> = {};
    if (actor.role === Role.Student) {
      filter.studentId = new Types.ObjectId(actor.id);
    } else if (query.studentId) {
      filter.studentId = new Types.ObjectId(query.studentId);
    }
    if (query.professorId) {
      filter.professorId = new Types.ObjectId(query.professorId);
    }
    if (query.unitId) filter.unitId = new Types.ObjectId(query.unitId);
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
      .populate('professorId', 'name email avatar unitId')
      .populate('equipmentId', 'name description unitId active')
      .populate('unitId', 'key label shortLabel timezone')
      .lean({ virtuals: true })
      .exec();
    if (!booking) throw new NotFoundException('Agendamento não encontrado.');
    const ownerId = this.referenceId(booking.studentId);
    if (actor.role === Role.Student && ownerId !== actor.id) {
      throw new ForbiddenException('Agendamento pertence a outro aluno.');
    }
    return booking;
  }

  async remove(id: string) {
    this.ensureObjectId(id);
    const deleted = await this.bookingModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Agendamento não encontrado.');
    return { id };
  }

  async update(id: string, dto: UpdateBookingDto, actor: AuthUser) {
    if (actor.role === Role.Student) {
      throw new ForbiddenException('Aluno deve usar cancelar ou remarcar.');
    }

    const booking = await this.getDocument(id);
    const previousStatus = booking.status;
    const status = dto.status ?? booking.status;
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
      status !== BookingStatus.Cancelled &&
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
    const date = dto.date ?? booking.date;
    const time = dto.time ?? booking.time;
    const durationMinutes = dto.durationMinutes ?? booking.durationMinutes;

    this.validateSchedule(date, time, durationMinutes);
    if (status !== BookingStatus.Cancelled) {
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
        if (original && original.status !== BookingStatus.Cancelled) {
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
    const selection = await this.resolveResources(
      booking.type,
      booking.professorId?.toString(),
      booking.equipmentId?.toString(),
      unitId,
    );
    this.validateSchedule(booking.date, booking.time, booking.durationMinutes);
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
      if (original && original.status !== BookingStatus.Cancelled) {
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
    if (booking.status !== BookingStatus.Pending) {
      throw new BadRequestException(
        'Somente solicitações pendentes podem ser recusadas.',
      );
    }
    await this.changeStatus(
      booking,
      BookingStatus.Cancelled,
      actor,
      reason,
      false,
    );
    await this.notifyStudent(booking, BookingStatus.Cancelled, reason);
    return this.findOne(id, actor);
  }

  async cancel(id: string, reason: string | undefined, actor: AuthUser) {
    const booking = await this.getDocument(id);
    if (actor.role === Role.Student && String(booking.studentId) !== actor.id) {
      throw new ForbiddenException('Agendamento pertence a outro aluno.');
    }
    if (booking.status === BookingStatus.Cancelled) return booking;
    await this.changeStatus(booking, BookingStatus.Cancelled, actor, reason);
    if (actor.role !== Role.Student) {
      await this.notifyStudent(booking, BookingStatus.Cancelled, reason);
    }
    return this.findOne(id, actor);
  }

  async reschedule(id: string, dto: CreateBookingDto, actor: AuthUser) {
    const original = await this.getDocument(id);
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
        original.status !== BookingStatus.Cancelled
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
  ) {
    this.validateDate(date);
    const resolvedUnitId = await this.resolveUnitId(unitId);
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
  ) {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('Mês inválido para consultar a agenda.');
    }
    const durationMinutes = this.resolveDurationMinutes(duration);
    const resolvedUnitId = await this.resolveUnitId(unitId);
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
        this.availableStartTimes(date, selection, bookings, durationMinutes)
          .length > 0
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
      status: { $ne: BookingStatus.Cancelled },
      date: dateFrom === dateTo ? dateFrom : { $gte: dateFrom, $lte: dateTo },
      ...(excludeBookingId
        ? { _id: { $ne: new Types.ObjectId(excludeBookingId) } }
        : {}),
    };
    return this.bookingModel
      .find(filter)
      .select('_id date time durationMinutes professorId equipmentId')
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
  ) {
    if (date < this.todayIso()) return [];
    const dayBookings = bookings.filter(
      (booking) =>
        booking.date === date && this.usesSelectedResource(booking, selection),
    );
    const now = new Date();
    const currentMinutes =
      now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    return this.bookingStartTimes(durationMinutes).filter(
      (time) =>
        (date !== this.todayIso() ||
          this.timeToMinutes(time) > currentMinutes) &&
        dayBookings.every(
          (booking) => !this.overlaps(time, durationMinutes, booking),
        ),
    );
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
    if (status === BookingStatus.Cancelled) {
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
  ) {
    this.validateDate(date);
    if (date < this.todayIso()) {
      throw new BadRequestException('Escolha uma data de hoje em diante.');
    }
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 60 ||
      durationMinutes > 480 ||
      durationMinutes % SLOT_MINUTES !== 0
    ) {
      throw new BadRequestException(
        'Escolha uma duração entre 1 e 8 horas, em horas inteiras.',
      );
    }
    const start = this.timeToMinutes(time);
    if (
      !/^([01]\d|2[0-3]):00$/.test(time) ||
      start < OPENING_MINUTES ||
      start + durationMinutes > CLOSING_MINUTES
    ) {
      throw new BadRequestException(
        'Escolha um horário de hora em hora entre 08:00 e 22:00.',
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

    const bookings = await this.bookingModel
      .find({
        studentId: new Types.ObjectId(studentId),
        type: BookingType.Training,
        status: { $in: [BookingStatus.Pending, BookingStatus.Confirmed] },
        date: { $gte: this.todayIso() },
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
    const limitHours = Number(student.trainingHoursLimit ?? 8);
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
      durationMinutes < 60 ||
      durationMinutes > 480 ||
      durationMinutes % SLOT_MINUTES !== 0
    ) {
      throw new BadRequestException(
        'Escolha uma duração entre 1 e 8 horas, em horas inteiras.',
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

  private todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private async notifyBookingCreated(
    booking: BookingDocument,
    actor: AuthUser,
  ) {
    if (actor.role !== Role.Student) return;
    const managers = await this.usersService.findActiveByRoles([
      Role.Admin,
      Role.Professor,
    ]);
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
  }

  private async notifyStudent(
    booking: BookingDocument,
    status: BookingStatus,
    reason?: string,
  ) {
    const label =
      status === BookingStatus.Confirmed ? 'aprovado' : 'cancelado/recusado';
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
