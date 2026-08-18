import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StoredFile, StoredFileSchema } from './schemas/stored-file.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StoredFile.name, schema: StoredFileSchema },
    ]),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
