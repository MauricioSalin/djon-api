import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { MaterialCategory } from './material-category.schema';

export enum MaterialAttachmentType {
  Pdf = 'pdf',
  Image = 'image',
  File = 'file',
}

export enum MaterialStatus {
  Draft = 'draft',
  Published = 'published',
}

@Schema({ _id: true })
export class MaterialAttachment {
  @Prop()
  legacyId?: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: MaterialAttachmentType })
  type!: MaterialAttachmentType;

  @Prop({ required: true })
  url!: string;

  @Prop()
  size?: string;
}

const MaterialAttachmentSchema =
  SchemaFactory.createForClass(MaterialAttachment);

export type MaterialDocument = HydratedDocument<Material>;

@Schema({ timestamps: true })
export class Material {
  @Prop({ unique: true, sparse: true, index: true })
  legacyId?: string;

  @Prop({ trim: true, maxlength: 250, default: '' })
  title!: string;

  @Prop({ maxlength: 2000 })
  description?: string;

  @Prop({
    type: Types.ObjectId,
    ref: MaterialCategory.name,
    index: true,
  })
  categoryId?: Types.ObjectId;

  @Prop()
  coverImage?: string;

  @Prop()
  body?: string;

  @Prop({ type: [MaterialAttachmentSchema], default: [] })
  attachments!: MaterialAttachment[];

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  authorId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: MaterialStatus,
    default: MaterialStatus.Published,
    index: true,
  })
  status!: MaterialStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);
MaterialSchema.index({ title: 'text', description: 'text', body: 'text' });
