import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MaterialCategoryDocument = HydratedDocument<MaterialCategory>;

export enum MaterialCategoryType {
  Library = 'biblioteca',
  Course = 'curso',
}

export const COURSES_CATEGORY_NAME = 'Cursos';
export const COURSES_CATEGORY_KEY = 'courses';

@Schema({ timestamps: true })
export class MaterialCategory {
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  @Prop({ default: true })
  active!: boolean;

  @Prop({
    type: String,
    enum: MaterialCategoryType,
    default: MaterialCategoryType.Library,
    index: true,
  })
  type!: MaterialCategoryType;

  @Prop({ unique: true, sparse: true, trim: true })
  systemKey?: string;
}

export const MaterialCategorySchema =
  SchemaFactory.createForClass(MaterialCategory);
