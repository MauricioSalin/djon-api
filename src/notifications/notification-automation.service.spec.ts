import { Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { NotificationAutomationService } from './notification-automation.service';

function queryResult<T>(value: T) {
  const query = {
    select: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(value),
  };
  query.select.mockReturnValue(query);
  query.lean.mockReturnValue(query);
  return query;
}

describe('NotificationAutomationService', () => {
  const unitId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const secondStudentId = new Types.ObjectId();
  const professorId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const bookingModel = { find: jest.fn() };
  const userModel = { find: jest.fn() };
  const unitModel = { find: jest.fn() };
  const notificationsService = {
    createForRecipientsOnce: jest.fn(),
    wasRecentlyCreated: jest.fn(),
  };
  const config = { get: jest.fn() };
  const service = new NotificationAutomationService(
    bookingModel as never,
    userModel as never,
    unitModel as never,
    notificationsService as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    unitModel.find.mockReturnValue(
      queryResult([{ _id: unitId, timezone: 'America/Sao_Paulo' }]),
    );
    bookingModel.find.mockReturnValue(queryResult([]));
    userModel.find.mockReturnValue(queryResult([]));
    notificationsService.wasRecentlyCreated.mockResolvedValue(false);
    notificationsService.createForRecipientsOnce.mockResolvedValue([]);
  });

  it('envia uma única lembrança da aula do dia seguinte para todos os alunos', async () => {
    bookingModel.find.mockReturnValue(
      queryResult([
        {
          _id: bookingId,
          studentId,
          studentIds: [studentId, secondStudentId],
          title: 'Mixagem criativa',
          date: '2026-09-03',
          time: '18:00',
        },
      ]),
    );

    await service['sendLessonReminders'](new Date('2026-09-02T15:00:00.000Z'));

    expect(bookingModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        unitId,
        type: 'aula',
        status: 'confirmado',
        date: '2026-09-03',
      }),
    );
    expect(notificationsService.createForRecipientsOnce).toHaveBeenCalledWith(
      [studentId.toString(), secondStudentId.toString()],
      expect.objectContaining({
        type: 'lesson.reminder',
        title: 'Lembrete de aula',
      }),
      `lesson-reminder:${bookingId.toString()}:2026-09-03:18:00`,
    );
  });

  it('envia incentivos quinzenais de evento e material conforme o papel', async () => {
    userModel.find.mockReturnValue(
      queryResult([
        { _id: studentId, role: Role.Student },
        { _id: professorId, role: Role.Professor },
      ]),
    );

    await service['sendContentIncentives'](
      new Date('2026-09-02T15:00:00.000Z'),
    );

    expect(notificationsService.createForRecipientsOnce).toHaveBeenCalledTimes(
      3,
    );
    expect(notificationsService.createForRecipientsOnce).toHaveBeenCalledWith(
      [studentId.toString()],
      expect.objectContaining({
        type: 'event.incentive',
        url: '/dashboard/student/evento',
      }),
      'event.incentive:2026-09-02',
    );
    expect(notificationsService.createForRecipientsOnce).toHaveBeenCalledWith(
      [professorId.toString()],
      expect.objectContaining({
        type: 'material.incentive',
        url: '/dashboard/material/novo',
      }),
      'material.incentive:2026-09-02',
    );
  });

  it('não repete um incentivo enviado nos últimos quinze dias', async () => {
    userModel.find.mockReturnValue(
      queryResult([{ _id: studentId, role: Role.Student }]),
    );
    notificationsService.wasRecentlyCreated.mockResolvedValue(true);

    await service['sendContentIncentives'](
      new Date('2026-09-02T15:00:00.000Z'),
    );

    expect(notificationsService.createForRecipientsOnce).not.toHaveBeenCalled();
  });
});
