import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export enum EventType {
  Student = 'student',
  DjOn = 'djOn',
  Professor = 'professor',
}

export type EventDocument = HydratedDocument<Event>;

@Schema({ timestamps: true })
export class Event {
  @Prop({ unique: true, sparse: true, index: true })
  legacyId?: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true })
  date!: string;

  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  time!: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  location!: string;

  @Prop({ trim: true, maxlength: 100 })
  instagram?: string;

  @Prop({ maxlength: 3000 })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: EventType, index: true })
  type!: EventType;

  createdAt!: Date;
  updatedAt!: Date;
}

export const EventSchema = SchemaFactory.createForClass(Event);
EventSchema.index({ date: 1, time: 1 });
EventSchema.index({ title: 'text', location: 'text', description: 'text' });
