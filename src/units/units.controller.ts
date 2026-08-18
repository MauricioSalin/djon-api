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
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { UpsertUnitDto } from './dto/upsert-unit.dto';
import { UnitsService } from './units.service';

@ApiTags('units')
@Controller('units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Public()
  @Get()
  findAll() {
    return this.unitsService.findAll(true);
  }

  @ApiBearerAuth()
  @Get('admin/all')
  @Roles(Role.Admin)
  findAllForAdmin() {
    return this.unitsService.findAll(false);
  }

  @ApiBearerAuth()
  @Post()
  @Roles(Role.Admin)
  create(@Body() dto: UpsertUnitDto) {
    return this.unitsService.create(dto);
  }

  @ApiBearerAuth()
  @Patch(':id')
  @Roles(Role.Admin)
  update(@Param('id') id: string, @Body() dto: UpsertUnitDto) {
    return this.unitsService.update(id, dto);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @Roles(Role.Admin)
  deactivate(@Param('id') id: string) {
    return this.unitsService.deactivate(id);
  }
}
