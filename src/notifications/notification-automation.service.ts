import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Booking,
  BookingStatus,
  BookingType,
} from '../bookings/schemas/booking.schema';
import { Role } from '../common/enums/role.enum';
import { Unit, UnitDocument } from '../units/schemas/unit.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NotificationsService } from './notifications.service';

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
const AUTOMATION_INTERVAL_MS = 60 * 60 * 1000;

type ReminderBooking = {
  _id: unknown;
  studentId: unknown;
  studentIds?: unknown[];
  title: string;
  date: string;
  time: string;
};

@Injectable()
export class NotificationAutomationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationAutomationService.name);
  private interval?: NodeJS.Timeout;

  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Unit.name)
    private readonly unitModel: Model<UnitDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (
      this.config.get<string>('NODE_ENV') === 'test' ||
      this.config.get<string>('DISABLE_NOTIFICATION_AUTOMATION') === 'true'
    ) {
      return;
    }
    void this.runDueNotifications();
    this.interval = setInterval(
      () => void this.runDueNotifications(),
      AUTOMATION_INTERVAL_MS,
    );
    this.interval.unref();
  }

  onApplicationShutdown() {
    if (this.interval) clearInterval(this.interval);
  }

  async runDueNotifications(now = new Date()) {
    try {
      await this.sendLessonReminders(now);
      await this.sendContentIncentives(now);
    } catch (error) {
      this.logger.error(
        'Falha ao processar notificações automáticas.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async sendLessonReminders(now: Date) {
    const units = await this.unitModel
      .find({ active: true })
      .select('_id timezone')
      .lean()
      .exec();

    for (const unit of units) {
      const timezone = unit.timezone || 'America/Sao_Paulo';
      const reminderDate = this.tomorrowIso(now, timezone);
      const bookings = (await this.bookingModel
        .find({
          unitId: unit._id,
          type: BookingType.Lesson,
          status: BookingStatus.Confirmed,
          date: reminderDate,
        })
        .select('_id studentId studentIds title date time')
        .lean()
        .exec()) as unknown as ReminderBooking[];

      for (const booking of bookings) {
        const recipients = (
          booking.studentIds?.length ? booking.studentIds : [booking.studentId]
        ).map(String);
        await this.notificationsService.createForRecipientsOnce(
          recipients,
          {
            type: 'lesson.reminder',
            title: 'Lembrete de aula',
            body: `${booking.title} amanhã às ${booking.time}.`,
            url: '/dashboard/student/agendar',
            metadata: {
              bookingId: String(booking._id),
              date: booking.date,
            },
          },
          `lesson-reminder:${String(booking._id)}:${booking.date}:${booking.time}`,
        );
      }
    }
  }

  private async sendContentIncentives(now: Date) {
    const users = await this.userModel
      .find({ active: true, role: { $in: [Role.Student, Role.Professor] } })
      .select('_id role')
      .lean()
      .exec();
    const since = new Date(now.getTime() - FIFTEEN_DAYS_MS);
    const cycleDate = now.toISOString().slice(0, 10);

    for (const user of users) {
      const userId = String(user._id);
      await this.sendIncentiveIfDue(
        userId,
        'event.incentive',
        since,
        cycleDate,
        {
          type: 'event.incentive',
          title: 'Tem algum evento para compartilhar?',
          body: 'Publique seu próximo evento e mantenha a comunidade DJ ON por dentro.',
          url:
            user.role === Role.Professor
              ? '/dashboard/professor/evento'
              : '/dashboard/student/evento',
        },
      );

      if (user.role === Role.Professor) {
        await this.sendIncentiveIfDue(
          userId,
          'material.incentive',
          since,
          cycleDate,
          {
            type: 'material.incentive',
            title: 'Que tal publicar um material?',
            body: 'Compartilhe uma referência, técnica ou conteúdo novo com os alunos.',
            url: '/dashboard/material/novo',
          },
        );
      }
    }
  }

  private async sendIncentiveIfDue(
    userId: string,
    type: string,
    since: Date,
    cycleDate: string,
    data: {
      type: string;
      title: string;
      body: string;
      url: string;
    },
  ) {
    if (
      await this.notificationsService.wasRecentlyCreated(userId, type, since)
    ) {
      return;
    }
    await this.notificationsService.createForRecipientsOnce(
      [userId],
      data,
      `${type}:${cycleDate}`,
    );
  }

  private tomorrowIso(now: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const tomorrow = new Date(
      Date.UTC(value('year'), value('month') - 1, value('day') + 1, 12),
    );
    return tomorrow.toISOString().slice(0, 10);
  }
}
