import { Types } from 'mongoose';
import * as webPush from 'web-push';
import { NotificationsService } from './notifications.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
}));

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

describe('NotificationsService - confirmação de ativação push', () => {
  const recipientId = new Types.ObjectId();
  const subscriptionId = new Types.ObjectId();
  const notificationId = new Types.ObjectId();
  const dto = {
    endpoint: 'https://web.push.apple.com/device-test',
    p256dh: 'test-p256dh',
    auth: 'test-auth',
    confirmActivation: true,
  };
  const subscription = { _id: subscriptionId, userId: recipientId, ...dto };
  const notification = {
    _id: notificationId,
    recipientId,
    type: 'push.activated',
    title: 'Notificações push ativadas',
    body: 'Pronto! Agora você pode receber notificações push do DJ ON neste dispositivo.',
    url: '/dashboard/notificacoes',
  };
  const notificationModel = {
    updateOne: jest.fn(),
    findById: jest.fn(),
  };
  const subscriptionModel = {
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'WEB_PUSH_PUBLIC_KEY') return 'public-key';
      if (key === 'WEB_PUSH_PRIVATE_KEY') return 'private-key';
      return fallback;
    }),
  };
  const service = new NotificationsService(
    notificationModel as never,
    subscriptionModel as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    subscriptionModel.findOneAndUpdate.mockResolvedValue(subscription);
    subscriptionModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([subscription]),
    });
    notificationModel.updateOne.mockResolvedValue({
      upsertedId: notificationId,
    });
    notificationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(notification),
    });
  });

  it('salva a assinatura antes de criar a notificação e enviar o mesmo conteúdo por push', async () => {
    await expect(
      service.subscribe(recipientId.toString(), dto, 'iPhone'),
    ).resolves.toEqual(subscription);

    expect(subscriptionModel.findOneAndUpdate).toHaveBeenCalledWith(
      { endpoint: dto.endpoint },
      {
        userId: recipientId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: 'iPhone',
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    expect(notificationModel.updateOne).toHaveBeenCalledWith(
      { recipientId, dedupeKey: `push-activated:${String(subscriptionId)}` },
      {
        $setOnInsert: {
          recipientId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          url: notification.url,
          metadata: {},
          dedupeKey: `push-activated:${String(subscriptionId)}`,
        },
      },
      { upsert: true },
    );
    expect(
      subscriptionModel.findOneAndUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(notificationModel.updateOne.mock.invocationCallOrder[0]);
    expect(subscriptionModel.find).toHaveBeenCalledWith({
      userId: recipientId,
    });
    expect(webPush.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: dto.endpoint,
        keys: { p256dh: dto.p256dh, auth: dto.auth },
      },
      JSON.stringify({
        title: notification.title,
        body: notification.body,
        url: notification.url,
      }),
    );
  });

  it.each([undefined, false])(
    'não notifica na sincronização sem confirmação: %s',
    async (confirmActivation) => {
      await service.subscribe(recipientId.toString(), {
        ...dto,
        confirmActivation,
      });

      expect(notificationModel.updateOne).not.toHaveBeenCalled();
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    },
  );

  it('não duplica a confirmação nem o push em uma repetição da mesma ativação', async () => {
    notificationModel.updateOne
      .mockResolvedValueOnce({ upsertedId: notificationId })
      .mockResolvedValueOnce({ upsertedId: null });

    await service.subscribe(recipientId.toString(), dto);
    await service.subscribe(recipientId.toString(), dto);

    expect(notificationModel.findById).toHaveBeenCalledTimes(1);
    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('não confirma a ativação se a assinatura não foi salva', async () => {
    subscriptionModel.findOneAndUpdate.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(
      service.subscribe(recipientId.toString(), dto),
    ).rejects.toThrow('database unavailable');
    expect(notificationModel.updateOne).not.toHaveBeenCalled();
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
});
