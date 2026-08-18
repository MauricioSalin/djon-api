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
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
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
  @Roles(Role.Admin)
  findAllForAdmin() {
    return this.equipmentsService.findAll(false);
  }

  @Post()
  @Roles(Role.Admin)
  create(@Body() dto: CreateEquipmentDto) {
    return this.equipmentsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  update(@Param('id') id: string, @Body() dto: UpdateEquipmentDto) {
    return this.equipmentsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  deactivate(@Param('id') id: string) {
    return this.equipmentsService.deactivate(id);
  }
}
