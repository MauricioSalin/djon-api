import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export enum LeadStatus {
  New = 'novo',
  Contacted = 'contatado',
  Converted = 'convertido',
  Archived = 'arquivado',
}

export type LeadDocument = HydratedDocument<Lead>;

@Schema({ timestamps: true })
export class Lead {
  @Prop({ trim: true, maxlength: 100 })
  firstName?: string;

  @Prop({ trim: true, maxlength: 100 })
  lastName?: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ maxlength: 3000 })
  message?: string;

  @Prop({ maxlength: 50 })
  unitKey?: string;

  @Prop({
    type: String,
    required: true,
    enum: LeadStatus,
    default: LeadStatus.New,
    index: true,
  })
  status!: LeadStatus;

  @Prop({ type: Types.ObjectId, ref: User.name })
  assignedTo?: Types.ObjectId;

  @Prop({ maxlength: 3000 })
  internalNotes?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
