import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Role } from '../common/enums/role.enum';
import { BookingsController } from './bookings.controller';

type BookingControllerMethod = 'update' | 'approve' | 'reject' | 'remove';

function handler(method: BookingControllerMethod): object {
  const value: unknown = Object.getOwnPropertyDescriptor(
    BookingsController.prototype,
    method,
  )?.value;
  if (typeof value !== 'function') throw new Error(`Método ${method} ausente.`);
  return value;
}

describe('BookingsController - autorização', () => {
  it.each(['update', 'approve', 'reject'] as const)(
    'permite %s para admin e professor sem permissão delegada',
    (method) => {
      expect(Reflect.getMetadata(ROLES_KEY, handler(method))).toEqual([
        Role.Admin,
        Role.Professor,
      ]);
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, handler(method)),
      ).toBeUndefined();
    },
  );

  it('mantém a exclusão definitiva protegida pela permissão de gestão', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler('remove'))).toEqual([
      Permission.BookingsManage,
    ]);
  });
});
