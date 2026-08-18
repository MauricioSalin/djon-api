import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Unit } from '../../units/schemas/unit.schema';

export type EquipmentDocument = HydratedDocument<Equipment>;

@Schema({ timestamps: true })
export class Equipment {
  @Prop({ required: true, trim: true, maxlength: 120 })
  name!: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: Unit.name, required: true, index: true })
  unitId!: Types.ObjectId;

  @Prop({ default: true, index: true })
  active!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const EquipmentSchema = SchemaFactory.createForClass(Equipment);
EquipmentSchema.index({ unitId: 1, name: 1 }, { unique: true });
