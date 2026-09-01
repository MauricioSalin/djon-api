import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilesModule } from '../files/files.module';
import { PortalContentController } from './portal-content.controller';
import { PortalContentService } from './portal-content.service';
import {
  PortalContent,
  PortalContentSchema,
} from './schemas/portal-content.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PortalContent.name, schema: PortalContentSchema },
    ]),
    FilesModule,
  ],
  controllers: [PortalContentController],
  providers: [PortalContentService],
  exports: [PortalContentService],
})
export class PortalContentModule {}
