import type { AppLanguage } from '../i18n/translations';

export type SearchMode = 'salidas' | 'compras';
export type OfferProductCategory = 'all' | 'carnes' | 'refrescos' | 'helados' | 'panificados';
export type StoreBucketType =
  | 'carniceria'
  | 'panaderia'
  | 'supermercado'
  | 'heladeria'
  | 'restaurante'
  | 'restobar'
  | 'juegos_comida';
export type OfferStoreType = 'all' | StoreBucketType;

export interface NearbyPlace {
  id: string;
  name: string;
  storeType: StoreBucketType;
  storeTypeLabel: string;
  address: string;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  rating: number | null;
  userRatingCount: number | null;
  openNow: boolean | null;
  priceLevelLabel: string | null;
  priceRange: {
    currencyCode: string;
    startUnits: number | null;
    endUnits: number | null;
  } | null;
  googleMapsUri: string;
  osmUri?: string | null;
  websiteUri: string | null;
}

export interface VenueEnrichment {
  name: string;
  foodOffers: string[];
  hasGames: boolean;
  gameOffers?: string[];
  gamePrices: string[];
  estimatedFoodPerPerson: number | null;
  estimatedGamePerSession: number | null;
  priceNote: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ClientPlacesResult {
  city: string;
  center: { lat: number; lng: number } | null;
  places: NearbyPlace[];
  provider: 'google' | 'osm' | 'fallback_links';
  fallbackMapsSearchUrl: string;
  fallbackOsmSearchUrl: string;
}

export interface ClientOffersFallbackResult {
  city: string;
  markdown: string;
  venueEnrichments: VenueEnrichment[];
  sources: GroundingSource[];
}

const STORE_LABELS_BY_LANG: Record<AppLanguage, Record<StoreBucketType, string>> = {
  es: {
    restaurante: 'Restaurante',
    restobar: 'Restobar',
    juegos_comida: 'Juegos y comidas',
    carniceria: 'Carnicería',
    panaderia: 'Panadería',
    supermercado: 'Supermercado',
    heladeria: 'Heladería',
  },
  en: {
    restaurante: 'Restaurant',
    restobar: 'Gastropub / Bar',
    juegos_comida: 'Games & Dining',
    carniceria: 'Butcher Shop',
    panaderia: 'Bakery',
    supermercado: 'Supermarket',
    heladeria: 'Ice Cream Shop',
  },
  fr: {
    restaurante: 'Restaurant',
    restobar: 'Resto-bar',
    juegos_comida: 'Jeux & restauration',
    carniceria: 'Boucherie',
    panaderia: 'Boulangerie',
    supermercado: 'Supermarché',
    heladeria: 'Glacier',
  },
  zh: {
    restaurante: '餐厅',
    restobar: '餐酒吧',
    juegos_comida: '游乐与餐饮',
    carniceria: '肉铺',
    panaderia: '面包店',
    supermercado: '超市',
    heladeria: '冰淇淋店',
  },
  ru: {
    restaurante: 'Ресторан',
    restobar: 'Рестобар',
    juegos_comida: 'Игры и еда',
    carniceria: 'Мясная лавка',
    panaderia: 'Пекарня',
    supermercado: 'Супермаркет',
    heladeria: 'Кафе-мороженое',
  },
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function buildClientMapsSearchUrl(
  city: string,
  mode: SearchMode,
  storeType: OfferStoreType,
  customQuery: string,
  language: AppLanguage = 'es'
): string {
  const trimmed = customQuery.trim();
  const topicParts: string[] = [];
  if (trimmed) topicParts.push(trimmed);
  if (storeType !== 'all') {
    topicParts.push(STORE_LABELS_BY_LANG[language][storeType]);
  } else if (!trimmed) {
    if (language === 'en') {
      topicParts.push(
        mode === 'salidas'
          ? 'restaurants restobars pool arcade bowling'
          : 'butcher bakery supermarket ice cream'
      );
    } else if (language === 'fr') {
      topicParts.push(
        mode === 'salidas'
          ? 'restaurants resto-bar billard arcade'
          : 'boucherie boulangerie supermarché glacier'
      );
    } else if (language === 'zh') {
      topicParts.push(
        mode === 'salidas' ? '餐厅 餐酒吧 台球 桌球 电玩' : '肉铺 面包店 超市 冰淇淋'
      );
    } else if (language === 'ru') {
      topicParts.push(
        mode === 'salidas'
          ? 'рестораны рестобар бильярд аркада'
          : 'мясная лавка пекарня супермаркет мороженое'
      );
    } else {
      topicParts.push(
        mode === 'salidas'
          ? 'restaurantes restobares pool juegos'
          : 'carnicerias panaderias supermercados heladerias'
      );
    }
  }
  const cleanCity = city.trim() || 'Buenos Aires, Argentina';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${topicParts.join(' ')} ${cleanCity}`.trim())}`;
}

export function buildClientOsmSearchUrl(city: string): string {
  const cleanCity = city.trim() || 'Argentina';
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(cleanCity)}`;
}

interface ResolvedGeoCity {
  displayName: string;
  center: { lat: number; lng: number } | null;
  viewbox: string; // west,north,east,south for Nominatim
  bbox: string; // west,south,east,north for Photon
  countryCode: string;
}

interface NominatimRow {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  addresstype?: string;
  importance?: number;
  name?: string;
  display_name?: string;
  boundingbox?: [string, string, string, string]; // [south, north, west, east]
  address?: Record<string, string>;
}

interface PhotonFeature {
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    extent?: [number, number, number, number]; // [west, north, east, south]
  };
  geometry?: {
    coordinates?: [number, number]; // [lng, lat]
  };
}

function buildTightBounds(
  center: { lat: number; lng: number },
  extent?: [number, number, number, number]
): { viewbox: string; bbox: string } {
  // Clamp bounding box to ~16km x 14km max so mega-cities/provinces stay focused around center
  const maxLngSpan = 0.16;
  const maxLatSpan = 0.12;
  if (extent && extent.length === 4) {
    const [w, n, e, s] = extent;
    if (
      [w, n, e, s].every(Number.isFinite) &&
      Math.abs(e - w) <= 0.35 &&
      Math.abs(n - s) <= 0.35 &&
      Math.abs(e - w) >= 0.01 &&
      Math.abs(n - s) >= 0.01
    ) {
      return {
        viewbox: `${w},${n},${e},${s}`,
        bbox: `${w},${s},${e},${n}`,
      };
    }
  }
  const west = (center.lng - maxLngSpan / 2).toFixed(6);
  const east = (center.lng + maxLngSpan / 2).toFixed(6);
  const north = (center.lat + maxLatSpan / 2).toFixed(6);
  const south = (center.lat - maxLatSpan / 2).toFixed(6);
  return {
    viewbox: `${west},${north},${east},${south}`,
    bbox: `${west},${south},${east},${north}`,
  };
}

interface OpenMeteoGeoRow {
  name?: string;
  latitude?: number;
  longitude?: number;
  country_code?: string;
  country?: string;
  admin1?: string;
  population?: number;
}

export async function geocodeCityGlobalClient(
  rawCity: string,
  mapsLang: string
): Promise<ResolvedGeoCity> {
  const clean = rawCity.trim();
  if (!clean) {
    return { displayName: '', center: null, viewbox: '', bbox: '', countryCode: '' };
  }

  const cityHead = clean.split(',')[0].trim();
  const extraHint = clean.includes(',') ? clean.split(',').slice(1).join(' ').trim().toLowerCase() : '';

  const nomPromise = fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      clean
    )}&format=jsonv2&addressdetails=1&limit=5&accept-language=${encodeURIComponent(mapsLang)}`,
    { signal: AbortSignal.timeout(5500) }
  )
    .then((r) => (r.ok ? (r.json() as Promise<NominatimRow[]>) : []))
    .catch(() => [] as NominatimRow[]);

  const openMeteoPromise = fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      cityHead
    )}&count=5&language=${encodeURIComponent(mapsLang)}`,
    { signal: AbortSignal.timeout(5000) }
  )
    .then((r) => (r.ok ? (r.json() as Promise<{ results?: OpenMeteoGeoRow[] }>) : { results: [] }))
    .catch(() => ({ results: [] as OpenMeteoGeoRow[] }));

  const photonPromise = fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=4`,
    { signal: AbortSignal.timeout(4500) }
  )
    .then((r) => (r.ok ? (r.json() as Promise<{ features?: PhotonFeature[] }>) : { features: [] }))
    .catch(() => ({ features: [] as PhotonFeature[] }));

  const [nomRows, meteoData, photonData] = await Promise.all([
    nomPromise,
    openMeteoPromise,
    photonPromise,
  ]);
  const photonFeatures = photonData.features || [];
  const meteoResults = meteoData.results || [];

  // Score Nominatim settlement candidates
  const settlementTypes = new Set([
    'city',
    'town',
    'village',
    'municipality',
    'administrative',
    'borough',
    'suburb',
    'quarter',
    'state_district',
    'province',
  ]);
  const bestNom =
    nomRows.find((r) => settlementTypes.has(r.addresstype || '') || settlementTypes.has(r.type || '')) ||
    nomRows[0];

  const photonSettlement = photonFeatures.find((f) => {
    const val = f.properties?.osm_value || f.properties?.type || '';
    return ['city', 'town', 'village', 'borough', 'suburb', 'province', 'state'].includes(val);
  });
  const bestPhotonCity = photonSettlement || photonFeatures[0];

  const bestMeteo =
    (extraHint
      ? meteoResults.find((m) =>
          `${m.admin1 || ''} ${m.country || ''} ${m.country_code || ''}`
            .toLowerCase()
            .includes(extraHint)
        )
      : undefined) || meteoResults[0];

  let center: { lat: number; lng: number } | null = null;
  let extent: [number, number, number, number] | undefined;
  let displayName = clean;
  let countryCode = '';

  // Fast global baseline from Open-Meteo Geocoding
  if (
    bestMeteo &&
    typeof bestMeteo.latitude === 'number' &&
    typeof bestMeteo.longitude === 'number'
  ) {
    center = { lat: bestMeteo.latitude, lng: bestMeteo.longitude };
    countryCode = (bestMeteo.country_code || '').toLowerCase();
    const cleanMeteoName = (bestMeteo.name || '').replace(/^Ciudad de\s+/i, '').trim();
    const parts = [cleanMeteoName, bestMeteo.admin1, bestMeteo.country].filter(
      (v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx
    );
    if (parts.length > 0) {
      displayName = parts.join(', ');
    }
  }

  // Photon city node often has the exact urban center & extent
  if (photonSettlement && bestPhotonCity?.geometry?.coordinates?.length === 2) {
    const [pLng, pLat] = bestPhotonCity.geometry.coordinates;
    if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
      center = { lat: pLat, lng: pLng };
      extent = bestPhotonCity.properties?.extent;
      countryCode = (bestPhotonCity.properties?.countrycode || countryCode).toLowerCase();
      const props = bestPhotonCity.properties || {};
      const parts = [props.name || props.city, props.state, props.country].filter(
        (v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx
      );
      if (parts.length > 0) {
        displayName = parts.join(', ');
      }
    }
  }

  if (bestNom) {
    const nLat = Number(bestNom.lat);
    const nLng = Number(bestNom.lon);
    const addr = bestNom.address || {};
    const locality =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.suburb ||
      addr.municipality ||
      bestNom.name ||
      '';
    const state = addr.state || '';
    const country = addr.country || '';
    const nomCountryCode = (addr.country_code || '').toLowerCase();

    const nomParts = [locality, state, country].filter(
      (v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx
    );
    if (nomParts.length > 0) {
      displayName = nomParts.join(', ');
    } else if (bestNom.display_name) {
      displayName = bestNom.display_name.split(',').slice(0, 3).join(',').trim();
    }
    if (!countryCode && nomCountryCode) {
      countryCode = nomCountryCode;
    }

    const sameCountry = !countryCode || !nomCountryCode || countryCode === nomCountryCode;
    if (!center || !sameCountry) {
      if (Number.isFinite(nLat) && Number.isFinite(nLng)) {
        center = { lat: nLat, lng: nLng };
      }
      if (Array.isArray(bestNom.boundingbox) && bestNom.boundingbox.length === 4) {
        const [south, north, west, east] = bestNom.boundingbox.map(Number);
        if ([west, north, east, south].every(Number.isFinite)) {
          extent = [west, north, east, south];
        }
      }
    }
  }

  const bounds = center ? buildTightBounds(center, extent) : { viewbox: '', bbox: '' };
  return { displayName, center, viewbox: bounds.viewbox, bbox: bounds.bbox, countryCode };
}

function getBucketsToSearch(
  mode: SearchMode,
  storeType: OfferStoreType,
  productCategory: OfferProductCategory,
  isGamesQuery: boolean
): StoreBucketType[] {
  if (storeType !== 'all') {
    return [storeType];
  }
  if (mode === 'salidas' && isGamesQuery) {
    return ['juegos_comida', 'restobar'];
  }
  if (mode === 'salidas') {
    return ['restaurante', 'restobar', 'juegos_comida'];
  }
  if (productCategory === 'carnes') {
    return ['carniceria', 'supermercado'];
  }
  if (productCategory === 'panificados') {
    return ['panaderia', 'supermercado'];
  }
  if (productCategory === 'helados') {
    return ['heladeria', 'supermercado'];
  }
  if (productCategory === 'refrescos') {
    return ['supermercado'];
  }
  return ['carniceria', 'panaderia', 'supermercado', 'heladeria'];
}

const NON_SALIDAS_BUCKETS = new Set<StoreBucketType>([
  'carniceria',
  'panaderia',
  'supermercado',
  'heladeria',
]);

const GAME_KEYWORD_REGEX =
  /\b(pool|billar|billiards|arcade|bowling|boliche|fichines|juegos|games|snooker|metegol|flipper|ping\s*pong|dardos)\b/i;

function isNonGameNoiseVenue(osmCategory: string, osmType: string, nameLower: string): boolean {
  const cat = osmCategory.toLowerCase();
  const typ = osmType.toLowerCase();
  if (
    typ === 'ice_cream' ||
    typ === 'swimming_pool' ||
    typ === 'water_park' ||
    typ === 'lottery' ||
    typ === 'butcher' ||
    typ === 'bakery' ||
    typ === 'pastry' ||
    typ === 'supermarket' ||
    typ === 'convenience' ||
    typ === 'grocery'
  ) {
    return !GAME_KEYWORD_REGEX.test(nameLower);
  }
  if (cat === 'shop' && typ === 'ice_cream') return true;
  if (/\b(helader[ií]a|helados|gelato|ice\s*cream|piscina|natatorio)\b/i.test(nameLower)) {
    return !GAME_KEYWORD_REGEX.test(nameLower);
  }
  return false;
}

function classifyNominatimRow(
  row: NominatimRow,
  fallbackBucket: StoreBucketType
): StoreBucketType {
  const cat = (row.category || '').toLowerCase();
  const type = (row.type || '').toLowerCase();
  const nameLower = (row.name || row.display_name || '').toLowerCase();

  if ((cat === 'amenity' || cat === 'shop') && type === 'ice_cream') return 'heladeria';
  if (cat === 'shop' && type === 'butcher') return 'carniceria';
  if (cat === 'shop' && (type === 'bakery' || type === 'pastry')) return 'panaderia';
  if (cat === 'shop' && (type === 'supermarket' || type === 'convenience' || type === 'grocery')) {
    return 'supermercado';
  }

  if (
    type === 'bowling_alley' ||
    type === 'amusement_arcade' ||
    type === 'adult_gaming_centre' ||
    type === 'billiards' ||
    (cat === 'shop' && type === 'games') ||
    GAME_KEYWORD_REGEX.test(nameLower)
  ) {
    return 'juegos_comida';
  }
  if (cat === 'amenity' && (type === 'bar' || type === 'pub' || type === 'biergarten' || type === 'nightclub')) {
    return 'restobar';
  }
  if (cat === 'amenity' && (type === 'restaurant' || type === 'fast_food' || type === 'cafe' || type === 'food_court')) {
    return fallbackBucket === 'restobar' ? 'restobar' : 'restaurante';
  }
  return fallbackBucket;
}

export async function searchNearbyPlacesClient(params: {
  cityQuery: string;
  mode: SearchMode;
  storeType: OfferStoreType;
  productCategory: OfferProductCategory;
  customQuery: string;
  language: AppLanguage;
  mapsLanguage: string;
}): Promise<ClientPlacesResult> {
  const {
    cityQuery,
    mode,
    storeType,
    productCategory,
    customQuery,
    language,
    mapsLanguage,
  } = params;

  const trimmedCity = cityQuery.trim();
  const trimmedQuery = customQuery.trim();
  const isGamesQuery =
    /\b(pool|billar|billiards|arcade|bowling|boliche|fichas?|metegol|flipper|ping\s*pong|juegos?|games?|snooker|dardos|laser|fichines)\b/i.test(
      trimmedQuery
    );

  const bucketsToSearch = getBucketsToSearch(mode, storeType, productCategory, isGamesQuery);
  const geo = await geocodeCityGlobalClient(trimmedCity, mapsLanguage);
  const displayCity = geo.displayName || trimmedCity;
  const fallbackMapsSearchUrl = buildClientMapsSearchUrl(
    displayCity,
    mode,
    storeType,
    trimmedQuery,
    language
  );
  const fallbackOsmSearchUrl = buildClientOsmSearchUrl(displayCity);

  const labels = STORE_LABELS_BY_LANG[language];
  const collected: NearbyPlace[] = [];
  const seenKeys = new Set<string>();

  const isBucketCompatible = (
    bucket: StoreBucketType,
    rawName: string,
    osmCategory = '',
    osmType = ''
  ): boolean => {
    const nameLower = rawName.toLowerCase();
    if (storeType === 'juegos_comida') {
      if (isNonGameNoiseVenue(osmCategory, osmType, nameLower)) return false;
      return bucket === 'juegos_comida';
    }
    if (storeType !== 'all') {
      if (mode === 'salidas' && NON_SALIDAS_BUCKETS.has(bucket)) return false;
      return bucket === storeType;
    }
    if (mode === 'salidas') {
      if (NON_SALIDAS_BUCKETS.has(bucket)) return false;
      if (isGamesQuery) {
        return bucket === 'juegos_comida' || bucket === 'restobar';
      }
    }
    return bucketsToSearch.includes(bucket);
  };

  const addNominatimRows = (rows: NominatimRow[], fallbackBucket: StoreBucketType) => {
    for (const row of rows) {
      const osmKey = row.osm_type && row.osm_id ? `${row.osm_type}-${row.osm_id}` : `nom-${row.place_id}`;
      const rawName = (row.name || row.display_name?.split(',')[0] || '').trim();
      if (!rawName) continue;
      // Skip administrative city boundary entries themselves
      if (row.category === 'boundary' || ['city', 'town', 'village', 'municipality'].includes(row.type || '')) {
        continue;
      }

      const bucket = classifyNominatimRow(row, fallbackBucket);
      if (!isBucketCompatible(bucket, rawName, row.category || '', row.type || '')) {
        continue;
      }

      const dedupeKey = `${osmKey}|${rawName.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const pLat = Number(row.lat);
      const pLng = Number(row.lon);
      const validCoords = Number.isFinite(pLat) && Number.isFinite(pLng);

      const distanceMeters =
        geo.center && validCoords
          ? haversineMeters(geo.center.lat, geo.center.lng, pLat, pLng)
          : null;

      if (distanceMeters !== null && distanceMeters > 60000) {
        continue;
      }

      const addr = row.address || {};
      const streetLine = [addr.road, addr.house_number].filter(Boolean).join(' ');
      const areaLine = addr.suburb || addr.neighbourhood || addr.city || addr.town || '';
      const formattedAddr =
        [streetLine, areaLine].filter(Boolean).join(', ') ||
        row.display_name?.split(',').slice(1, 4).join(',').trim() ||
        displayCity;

      collected.push({
        id: `osm-${osmKey}`,
        name: rawName,
        storeType: bucket,
        storeTypeLabel: labels[bucket],
        address: formattedAddr,
        lat: validCoords ? pLat : null,
        lng: validCoords ? pLng : null,
        distanceMeters,
        rating: null,
        userRatingCount: null,
        openNow: null,
        priceLevelLabel: null,
        priceRange: null,
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${rawName} ${displayCity}`)}`,
        osmUri:
          row.osm_type && row.osm_id
            ? `https://www.openstreetmap.org/${row.osm_type}/${row.osm_id}`
            : null,
        websiteUri: null,
      });
    }
  };

  const runNominatimQuery = async (
    q: string,
    fallbackBucket: StoreBucketType,
    limit = 8,
    useViewbox = true
  ) => {
    try {
      const viewboxClause =
        useViewbox && geo.viewbox ? `&viewbox=${encodeURIComponent(geo.viewbox)}&bounded=1` : '';
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q
      )}${viewboxClause}&format=jsonv2&addressdetails=1&limit=${limit}&accept-language=${encodeURIComponent(
        mapsLanguage
      )}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) return;
      const rows = (await res.json()) as NominatimRow[];
      addNominatimRows(rows, fallbackBucket);
    } catch {
      // Non-fatal: continue other queries
    }
  };

  const tagQueriesByBucket: Record<StoreBucketType, string[]> = {
    restaurante: ['[amenity=restaurant]'],
    restobar: ['[amenity=bar]', '[amenity=pub]'],
    juegos_comida: [
      '[leisure=bowling_alley]',
      '[leisure=amusement_arcade]',
      '[sport=billiards]',
      'billar bowling arcade',
    ],
    carniceria: ['[shop=butcher]'],
    panaderia: ['[shop=bakery]'],
    supermercado: ['[shop=supermarket]'],
    heladeria: ['[amenity=ice_cream]'],
  };

  const tasks: Array<{ q: string; bucket: StoreBucketType; limit: number; bounded: boolean }> = [];

  if (trimmedQuery) {
    const primaryBucket = bucketsToSearch[0] || 'restaurante';
    tasks.push({
      q: geo.viewbox ? trimmedQuery : `${trimmedQuery} ${displayCity}`,
      bucket: primaryBucket,
      limit: 10,
      bounded: Boolean(geo.viewbox),
    });
  }

  for (const bucket of bucketsToSearch.slice(0, 4)) {
    const queries = tagQueriesByBucket[bucket];
    if (geo.viewbox) {
      const tagQ = queries[0];
      tasks.push({
        q: tagQ,
        bucket,
        limit: bucketsToSearch.length === 1 ? 12 : 6,
        bounded: true,
      });
      if ((bucketsToSearch.length === 1 || bucket === 'juegos_comida') && queries[1]) {
        tasks.push({ q: queries[1], bucket, limit: 8, bounded: true });
      }
      if (bucket === 'juegos_comida' && queries[2]) {
        tasks.push({ q: queries[2], bucket, limit: 8, bounded: true });
      }
    } else {
      tasks.push({
        q: `${labels[bucket]} ${displayCity}`,
        bucket,
        limit: 6,
        bounded: false,
      });
    }
  }

  // Execute max 3-4 Nominatim queries politely to stay well within fair-use limits
  const maxNomTasks = storeType === 'juegos_comida' ? 4 : 3;
  for (const t of tasks.slice(0, maxNomTasks)) {
    await runNominatimQuery(t.q, t.bucket, t.limit, t.bounded);
  }

  // Co-primary / backup bounded Photon POI search (CORS *, reliable worldwide & inside exact bbox)
  const ALLOWED_POI_VALUES = new Set([
    'restaurant',
    'bar',
    'pub',
    'biergarten',
    'fast_food',
    'cafe',
    'food_court',
    'ice_cream',
    'bowling_alley',
    'amusement_arcade',
    'adult_gaming_centre',
    'billiards',
    'games',
    'sports_centre',
    'butcher',
    'bakery',
    'pastry',
    'supermarket',
    'convenience',
    'grocery',
  ]);

  const classifyPhotonPoi = (
    p: NonNullable<PhotonFeature['properties']>,
    fallbackBucket: StoreBucketType
  ): StoreBucketType | null => {
    const osmKey = (p.osm_key || '').toLowerCase();
    const osmVal = (p.osm_value || '').toLowerCase();
    const nameLower = (p.name || '').toLowerCase();
    if (!['amenity', 'shop', 'leisure', 'sport'].includes(osmKey) || !ALLOWED_POI_VALUES.has(osmVal)) {
      return null;
    }
    if (osmVal === 'ice_cream') return 'heladeria';
    if (osmVal === 'butcher') return 'carniceria';
    if (osmVal === 'bakery' || osmVal === 'pastry') return 'panaderia';
    if (osmVal === 'supermarket' || osmVal === 'convenience' || osmVal === 'grocery') {
      return 'supermercado';
    }
    if (
      osmVal === 'bowling_alley' ||
      osmVal === 'amusement_arcade' ||
      osmVal === 'adult_gaming_centre' ||
      osmVal === 'billiards' ||
      (osmKey === 'shop' && osmVal === 'games') ||
      GAME_KEYWORD_REGEX.test(nameLower)
    ) {
      return 'juegos_comida';
    }
    if (osmVal === 'bar' || osmVal === 'pub' || osmVal === 'biergarten') return 'restobar';
    if (osmVal === 'restaurant' || osmVal === 'fast_food' || osmVal === 'cafe' || osmVal === 'food_court') {
      if (/\b(resto\s*bar|restobar|pub|cervecer[ií]a|brewery)\b/i.test(nameLower)) {
        return 'restobar';
      }
      return fallbackBucket === 'restobar' ? 'restobar' : 'restaurante';
    }
    return fallbackBucket;
  };

  if (collected.length < 10 && displayCity) {
    const photonSpecs: Array<{ q: string; osmTag?: string; bucket: StoreBucketType }> = [];

    if (trimmedQuery) {
      photonSpecs.push({
        q: trimmedQuery,
        bucket: bucketsToSearch[0] || 'restaurante',
      });
    }

    for (const bucket of bucketsToSearch) {
      if (bucket === 'restaurante') {
        photonSpecs.push(
          { q: 'restaurant', osmTag: 'amenity:restaurant', bucket },
          { q: 'pizza', bucket },
          { q: 'parrilla', bucket }
        );
      } else if (bucket === 'restobar') {
        photonSpecs.push(
          { q: 'bar', osmTag: 'amenity:bar', bucket },
          { q: 'cafe', osmTag: 'amenity:cafe', bucket },
          { q: 'burger', bucket }
        );
      } else if (bucket === 'juegos_comida') {
        photonSpecs.push(
          { q: 'bowling', osmTag: 'leisure:bowling_alley', bucket },
          { q: 'arcade', osmTag: 'leisure:amusement_arcade', bucket },
          { q: 'billar', bucket },
          { q: 'pool', osmTag: 'amenity:bar', bucket },
          { q: 'juegos', bucket }
        );
      } else if (bucket === 'carniceria') {
        photonSpecs.push(
          { q: 'carniceria', bucket },
          { q: 'butcher', osmTag: 'shop:butcher', bucket }
        );
      } else if (bucket === 'panaderia') {
        photonSpecs.push(
          { q: 'panaderia', bucket },
          { q: 'bakery', osmTag: 'shop:bakery', bucket }
        );
      } else if (bucket === 'supermercado') {
        photonSpecs.push(
          { q: 'super', osmTag: 'shop:supermarket', bucket },
          { q: 'market', osmTag: 'shop:supermarket', bucket }
        );
      } else if (bucket === 'heladeria') {
        photonSpecs.push(
          { q: 'helad', bucket },
          { q: 'ice', osmTag: 'amenity:ice_cream', bucket }
        );
      }
    }

    const bboxParam = geo.bbox ? `&bbox=${encodeURIComponent(geo.bbox)}` : '';
    const latLonBias = geo.center ? `&lat=${geo.center.lat}&lon=${geo.center.lng}` : '';
    const cityHead = displayCity.split(',')[0].trim();

    // Limit to 3-4 concise bounded Photon requests to avoid throttling
    const maxPhotonSpecs = storeType === 'juegos_comida' ? 4 : 3;
    const uniqueSpecs: typeof photonSpecs = [];
    const seenBuckets = new Set<string>();
    for (const s of photonSpecs) {
      if (uniqueSpecs.length >= maxPhotonSpecs) break;
      const key = `${s.bucket}|${s.q}|${s.osmTag || ''}`;
      if (!seenBuckets.has(key)) {
        seenBuckets.add(key);
        uniqueSpecs.push(s);
      }
    }

    await Promise.all(
      uniqueSpecs.map(async (spec) => {
        try {
          const queryTerm = geo.bbox ? spec.q : `${spec.q} ${cityHead}`;
          const tagParam = spec.osmTag ? `&osm_tag=${encodeURIComponent(spec.osmTag)}` : '';
          const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
            queryTerm
          )}${tagParam}${bboxParam}${latLonBias}&limit=8`;
          const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return;
          const data = (await res.json()) as { features?: PhotonFeature[] };
          for (const feat of data.features || []) {
            const p = feat.properties || {};
            const name = (p.name || '').trim();
            if (!name || !feat.geometry?.coordinates) continue;
            const bucket = classifyPhotonPoi(p, spec.bucket);
            if (!bucket) continue;
            if (!isBucketCompatible(bucket, name, p.osm_key || '', p.osm_value || '')) {
              continue;
            }

            const [pLng, pLat] = feat.geometry.coordinates;
            if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) continue;
            const distanceMeters = geo.center
              ? haversineMeters(geo.center.lat, geo.center.lng, pLat, pLng)
              : null;
            if (distanceMeters !== null && distanceMeters > 60000) continue;

            const key = `${p.osm_type || 'p'}-${p.osm_id || name}|${name.toLowerCase()}`;
            const altKey = `nom-${p.osm_id}|${name.toLowerCase()}`;
            if (seenKeys.has(key) || seenKeys.has(altKey)) continue;
            seenKeys.add(key);

            const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ');
            const areaLine = p.locality || p.district || p.city || '';
            collected.push({
              id: `ph-${p.osm_type || 'n'}-${p.osm_id || collected.length}`,
              name,
              storeType: bucket,
              storeTypeLabel: labels[bucket],
              address: [streetLine, areaLine].filter(Boolean).join(', ') || displayCity,
              lat: pLat,
              lng: pLng,
              distanceMeters,
              rating: null,
              userRatingCount: null,
              openNow: null,
              priceLevelLabel: null,
              priceRange: null,
              googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${displayCity}`)}`,
              osmUri:
                p.osm_type && p.osm_id
                  ? `https://www.openstreetmap.org/${
                      p.osm_type === 'W' ? 'way' : p.osm_type === 'R' ? 'relation' : 'node'
                    }/${p.osm_id}`
                  : null,
              websiteUri: null,
            });
          }
        } catch {
          // Ignore Photon error
        }
      })
    );
  }

  // Sort by user query match + explicit games priority + distance
  collected.sort((a, b) => {
    const scorePlace = (item: NearbyPlace) => {
      const hay = `${item.name} ${item.storeTypeLabel}`.toLowerCase();
      let score = 0;
      if (trimmedQuery) {
        const tokens = trimmedQuery
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length >= 3);
        for (const tok of tokens) {
          if (hay.includes(tok)) score += 3;
        }
      }
      if (storeType === 'juegos_comida' || isGamesQuery) {
        if (GAME_KEYWORD_REGEX.test(item.name)) score += 4;
        if (item.storeType === 'juegos_comida') score += 2;
      }
      return score;
    };
    const diff = scorePlace(b) - scorePlace(a);
    if (diff !== 0) return diff;
    if (a.distanceMeters !== null && b.distanceMeters !== null) {
      return a.distanceMeters - b.distanceMeters;
    }
    return a.name.localeCompare(b.name);
  });

  const finalPlaces = collected.slice(0, 18);

  return {
    city: displayCity,
    center: geo.center,
    places: finalPlaces,
    provider: finalPlaces.length > 0 ? 'osm' : 'fallback_links',
    fallbackMapsSearchUrl,
    fallbackOsmSearchUrl,
  };
}

export function buildClientOffersFallback(params: {
  city: string;
  mode: SearchMode;
  storeType: OfferStoreType;
  customQuery: string;
  places: NearbyPlace[];
  language: AppLanguage;
  fallbackMapsSearchUrl: string;
  fallbackOsmSearchUrl: string;
}): ClientOffersFallbackResult {
  const {
    city,
    mode,
    customQuery,
    places,
    language,
    fallbackMapsSearchUrl,
    fallbackOsmSearchUrl,
  } = params;

  const grouped = new Map<string, NearbyPlace[]>();
  for (const p of places) {
    const arr = grouped.get(p.storeTypeLabel) || [];
    arr.push(p);
    grouped.set(p.storeTypeLabel, arr);
  }

  const lines: string[] = [];
  const cityLabel = city || 'tu ciudad';
  const queryLabel = customQuery.trim();

  if (language === 'en') {
    lines.push(`## Local directory in ${cityLabel}`);
    if (queryLabel) {
      lines.push(`Filtered by **${queryLabel}**.`);
    }
    if (places.length > 0) {
      for (const [label, list] of grouped.entries()) {
        lines.push(`### ${label}`);
        for (const item of list.slice(0, 5)) {
          const dist =
            item.distanceMeters !== null
              ? item.distanceMeters < 1000
                ? ` · ${Math.round(item.distanceMeters)} m`
                : ` · ${(item.distanceMeters / 1000).toFixed(1)} km`
              : '';
          lines.push(`- **${item.name}**${item.address ? ` — ${item.address}` : ''}${dist}`);
        }
      }
    } else {
      lines.push(
        `No pre-indexed venues matched that filter in OpenStreetMap for **${cityLabel}**.`
      );
    }
    lines.push(`### Promotions & rates`);
    lines.push(
      mode === 'salidas'
        ? `- Tap **View on Maps** on any venue (or the Google Maps button below) to check current menus, happy hours, bank promos, and hourly pool/arcade rates, then split the cost in the calculator.`
        : `- Tap **View on Maps** on any store (or the Google Maps button below) to check active discounts and combos in ${cityLabel}, then calculate each person's share.`
    );
  } else if (language === 'fr') {
    lines.push(`## Répertoire local à ${cityLabel}`);
    if (queryLabel) {
      lines.push(`Filtre actif : **${queryLabel}**.`);
    }
    if (places.length > 0) {
      for (const [label, list] of grouped.entries()) {
        lines.push(`### ${label}`);
        for (const item of list.slice(0, 5)) {
          const dist =
            item.distanceMeters !== null
              ? item.distanceMeters < 1000
                ? ` · ${Math.round(item.distanceMeters)} m`
                : ` · ${(item.distanceMeters / 1000).toFixed(1)} km`
              : '';
          lines.push(`- **${item.name}**${item.address ? ` — ${item.address}` : ''}${dist}`);
        }
      }
    } else {
      lines.push(`Aucun lieu indexé avec ce filtre dans OpenStreetMap pour **${cityLabel}**.`);
    }
    lines.push(`### Promos et tarifs`);
    lines.push(
      `- Touchez **Voir sur Maps** sur un lieu pour consulter le menu, l’happy hour et les tarifs de billard/jeux, puis divisez la note dans la calculatrice.`
    );
  } else if (language === 'zh') {
    lines.push(`## ${cityLabel} 本地场所清单`);
    if (queryLabel) {
      lines.push(`当前关键词：**${queryLabel}**。`);
    }
    if (places.length > 0) {
      for (const [label, list] of grouped.entries()) {
        lines.push(`### ${label}`);
        for (const item of list.slice(0, 5)) {
          const dist =
            item.distanceMeters !== null
              ? item.distanceMeters < 1000
                ? ` · ${Math.round(item.distanceMeters)} m`
                : ` · ${(item.distanceMeters / 1000).toFixed(1)} km`
              : '';
          lines.push(`- **${item.name}**${item.address ? ` — ${item.address}` : ''}${dist}`);
        }
      }
    } else {
      lines.push(`OpenStreetMap 中暂未找到 **${cityLabel}** 符合该筛选的场所。`);
    }
    lines.push(`### 优惠与收费查询`);
    lines.push(
      `- 点击任意地点卡片的**在地图中查看**（或下方 Google 地图按钮），查看最新菜单、折扣与台球/电玩价格，并在计算器中分摊。`
    );
  } else if (language === 'ru') {
    lines.push(`## Заведения в городе ${cityLabel}`);
    if (queryLabel) {
      lines.push(`Поиск по запросу: **${queryLabel}**.`);
    }
    if (places.length > 0) {
      for (const [label, list] of grouped.entries()) {
        lines.push(`### ${label}`);
        for (const item of list.slice(0, 5)) {
          const dist =
            item.distanceMeters !== null
              ? item.distanceMeters < 1000
                ? ` · ${Math.round(item.distanceMeters)} м`
                : ` · ${(item.distanceMeters / 1000).toFixed(1)} км`
              : '';
          lines.push(`- **${item.name}**${item.address ? ` — ${item.address}` : ''}${dist}`);
        }
      }
    } else {
      lines.push(`В OpenStreetMap не найдено заведений по этому фильтру в **${cityLabel}**.`);
    }
    lines.push(`### Акции и тарифы`);
    lines.push(
      `- Нажмите **На карте** у любого места (или кнопку Google Карт ниже), чтобы посмотреть меню, скидки и цены на бильярд/игры, и разделите сумму в калькуляторе.`
    );
  } else {
    lines.push(`## Opciones detectadas en ${cityLabel}`);
    if (queryLabel) {
      lines.push(`Búsqueda aplicada: **${queryLabel}**.`);
    }
    if (places.length > 0) {
      for (const [label, list] of grouped.entries()) {
        lines.push(`### ${label}`);
        for (const item of list.slice(0, 5)) {
          const dist =
            item.distanceMeters !== null
              ? item.distanceMeters < 1000
                ? ` · ${Math.round(item.distanceMeters)} m`
                : ` · ${(item.distanceMeters / 1000).toFixed(1)} km`
              : '';
          lines.push(`- **${item.name}**${item.address ? ` — ${item.address}` : ''}${dist}`);
        }
      }
    } else {
      lines.push(
        `No aparecieron locales indexados con esos filtros exactos en OpenStreetMap para **${cityLabel}**.`
      );
    }
    lines.push(`### Cómo ver promociones y tarifas vigentes`);
    lines.push(
      mode === 'salidas'
        ? `- Tocá **Ver en Maps** en cualquier local listado (o el botón de Google Maps abajo) para ver cartas, happy hour, descuentos bancarios y precios de pool/juegos, y usá la calculadora para dividir por integrante.`
        : `- Tocá **Ver en Maps** en cualquier comercio listado (o el botón de Google Maps abajo) para revisar promos vigentes y descuentos en ${cityLabel}, y calculá el total por integrante.`
    );
  }

  return {
    city: displaySafeCity(cityLabel),
    markdown: lines.join('\n'),
    venueEnrichments: [],
    sources: [
      { title: `Google Maps · ${cityLabel}`, uri: fallbackMapsSearchUrl },
      { title: `OpenStreetMap · ${cityLabel}`, uri: fallbackOsmSearchUrl },
    ],
  };
}

function displaySafeCity(city: string): string {
  return city.trim() || 'Tu ciudad';
}
