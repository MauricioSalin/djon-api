import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Connection, ConnectionStates } from 'mongoose';
import { Public } from '../common/decorators/public.decorator';
import { SyncService } from '../sync/sync.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly sync: SyncService,
  ) {}

  @Public()
  @Get()
  check() {
    const connected = this.connection.readyState === ConnectionStates.connected;
    return {
      status: connected ? 'ok' : 'degraded',
      database: connected ? 'connected' : 'disconnected',
      liveSync: this.sync.isConnected(),
      timestamp: new Date().toISOString(),
    };
  }
}
