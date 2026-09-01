import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditController } from './audit.controller';
import { AuditAccessGuard } from './audit-access.guard';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor, AuditAccessGuard],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
