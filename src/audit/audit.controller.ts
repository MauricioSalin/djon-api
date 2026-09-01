import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAccessGuard } from './audit-access.guard';
import { AuditService } from './audit.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(AuditAccessGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('actorId') actorId?: string,
    @Query('method') method?: string,
  ) {
    return this.auditService.findAll(
      Math.max(1, page),
      Math.min(100, Math.max(1, limit)),
      actorId,
      method,
    );
  }
}
