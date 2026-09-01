import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';

type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class AuditAccessGuard implements CanActivate {
  private readonly allowedEmails: Set<string>;

  constructor(config: ConfigService) {
    this.allowedEmails = new Set(
      config
        .get<string>('AUDIT_ALLOWED_EMAILS', '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().user;
    if (
      actor?.role !== Role.Admin ||
      !this.allowedEmails.has(actor.email.trim().toLowerCase())
    ) {
      throw new ForbiddenException('Recurso indisponível.');
    }
    return true;
  }
}
