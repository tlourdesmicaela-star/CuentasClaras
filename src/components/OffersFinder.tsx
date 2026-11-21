import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  AlertCircle,
  Calculator,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Gamepad2,
  Loader2,
  MapPin,
  Minus,
  Navigation,
  Plus,
  PlusCircle,
  Search,
  Sparkles,
  Star,
  Store,
  Tag,
  Users,
  Utensils,
} from 'lucide-react';
import type { ExpenseCategory, Participant } from '../types/expense';
import { formatCurrency } from '../utils/currency';
import { useLanguage } from '../contexts/LanguageContext';

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

interface NearbyPlace {
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
  websiteUri: string | null;
}

interface VenueEnrichment {
  name: string;
  foodOffers: string[];
  hasGames: boolean;
  gameOffers?: string[];
  gamePrices: string[];
  estimatedFoodPerPerson: number | null;
  estimatedGamePerSession: number | null;
  priceNote: string;
}

interface GroundingSource {
  title: string;
  uri: string;
}

interface VenueCalcState {
  foodMode: 'per_person' | 'table_total';
  foodAmountStr: string;
  gamesEnabled: boolean;
  gameQtyStr: string;
  gameUnitPriceStr: string;
  tipPercent: 0 | 10 | 15;
  groupSizeOverride: number | null;
}

interface OffersFinderProps {
  theme: 'light' | 'dark';
  participants: Participant[];
  onQuickAddExpense: (description: string, category: ExpenseCategory, amount?: number) => void;
}

const PIN_STYLE_BY_TYPE: Record<
  StoreBucketType,
  { bg: string; border: string; glyph: string }
> = {
  restaurante: { bg: '#f97316', border: '#c2410c', glyph: '#ffffff' },
  restobar: { bg: '#ec4899', border: '#9d174d', glyph: '#ffffff' },
  juegos_comida: { bg: '#0ea5e9', border: '#0369a1', glyph: '#ffffff' },
  carniceria: { bg: '#e11d48', border: '#9f1239', glyph: '#ffffff' },
  panaderia: { bg: '#d97706', border: '#92400e', glyph: '#ffffff' },
  supermercado: { bg: '#059669', border: '#065f46', glyph: '#ffffff' },
  heladeria: { bg: '#7c3aed', border: '#5b21b6', glyph: '#ffffff' },
};

function formatDistance(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatPlacesPriceRange(
  range: NearbyPlace['priceRange'],
  persShort: string
): string | null {
  if (!range) return null;
  const { startUnits, endUnits } = range;
  if (startUnits !== null && endUnits !== null) {
    return `${formatCurrency(startUnits)} – ${formatCurrency(endUnits)} / ${persShort}`;
  }
  if (startUnits !== null) {
    return `≥ ${formatCurrency(startUnits)} / ${persShort}`;
  }
  if (endUnits !== null) {
    return `≤ ${formatCurrency(endUnits)} / ${persShort}`;
  }
  return null;
}

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findVenueEnrichment(
  placeName: string,
  enrichments: VenueEnrichment[]
): VenueEnrichment | null {
  if (!enrichments.length) return null;
  const target = normalizeMatchText(placeName);
  if (!target) return null;

  const exact = enrichments.find((e) => normalizeMatchText(e.name) === target);
  if (exact) return exact;

  const substringMatch = enrichments.find((e) => {
    const candidate = normalizeMatchText(e.name);
    return (
      candidate.length >= 4 &&
      (target.includes(candidate) || candidate.includes(target))
    );
  });
  if (substringMatch) return substringMatch;

  const stopWords = new Set(['bar', 'restobar', 'club', 'pool', 'pub', 'cafe', 'de', 'la', 'el', 'the']);
  const targetTokens = target.split(' ').filter((w) => w.length >= 3 && !stopWords.has(w));
  if (!targetTokens.length) return null;

  return (
    enrichments.find((e) => {
      const candidateTokens = normalizeMatchText(e.name)
        .split(' ')
        .filter((w) => w.length >= 3 && !stopWords.has(w));
      return candidateTokens.some((tok) => targetTokens.includes(tok));
    }) || null
  );
}

function renderInlineBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-50">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function FormattedOffersMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);

  return (
    <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} className="h-1" />;

        if (line.startsWith('### ')) {
          return (
            <h4
              key={index}
              className="text-sm font-display font-bold text-slate-900 dark:text-violet-200 pt-2"
            >
              {renderInlineBold(line.slice(4))}
            </h4>
          );
        }

        if (line.startsWith('## ') || line.startsWith('# ')) {
          const text = line.replace(/^#{1,3}\s+/, '');
          return (
            <h3
              key={index}
              className="text-base font-display font-bold text-slate-900 dark:text-slate-50 pt-2.5 border-t border-slate-100 dark:border-slate-800 first:border-t-0 first:pt-0"
            >
              {renderInlineBold(text)}
            </h3>
          );
        }

        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={index} className="flex items-start gap-2 pl-1">
              <span
                aria-hidden="true"
                className="mt-2 w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-violet-400 shrink-0"
              />
              <p className="flex-1">{renderInlineBold(line.slice(2))}</p>
            </div>
          );
        }

        return <p key={index}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

function MapCameraSync({ center }: { center: { lat: number; lng: number } | null }) {
  const map = useMap();
  const prevRef = useRef<string>('');

  useEffect(() => {
    if (!map || !center) return;
    const key = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
    if (prevRef.current === key) return;
    prevRef.current = key;
    map.panTo(center);
  }, [map, center]);

  return null;
}

interface StoreMarkerProps {
  place: NearbyPlace;
  isSelected: boolean;
  onSelect: (place: NearbyPlace) => void;
  onClose: () => void;
}

function StoreMarker({ place, isSelected, onSelect, onClose }: StoreMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const { t } = useLanguage();

  if (place.lat === null || place.lng === null) return null;
  const palette = PIN_STYLE_BY_TYPE[place.storeType] || PIN_STYLE_BY_TYPE.restaurante;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: place.lat, lng: place.lng }}
        title={place.name}
        onClick={() => onSelect(place)}
      >
        <Pin
          background={palette.bg}
          borderColor={palette.border}
          glyphColor={palette.glyph}
          scale={isSelected ? 1.2 : 1.0}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={onClose}>
          <div className="text-slate-900 space-y-1.5 py-0.5">
            <p className="font-bold text-sm leading-snug">{place.name}</p>
            <p className="text-xs text-slate-600">{place.storeTypeLabel}</p>
            {place.address && <p className="text-xs text-slate-700">{place.address}</p>}
            <div className="flex items-center gap-2 text-xs text-slate-600">
              {place.openNow !== null && (
                <span className={place.openNow ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                  {place.openNow ? t.offers.openNowLabel : t.offers.closedLabel}
                </span>
              )}
              {place.distanceMeters !== null && (
                <span className="font-mono tabular-nums">· {formatDistance(place.distanceMeters)}</span>
              )}
            </div>
            {place.googleMapsUri && (
              <a
                href={place.googleMapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline pt-0.5"
              >
                <span>{t.offers.openInMaps}</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function buildDefaultCalcState(
  place: NearbyPlace,
  enrichment: VenueEnrichment | null
): VenueCalcState {
  let suggestedFood = '';
  if (enrichment?.estimatedFoodPerPerson && enrichment.estimatedFoodPerPerson > 0) {
    suggestedFood = String(enrichment.estimatedFoodPerPerson);
  } else if (place.priceRange?.startUnits || place.priceRange?.endUnits) {
    const start = place.priceRange.startUnits ?? place.priceRange.endUnits ?? 0;
    const end = place.priceRange.endUnits ?? place.priceRange.startUnits ?? 0;
    const mid = Math.round((start + end) / 2);
    if (mid > 0) suggestedFood = String(mid);
  }

  const hasGames =
    place.storeType === 'juegos_comida' ||
    Boolean(enrichment?.hasGames) ||
    Boolean(enrichment?.gamePrices.length) ||
    Boolean(enrichment?.gameOffers?.length);

  return {
    foodMode: 'per_person',
    foodAmountStr: suggestedFood,
    gamesEnabled: hasGames,
    gameQtyStr: '1',
    gameUnitPriceStr:
      enrichment?.estimatedGamePerSession && enrichment.estimatedGamePerSession > 0
        ? String(enrichment.estimatedGamePerSession)
        : '',
    tipPercent: 0,
    groupSizeOverride: null,
  };
}

export function OffersFinder({
  theme,
  participants,
  onQuickAddExpense,
}: OffersFinderProps) {
  const { language, mapsLanguage, t } = useLanguage();
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );

  // Search Mode & Filters
  const [searchMode, setSearchMode] = useState<SearchMode>('salidas');
  const [manualCity, setManualCity] = useState('');
  const [productCategory, setProductCategory] = useState<OfferProductCategory>('all');
  const [storeType, setStoreType] = useState<OfferStoreType>('all');
  const [customQuery, setCustomQuery] = useState('');
  const [openNowOnly, setOpenNowOnly] = useState(false);

  // Search Results
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolvedCity, setResolvedCity] = useState<string>('');
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [offersMarkdown, setOffersMarkdown] = useState<string>('');
  const [venueEnrichments, setVenueEnrichments] = useState<VenueEnrichment[]>([]);
  const [offerSources, setOfferSources] = useState<GroundingSource[]>([]);
  const [offersUnavailable, setOffersUnavailable] = useState(false);

  // Per-venue calculator state & expanded cards (Record instead of Map to avoid GoogleMap shadowing)
  const [calcByPlace, setCalcByPlace] = useState<Record<string, VenueCalcState>>({});
  const [expandedCalcIds, setExpandedCalcIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    fetch('/api/maps-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { apiKey?: string } | null) => {
        if (active && data?.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      })
      .catch(() => {
        // Keep Vite env fallback if present
      });
    return () => {
      active = false;
    };
  }, []);

  const handleChangeMode = (nextMode: SearchMode) => {
    setSearchMode(nextMode);
    setStoreType('all');
    if (nextMode === 'salidas') {
      setProductCategory('all');
    }
  };

  const runSearch = useCallback(async () => {
    const trimmedCity = manualCity.trim();

    if (!trimmedCity) {
      setSearchError(t.offers.missingLocationErr);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setOffersUnavailable(false);

    let detectedCity = trimmedCity;
    let fetchedPlaces: NearbyPlace[] = [];

    try {
      const storesRes = await fetch('/api/nearby-stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityQuery: trimmedCity,
          mode: searchMode,
          storeType,
          productCategory: searchMode === 'compras' ? productCategory : 'all',
          openNowOnly,
          customQuery,
          language,
        }),
      });

      const storesData = (await storesRes.json()) as {
        city?: string;
        center?: { lat: number; lng: number } | null;
        places?: NearbyPlace[];
        error?: string;
        quotaExceeded?: boolean;
      };

      if (storesRes.status === 429 || storesData.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }

      if (!storesRes.ok) {
        setSearchError(storesData.error || t.offers.nearbyError);
        setPlaces([]);
      } else {
        fetchedPlaces = storesData.places || [];
        setPlaces(fetchedPlaces);
        const firstId = fetchedPlaces[0]?.id || null;
        setSelectedPlaceId(firstId);
        if (firstId) {
          setExpandedCalcIds({ [firstId]: true });
        }
        if (storesData.center) {
          setMapCenter(storesData.center);
        }
        if (storesData.city) {
          detectedCity = storesData.city;
          setResolvedCity(storesData.city);
        }
      }
    } catch {
      setSearchError(t.offers.nearbyNetError);
    }

    // Grounded web search for food offers + game prices (pool, bowling, arcade)
    try {
      const offersRes = await fetch('/api/search-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: detectedCity || trimmedCity,
          mode: searchMode,
          productCategory: searchMode === 'compras' ? productCategory : 'all',
          storeType,
          customQuery,
          language,
          venues: fetchedPlaces.slice(0, 10).map((p) => ({
            id: p.id,
            name: p.name,
            storeType: p.storeTypeLabel,
            address: p.address,
          })),
        }),
      });

      const rawOffersText = await offersRes.text();
      let offersData: {
        city?: string;
        markdown?: string;
        venueEnrichments?: VenueEnrichment[];
        sources?: GroundingSource[];
        error?: string;
      } | null = null;
      if (rawOffersText) {
        try {
          offersData = JSON.parse(rawOffersText) as {
            city?: string;
            markdown?: string;
            venueEnrichments?: VenueEnrichment[];
            sources?: GroundingSource[];
            error?: string;
          };
        } catch {
          offersData = null;
        }
      }

      if (!offersRes.ok || !offersData || !offersData.markdown) {
        setOffersUnavailable(true);
        setOffersMarkdown('');
        setVenueEnrichments([]);
        setOfferSources([]);
      } else {
        if (offersData.city && !resolvedCity) {
          setResolvedCity(offersData.city);
        }
        setOffersUnavailable(false);
        setOffersMarkdown(offersData.markdown || '');
        setVenueEnrichments(offersData.venueEnrichments || []);
        setOfferSources(offersData.sources || []);
      }
    } catch {
      setOffersUnavailable(true);
      setOffersMarkdown('');
      setVenueEnrichments([]);
      setOfferSources([]);
    } finally {
      setIsSearching(false);
    }
  }, [
    manualCity,
    searchMode,
    storeType,
    productCategory,
    openNowOnly,
    customQuery,
    resolvedCity,
    language,
    t.offers,
  ]);

  const effectiveMapCenter = useMemo(() => {
    if (mapCenter) return mapCenter;
    const firstWithCoords = places.find((p) => p.lat !== null && p.lng !== null);
    if (firstWithCoords && firstWithCoords.lat !== null && firstWithCoords.lng !== null) {
      return { lat: firstWithCoords.lat, lng: firstWithCoords.lng };
    }
    return null;
  }, [mapCenter, places]);

  const getCalcForPlace = (place: NearbyPlace, enrichment: VenueEnrichment | null): VenueCalcState => {
    return calcByPlace[place.id] || buildDefaultCalcState(place, enrichment);
  };

  const updateCalcForPlace = (
    place: NearbyPlace,
    enrichment: VenueEnrichment | null,
    patch: Partial<VenueCalcState>
  ) => {
    setCalcByPlace((prev) => {
      const base = prev[place.id] || buildDefaultCalcState(place, enrichment);
      return {
        ...prev,
        [place.id]: { ...base, ...patch },
      };
    });
  };

  const mapQuickAddCategory = (place: NearbyPlace): ExpenseCategory => {
    if (place.storeType === 'supermercado' && productCategory === 'refrescos') {
      return 'bebida';
    }
    return 'comida';
  };

  const productFilters = useMemo<{ id: OfferProductCategory; label: string }[]>(
    () => [
      { id: 'all', label: t.offers.prodAll },
      { id: 'carnes', label: t.offers.prodMeat },
      { id: 'refrescos', label: t.offers.prodDrinks },
      { id: 'helados', label: t.offers.prodIceCream },
      { id: 'panificados', label: t.offers.prodBakery },
    ],
    [t.offers]
  );

  const salidasStoreFilters = useMemo<{ id: OfferStoreType; label: string }[]>(
    () => [
      { id: 'all', label: t.offers.salidasAll },
      { id: 'restaurante', label: t.offers.salidasRestaurant },
      { id: 'restobar', label: t.offers.salidasRestobar },
      { id: 'juegos_comida', label: t.offers.salidasGames },
    ],
    [t.offers]
  );

  const comprasStoreFilters = useMemo<{ id: OfferStoreType; label: string }[]>(
    () => [
      { id: 'all', label: t.offers.comprasAll },
      { id: 'carniceria', label: t.offers.comprasButcher },
      { id: 'panaderia', label: t.offers.comprasBakery },
      { id: 'supermercado', label: t.offers.comprasMarket },
      { id: 'heladeria', label: t.offers.comprasIceCream },
    ],
    [t.offers]
  );

  const activeGroupCount = participants.length > 0 ? participants.length : 4;
  const activeStoreFilters =
    searchMode === 'salidas' ? salidasStoreFilters : comprasStoreFilters;

  return (
    <div className="space-y-5">
      {/* GPS Consent & Search Header Card */}
      <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-600 dark:text-violet-400 shrink-0" aria-hidden="true" />
              <span>{t.offers.title}</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              {t.offers.subtitle}
            </p>
          </div>

          {resolvedCity && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-violet-500/35 bg-emerald-50/70 dark:bg-violet-500/10 text-xs font-semibold text-emerald-800 dark:text-violet-200 shrink-0 self-start">
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{resolvedCity}</span>
            </div>
          )}
        </div>

        {/* Mode Switcher: Salidas (Resto/Bar/Juegos) vs Compras */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950/80 border border-transparent dark:border-slate-800">
          <button
            type="button"
            onClick={() => handleChangeMode('salidas')}
            className={`inline-flex items-center justify-center gap-2 min-h-[42px] px-3 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              searchMode === 'salidas'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-violet-200 shadow-xs dark:shadow-[0_0_14px_-4px_rgba(139,92,246,0.45)] font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Utensils className="w-4 h-4 text-emerald-600 dark:text-violet-400 shrink-0" aria-hidden="true" />
            <span>{t.offers.modeSalidas}</span>
          </button>

          <button
            type="button"
            onClick={() => handleChangeMode('compras')}
            className={`inline-flex items-center justify-center gap-2 min-h-[42px] px-3 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              searchMode === 'compras'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-violet-200 shadow-xs dark:shadow-[0_0_14px_-4px_rgba(139,92,246,0.45)] font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Store className="w-4 h-4 text-emerald-600 dark:text-violet-400 shrink-0" aria-hidden="true" />
            <span>{t.offers.modeCompras}</span>
          </button>
        </div>

        {/* City Input + Filters */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5">
              <label
                htmlFor="offers-city-input"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
              >
                {t.offers.cityLabel}
              </label>
              <input
                id="offers-city-input"
                type="text"
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
                placeholder={resolvedCity || t.offers.cityPlaceholder}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none transition-colors"
              />
            </div>

            <div className="sm:col-span-7">
              <label
                htmlFor="offers-query-input"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
              >
                {searchMode === 'salidas'
                  ? t.offers.querySalidasLabel
                  : t.offers.queryComprasLabel}
              </label>
              <input
                id="offers-query-input"
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
                placeholder={
                  searchMode === 'salidas'
                    ? t.offers.querySalidasPlaceholder
                    : t.offers.queryComprasPlaceholder
                }
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {searchMode === 'salidas' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
                {t.offers.quickGameChipsLabel}
              </span>
              {[
                { label: t.offers.chipPool, query: 'pool billar', type: 'juegos_comida' as OfferStoreType },
                { label: t.offers.chipArcade, query: 'arcade juegos fichas', type: 'juegos_comida' as OfferStoreType },
                { label: t.offers.chipBowling, query: 'bowling', type: 'juegos_comida' as OfferStoreType },
                { label: t.offers.chipGameCombo, query: 'promo juegos comida happy hour', type: 'juegos_comida' as OfferStoreType },
              ].map((chip) => {
                const isSelectedChip = customQuery.trim().toLowerCase() === chip.query;
                return (
                  <button
                    key={chip.query}
                    type="button"
                    onClick={() => {
                      if (isSelectedChip) {
                        setCustomQuery('');
                      } else {
                        setCustomQuery(chip.query);
                        setStoreType(chip.type);
                      }
                    }}
                    className={`min-h-[32px] px-2.5 py-1 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                      isSelectedChip
                        ? 'bg-sky-600 dark:bg-violet-600 text-white border-sky-600 dark:border-violet-500'
                        : 'bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-violet-400'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}

          {searchMode === 'compras' && (
            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {t.offers.whatLookingFor}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {productFilters.map((item) => {
                  const active = productCategory === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setProductCategory(item.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 dark:bg-violet-600 text-white border-slate-900 dark:border-violet-500'
                          : 'bg-white dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Venue/Store Type Chips + Open Now + Search CTA */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pt-1">
            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {searchMode === 'salidas'
                  ? t.offers.venueTypeSalidasLabel
                  : t.offers.venueTypeComprasLabel}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activeStoreFilters.map((item) => {
                  const active = storeType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setStoreType(item.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-emerald-600 dark:bg-violet-500/20 text-white dark:text-violet-200 border-emerald-600 dark:border-violet-400'
                          : 'bg-white dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none min-h-[40px]">
                <input
                  type="checkbox"
                  checked={openNowOnly}
                  onChange={(e) => setOpenNowOnly(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-600 dark:accent-violet-500"
                />
                <span>{t.offers.openNowOnly}</span>
              </label>

              <button
                type="button"
                onClick={() => void runSearch()}
                disabled={isSearching}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-violet-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-violet-500 dark:shadow-[0_0_22px_-6px_rgba(139,92,246,0.55)] disabled:opacity-50 cursor-pointer transition-all"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="w-4 h-4" aria-hidden="true" />
                )}
                <span>
                  {isSearching
                    ? t.offers.searchingBtn
                    : searchMode === 'salidas'
                      ? t.offers.searchSalidasBtn
                      : t.offers.searchComprasBtn}
                </span>
              </button>
            </div>
          </div>
        </div>

        {searchError && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{searchError}</span>
          </div>
        )}
      </section>

      {/* Main Results Grid: Map + Listed Venue Options (left) and City Offers Summary (right) */}
      {(places.length > 0 || offersMarkdown || isSearching) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive Map & Enlisted Options with Calculators */}
          <div className="lg:col-span-7 space-y-4">
            {mapsApiKey && effectiveMapCenter && (
              <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-display font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-emerald-600 dark:text-violet-400" aria-hidden="true" />
                    <span>{t.offers.mapIn} {resolvedCity || manualCity || t.offers.yourArea}</span>
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    {places.length} {places.length === 1 ? t.offers.optionSingular : t.offers.optionPlural}
                  </span>
                </div>

                <div className="h-[320px] sm:h-[360px] w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                  <APIProvider apiKey={mapsApiKey} libraries={['marker']} language={mapsLanguage}>
                    <GoogleMap
                      mapId="DEMO_MAP_ID"
                      defaultCenter={effectiveMapCenter}
                      defaultZoom={14}
                      gestureHandling="greedy"
                      colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                      className="w-full h-full"
                    >
                      <MapCameraSync center={effectiveMapCenter} />

                      {places.map((place) => (
                        <StoreMarker
                          key={place.id}
                          place={place}
                          isSelected={selectedPlaceId === place.id}
                          onSelect={(p) => {
                            setSelectedPlaceId(p.id);
                            setExpandedCalcIds((prev) => ({ ...prev, [p.id]: true }));
                          }}
                          onClose={() => setSelectedPlaceId(null)}
                        />
                      ))}
                    </GoogleMap>
                  </APIProvider>
                </div>

                {/* Color Legend */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 px-0.5">
                  {searchMode === 'salidas' ? (
                    <>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" /> {t.offers.legendRestaurant}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ec4899]" /> {t.offers.legendRestobar}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0ea5e9]" /> {t.offers.legendGames}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#e11d48]" /> {t.offers.legendButcher}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]" /> {t.offers.legendBakery}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#059669]" /> {t.offers.legendMarket}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed]" /> {t.offers.legendIceCream}
                      </span>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* Enlisted Options List with Food Offers, Game Prices & Per-Member Calculator */}
            <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-display font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  {searchMode === 'salidas' ? (
                    <Utensils className="w-4 h-4 text-emerald-600 dark:text-violet-400" aria-hidden="true" />
                  ) : (
                    <Store className="w-4 h-4 text-emerald-600 dark:text-violet-400" aria-hidden="true" />
                  )}
                  <span>
                    {t.offers.enlistedTitle} {resolvedCity || manualCity || t.offers.yourCity}
                  </span>
                </h3>
                <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.offers.activeGroupLabel} {activeGroupCount} {t.offers.membersLabel}</span>
                </span>
              </div>

              {places.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                  {isSearching
                    ? t.offers.loadingPlaces
                    : t.offers.noPlacesFound}
                </p>
              ) : (
                <div className="space-y-3.5">
                  {places.map((place, index) => {
                    const isSelected = selectedPlaceId === place.id;
                    const enrichment = findVenueEnrichment(place.name, venueEnrichments);
                    const calc = getCalcForPlace(place, enrichment);
                    const isExpanded = Boolean(expandedCalcIds[place.id]);
                    const placesRangeText = formatPlacesPriceRange(place.priceRange, t.offers.persShort);

                    const groupSize = Math.max(1, calc.groupSizeOverride ?? activeGroupCount);
                    const foodUnit = Math.max(0, Math.round(Number(calc.foodAmountStr) || 0));
                    const foodSubtotal =
                      calc.foodMode === 'per_person' ? foodUnit * groupSize : foodUnit;
                    const gameQty = Math.max(0, Number(calc.gameQtyStr) || 0);
                    const gameUnit = Math.max(0, Math.round(Number(calc.gameUnitPriceStr) || 0));
                    const gameSubtotal = calc.gamesEnabled ? Math.round(gameQty * gameUnit) : 0;
                    const baseTotal = foodSubtotal + gameSubtotal;
                    const tipAmount = Math.round((baseTotal * calc.tipPercent) / 100);
                    const grandTotal = baseTotal + tipAmount;
                    const perPersonTotal =
                      groupSize > 0 ? Math.round(grandTotal / groupSize) : 0;

                    const showGamesSection =
                      place.storeType === 'juegos_comida' ||
                      place.storeType === 'restobar' ||
                      Boolean(enrichment?.hasGames) ||
                      (enrichment?.gamePrices.length ?? 0) > 0 ||
                      (enrichment?.gameOffers?.length ?? 0) > 0;

                    return (
                      <article
                        key={place.id}
                        className={`rounded-xl border p-4 transition-colors space-y-3 ${
                          isSelected
                            ? 'border-emerald-500 dark:border-violet-400 bg-emerald-50/35 dark:bg-violet-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60'
                        }`}
                      >
                        {/* Venue Title, Type, Rating, Distance */}
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPlaceId(place.id);
                                  if (place.lat !== null && place.lng !== null) {
                                    setMapCenter({ lat: place.lat, lng: place.lng });
                                  }
                                }}
                                className="text-left font-display font-bold text-sm sm:text-base text-slate-900 dark:text-slate-50 hover:text-emerald-700 dark:hover:text-violet-300 transition-colors cursor-pointer"
                              >
                                <span className="font-mono text-xs text-slate-400 dark:text-slate-500 mr-1.5">
                                  #{index + 1}
                                </span>
                                {place.name}
                              </button>
                            </div>
                            {place.distanceMeters !== null && (
                              <span className="font-mono tabular-nums text-xs font-semibold text-emerald-700 dark:text-violet-300 shrink-0">
                                {formatDistance(place.distanceMeters)}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {place.storeTypeLabel}
                            </span>
                            {place.rating !== null && (
                              <span className="inline-flex items-center gap-0.5 font-mono tabular-nums">
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500" aria-hidden="true" />
                                {place.rating.toFixed(1)}
                                {place.userRatingCount ? ` (${place.userRatingCount})` : ''}
                              </span>
                            )}
                            {place.openNow !== null && (
                              <span
                                className={
                                  place.openNow
                                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                    : 'text-rose-600 dark:text-rose-400 font-semibold'
                                }
                              >
                                · {place.openNow ? t.offers.openLabel : t.offers.closedLabel}
                              </span>
                            )}
                            {(placesRangeText || place.priceLevelLabel) && (
                              <span className="font-mono tabular-nums text-slate-600 dark:text-violet-300">
                                · {placesRangeText || place.priceLevelLabel}
                              </span>
                            )}
                          </div>

                          {place.address && (
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              {place.address}
                            </p>
                          )}
                        </div>

                        {/* Food Offers & Games Pricing Box */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {/* Food offers */}
                          <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-2.5 space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-violet-300 flex items-center gap-1.5">
                              <Utensils className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>{t.offers.foodOffersTitle}</span>
                            </p>
                            {enrichment && enrichment.foodOffers.length > 0 ? (
                              <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                                {enrichment.foodOffers.map((offer, i) => (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-600 dark:bg-violet-400 shrink-0" />
                                    <span>{offer}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {isSearching
                                  ? t.offers.searchingVenuePromos
                                  : placesRangeText
                                    ? `${t.offers.placesRefPrefix} ${placesRangeText}. ${t.offers.placesRefSuffix}`
                                    : t.offers.noOnlineFoodOffers}
                              </p>
                            )}
                          </div>

                          {/* Games & Pricing (Pool / Bowling / Arcade) */}
                          {showGamesSection && (
                            <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 p-2.5 space-y-1.5">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                                <Gamepad2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span>{t.offers.gamesTitle}</span>
                              </p>
                              {enrichment &&
                              ((enrichment.gameOffers?.length ?? 0) > 0 || enrichment.gamePrices.length > 0) ? (
                                <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                                  {(enrichment.gameOffers?.length ?? 0) > 0 && (
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-violet-300">
                                        {t.offers.gameOffersLabel}
                                      </p>
                                      <ul className="space-y-1">
                                        {enrichment.gameOffers!.map((offer, i) => (
                                          <li key={i} className="flex items-start gap-1.5">
                                            <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-600 dark:bg-violet-400 shrink-0" />
                                            <span>{offer}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {enrichment.gamePrices.length > 0 && (
                                    <div className="space-y-1">
                                      {(enrichment.gameOffers?.length ?? 0) > 0 && (
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                                          {t.offers.gameRatesLabel}
                                        </p>
                                      )}
                                      <ul className="space-y-1">
                                        {enrichment.gamePrices.map((gp, i) => (
                                          <li key={i} className="flex items-start gap-1.5">
                                            <span className="mt-1.5 w-1 h-1 rounded-full bg-sky-500 shrink-0" />
                                            <span>{gp}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {isSearching
                                    ? t.offers.searchingVenuePromos
                                    : customQuery.trim()
                                      ? `${t.offers.gamesSearchNoOnlinePricePrefix} "${customQuery.trim()}". ${t.offers.gamesNoOnlinePrice}`
                                      : place.storeType === 'juegos_comida'
                                        ? t.offers.gamesNoOnlinePrice
                                        : t.offers.gamesOptionalHint}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {enrichment?.priceNote && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                            {enrichment.priceNote}
                          </p>
                        )}

                        {/* Group Per-Member Price Calculator (Expandable on Every Venue) */}
                        <div className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-white dark:bg-slate-900/90 overflow-hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCalcIds((prev) => ({
                                ...prev,
                                [place.id]: !isExpanded,
                              }))
                            }
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Calculator
                                className="w-4 h-4 text-emerald-600 dark:text-violet-400 shrink-0"
                                aria-hidden="true"
                              />
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {t.offers.calcToggle} ({groupSize} {t.offers.persShort})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {grandTotal > 0 && (
                                <span className="font-mono tabular-nums text-xs font-bold text-emerald-700 dark:text-violet-300">
                                  {formatCurrency(perPersonTotal)} {t.offers.eachShort}
                                </span>
                              )}
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
                              )}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                              {/* Group size controls */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                                  {t.offers.groupMembersLabel}
                                </span>
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCalcForPlace(place, enrichment, {
                                        groupSizeOverride: Math.max(1, groupSize - 1),
                                      })
                                    }
                                    aria-label={t.offers.removeMemberAria}
                                    className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-emerald-500 dark:hover:border-violet-400 cursor-pointer"
                                  >
                                    <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                  <span className="font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-slate-100 min-w-[2ch] text-center">
                                    {groupSize}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCalcForPlace(place, enrichment, {
                                        groupSizeOverride: groupSize + 1,
                                      })
                                    }
                                    aria-label={t.offers.addMemberAria}
                                    className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-emerald-500 dark:hover:border-violet-400 cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                </div>
                              </div>

                              {/* Food input */}
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                                <div className="sm:col-span-6">
                                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                    {t.offers.foodCostLabel}
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min="0"
                                      value={calc.foodAmountStr}
                                      onChange={(e) =>
                                        updateCalcForPlace(place, enrichment, {
                                          foodAmountStr: e.target.value,
                                        })
                                      }
                                      placeholder={t.offers.foodCostPlaceholder}
                                      className="w-full min-h-[38px] pl-7 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none"
                                    />
                                  </div>
                                </div>

                                <div className="sm:col-span-6 grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCalcForPlace(place, enrichment, {
                                        foodMode: 'per_person',
                                      })
                                    }
                                    className={`min-h-[34px] px-2 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                                      calc.foodMode === 'per_person'
                                        ? 'bg-white dark:bg-violet-600 text-slate-900 dark:text-white'
                                        : 'text-slate-600 dark:text-slate-400'
                                    }`}
                                  >
                                    {t.offers.perPersonBtn}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateCalcForPlace(place, enrichment, {
                                        foodMode: 'table_total',
                                      })
                                    }
                                    className={`min-h-[34px] px-2 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                                      calc.foodMode === 'table_total'
                                        ? 'bg-white dark:bg-violet-600 text-slate-900 dark:text-white'
                                        : 'text-slate-600 dark:text-slate-400'
                                    }`}
                                  >
                                    {t.offers.tableTotalBtn}
                                  </button>
                                </div>
                              </div>

                              {/* Optional Games (Pool, Fichas, Bowling) Toggle & Inputs */}
                              <div className="space-y-2">
                                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={calc.gamesEnabled}
                                    onChange={(e) =>
                                      updateCalcForPlace(place, enrichment, {
                                        gamesEnabled: e.target.checked,
                                      })
                                    }
                                    className="w-3.5 h-3.5 rounded accent-sky-600 dark:accent-violet-500"
                                  />
                                  <span>{t.offers.includeGamesLabel}</span>
                                </label>

                                {calc.gamesEnabled && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                        {t.offers.gameQtyLabel}
                                      </label>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.5"
                                        value={calc.gameQtyStr}
                                        onChange={(e) =>
                                          updateCalcForPlace(place, enrichment, {
                                            gameQtyStr: e.target.value,
                                          })
                                        }
                                        className="w-full min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                                        {t.offers.gameUnitLabel}
                                      </label>
                                      <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
                                          $
                                        </span>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min="0"
                                          value={calc.gameUnitPriceStr}
                                          onChange={(e) =>
                                            updateCalcForPlace(place, enrichment, {
                                              gameUnitPriceStr: e.target.value,
                                            })
                                          }
                                          placeholder={t.offers.gameUnitPlaceholder}
                                          className="w-full min-h-[38px] pl-7 pr-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Tip Selector */}
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                  {t.offers.tipLabel}
                                </span>
                                <div className="flex items-center gap-1">
                                  {([0, 10, 15] as const).map((pct) => (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() =>
                                        updateCalcForPlace(place, enrichment, { tipPercent: pct })
                                      }
                                      className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-mono font-semibold border cursor-pointer transition-colors ${
                                        calc.tipPercent === pct
                                          ? 'bg-slate-900 dark:bg-violet-600 text-white border-slate-900 dark:border-violet-500'
                                          : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                                      }`}
                                    >
                                      {pct}%
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Summary Box: Total + Per Member Split */}
                              <div className="rounded-lg bg-emerald-50/80 dark:bg-violet-950/35 border border-emerald-200 dark:border-violet-500/35 p-2.5 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                      {t.offers.estimatedTotal}
                                    </p>
                                    <p className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-slate-50">
                                      {formatCurrency(grandTotal)}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[11px] text-emerald-700 dark:text-violet-300 font-medium">
                                      {t.offers.eachMemberPays} ({groupSize})
                                    </p>
                                    <p className="font-mono tabular-nums text-base font-bold text-emerald-700 dark:text-violet-200">
                                      {formatCurrency(perPersonTotal)}
                                    </p>
                                  </div>
                                </div>

                                {grandTotal > 0 &&
                                  participants.length > 0 &&
                                  groupSize === participants.length && (
                                    <div className="pt-1.5 border-t border-emerald-200/70 dark:border-violet-500/20 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                                      {participants.map((p) => (
                                        <span key={p.id} className="font-mono tabular-nums">
                                          <strong className="font-sans font-semibold">
                                            {p.name}:
                                          </strong>{' '}
                                          {formatCurrency(perPersonTotal)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Footer Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-3">
                            {place.googleMapsUri && (
                              <a
                                href={place.googleMapsUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-violet-300 hover:underline"
                              >
                                <span>{t.offers.viewOnMaps}</span>
                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              </a>
                            )}
                            {place.websiteUri && (
                              <a
                                href={place.websiteUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:underline"
                              >
                                <span>{t.offers.webLink}</span>
                              </a>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              onQuickAddExpense(
                                calc.gamesEnabled && gameSubtotal > 0
                                  ? `${t.offers.expenseDescGamesPrefix} ${place.name} (${groupSize} ${t.offers.persShort})`
                                  : `${t.offers.expenseDescGatheringPrefix} ${place.name} (${groupSize} ${t.offers.persShort})`,
                                mapQuickAddCategory(place),
                                grandTotal > 0 ? grandTotal : undefined
                              )
                            }
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-violet-600 hover:bg-slate-800 dark:hover:bg-violet-500 py-1.5 px-3 rounded-lg cursor-pointer transition-colors"
                          >
                            <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {t.offers.loadExpenseBtn} {grandTotal > 0 ? `(${formatCurrency(grandTotal)})` : ''}
                            </span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Grounded City Offers & Game Rates Column */}
          <div className="lg:col-span-5 space-y-4">
            <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-display font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-violet-400 shrink-0" aria-hidden="true" />
                  <span>
                    {searchMode === 'salidas'
                      ? `${t.offers.cityOffersSalidasTitle} ${resolvedCity || manualCity || t.offers.yourCity}`
                      : `${t.offers.cityOffersComprasTitle} ${resolvedCity || manualCity || t.offers.yourCity}`}
                  </span>
                </h3>
              </div>

              {offersUnavailable ? (
                <div className="rounded-xl border border-slate-200 dark:border-violet-500/25 bg-slate-50 dark:bg-slate-950/60 p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <MapPin
                      className="w-4 h-4 text-emerald-600 dark:text-violet-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {t.offers.mapsPromoTipTitle}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {t.offers.mapsPromoTipBody}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${customQuery.trim() || (searchMode === 'salidas' ? 'promociones restaurantes restobares pool' : 'ofertas carnicerias supermercados')} ${resolvedCity || manualCity.trim() || 'Argentina'}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-violet-500/35 bg-white dark:bg-slate-900 text-xs font-semibold text-emerald-700 dark:text-violet-300 hover:border-emerald-400 dark:hover:border-violet-400 transition-colors"
                  >
                    <span>{t.offers.searchPromosInMapsBtn}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </div>
              ) : isSearching && !offersMarkdown ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600 dark:text-violet-400" />
                  <span>{t.offers.searchingWebOffers}</span>
                </div>
              ) : offersMarkdown ? (
                <FormattedOffersMarkdown markdown={offersMarkdown} />
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.offers.clickToSearchOffers}
                </p>
              )}

              {offerSources.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {t.offers.verifiedSources}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {offerSources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs text-emerald-700 dark:text-violet-300 hover:border-emerald-400 dark:hover:border-violet-400/60 transition-colors"
                      >
                        <span className="truncate">{src.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80 leading-relaxed">
                {t.offers.mapsAttribution1}{' '}
                <a
                  href="https://maps.google.com/help/terms_maps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {t.offers.mapsTermsLink}
                </a>{' '}
                {t.offers.mapsAttribution2}{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {t.offers.privacyLink}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
