import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type PushSubscriptionDocument = HydratedDocument<PushSubscription>;

@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  endpoint!: string;

  @Prop({ required: true })
  p256dh!: string;

  @Prop({ required: true })
  auth!: string;

  @Prop()
  userAgent?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);
