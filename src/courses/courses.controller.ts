import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ConfigureCohortLessonsDto,
  CreateCohortDto,
  CreateCohortWithLessonsDto,
  UpdateAttendanceDto,
} from './dto/cohort.dto';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CoursesService } from './courses.service';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  findCourses(
    @Query('activeOnly') activeOnly: string | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.coursesService.findAllCourses(activeOnly !== 'false', actor);
  }

  @Post()
  @Permissions(Permission.CoursesManage)
  createCourse(@Body() dto: CreateCourseDto, @CurrentUser() actor: AuthUser) {
    return this.coursesService.createCourse(dto, actor);
  }

  @Patch(':id')
  @Permissions(Permission.CoursesManage)
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.coursesService.updateCourse(id, dto);
  }

  @Delete(':id')
  @Permissions(Permission.CoursesManage)
  deleteCourse(@Param('id') id: string) {
    return this.coursesService.deleteCourse(id);
  }

  @Get('cohorts')
  findCohorts(@CurrentUser() actor: AuthUser) {
    return this.coursesService.findCohorts(actor);
  }

  @Post('cohorts')
  @Roles(Role.Admin, Role.Professor)
  createCohort(@Body() dto: CreateCohortDto, @CurrentUser() actor: AuthUser) {
    return this.coursesService.createCohort(dto, actor);
  }

  @Post('cohorts/complete')
  @Roles(Role.Admin, Role.Professor)
  createCohortWithLessons(
    @Body() dto: CreateCohortWithLessonsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.coursesService.createCohortWithLessons(dto, actor);
  }

  @Get('cohorts/:id')
  findCohort(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.coursesService.findOneCohort(id, actor);
  }

  @Post('cohorts/:id/lessons')
  @Roles(Role.Admin, Role.Professor)
  configureLessons(
    @Param('id') id: string,
    @Body() dto: ConfigureCohortLessonsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.coursesService.configureLessons(id, dto, actor);
  }

  @Patch('lessons/:id/attendance')
  @Roles(Role.Admin, Role.Professor)
  updateAttendance(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.coursesService.updateAttendance(id, dto, actor);
  }
}
