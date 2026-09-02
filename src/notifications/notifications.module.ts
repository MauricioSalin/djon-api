import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationAutomationService } from './notification-automation.service';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Unit, UnitSchema } from '../units/schemas/unit.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import {
  PushSubscription,
  PushSubscriptionSchema,
} from './schemas/push-subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: User.name, schema: UserSchema },
      { name: Unit.name, schema: UnitSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationAutomationService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
