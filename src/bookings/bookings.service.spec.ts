import { Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { Permission } from '../common/enums/permission.enum';
import { BookingsService } from './bookings.service';
import { BookingStatus, BookingType } from './schemas/booking.schema';

describe('BookingsService - recursos e disponibilidade', () => {
  const unitId = new Types.ObjectId();
  const actorId = new Types.ObjectId().toString();
  const usersService = {
    findActiveByRole: jest.fn(),
    findActiveByRoles: jest.fn(),
  };
  const unitsService = {
    findDefault: jest.fn().mockResolvedValue({ id: unitId }),
    findActiveById: jest.fn().mockResolvedValue({ id: unitId }),
  };
  const equipmentsService = {
    findActiveById: jest.fn(),
  };
  const bookingModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };
  const service = new BookingsService(
    bookingModel as never,
    usersService as never,
    unitsService as never,
    equipmentsService as never,
    {} as never,
  );

  const tomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.findActiveByRole.mockImplementation(
      (id: string, role: Role) =>
        role === Role.Student ? { id, trainingHoursLimit: 8 } : null,
    );
    unitsService.findDefault.mockResolvedValue({ id: unitId });
    unitsService.findActiveById.mockResolvedValue({ id: unitId });
  });

  it('exige professor quando uma aula é agendada', async () => {
    await expect(
      service.create(
        {
          studentId: new Types.ObjectId().toString(),
          title: 'Aula sem professor',
          date: tomorrow(),
          time: '18:00',
          type: BookingType.Lesson,
        },
        { id: actorId, email: 'admin@teste.com', role: Role.Admin },
      ),
    ).rejects.toThrow('Selecione o professor da aula.');
  });

  it('impede que o aluno solicite aula', async () => {
    await expect(
      service.create(
        {
          title: 'Aula do aluno',
          date: tomorrow(),
          time: '18:00',
          type: BookingType.Lesson,
        },
        { id: actorId, email: 'aluno@teste.com', role: Role.Student },
      ),
    ).rejects.toThrow('Alunos podem solicitar apenas treinos.');
  });

  it('exige equipamento quando o aluno solicita um treino', async () => {
    await expect(
      service.create(
        {
          title: 'Treino sem equipamento',
          date: '2030-08-20',
          time: '18:00',
          type: BookingType.Training,
        },
        { id: actorId, email: 'aluno@teste.com', role: Role.Student },
      ),
    ).rejects.toThrow('Selecione o equipamento.');
  });

  it('impede que o aluno ultrapasse o limite de horas de treino', async () => {
    const equipmentId = new Types.ObjectId();
    usersService.findActiveByRole.mockResolvedValue({
      id: actorId,
      trainingHoursLimit: 2,
    });
    equipmentsService.findActiveById.mockResolvedValue({
      id: equipmentId,
      unitId,
    });
    const balanceQuery = {
      select: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([{ durationMinutes: 120 }]),
    };
    balanceQuery.select.mockReturnValue(balanceQuery);
    balanceQuery.lean.mockReturnValue(balanceQuery);
    bookingModel.find.mockReturnValue(balanceQuery);

    await expect(
      service.create(
        {
          equipmentId: equipmentId.toString(),
          title: 'Treino acima do limite',
          date: tomorrow(),
          time: '18:00',
          durationMinutes: 60,
          type: BookingType.Training,
        },
        { id: actorId, email: 'aluno@teste.com', role: Role.Student },
      ),
    ).rejects.toThrow('Seu limite permite reservar mais 0 horas de treino.');
  });

  it('confirma automaticamente agendamentos criados por gestores', async () => {
    const equipmentId = new Types.ObjectId();
    equipmentsService.findActiveById.mockResolvedValue({
      id: equipmentId,
      unitId,
    });
    const availabilityQuery = {
      select: jest.fn(),
      populate: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    availabilityQuery.select.mockReturnValue(availabilityQuery);
    availabilityQuery.populate.mockReturnValue(availabilityQuery);
    availabilityQuery.lean.mockReturnValue(availabilityQuery);
    bookingModel.find.mockReturnValue(availabilityQuery);
    bookingModel.create.mockRejectedValue(
      new Error('interromper após validar'),
    );

    await expect(
      service.create(
        {
          studentId: new Types.ObjectId().toString(),
          equipmentId: equipmentId.toString(),
          title: 'Treino criado pelo professor',
          date: '2030-08-20',
          time: '18:00',
          durationMinutes: 120,
          type: BookingType.Training,
          status: BookingStatus.Pending,
        },
        {
          id: actorId,
          email: 'professor@teste.com',
          role: Role.Professor,
          unitId: unitId.toString(),
          permissions: [Permission.BookingsManage],
        },
      ),
    ).rejects.toThrow('interromper após validar');
    expect(bookingModel.create).toHaveBeenCalledTimes(1);
    const createCalls = bookingModel.create.mock.calls as unknown as Array<
      [
        {
          status: string;
          durationMinutes: number;
          activeEquipmentSlotKeys: string[];
        },
      ]
    >;
    const createdPayload = createCalls[0][0];
    expect(createdPayload.status).toBe('confirmado');
    expect(createdPayload.durationMinutes).toBe(120);
    expect(createdPayload.activeEquipmentSlotKeys).toHaveLength(4);
    expect(createdPayload.activeEquipmentSlotKeys[0]).toContain(':18:00');
    expect(createdPayload.activeEquipmentSlotKeys[1]).toContain(':18:30');
    expect(createdPayload.activeEquipmentSlotKeys[2]).toContain(':19:00');
    expect(createdPayload.activeEquipmentSlotKeys[3]).toContain(':19:30');
  });

  it('bloqueia equipamento no dia semanal configurado', async () => {
    const equipmentId = new Types.ObjectId();
    equipmentsService.findActiveById.mockResolvedValue({
      id: equipmentId,
      unitId,
      unavailableWeekdays: [2],
    });

    await expect(
      service.create(
        {
          studentId: new Types.ObjectId().toString(),
          equipmentId: equipmentId.toString(),
          title: 'Treino em equipamento indisponível',
          date: '2030-08-20',
          time: '18:00',
          durationMinutes: 30,
          type: BookingType.Training,
        },
        { id: actorId, email: 'admin@teste.com', role: Role.Admin },
      ),
    ).rejects.toThrow(
      'Este equipamento não está disponível no dia da semana escolhido.',
    );
  });

  it('bloqueia agendamentos que sobrepõem o período configurado', async () => {
    const equipmentId = new Types.ObjectId();
    equipmentsService.findActiveById.mockResolvedValue({
      id: equipmentId,
      unitId,
      unavailableWeekdays: [],
      unavailableFrom: '2030-08-20T17:30',
      unavailableUntil: '2030-08-20T19:00',
    });

    await expect(
      service.create(
        {
          studentId: new Types.ObjectId().toString(),
          equipmentId: equipmentId.toString(),
          title: 'Treino durante bloqueio temporário',
          date: '2030-08-20',
          time: '17:00',
          durationMinutes: 60,
          type: BookingType.Training,
        },
        { id: actorId, email: 'admin@teste.com', role: Role.Admin },
      ),
    ).rejects.toThrow('Este equipamento está bloqueado no período escolhido.');
  });

  it('remove da disponibilidade apenas os horários que cruzam o período bloqueado', async () => {
    const equipmentId = new Types.ObjectId();
    equipmentsService.findActiveById.mockResolvedValue({
      id: equipmentId,
      unitId,
      unavailableWeekdays: [],
      unavailableFrom: '2030-08-20T17:30',
      unavailableUntil: '2030-08-20T19:00',
    });
    const query = {
      select: jest.fn(),
      populate: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    query.select.mockReturnValue(query);
    query.populate.mockReturnValue(query);
    query.lean.mockReturnValue(query);
    bookingModel.find.mockReturnValue(query);

    const result = await service.availability(
      '2030-08-20',
      unitId.toString(),
      BookingType.Training,
      undefined,
      equipmentId.toString(),
      undefined,
      '60',
    );

    expect(result.availableTimes).not.toContain('17:00');
    expect(result.availableTimes).not.toContain('18:00');
    expect(result.availableTimes).toContain('19:00');
  });

  it('antecipa conflitos das aulas da turma com agendamentos do equipamento', async () => {
    const professorId = new Types.ObjectId();
    const equipmentId = new Types.ObjectId();
    usersService.findActiveByRole.mockResolvedValue({
      id: professorId,
      unitId,
      role: Role.Professor,
    });
    equipmentsService.findActiveById.mockResolvedValue({
      id: equipmentId,
      unitId,
      unavailableWeekdays: [],
    });
    const query = {
      select: jest.fn(),
      populate: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          title: 'Treino reservado',
          date: '2030-08-20',
          time: '18:30',
          durationMinutes: 60,
          equipmentId,
        },
      ]),
    };
    query.select.mockReturnValue(query);
    query.populate.mockReturnValue(query);
    query.lean.mockReturnValue(query);
    bookingModel.find.mockReturnValue(query);

    const conflicts = await service.classLessonScheduleConflicts(
      {
        unitId: unitId.toString(),
        professorId: professorId.toString(),
        equipmentId: equipmentId.toString(),
        durationMinutes: 60,
        lessons: [{ date: '2030-08-20', time: '18:00' }],
      },
      { id: actorId, email: 'admin@teste.com', role: Role.Admin },
    );

    expect(conflicts).toEqual([
      expect.objectContaining({
        lessonIndex: 0,
        kind: 'equipment',
        conflictingTitle: 'Treino reservado',
        time: '18:00',
        endTime: '19:00',
      }),
    ]);
  });

  it('antecipa sobreposição entre duas aulas da própria turma', async () => {
    const professorId = new Types.ObjectId();
    const equipmentId = new Types.ObjectId();
    usersService.findActiveByRole.mockResolvedValue({
      id: professorId,
      unitId,
      role: Role.Professor,
    });
    equipmentsService.findActiveById.mockResolvedValue({
      id: equipmentId,
      unitId,
      unavailableWeekdays: [],
    });
    const query = {
      select: jest.fn(),
      populate: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    query.select.mockReturnValue(query);
    query.populate.mockReturnValue(query);
    query.lean.mockReturnValue(query);
    bookingModel.find.mockReturnValue(query);

    const conflicts = await service.classLessonScheduleConflicts(
      {
        unitId: unitId.toString(),
        professorId: professorId.toString(),
        equipmentId: equipmentId.toString(),
        durationMinutes: 90,
        lessons: [
          { date: '2030-08-20', time: '18:00' },
          { date: '2030-08-20', time: '19:00' },
        ],
      },
      { id: actorId, email: 'admin@teste.com', role: Role.Admin },
    );

    expect(conflicts).toEqual([
      expect.objectContaining({
        lessonIndex: 1,
        kind: 'cohort-lesson',
        conflictingLessonIndex: 0,
      }),
    ]);
  });

  it('não aprova solicitação pendente de aluno desativado', async () => {
    const bookingId = new Types.ObjectId().toString();
    const studentId = new Types.ObjectId();
    bookingModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: bookingId,
        studentId,
        unitId,
        status: BookingStatus.Pending,
      }),
    });
    usersService.findActiveByRole.mockResolvedValue(null);

    await expect(
      service.approve(bookingId, {
        id: actorId,
        email: 'professor@teste.com',
        role: Role.Professor,
        unitId: unitId.toString(),
        permissions: [Permission.BookingsReview],
      }),
    ).rejects.toThrow(
      'O aluno está desativado e a solicitação não pode ser aprovada.',
    );
  });

  it('não altera agendamento de aluno desativado', async () => {
    const bookingId = new Types.ObjectId().toString();
    const studentId = new Types.ObjectId();
    bookingModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: bookingId,
        studentId,
        status: BookingStatus.Confirmed,
      }),
    });
    usersService.findActiveByRole.mockResolvedValue(null);

    await expect(
      service.update(
        bookingId,
        { date: '2030-08-21' },
        { id: actorId, email: 'admin@teste.com', role: Role.Admin },
      ),
    ).rejects.toThrow('Selecione um aluno ativo.');
  });

  it('recusa equipamento que pertence a outra unidade', async () => {
    equipmentsService.findActiveById.mockResolvedValue({
      id: new Types.ObjectId(),
      unitId: { _id: new Types.ObjectId() },
    });

    await expect(
      service.create(
        {
          studentId: new Types.ObjectId().toString(),
          unitId: unitId.toString(),
          equipmentId: new Types.ObjectId().toString(),
          title: 'Treino em unidade incorreta',
          date: '2030-08-20',
          time: '18:00',
          type: BookingType.Training,
        },
        { id: actorId, email: 'admin@teste.com', role: Role.Admin },
      ),
    ).rejects.toThrow('O equipamento não pertence à unidade selecionada.');
  });

  it('oferece horários de hora em hora e remove sobreposições do equipamento', async () => {
    const equipmentId = new Types.ObjectId();
    equipmentsService.findActiveById.mockResolvedValue({
      id: equipmentId,
      unitId,
    });
    const query = {
      select: jest.fn(),
      populate: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          date: '2030-08-20',
          time: '10:00',
          durationMinutes: 60,
          equipmentId: { _id: equipmentId, name: 'CDJ-3000' },
        },
      ]),
    };
    query.select.mockReturnValue(query);
    query.populate.mockReturnValue(query);
    query.lean.mockReturnValue(query);
    bookingModel.find.mockReturnValue(query);

    const result = await service.availability(
      '2030-08-20',
      unitId.toString(),
      BookingType.Training,
      undefined,
      equipmentId.toString(),
    );

    expect(result.availableTimes).toContain('08:00');
    expect(result.availableTimes).toContain('09:00');
    expect(result.availableTimes).not.toContain('10:00');
    expect(result.availableTimes).toContain('11:00');
    expect(result.occupiedEquipment).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          equipmentName: 'CDJ-3000',
          time: '10:00',
          endTime: '11:00',
        }),
      ]),
    );
    expect(bookingModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $ne: 'cancelado' } }),
    );
  });

  it('remove um agendamento existente', async () => {
    const bookingId = new Types.ObjectId().toString();
    bookingModel.findByIdAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: bookingId }),
    });

    await expect(service.remove(bookingId)).resolves.toEqual({ id: bookingId });
    expect(bookingModel.findByIdAndDelete).toHaveBeenCalledWith(bookingId);
  });

  it('informa quando o agendamento a remover não existe', async () => {
    const bookingId = new Types.ObjectId().toString();
    bookingModel.findByIdAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(service.remove(bookingId)).rejects.toThrow(
      'Agendamento não encontrado.',
    );
  });
});
