import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ _id: false })
export class LessonAttendance {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId!: Types.ObjectId;

  @Prop({ default: false })
  present!: boolean;

  @Prop({ default: false })
  materialReleased!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  markedBy?: Types.ObjectId;

  @Prop()
  markedAt?: Date;
}

const LessonAttendanceSchema = SchemaFactory.createForClass(LessonAttendance);

export type LessonDocument = HydratedDocument<Lesson>;

@Schema({ timestamps: true })
export class Lesson {
  @Prop({ type: Types.ObjectId, ref: 'Cohort', required: true, index: true })
  cohortId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  order!: number;

  @Prop({ trim: true, maxlength: 200 })
  title?: string;

  @Prop({ type: Types.ObjectId, ref: 'Material', required: true, index: true })
  materialId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Booking', required: true })
  bookingId!: Types.ObjectId;

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  date!: string;

  @Prop({ required: true, match: /^([01]\d|2[0-3]):(?:00|30)$/ })
  time!: string;

  @Prop({ required: true, min: 30, max: 480 })
  durationMinutes!: number;

  @Prop({ type: [LessonAttendanceSchema], default: [] })
  attendance!: LessonAttendance[];
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);
LessonSchema.index({ cohortId: 1, order: 1 }, { unique: true });
