import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const contextFor = (role: Role) =>
    ({
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    }) as unknown as ExecutionContext;

  it('autoriza papel declarado', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.Admin]),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(contextFor(Role.Admin))).toBe(
      true,
    );
  });

  it('nega papel fora da política', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.Admin]),
    } as unknown as Reflector;
    expect(
      new RolesGuard(reflector).canActivate(contextFor(Role.Student)),
    ).toBe(false);
  });
});
