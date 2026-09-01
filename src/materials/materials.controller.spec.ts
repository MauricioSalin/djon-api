import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Permission } from '../common/enums/permission.enum';
import { Role } from '../common/enums/role.enum';
import { MaterialsController } from './materials.controller';

type MaterialControllerMethod =
  | 'create'
  | 'update'
  | 'createCategory'
  | 'updateCategory'
  | 'deleteCategory'
  | 'remove';

function handler(method: MaterialControllerMethod): object {
  const value: unknown = Object.getOwnPropertyDescriptor(
    MaterialsController.prototype,
    method,
  )?.value;
  if (typeof value !== 'function') throw new Error(`Método ${method} ausente.`);
  return value;
}

describe('MaterialsController - autorização', () => {
  it.each(['create', 'update', 'remove'] as const)(
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

  it.each(['createCategory', 'updateCategory', 'deleteCategory'] as const)(
    'mantém %s protegido pela permissão de gestão',
    (method) => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(method))).toEqual([
        Permission.MaterialsManage,
      ]);
    },
  );
});
