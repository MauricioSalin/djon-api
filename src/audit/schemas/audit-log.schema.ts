import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { User } from '../../users/schemas/user.schema';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: User.name, index: true })
  actorId?: Types.ObjectId;

  @Prop({ type: String, enum: Role })
  actorRole?: Role;

  @Prop({ trim: true })
  actorName?: string;

  @Prop({ lowercase: true, trim: true, index: true })
  actorEmail?: string;

  @Prop({ required: true, index: true })
  method!: string;

  @Prop({ required: true, index: true })
  path!: string;

  @Prop({ required: true })
  statusCode!: number;

  @Prop()
  targetId?: string;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop({ type: SchemaTypes.Mixed })
  requestBody?: unknown;

  @Prop({ required: true })
  durationMs!: number;

  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorEmail: 1, createdAt: -1 });
