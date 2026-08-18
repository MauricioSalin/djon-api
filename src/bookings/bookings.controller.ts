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
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { ReviewBookingDto } from './dto/review-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create(@Body() dto: CreateBookingDto, @CurrentUser() actor: AuthUser) {
    return this.bookingsService.create(dto, actor);
  }

  @Get()
  findAll(@Query() query: QueryBookingsDto, @CurrentUser() actor: AuthUser) {
    return this.bookingsService.findAll(query, actor);
  }

  @Get('training-balance')
  @Roles(Role.Student)
  trainingBalance(@CurrentUser() actor: AuthUser) {
    return this.bookingsService.trainingBalance(actor);
  }

  @Get('availability')
  availability(
    @Query('date') date: string,
    @Query('unitId') unitId?: string,
    @Query('type') type?: string,
    @Query('professorId') professorId?: string,
    @Query('equipmentId') equipmentId?: string,
    @Query('excludeBookingId') excludeBookingId?: string,
    @Query('durationMinutes') durationMinutes?: string,
  ) {
    return this.bookingsService.availability(
      date,
      unitId,
      type,
      professorId,
      equipmentId,
      excludeBookingId,
      durationMinutes,
    );
  }

  @Get('availability/month')
  monthlyAvailability(
    @Query('month') month: string,
    @Query('unitId') unitId?: string,
    @Query('type') type?: string,
    @Query('professorId') professorId?: string,
    @Query('equipmentId') equipmentId?: string,
    @Query('excludeBookingId') excludeBookingId?: string,
    @Query('durationMinutes') durationMinutes?: string,
  ) {
    return this.bookingsService.monthlyAvailability(
      month,
      unitId,
      type,
      professorId,
      equipmentId,
      excludeBookingId,
      durationMinutes,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.bookingsService.findOne(id, actor);
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Professor)
  remove(@Param('id') id: string) {
    return this.bookingsService.remove(id);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Professor)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.bookingsService.update(id, dto, actor);
  }

  @Post(':id/approve')
  @Roles(Role.Admin, Role.Professor)
  approve(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.bookingsService.approve(id, actor);
  }

  @Post(':id/reject')
  @Roles(Role.Admin, Role.Professor)
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewBookingDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.bookingsService.reject(id, dto.reason, actor);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: ReviewBookingDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.bookingsService.cancel(id, dto.reason, actor);
  }

  @Post(':id/reschedule')
  reschedule(
    @Param('id') id: string,
    @Body() dto: CreateBookingDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.bookingsService.reschedule(id, dto, actor);
  }
}
