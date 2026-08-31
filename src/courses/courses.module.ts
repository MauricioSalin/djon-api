import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsModule } from '../bookings/bookings.module';
import { EquipmentsModule } from '../equipments/equipments.module';
import { MaterialsModule } from '../materials/materials.module';
import { UnitsModule } from '../units/units.module';
import { UsersModule } from '../users/users.module';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Cohort, CohortSchema } from './schemas/cohort.schema';
import { Course, CourseSchema } from './schemas/course.schema';
import { Lesson, LessonSchema } from './schemas/lesson.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Cohort.name, schema: CohortSchema },
      { name: Lesson.name, schema: LessonSchema },
    ]),
    BookingsModule,
    MaterialsModule,
    UsersModule,
    UnitsModule,
    EquipmentsModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService, MongooseModule],
})
export class CoursesModule {}
