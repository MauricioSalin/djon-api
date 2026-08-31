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
