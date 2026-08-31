import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Unit } from '../../units/schemas/unit.schema';
import { Equipment } from '../../equipments/schemas/equipment.schema';

export enum BookingType {
  Lesson = 'aula',
  Training = 'treino',
}

export enum BookingStatus {
  Confirmed = 'confirmado',
  Pending = 'pendente',
  Cancelled = 'cancelado',
}

@Schema({ _id: false })
export class BookingStatusHistory {
  @Prop({ type: String, required: true, enum: BookingStatus })
  status!: BookingStatus;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  changedBy!: Types.ObjectId;

  @Prop()
  reason?: string;

  @Prop({ required: true, default: Date.now })
  changedAt!: Date;
}

const BookingStatusHistorySchema =
  SchemaFactory.createForClass(BookingStatusHistory);

export type BookingDocument = HydratedDocument<Booking>;

@Schema({ timestamps: true })
export class Booking {
  @Prop({ unique: true, sparse: true, index: true })
  legacyId?: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  studentId!: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: User.name, default: undefined })
  studentIds?: Types.ObjectId[];

  @Prop({ default: false, index: true })
  isClassLesson!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Cohort', index: true })
  cohortId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lesson', index: true })
  lessonId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 150 })
  cohortName?: string;

  @Prop({ type: Types.ObjectId, ref: User.name, index: true })
  professorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Equipment.name, index: true })
  equipmentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Unit.name, required: true, index: true })
  unitId!: Types.ObjectId;

  @Prop({ required: true, default: 'main-room' })
  resourceKey!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true })
  date!: string;

  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  time!: string;

  @Prop({ required: true, min: 30, max: 480, default: 60 })
  durationMinutes!: number;

  @Prop({ type: String, required: true, enum: BookingType, index: true })
  type!: BookingType;

  @Prop({ maxlength: 2000 })
  notes?: string;

  @Prop({ type: String, required: true, enum: BookingStatus, index: true })
  status!: BookingStatus;

  @Prop({ type: Types.ObjectId, ref: Booking.name })
  originalBookingId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  requestedBy!: Types.ObjectId;

  @Prop({ unique: true, sparse: true })
  activeSlotKey?: string;

  @Prop({ type: [String], default: undefined })
  activeProfessorSlotKeys?: string[];

  @Prop({ type: [String], default: undefined })
  activeEquipmentSlotKeys?: string[];

  @Prop({ type: [BookingStatusHistorySchema], default: [] })
  statusHistory!: BookingStatusHistory[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
BookingSchema.index({ date: 1, time: 1, status: 1 });
BookingSchema.index({ studentId: 1, date: 1 });
BookingSchema.index({ studentIds: 1, date: 1 });
BookingSchema.index(
  { activeProfessorSlotKeys: 1 },
  { unique: true, sparse: true },
);
BookingSchema.index(
  { activeEquipmentSlotKeys: 1 },
  { unique: true, sparse: true },
);
