import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { Permission } from '../common/enums/permission.enum';
import { LandingContentController } from './landing-content.controller';

function handler(name: 'findAll' | 'findOne' | 'update') {
  const value: unknown = Object.getOwnPropertyDescriptor(
    LandingContentController.prototype,
    name,
  )?.value;
  if (typeof value !== 'function') throw new Error(`Método ${name} ausente.`);
  return value;
}

describe('LandingContentController - autorização', () => {
  it('mantém a leitura pública', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('findAll'))).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler('findOne'))).toBe(true);
  });

  it('protege a edição com a permissão exclusiva do site principal', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler('update'))).toEqual([
      Permission.SiteEdit,
    ]);
  });
});
