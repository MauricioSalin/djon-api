import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      return next.handle();

    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    const rawTargetId = request.params?.id;
    const record = (statusCode: number) => {
      void this.auditService
        .record({
          actorId: request.user?.id,
          actorRole: request.user?.role,
          method: request.method,
          path: request.originalUrl.split('?')[0],
          statusCode,
          targetId: Array.isArray(rawTargetId) ? rawTargetId[0] : rawTargetId,
          ip: request.ip,
          userAgent: request.get('user-agent'),
          durationMs: Date.now() - startedAt,
        })
        .catch((error: unknown) =>
          this.logger.error('Falha ao persistir log de auditoria.', error),
        );
    };
    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (error: { status?: number }) => record(error.status ?? 500),
      }),
    );
  }
}
