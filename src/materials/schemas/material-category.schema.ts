import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MaterialCategoryDocument = HydratedDocument<MaterialCategory>;

@Schema({ timestamps: true })
export class MaterialCategory {
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  @Prop({ default: true })
  active!: boolean;
}

export const MaterialCategorySchema =
  SchemaFactory.createForClass(MaterialCategory);
