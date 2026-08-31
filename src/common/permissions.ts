import { Permission } from './enums/permission.enum';
import { Role } from './enums/role.enum';
import { AuthUser } from './interfaces/auth-user.interface';

export function actorHasPermission(
  actor: AuthUser | undefined,
  permission: Permission,
): boolean {
  return Boolean(
    actor &&
    (actor.role === Role.Admin ||
      (actor.permissions ?? []).includes(permission)),
  );
}
