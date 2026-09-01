import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PortalHeroKey } from '../portal-content.defaults';

export type PortalContentDocument = HydratedDocument<PortalContent>;

@Schema({ timestamps: true })
export class PortalContent {
  @Prop({ type: String, enum: PortalHeroKey, required: true, unique: true })
  key!: PortalHeroKey;

  @Prop({ required: true, trim: true, maxlength: 80 })
  label!: string;

  @Prop({ required: true, trim: true, maxlength: 180 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  description!: string;

  @Prop({ type: String, default: null, maxlength: 2000 })
  banner!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PortalContentSchema = SchemaFactory.createForClass(PortalContent);
