import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilesModule } from '../files/files.module';
import { LandingContentController } from './landing-content.controller';
import { LandingContentService } from './landing-content.service';
import {
  LandingContent,
  LandingContentSchema,
} from './schemas/landing-content.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LandingContent.name, schema: LandingContentSchema },
    ]),
    FilesModule,
  ],
  controllers: [LandingContentController],
  providers: [LandingContentService],
})
export class LandingContentModule {}
