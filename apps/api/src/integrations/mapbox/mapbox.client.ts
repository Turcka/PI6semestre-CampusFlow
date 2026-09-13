import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  placeName: string;
};

export type DirectionsResult = {
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  distanceMeters: number;
  durationMinutes: number;
};

function isConfigured() {
  return Boolean(env.MAPBOX_ACCESS_TOKEN);
}

export async function geocode(query: string): Promise<GeocodeResult | null> {
  if (!isConfigured()) {
    logger.warn({ query }, 'Mapbox não configurado — geocode ignorado');
    return null;
  }

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set('access_token', env.MAPBOX_ACCESS_TOKEN!);
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'pt');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox geocode error ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ center: [number, number]; place_name: string }>;
  };
  const feature = json.features?.[0];
  if (!feature) return null;
  return {
    longitude: feature.center[0],
    latitude: feature.center[1],
    placeName: feature.place_name,
  };
}

export async function directions(
  coordinates: Array<[number, number]>,
  profile: 'walking' | 'driving' = 'walking',
): Promise<DirectionsResult | null> {
  if (!isConfigured() || coordinates.length < 2) {
    logger.warn('Mapbox não configurado ou pontos insuficientes — directions ignorado');
    return null;
  }

  const path = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${path}`);
  url.searchParams.set('access_token', env.MAPBOX_ACCESS_TOKEN!);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox directions error ${res.status}`);
  const json = (await res.json()) as {
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { type: 'LineString'; coordinates: [number, number][] };
    }>;
  };
  const route = json.routes?.[0];
  if (!route) return null;

  return {
    geometry: route.geometry,
    distanceMeters: Math.round(route.distance),
    durationMinutes: Math.round(route.duration / 60),
  };
}
