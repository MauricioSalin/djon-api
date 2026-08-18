import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { Unit } from '../../units/schemas/unit.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class SocialLinks {
  @Prop({ trim: true })
  instagram?: string;

  @Prop({ trim: true })
  soundcloud?: string;

  @Prop({ trim: true })
  youtube?: string;
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

  @Prop({ type: String, required: true, enum: Role, index: true })
  role!: Role;

  @Prop({ type: Types.ObjectId, ref: Unit.name, index: true })
  unitId?: Types.ObjectId;

  @Prop({ min: 0, max: 1000, default: 8, select: false })
  trainingHoursLimit!: number;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop()
  deactivatedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ name: 'text', email: 'text' });
