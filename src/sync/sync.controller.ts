import { Controller, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Sse('stream')
  stream() {
    return this.sync.events();
  }
}
