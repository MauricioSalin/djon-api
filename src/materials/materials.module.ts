import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { FilesModule } from '../files/files.module';
import { UsersModule } from '../users/users.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import {
  MaterialCategory,
  MaterialCategorySchema,
} from './schemas/material-category.schema';
import { Material, MaterialSchema } from './schemas/material.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Material.name, schema: MaterialSchema },
      { name: MaterialCategory.name, schema: MaterialCategorySchema },
    ]),
    UsersModule,
    NotificationsModule,
    FilesModule,
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService, MongooseModule],
})
export class MaterialsModule {}
