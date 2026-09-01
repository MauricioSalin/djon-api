import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/enums/permission.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findMine(
    @CurrentUser() actor: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.findMine(actor.id, unreadOnly === 'true');
  }

  @Get('unread-count')
  async countUnread(@CurrentUser() actor: AuthUser) {
    return { count: await this.notificationsService.countUnread(actor.id) };
  }

  @Post()
  @Permissions(Permission.NotificationsManage)
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() actor: AuthUser) {
    return this.notificationsService.markAllRead(actor.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.notificationsService.markRead(id, actor.id);
  }

  @Post('push-subscriptions')
  subscribe(
    @CurrentUser() actor: AuthUser,
    @Body() dto: PushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notificationsService.subscribe(actor.id, dto, userAgent);
  }

  @Delete('push-subscriptions')
  unsubscribe(
    @CurrentUser() actor: AuthUser,
    @Body('endpoint') endpoint: string,
  ) {
    return this.notificationsService.unsubscribe(actor.id, endpoint);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.notificationsService.remove(id, actor.id);
  }
}
