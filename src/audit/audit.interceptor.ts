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
import { Role } from '../common/enums/role.enum';
import { sanitizeAuditPayload } from './audit-sanitizer';
import { AuditService } from './audit.service';

type ResponseActor = Pick<AuthUser, 'id' | 'email' | 'role'> & {
  name?: string;
};

function actorFromResponse(value: unknown): ResponseActor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const user = (value as Record<string, unknown>).user;
  if (!user || typeof user !== 'object') return undefined;
  const record = user as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.email !== 'string' ||
    !Object.values(Role).includes(record.role as Role)
  ) {
    return undefined;
  }
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : undefined,
    email: record.email,
    role: record.role as Role,
  };
}

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
    const record = (statusCode: number, responseBody?: unknown) => {
      const actor = request.user ?? actorFromResponse(responseBody);
      void this.auditService
        .record({
          actorId: actor?.id,
          actorRole: actor?.role,
          actorName: actor?.name,
          actorEmail: actor?.email,
          method: request.method,
          path: request.originalUrl.split('?')[0],
          statusCode,
          targetId: Array.isArray(rawTargetId) ? rawTargetId[0] : rawTargetId,
          ip: request.ip,
          userAgent: request.get('user-agent'),
          requestBody: sanitizeAuditPayload(request.body),
          durationMs: Date.now() - startedAt,
        })
        .catch((error: unknown) =>
          this.logger.error('Falha ao persistir log de auditoria.', error),
        );
    };
    return next.handle().pipe(
      tap({
        next: (value) => record(response.statusCode, value),
        error: (error: { status?: number }) => record(error.status ?? 500),
      }),
    );
  }
}
