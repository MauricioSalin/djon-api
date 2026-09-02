import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as webPush from 'web-push';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import {
  PushSubscription,
  PushSubscriptionDocument,
} from './schemas/push-subscription.schema';

@Injectable()
export class NotificationsService {
  private readonly pushEnabled: boolean;

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(PushSubscription.name)
    private readonly subscriptionModel: Model<PushSubscriptionDocument>,
    config: ConfigService,
  ) {
    const publicKey = config.get<string>('WEB_PUSH_PUBLIC_KEY');
    const privateKey = config.get<string>('WEB_PUSH_PRIVATE_KEY');
    this.pushEnabled = Boolean(publicKey && privateKey);
    if (publicKey && privateKey) {
      webPush.setVapidDetails(
        config.get<string>(
          'WEB_PUSH_SUBJECT',
          'mailto:contato@djonacademy.com',
        ),
        publicKey,
        privateKey,
      );
    }
  }

  async create(dto: CreateNotificationDto) {
    const documents = await this.notificationModel.insertMany(
      dto.recipientIds.map((recipientId) => ({
        recipientId: new Types.ObjectId(recipientId),
        type: dto.type,
        title: dto.title,
        body: dto.body,
        url: dto.url ?? '/',
        metadata: dto.metadata ?? {},
      })),
    );
    await Promise.all(documents.map((document) => this.sendPush(document)));
    return documents;
  }

  createForRecipients(
    recipientIds: string[],
    data: Omit<CreateNotificationDto, 'recipientIds'>,
  ) {
    if (recipientIds.length === 0) return [];
    return this.create({ recipientIds, ...data });
  }

  async createForRecipientsOnce(
    recipientIds: string[],
    data: Omit<CreateNotificationDto, 'recipientIds'>,
    dedupeKey: string,
  ) {
    const documents = await Promise.all(
      [...new Set(recipientIds)].map(async (recipientId) => {
        const result = await this.notificationModel.updateOne(
          {
            recipientId: new Types.ObjectId(recipientId),
            dedupeKey,
          },
          {
            $setOnInsert: {
              recipientId: new Types.ObjectId(recipientId),
              type: data.type,
              title: data.title,
              body: data.body,
              url: data.url ?? '/',
              metadata: data.metadata ?? {},
              dedupeKey,
            },
          },
          { upsert: true },
        );
        if (!result.upsertedId) return null;
        const document = await this.notificationModel
          .findById(result.upsertedId)
          .exec();
        if (document) await this.sendPush(document);
        return document;
      }),
    );
    return documents.filter((document) => document !== null);
  }

  async wasRecentlyCreated(recipientId: string, type: string, since: Date) {
    return Boolean(
      await this.notificationModel.exists({
        recipientId: new Types.ObjectId(recipientId),
        type,
        createdAt: { $gte: since },
      }),
    );
  }

  async findMine(userId: string, unreadOnly = false) {
    return this.notificationModel
      .find({
        recipientId: new Types.ObjectId(userId),
        ...(unreadOnly ? { readAt: { $exists: false } } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean({ virtuals: true })
      .exec();
  }

  countUnread(userId: string) {
    return this.notificationModel.countDocuments({
      recipientId: new Types.ObjectId(userId),
      readAt: { $exists: false },
    });
  }

  async markRead(id: string, userId: string) {
    const notification = await this.notificationModel
      .findOneAndUpdate(
        { _id: id, recipientId: new Types.ObjectId(userId) },
        { readAt: new Date() },
        { returnDocument: 'after' },
      )
      .exec();
    if (!notification)
      throw new NotFoundException('Notificação não encontrada.');
    return notification;
  }

  async markAllRead(userId: string) {
    const result = await this.notificationModel.updateMany(
      { recipientId: new Types.ObjectId(userId), readAt: { $exists: false } },
      { readAt: new Date() },
    );
    return { updated: result.modifiedCount };
  }

  async remove(id: string, userId: string) {
    const result = await this.notificationModel.deleteOne({
      _id: id,
      recipientId: new Types.ObjectId(userId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    return { id, removed: true };
  }

  async subscribe(
    userId: string,
    dto: PushSubscriptionDto,
    userAgent?: string,
  ) {
    const subscription = await this.subscriptionModel.findOneAndUpdate(
      { endpoint: dto.endpoint },
      {
        userId: new Types.ObjectId(userId),
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent,
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    if (dto.confirmActivation && subscription) {
      // Persist first so the newly enabled device receives this same message.
      // Silent subscription syncs must never create another activation notice.
      await this.createForRecipientsOnce(
        [userId],
        {
          type: 'push.activated',
          title: 'Notificações push ativadas',
          body: 'Pronto! Agora você pode receber notificações push do DJ ON neste dispositivo.',
          url: '/dashboard/notificacoes',
        },
        `push-activated:${String(subscription._id)}`,
      );
    }
    return subscription;
  }

  async unsubscribe(userId: string, endpoint: string) {
    const result = await this.subscriptionModel.deleteOne({
      userId: new Types.ObjectId(userId),
      endpoint,
    });
    return { removed: result.deletedCount > 0 };
  }

  private async sendPush(notification: NotificationDocument) {
    if (!this.pushEnabled) return;
    const subscriptions = await this.subscriptionModel
      .find({ userId: notification.recipientId })
      .exec();
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify({
              title: notification.title,
              body: notification.body,
              url: notification.url,
            }),
          );
        } catch (error: unknown) {
          const statusCode =
            typeof error === 'object' && error !== null && 'statusCode' in error
              ? error.statusCode
              : undefined;
          if (statusCode === 404 || statusCode === 410) {
            await this.subscriptionModel.deleteOne({ _id: subscription.id });
          }
        }
      }),
    );
  }
}
