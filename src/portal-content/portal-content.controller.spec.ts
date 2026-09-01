import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/enums/permission.enum';
import { PortalContentController } from './portal-content.controller';

function handler(name: 'findAll' | 'findOne' | 'update') {
  const value: unknown = Object.getOwnPropertyDescriptor(
    PortalContentController.prototype,
    name,
  )?.value;
  if (typeof value !== 'function') throw new Error(`Método ${name} ausente.`);
  return value;
}

describe('PortalContentController - autorização', () => {
  it('mantém a leitura disponível para usuários autenticados', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, handler('findAll')),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, handler('findOne')),
    ).toBeUndefined();
  });

  it('protege a edição com o privilégio de edição do portal', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler('update'))).toEqual([
      Permission.PortalEdit,
    ]);
  });
});
