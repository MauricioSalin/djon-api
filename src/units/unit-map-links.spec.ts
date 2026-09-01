import { generateUnitMapLinks } from './unit-map-links';

describe('generateUnitMapLinks', () => {
  it('geocodes the address and builds OpenStreetMap and Google Maps URLs', async () => {
    let requestedUrl = '';
    const fetcher: typeof fetch = jest.fn((input) => {
      requestedUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return Promise.resolve(
        new Response(JSON.stringify([{ lat: '-30.0303', lon: '-51.2261' }])),
      );
    });

    const result = await generateUnitMapLinks(
      'Rua General Vitorino 77, Porto Alegre - RS',
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestedUrl).toContain('nominatim.openstreetmap.org/search');
    expect(result.mapSrc).toContain('openstreetmap.org/export/embed.html');
    expect(result.mapSrc).toContain('marker=-30.0303%2C-51.2261');
    expect(result.mapsHref).toContain('google.com/maps/search');
    expect(result.mapsHref).toContain('Rua+General+Vitorino+77');
  });

  it('rejects an address that cannot be located', async () => {
    const fetcher: typeof fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify([]))),
    );

    await expect(
      generateUnitMapLinks('Endereço inexistente', fetcher),
    ).rejects.toThrow('Address was not found');
  });
});
