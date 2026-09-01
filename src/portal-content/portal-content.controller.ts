import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/enums/permission.enum';
import { UpdatePortalContentDto } from './dto/update-portal-content.dto';
import { PortalContentService } from './portal-content.service';

@ApiTags('portal-content')
@ApiBearerAuth()
@Controller('portal-content')
export class PortalContentController {
  constructor(private readonly portalContentService: PortalContentService) {}

  @Get()
  findAll() {
    return this.portalContentService.findAll();
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.portalContentService.findOne(key);
  }

  @Patch(':key')
  @Permissions(Permission.PortalEdit)
  update(@Param('key') key: string, @Body() dto: UpdatePortalContentDto) {
    return this.portalContentService.update(key, dto);
  }
}
