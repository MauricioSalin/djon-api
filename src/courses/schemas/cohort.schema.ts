import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum CohortStatus {
  Setup = 'configuracao',
  Active = 'ativa',
  Completed = 'concluida',
}

export type CohortDocument = HydratedDocument<Cohort>;

@Schema({ timestamps: true })
export class Cohort {
  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Unit', required: true, index: true })
  unitId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  professorId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Equipment', required: true })
  equipmentId!: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'User', required: true, default: [] })
  studentIds!: Types.ObjectId[];

  @Prop({ required: true, min: 1, max: 200 })
  lessonCount!: number;

  @Prop({ required: true, min: 30, max: 480 })
  durationMinutes!: number;

  @Prop({
    type: String,
    enum: CohortStatus,
    default: CohortStatus.Setup,
    index: true,
  })
  status!: CohortStatus;
}

export const CohortSchema = SchemaFactory.createForClass(Cohort);
CohortSchema.index({ professorId: 1, unitId: 1, status: 1 });
