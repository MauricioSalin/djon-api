import { UnitsService } from './units.service';
import { generateUnitMapLinks } from './unit-map-links';

jest.mock('./unit-map-links', () => ({
  generateUnitMapLinks: jest.fn(),
}));

describe('UnitsService', () => {
  it('generates internal names and timezone without exposing them in the form', async () => {
    const unitModel = {
      create: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const service = new UnitsService(unitModel as never);
    jest.mocked(generateUnitMapLinks).mockResolvedValue({
      mapSrc: 'https://www.openstreetmap.org/export/embed.html',
      mapsHref: 'https://www.google.com/maps/search/',
      timezone: 'America/Sao_Paulo',
    });

    await service.create({
      label: 'Porto Alegre / RS',
      address: 'Rua General Vitorino 77, Porto Alegre - RS',
    });

    expect(unitModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'porto-alegre-rs',
        shortLabel: 'Porto Alegre',
        timezone: 'America/Sao_Paulo',
      }),
    );
  });
});
