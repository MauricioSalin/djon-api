export interface UnitMapLinks {
  mapSrc: string;
  mapsHref: string;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
}

const GEOCODING_TIMEOUT_MS = 8_000;
const MAP_LONGITUDE_SPAN = 0.006;
const MAP_LATITUDE_SPAN = 0.004;

export async function generateUnitMapLinks(
  address: string,
  fetcher: typeof fetch = fetch,
): Promise<UnitMapLinks> {
  const normalizedAddress = address.trim();
  const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
  searchUrl.searchParams.set('format', 'jsonv2');
  searchUrl.searchParams.set('limit', '1');
  searchUrl.searchParams.set('countrycodes', 'br');
  searchUrl.searchParams.set('q', normalizedAddress);

  const response = await fetcher(searchUrl, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'pt-BR',
      'User-Agent': 'DJON-Academy/1.0 (automatic unit map generation)',
    },
    signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenStreetMap geocoding failed with ${response.status}.`);
  }

  const results = (await response.json()) as NominatimResult[];
  const latitude = Number(results[0]?.lat);
  const longitude = Number(results[0]?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Address was not found by OpenStreetMap.');
  }

  const bbox = [
    longitude - MAP_LONGITUDE_SPAN / 2,
    latitude - MAP_LATITUDE_SPAN / 2,
    longitude + MAP_LONGITUDE_SPAN / 2,
    latitude + MAP_LATITUDE_SPAN / 2,
  ].join(',');
  const embedUrl = new URL('https://www.openstreetmap.org/export/embed.html');
  embedUrl.searchParams.set('bbox', bbox);
  embedUrl.searchParams.set('layer', 'mapnik');
  embedUrl.searchParams.set('marker', `${latitude},${longitude}`);

  const googleUrl = new URL('https://www.google.com/maps/search/');
  googleUrl.searchParams.set('api', '1');
  googleUrl.searchParams.set('query', normalizedAddress);

  return {
    mapSrc: embedUrl.toString(),
    mapsHref: googleUrl.toString(),
  };
}
