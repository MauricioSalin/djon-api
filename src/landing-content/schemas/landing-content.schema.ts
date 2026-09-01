import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { LandingSectionKey } from '../landing-content.defaults';

export type LandingContentDocument = HydratedDocument<LandingContent>;

@Schema({ timestamps: true })
export class LandingContent {
  @Prop({
    type: String,
    required: true,
    unique: true,
    enum: LandingSectionKey,
    index: true,
  })
  key!: LandingSectionKey;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data!: Record<string, unknown>;
}

export const LandingContentSchema =
  SchemaFactory.createForClass(LandingContent);
