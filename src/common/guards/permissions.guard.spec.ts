import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../enums/permission.enum';
import { Role } from '../enums/role.enum';
import { AuthUser } from '../interfaces/auth-user.interface';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const actor: AuthUser = {
    id: '507f1f77bcf86cd799439011',
    email: 'professor@teste.com',
    role: Role.Professor,
    permissions: [Permission.BookingsManage, Permission.BookingsReview],
  };

  function setup(required: Permission[] | undefined, user?: AuthUser) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
    return { guard: new PermissionsGuard(reflector), context };
  }

  it('libera endpoints que não declaram privilégios', () => {
    const { guard, context } = setup(undefined, actor);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('exige todos os privilégios declarados', () => {
    const required = [Permission.BookingsManage, Permission.BookingsReview];
    const allowed = setup(required, actor);
    expect(allowed.guard.canActivate(allowed.context)).toBe(true);

    const missing = { ...actor, permissions: [Permission.BookingsManage] };
    const denied = setup(required, missing);
    expect(denied.guard.canActivate(denied.context)).toBe(false);
  });

  it('mantém administradores como superusuários', () => {
    const admin = { ...actor, role: Role.Admin, permissions: [] };
    const { guard, context } = setup([Permission.BookingsManage], admin);
    expect(guard.canActivate(context)).toBe(true);
  });
});
