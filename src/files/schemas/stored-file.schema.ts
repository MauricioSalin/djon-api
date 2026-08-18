import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type StoredFileDocument = HydratedDocument<StoredFile>;

@Schema({ timestamps: true })
export class StoredFile {
  @Prop({ required: true, unique: true, index: true })
  key!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  size!: number;

  @Prop({ required: true, index: true })
  purpose!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  uploadedBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);
