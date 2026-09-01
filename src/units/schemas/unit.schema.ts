import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UnitDocument = HydratedDocument<Unit>;

@Schema({ timestamps: true })
export class Unit {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  label!: string;

  @Prop({ required: true, trim: true })
  shortLabel!: string;

  @Prop({ required: true, trim: true })
  address!: string;

  @Prop()
  mapSrc?: string;

  @Prop()
  mapsHref?: string;

  @Prop({ trim: true, maxlength: 20 })
  phone?: string;

  @Prop({ lowercase: true, trim: true, maxlength: 180 })
  email?: string;

  @Prop({ trim: true, maxlength: 500 })
  instagram?: string;

  @Prop({ trim: true, maxlength: 500 })
  facebook?: string;

  @Prop({ trim: true, maxlength: 120 })
  openingHours?: string;

  @Prop({ default: 'America/Sao_Paulo' })
  timezone!: string;

  @Prop({ default: true })
  active!: boolean;
}

export const UnitSchema = SchemaFactory.createForClass(Unit);
