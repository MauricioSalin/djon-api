import { Types } from 'mongoose';
import { NotificationsService } from './notifications.service';

describe('NotificationsService - deduplicação', () => {
  const recipientId = new Types.ObjectId();
  const notificationId = new Types.ObjectId();
  const notification = {
    _id: notificationId,
    recipientId,
    title: 'Lembrete',
    body: 'Conteúdo',
    url: '/',
  };
  const notificationModel = {
    updateOne: jest.fn(),
    findById: jest.fn(),
    exists: jest.fn(),
  };
  const subscriptionModel = {};
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new NotificationsService(
    notificationModel as never,
    subscriptionModel as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    notificationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(notification),
    });
  });

  it('cria e retorna somente a primeira notificação da mesma chave', async () => {
    notificationModel.updateOne
      .mockResolvedValueOnce({ upsertedId: notificationId })
      .mockResolvedValueOnce({ upsertedId: null });

    const data = {
      type: 'lesson.reminder',
      title: 'Lembrete de aula',
      body: 'Sua aula é amanhã.',
      url: '/dashboard/student/agendar',
    };
    const first = await service.createForRecipientsOnce(
      [recipientId.toString()],
      data,
      'lesson:1',
    );
    const repeated = await service.createForRecipientsOnce(
      [recipientId.toString()],
      data,
      'lesson:1',
    );

    expect(first).toEqual([notification]);
    expect(repeated).toEqual([]);
    expect(notificationModel.findById).toHaveBeenCalledTimes(1);
    const updateCalls = notificationModel.updateOne.mock
      .calls as unknown as Array<
      [
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
      ]
    >;
    const insert = updateCalls[0][1].$setOnInsert as Record<string, unknown>;
    expect(updateCalls[0][0]).toEqual({
      recipientId,
      dedupeKey: 'lesson:1',
    });
    expect(insert.type).toBe('lesson.reminder');
    expect(insert.dedupeKey).toBe('lesson:1');
    expect(updateCalls[0][2]).toEqual({ upsert: true });
  });

  it('consulta a janela recente pelo destinatário e pelo tipo', async () => {
    const since = new Date('2026-08-18T15:00:00.000Z');
    notificationModel.exists.mockResolvedValue({ _id: notificationId });

    await expect(
      service.wasRecentlyCreated(
        recipientId.toString(),
        'event.incentive',
        since,
      ),
    ).resolves.toBe(true);
    expect(notificationModel.exists).toHaveBeenCalledWith({
      recipientId,
      type: 'event.incentive',
      createdAt: { $gte: since },
    });
  });
});
