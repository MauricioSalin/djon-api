import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/enums/permission.enum';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { EquipmentsService } from './equipments.service';

@ApiTags('equipments')
@ApiBearerAuth()
@Controller('equipments')
export class EquipmentsController {
  constructor(private readonly equipmentsService: EquipmentsService) {}

  @Get()
  findAll() {
    return this.equipmentsService.findAll(true);
  }

  @Get('admin/all')
  @Permissions(Permission.EquipmentsManage)
  findAllForAdmin() {
    return this.equipmentsService.findAll(false);
  }

  @Post()
  @Permissions(Permission.EquipmentsManage)
  create(@Body() dto: CreateEquipmentDto) {
    return this.equipmentsService.create(dto);
  }

  @Patch(':id')
  @Permissions(Permission.EquipmentsManage)
  update(@Param('id') id: string, @Body() dto: UpdateEquipmentDto) {
    return this.equipmentsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions(Permission.EquipmentsManage)
  remove(@Param('id') id: string) {
    return this.equipmentsService.remove(id);
  }
}
