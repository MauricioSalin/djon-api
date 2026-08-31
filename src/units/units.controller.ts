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
import { Permissions } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/enums/permission.enum';
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
  @Permissions(Permission.UnitsManage)
  findAllForAdmin() {
    return this.unitsService.findAll(false);
  }

  @ApiBearerAuth()
  @Post()
  @Permissions(Permission.UnitsManage)
  create(@Body() dto: UpsertUnitDto) {
    return this.unitsService.create(dto);
  }

  @ApiBearerAuth()
  @Patch(':id')
  @Permissions(Permission.UnitsManage)
  update(@Param('id') id: string, @Body() dto: UpsertUnitDto) {
    return this.unitsService.update(id, dto);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @Permissions(Permission.UnitsManage)
  deactivate(@Param('id') id: string) {
    return this.unitsService.deactivate(id);
  }
}
