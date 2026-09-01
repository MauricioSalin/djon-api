import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Permission } from '../common/enums/permission.enum';
import { UpdateLandingContentDto } from './dto/update-landing-content.dto';
import { LandingContentService } from './landing-content.service';

@ApiTags('landing-content')
@Controller('landing-content')
export class LandingContentController {
  constructor(private readonly service: LandingContentService) {}

  @Public()
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Public()
  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.service.findOne(key);
  }

  @ApiBearerAuth()
  @Patch(':key')
  @Permissions(Permission.SiteEdit)
  update(@Param('key') key: string, @Body() dto: UpdateLandingContentDto) {
    return this.service.update(key, dto);
  }
}
