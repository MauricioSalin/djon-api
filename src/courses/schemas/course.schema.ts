import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CourseDocument = HydratedDocument<Course>;

@Schema({ timestamps: true })
export class Course {
  @Prop({ required: true, trim: true, maxlength: 150 })
  name!: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ trim: true, maxlength: 2048 })
  coverImage?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'MaterialCategory',
    required: true,
    index: true,
  })
  categoryId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ default: true, index: true })
  active!: boolean;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
CourseSchema.index({ categoryId: 1, name: 1 }, { unique: true });
