import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { Permission } from '../../common/enums/permission.enum';
import { Unit } from '../../units/schemas/unit.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class LatestRelease {
  @Prop({ trim: true, maxlength: 150 })
  title?: string;

  @Prop({ trim: true })
  link?: string;

  @Prop({ trim: true })
  cover?: string;
}

const LatestReleaseSchema = SchemaFactory.createForClass(LatestRelease);

@Schema({ _id: false })
export class SocialLinks {
  @Prop({ trim: true })
  instagram?: string;

  @Prop({ trim: true })
  soundcloud?: string;

  @Prop({ trim: true })
  youtube?: string;

  @Prop({ trim: true })
  spotify?: string;

  @Prop({ trim: true })
  pressKit?: string;
}

const SocialLinksSchema = SchemaFactory.createForClass(SocialLinks);

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_document, returned: Record<string, unknown>) => {
      delete returned._id;
      delete returned.__v;
      delete returned.passwordHash;
      return returned;
    },
  },
})
export class User {
  @Prop({ unique: true, sparse: true, index: true })
  legacyId?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, maxlength: 150, index: true })
  projectName?: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ trim: true })
  whatsapp?: string;

  @Prop({ trim: true, select: false })
  cpf?: string;

  @Prop()
  birthDate?: string;

  @Prop()
  avatar?: string;

  @Prop()
  banner?: string;

  @Prop({ maxlength: 2000 })
  bio?: string;

  @Prop({ type: SocialLinksSchema, default: {} })
  socials!: SocialLinks;

  @Prop({ type: LatestReleaseSchema, default: {} })
  latestRelease!: LatestRelease;

  @Prop({ type: String, required: true, enum: Role, index: true })
  role!: Role;

  @Prop({ type: Types.ObjectId, ref: Unit.name, index: true })
  unitId?: Types.ObjectId;

  @Prop({ min: 0, max: 1000, default: 15, select: false })
  trainingHoursLimit!: number;

  @Prop({ type: [String], enum: Permission, default: [], select: false })
  permissions!: Permission[];

  @Prop({ default: true })
  showAcademicProgress!: boolean;

  @Prop({ type: [Types.ObjectId], ref: 'Course', default: undefined })
  profileCourseIds?: Types.ObjectId[];

  @Prop({ default: false })
  passwordChangeRequired!: boolean;

  @Prop({ select: false, index: true })
  passwordResetTokenHash?: string;

  @Prop({ select: false })
  passwordResetExpiresAt?: Date;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop()
  deactivatedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ name: 'text', projectName: 'text', email: 'text' });
