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
import { Role } from '../common/enums/role.enum';
import { Permission } from '../common/enums/permission.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.Admin, Role.Professor)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.create(dto, actor);
  }

  @Get()
  findAll(@Query() query: QueryUsersDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.findAll(query, actor);
  }

  @Get('me')
  findMe(@CurrentUser() actor: AuthUser) {
    return this.usersService.findMe(actor.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() actor: AuthUser, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(actor.id, dto);
  }

  @Patch('me/password')
  changePassword(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(actor.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.usersService.findOne(id, actor);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Professor)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.usersService.updateByManager(id, dto, actor);
  }

  @Patch(':id/permissions')
  @Roles(Role.Admin)
  updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.usersService.updatePermissions(id, dto.permissions);
  }

  @Delete(':id')
  @Permissions(Permission.UsersManage)
  deactivate(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.usersService.deactivate(id, actor);
  }

  @Post(':id/restore')
  @Permissions(Permission.UsersManage)
  restore(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.usersService.restore(id, actor);
  }
}
