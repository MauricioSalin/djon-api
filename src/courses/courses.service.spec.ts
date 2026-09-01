import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { CoursesService } from './courses.service';

describe('CoursesService - presença e liberação', () => {
  const professorId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const unitId = new Types.ObjectId();
  const cohortId = new Types.ObjectId();
  const lessonId = new Types.ObjectId().toString();
  const attendance = {
    studentId,
    present: false,
    materialReleased: false,
    observation: undefined as string | undefined,
  };
  const lesson = {
    cohortId,
    attendance: [attendance],
    save: jest.fn().mockResolvedValue(undefined),
  };
  const cohort = {
    id: cohortId.toString(),
    professorId,
    unitId,
    studentIds: [studentId],
  };
  const lessonModel = { findById: jest.fn().mockResolvedValue(lesson) };
  const cohortModel = { findById: jest.fn().mockResolvedValue(cohort) };
  const service = new CoursesService(
    {} as never,
    cohortModel as never,
    lessonModel as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const actor = {
    id: professorId.toString(),
    email: 'professor@teste.com',
    role: Role.Professor,
    unitId: unitId.toString(),
  };

  beforeEach(() => {
    attendance.present = false;
    attendance.materialReleased = false;
    attendance.observation = undefined;
    jest.clearAllMocks();
    jest.spyOn(service, 'findOneCohort').mockResolvedValue({} as never);
  });

  it('libera automaticamente o material ao confirmar presença', async () => {
    await service.updateAttendance(
      lessonId,
      { studentId: studentId.toString(), present: true },
      actor,
    );

    expect(attendance.present).toBe(true);
    expect(attendance.materialReleased).toBe(true);
    expect(lesson.save).toHaveBeenCalled();
  });

  it('permite liberar material para aluno ausente', async () => {
    await service.updateAttendance(
      lessonId,
      { studentId: studentId.toString(), materialReleased: true },
      actor,
    );

    expect(attendance.present).toBe(false);
    expect(attendance.materialReleased).toBe(true);
  });

  it('salva a observação sem alterar a presença', async () => {
    await service.updateAttendance(
      lessonId,
      {
        studentId: studentId.toString(),
        observation: '  Precisa praticar transições.  ',
      },
      actor,
    );

    expect(attendance.observation).toBe('Precisa praticar transições.');
    expect(attendance.present).toBe(false);
    expect(attendance.materialReleased).toBe(false);
  });

  it('remove a observação quando o texto fica vazio', async () => {
    attendance.observation = 'Observação anterior';

    await service.updateAttendance(
      lessonId,
      { studentId: studentId.toString(), observation: '   ' },
      actor,
    );

    expect(attendance.observation).toBeUndefined();
  });
});

describe('CoursesService - consulta de observações', () => {
  const studentId = new Types.ObjectId();
  const cohortId = new Types.ObjectId();
  const lessonId = new Types.ObjectId();
  const lessonQuery = {
    sort: jest.fn(),
    lean: jest.fn(),
  };
  const cohortQuery = {
    populate: jest.fn(),
    lean: jest.fn(),
  };
  const lessonModel = { find: jest.fn().mockReturnValue(lessonQuery) };
  const cohortModel = { find: jest.fn().mockReturnValue(cohortQuery) };
  const userModel = { exists: jest.fn() };
  const service = new CoursesService(
    {} as never,
    cohortModel as never,
    lessonModel as never,
    {} as never,
    {} as never,
    userModel as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    userModel.exists.mockResolvedValue({ _id: studentId });
    lessonQuery.sort.mockReturnValue(lessonQuery);
    lessonQuery.lean.mockResolvedValue([
      {
        _id: lessonId,
        cohortId,
        order: 2,
        title: 'Beat Match',
        date: '2030-08-20',
        time: '19:00',
        attendance: [
          {
            studentId,
            observation: 'Precisa praticar a transição.',
          },
        ],
      },
    ]);
    cohortQuery.populate.mockReturnValue(cohortQuery);
    cohortQuery.lean.mockResolvedValue([
      {
        _id: cohortId,
        name: 'Turma Agosto',
        courseId: { name: 'Mixagem' },
        professorId: { name: 'Professora Ana' },
      },
    ]);
  });

  it('retorna curso e aula para qualquer professor autorizado pelo controller', async () => {
    await expect(
      service.findStudentObservations(studentId.toString()),
    ).resolves.toEqual([
      expect.objectContaining({
        id: `${lessonId.toString()}:${studentId.toString()}`,
        courseName: 'Mixagem',
        cohortName: 'Turma Agosto',
        lessonOrder: 2,
        lessonTitle: 'Beat Match',
        observation: 'Precisa praticar a transição.',
        professorName: 'Professora Ana',
      }),
    ]);
  });
});

describe('CoursesService - progresso', () => {
  const studentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const cohortId = new Types.ObjectId();

  it('calcula o andamento da turma para a equipe a partir das presenças', async () => {
    const lessonQuery = {
      select: jest.fn(),
    };
    const lessonModel = { find: jest.fn().mockReturnValue(lessonQuery) };
    lessonQuery.select.mockResolvedValue([
      { attendance: [{ studentId, present: true }] },
      { attendance: [{ studentId, present: false }] },
    ]);
    const service = new CoursesService(
      {} as never,
      {} as never,
      lessonModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service['progressFor'](cohortId, {
        id: new Types.ObjectId().toString(),
        email: 'admin@teste.com',
        role: Role.Admin,
      }),
    ).resolves.toEqual({ completed: 1, total: 2, percent: 50 });
  });

  it('agrega o progresso individual por curso e respeita a seleção pública', async () => {
    const userQuery = {
      select: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn(),
    };
    const cohortQuery = {
      populate: jest.fn(),
      lean: jest.fn(),
    };
    const lessonQuery = {
      select: jest.fn(),
      lean: jest.fn(),
    };
    const userModel = { findOne: jest.fn().mockReturnValue(userQuery) };
    const cohortModel = { find: jest.fn().mockReturnValue(cohortQuery) };
    const lessonModel = { find: jest.fn().mockReturnValue(lessonQuery) };
    userQuery.select.mockReturnValue(userQuery);
    userQuery.lean.mockReturnValue(userQuery);
    userQuery.exec.mockResolvedValue({
      showAcademicProgress: true,
      profileCourseIds: [courseId],
    });
    cohortQuery.populate.mockReturnValue(cohortQuery);
    cohortQuery.lean.mockResolvedValue([
      {
        _id: cohortId,
        courseId: {
          _id: courseId,
          name: 'Formação DJ',
          description: 'Fundamentos e prática.',
        },
      },
    ]);
    lessonQuery.select.mockReturnValue(lessonQuery);
    lessonQuery.lean.mockResolvedValue([
      {
        cohortId,
        attendance: [{ studentId, present: true }],
      },
      {
        cohortId,
        attendance: [{ studentId, present: false }],
      },
    ]);
    const service = new CoursesService(
      {} as never,
      cohortModel as never,
      lessonModel as never,
      {} as never,
      {} as never,
      userModel as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.findStudentCourseProgress(studentId.toString(), {
        id: new Types.ObjectId().toString(),
        email: 'professor@teste.com',
        role: Role.Professor,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: courseId.toString(),
        name: 'Formação DJ',
        completed: 1,
        total: 2,
        percent: 50,
        visible: true,
      }),
    ]);

    userQuery.exec.mockResolvedValue({ showAcademicProgress: false });
    cohortModel.find.mockClear();
    await expect(
      service.findStudentCourseProgress(studentId.toString(), {
        id: new Types.ObjectId().toString(),
        email: 'professor@teste.com',
        role: Role.Professor,
      }),
    ).resolves.toEqual([]);
    expect(cohortModel.find).not.toHaveBeenCalled();
  });
});

describe('CoursesService - exclusão de curso', () => {
  const courseId = new Types.ObjectId();
  const course = {
    _id: courseId,
    deleteOne: jest.fn().mockResolvedValue(undefined),
  };
  const courseModel = { findById: jest.fn().mockResolvedValue(course) };
  const cohortModel = { countDocuments: jest.fn().mockResolvedValue(0) };
  const materialModel = { countDocuments: jest.fn().mockResolvedValue(0) };
  const service = new CoursesService(
    courseModel as never,
    cohortModel as never,
    {} as never,
    {} as never,
    materialModel as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    courseModel.findById.mockResolvedValue(course);
    cohortModel.countDocuments.mockResolvedValue(0);
    materialModel.countDocuments.mockResolvedValue(0);
    jest.clearAllMocks();
  });

  it('exclui curso sem aulas ou turmas vinculadas', async () => {
    await expect(service.deleteCourse(courseId.toString())).resolves.toEqual({
      deleted: true,
    });
    expect(course.deleteOne).toHaveBeenCalled();
  });

  it('impede exclusão quando existem vínculos acadêmicos', async () => {
    materialModel.countDocuments.mockResolvedValue(1);

    await expect(
      service.deleteCourse(courseId.toString()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(course.deleteOne).not.toHaveBeenCalled();
  });
});

describe('CoursesService - edição e exclusão de turma', () => {
  const cohortId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const cohort = {
    _id: cohortId,
    id: cohortId.toString(),
    name: 'Turma antiga',
    professorId: new Types.ObjectId(),
    unitId: new Types.ObjectId(),
    save: jest.fn().mockResolvedValue(undefined),
    deleteOne: jest.fn().mockResolvedValue(undefined),
  };
  const lessonQuery = { select: jest.fn() };
  const cohortModel = { findById: jest.fn().mockResolvedValue(cohort) };
  const lessonModel = {
    find: jest.fn().mockReturnValue(lessonQuery),
    deleteMany: jest.fn().mockResolvedValue(undefined),
  };
  const bookingsService = { remove: jest.fn().mockResolvedValue(undefined) };
  const service = new CoursesService(
    {} as never,
    cohortModel as never,
    lessonModel as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    bookingsService as never,
  );
  const actor = {
    id: new Types.ObjectId().toString(),
    email: 'admin@teste.com',
    role: Role.Admin,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cohort.name = 'Turma antiga';
    lessonQuery.select.mockResolvedValue([{ bookingId }]);
    jest.spyOn(service, 'findOneCohort').mockResolvedValue({} as never);
  });

  it('salva o novo nome da turma', async () => {
    await service.updateCohort(
      cohortId.toString(),
      { name: '  Turma nova  ' },
      actor,
    );

    expect(cohort.name).toBe('Turma nova');
    expect(cohort.save).toHaveBeenCalled();
  });

  it('remove aulas, agendamentos e a turma', async () => {
    await expect(
      service.deleteCohort(cohortId.toString(), actor),
    ).resolves.toEqual({ deleted: true });

    expect(bookingsService.remove).toHaveBeenCalledWith(bookingId.toString());
    expect(lessonModel.deleteMany).toHaveBeenCalledWith({
      cohortId: cohort._id,
    });
    expect(cohort.deleteOne).toHaveBeenCalled();
  });
});

describe('CoursesService - criação de turma', () => {
  const unitId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const professorId = new Types.ObjectId();
  const equipmentId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const cohortId = new Types.ObjectId();
  const courseModel = { findOne: jest.fn() };
  const cohortModel = {
    create: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };
  const userModel = {
    findOne: jest.fn(),
    countDocuments: jest.fn(),
  };
  const unitModel = { findOne: jest.fn() };
  const equipmentModel = { findOne: jest.fn() };
  const bookingsService = {
    classLessonScheduleConflicts: jest.fn(),
  };
  const service = new CoursesService(
    courseModel as never,
    cohortModel as never,
    {} as never,
    {} as never,
    {} as never,
    userModel as never,
    unitModel as never,
    equipmentModel as never,
    bookingsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    courseModel.findOne.mockResolvedValue({ _id: courseId });
    unitModel.findOne.mockResolvedValue({ _id: unitId });
    userModel.findOne.mockResolvedValue({ _id: professorId });
    equipmentModel.findOne.mockResolvedValue({ _id: equipmentId });
    userModel.countDocuments.mockResolvedValue(1);
    cohortModel.create.mockResolvedValue({ id: cohortId.toString() });
    bookingsService.classLessonScheduleConflicts.mockResolvedValue([]);
    jest.spyOn(service, 'findOneCohort').mockResolvedValue({} as never);
  });

  it('converte a unidade para ObjectId ao validar professor, equipamento e alunos', async () => {
    await service.createCohort(
      {
        name: 'Turma Devito',
        courseId: courseId.toString(),
        unitId: unitId.toString(),
        professorId: professorId.toString(),
        equipmentId: equipmentId.toString(),
        studentIds: [studentId.toString()],
        lessonCount: 1,
        durationMinutes: 60,
      },
      {
        id: new Types.ObjectId().toString(),
        email: 'admin@teste.com',
        role: Role.Admin,
      },
    );

    expect(userModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        unitId: { $in: [unitId, unitId.toString()] },
      }),
    );
    expect(equipmentModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        unitId: { $in: [unitId, unitId.toString()] },
      }),
    );
    expect(userModel.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        unitId: { $in: [unitId, unitId.toString()] },
      }),
    );
  });

  it('não cria a turma quando alguma aula conflita com a agenda', async () => {
    bookingsService.classLessonScheduleConflicts.mockResolvedValue([
      {
        lessonIndex: 0,
        date: '2030-08-20',
        time: '18:00',
        endTime: '19:00',
        kind: 'equipment',
        message: 'O equipamento já possui um agendamento neste horário.',
      },
    ]);

    await expect(
      service.createCohortWithLessons(
        {
          name: 'Turma sem conflito',
          courseId: courseId.toString(),
          unitId: unitId.toString(),
          professorId: professorId.toString(),
          equipmentId: equipmentId.toString(),
          studentIds: [studentId.toString()],
          lessonCount: 1,
          durationMinutes: 60,
          lessons: [
            {
              materialId: new Types.ObjectId().toString(),
              date: '2030-08-20',
              time: '18:00',
            },
          ],
        },
        {
          id: new Types.ObjectId().toString(),
          email: 'admin@teste.com',
          role: Role.Admin,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(cohortModel.create).not.toHaveBeenCalled();
  });
});
