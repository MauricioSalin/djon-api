import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { AuditAccessGuard } from './audit-access.guard';

function contextFor(user?: AuthUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardFor(emails: string) {
  const config = {
    get: jest.fn().mockReturnValue(emails),
  } as unknown as ConfigService;
  return new AuditAccessGuard(config);
}

const developerAdmin: AuthUser = {
  id: '507f1f77bcf86cd799439011',
  name: 'Admin Desenvolvedor',
  email: 'dev@djon.test',
  role: Role.Admin,
};

describe('AuditAccessGuard', () => {
  it('autoriza somente admin cujo e-mail esteja configurado', () => {
    expect(
      guardFor('outro@djon.test, DEV@DJON.TEST').canActivate(
        contextFor(developerAdmin),
      ),
    ).toBe(true);
  });

  it.each([
    ['lista vazia', '', developerAdmin],
    ['admin não autorizado', 'outro@djon.test', developerAdmin],
    [
      'perfil não administrativo',
      'dev@djon.test',
      { ...developerAdmin, role: Role.Professor },
    ],
  ])('nega acesso com %s', (_label, emails, actor) => {
    expect(() => guardFor(emails).canActivate(contextFor(actor))).toThrow(
      'Recurso indisponível.',
    );
  });
});
