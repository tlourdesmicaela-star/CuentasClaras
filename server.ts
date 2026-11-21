import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const SAMPLE_RECEIPT_PATHS: Record<string, string> = {
  asado: 'src/assets/images/sample_receipt_asado_1795185295798.jpg',
  pizzeria: 'src/assets/images/sample_receipt_pizzeria_1795185293520.jpg',
};

type LangCode = 'es' | 'en' | 'fr' | 'zh' | 'ru';

function resolveLanguage(input?: unknown): LangCode {
  if (input === 'en' || input === 'fr' || input === 'zh' || input === 'ru') {
    return input;
  }
  return 'es';
}

const MAPS_LANG_BY_CODE: Record<LangCode, string> = {
  es: 'es',
  en: 'en',
  fr: 'fr',
  zh: 'zh-CN',
  ru: 'ru',
};

const PROMPT_LANG_LABEL: Record<LangCode, string> = {
  es: 'español (natural y claro)',
  en: 'English',
  fr: 'French (français)',
  zh: 'Simplified Chinese (简体中文)',
  ru: 'Russian (русский язык)',
};

const SERVER_ERRORS: Record<
  LangCode,
  {
    geminiMissingParse: string;
    missingExpenseText: string;
    geminiMissingOcr: string;
    sampleNotFound: string;
    missingImage: string;
    mapsKeyMissing: string;
    missingLocation: string;
    mapsQuotaExceeded: string;
    nearbyFallbackError: string;
    geminiMissingOffers: string;
    geminiInvalidKey: string;
    geminiBusy: string;
    geminiGeneric: string;
    defaultArea: string;
    defaultStoreName: string;
  }
> = {
  es: {
    geminiMissingParse:
      'No se encontró GEMINI_API_KEY configurada en el servidor. Configurala en Settings > Secrets o usá el motor local JS.',
    missingExpenseText: 'Ingresá una descripción de gasto para analizar.',
    geminiMissingOcr:
      'No se encontró GEMINI_API_KEY configurada en el servidor para ejecutar OCR con Gemini Vision.',
    sampleNotFound: 'No se encontró la imagen del ticket de ejemplo.',
    missingImage: 'Falta la imagen del ticket o QR para escanear.',
    mapsKeyMissing: 'Falta configurar GOOGLE_MAPS_API_KEY en el servidor.',
    missingLocation: 'Ingresá tu ciudad para buscar lugares y ofertas.',
    mapsQuotaExceeded: 'Se alcanzó el límite de consultas de Google Maps Platform.',
    nearbyFallbackError: 'No se pudieron consultar comercios cercanos en este momento.',
    geminiMissingOffers:
      'No se encontró GEMINI_API_KEY configurada en el servidor para buscar ofertas en la web.',
    geminiInvalidKey:
      'La clave de API de Gemini no es válida o no tiene permisos. Verificá Settings > Secrets.',
    geminiBusy:
      'El servicio de IA está con alta demanda temporal. Intentá nuevamente en unos segundos.',
    geminiGeneric: 'Error al procesar con el servicio de IA.',
    defaultArea: 'Tu zona actual',
    defaultStoreName: 'Comercio local',
  },
  en: {
    geminiMissingParse:
      'GEMINI_API_KEY is not configured on the server. Set it in Settings > Secrets or use the local JS parser.',
    missingExpenseText: 'Please enter an expense description to analyze.',
    geminiMissingOcr:
      'GEMINI_API_KEY is not configured on the server to run Gemini Vision OCR.',
    sampleNotFound: 'Sample receipt image could not be found.',
    missingImage: 'Missing receipt or QR image to scan.',
    mapsKeyMissing: 'GOOGLE_MAPS_API_KEY is not configured on the server.',
    missingLocation: 'Enter your city to search for places and deals.',
    mapsQuotaExceeded: 'Google Maps Platform query quota limit reached.',
    nearbyFallbackError: 'Could not query nearby places at this moment.',
    geminiMissingOffers:
      'GEMINI_API_KEY is not configured on the server to search web deals.',
    geminiInvalidKey:
      'The Gemini API key is invalid or lacks permissions. Check Settings > Secrets.',
    geminiBusy:
      'The AI service is experiencing temporary high demand. Try again in a few seconds.',
    geminiGeneric: 'Error processing request with the AI service.',
    defaultArea: 'Your current area',
    defaultStoreName: 'Local venue',
  },
  fr: {
    geminiMissingParse:
      'GEMINI_API_KEY introuvable sur le serveur. Configurez-la dans Settings > Secrets ou utilisez le moteur JS local.',
    missingExpenseText: 'Veuillez saisir une description de dépense à analyser.',
    geminiMissingOcr:
      'GEMINI_API_KEY introuvable sur le serveur pour exécuter l’OCR Gemini Vision.',
    sampleNotFound: 'L’image du ticket d’exemple est introuvable.',
    missingImage: 'Image du ticket ou du QR manquante pour la numérisation.',
    mapsKeyMissing: 'GOOGLE_MAPS_API_KEY n’est pas configurée sur le serveur.',
    missingLocation: 'Saisissez votre ville pour rechercher des lieux et des offres.',
    mapsQuotaExceeded: 'Limite de requêtes Google Maps Platform atteinte.',
    nearbyFallbackError: 'Impossible de consulter les lieux à proximité pour le moment.',
    geminiMissingOffers:
      'GEMINI_API_KEY introuvable sur le serveur pour rechercher les offres en ligne.',
    geminiInvalidKey:
      'La clé API Gemini est invalide ou n’a pas les autorisations requises. Vérifiez Settings > Secrets.',
    geminiBusy:
      'Le service d’IA connaît une forte demande temporaire. Réessayez dans quelques secondes.',
    geminiGeneric: 'Erreur lors du traitement avec le service d’IA.',
    defaultArea: 'Votre zone actuelle',
    defaultStoreName: 'Commerce local',
  },
  zh: {
    geminiMissingParse:
      '服务器未配置 GEMINI_API_KEY。请在 Settings > Secrets 中设置，或使用本地 JS 解析器。',
    missingExpenseText: '请输入要解析的消费说明。',
    geminiMissingOcr: '服务器未配置 GEMINI_API_KEY，无法运行 Gemini Vision OCR。',
    sampleNotFound: '未找到示例小票图片。',
    missingImage: '缺少要扫描的小票或二维码图片。',
    mapsKeyMissing: '服务器未配置 GOOGLE_MAPS_API_KEY。',
    missingLocation: '请输入所在城市以搜索地点和优惠。',
    mapsQuotaExceeded: '已达到 Google Maps Platform 查询配额上限。',
    nearbyFallbackError: '暂时无法查询附近商家。',
    geminiMissingOffers: '服务器未配置 GEMINI_API_KEY，无法联网搜索优惠。',
    geminiInvalidKey: 'Gemini API 密钥无效或权限不足。请检查 Settings > Secrets。',
    geminiBusy: 'AI 服务当前请求繁忙，请几秒后再试。',
    geminiGeneric: 'AI 服务处理请求时出错。',
    defaultArea: '当前区域',
    defaultStoreName: '本地商家',
  },
  ru: {
    geminiMissingParse:
      'На сервере не настроен GEMINI_API_KEY. Укажите его в Settings > Secrets или используйте локальный JS-парсер.',
    missingExpenseText: 'Введите описание расхода для анализа.',
    geminiMissingOcr:
      'На сервере не настроен GEMINI_API_KEY для запуска OCR Gemini Vision.',
    sampleNotFound: 'Не удалось найти изображение примера чека.',
    missingImage: 'Отсутствует изображение чека или QR-кода для сканирования.',
    mapsKeyMissing: 'На сервере не настроен GOOGLE_MAPS_API_KEY.',
    missingLocation: 'Введите ваш город для поиска заведений и акций.',
    mapsQuotaExceeded: 'Достигнут лимит запросов Google Maps Platform.',
    nearbyFallbackError: 'Не удалось получить список мест поблизости.',
    geminiMissingOffers:
      'На сервере не настроен GEMINI_API_KEY для поиска акций в интернете.',
    geminiInvalidKey:
      'Ключ Gemini API недействителен или не имеет прав. Проверьте Settings > Secrets.',
    geminiBusy: 'Сервис ИИ временно перегружен. Повторите попытку через несколько секунд.',
    geminiGeneric: 'Ошибка обработки запроса сервисом ИИ.',
    defaultArea: 'Ваш район',
    defaultStoreName: 'Местное заведение',
  },
};

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getMapsApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key || key === 'MY_GOOGLE_MAPS_API_KEY') {
    return null;
  }
  return key;
}

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

interface AddressComponentLike {
  long_name?: string;
  longText?: string;
  types?: string[];
}

function extractCityFromComponents(components?: AddressComponentLike[]): string {
  if (!Array.isArray(components)) return '';
  const findType = (type: string) => {
    const match = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
    return match?.longText || match?.long_name || '';
  };
  const locality =
    findType('locality') ||
    findType('sublocality_level_1') ||
    findType('administrative_area_level_2');
  const province = findType('administrative_area_level_1');
  if (locality && province && locality.toLowerCase() !== province.toLowerCase()) {
    return `${locality}, ${province}`;
  }
  return locality || province || '';
}

interface GlobalCityResolution {
  raw: string;
  cityForGeocode: string;
  cityForSearch: string;
  countryCode: string; // uppercase ISO-3166-1 alpha-2 if known (e.g. 'AR', 'ES', 'JP')
  prioritizeArgentina: boolean;
  center: { lat: number; lng: number } | null;
  viewboxParam: string;
}

async function resolveCitySearchGlobal(
  rawCity: string,
  mapsLang = 'es'
): Promise<GlobalCityResolution> {
  const clean = rawCity.trim();
  if (!clean) {
    return {
      raw: '',
      cityForGeocode: 'Argentina',
      cityForSearch: 'Argentina',
      countryCode: 'AR',
      prioritizeArgentina: true,
      center: null,
      viewboxParam: '',
    };
  }

  const hasExplicitCountry =
    /\b(argentina|españa|spain|chile|uruguay|paraguay|bolivia|brasil|brazil|colombia|peru|perú|mexico|méxico|ecuador|venezuela|estados unidos|usa|u\.s\.a\.?|united states|ee\.?\s*uu\.?|canada|canadá|francia|france|italia|italy|alemania|germany|portugal|reino unido|uk|england|china|rusia|russia|japon|japan|australia|korea|corea|india|turquia|turkey|grecia|greece|suiza|switzerland|holanda|netherlands|belgica|belgium)\b/i.test(
      clean
    ) || /,\s*[a-z]{2,}$/i.test(clean);

  const hasArgentina = /\bargentina\b/i.test(clean);
  if (hasArgentina) {
    return {
      raw: clean,
      cityForGeocode: clean,
      cityForSearch: clean,
      countryCode: 'AR',
      prioritizeArgentina: true,
      center: null,
      viewboxParam: '',
    };
  }

  // Query Open-Meteo Geocoding + Nominatim + Photon globally so any city resolves cleanly
  try {
    const osmHeaders = {
      'User-Agent': 'CuentasClarasApp/1.0 (+https://cuentasclaras.app)',
      'Accept-Language': mapsLang,
    };
    const cityHead = clean.split(',')[0].trim();

    const [meteoRes, nomRes, photonRes] = await Promise.all([
      fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          cityHead
        )}&count=5&language=${encodeURIComponent(mapsLang)}`,
        { signal: AbortSignal.timeout(3500) }
      )
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .catch(() => ({ results: [] })),
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          clean
        )}&format=jsonv2&addressdetails=1&limit=5&accept-language=${encodeURIComponent(mapsLang)}`,
        { headers: osmHeaders, signal: AbortSignal.timeout(4000) }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=4`, {
        signal: AbortSignal.timeout(3500),
      })
        .then((r) => (r.ok ? r.json() : { features: [] }))
        .catch(() => ({ features: [] })),
    ]);

    const meteoResults = Array.isArray((meteoRes as { results?: unknown[] }).results)
      ? ((meteoRes as {
          results: Array<{
            name?: string;
            latitude?: number;
            longitude?: number;
            country_code?: string;
            country?: string;
            admin1?: string;
          }>;
        }).results)
      : [];

    const nomRows = Array.isArray(nomRes)
      ? (nomRes as Array<{
          lat: string;
          lon: string;
          type?: string;
          addresstype?: string;
          importance?: number;
          name?: string;
          display_name?: string;
          boundingbox?: [string, string, string, string];
          address?: Record<string, string>;
        }>)
      : [];

    const photonFeatures = Array.isArray(
      (photonRes as { features?: unknown[] }).features
    )
      ? ((photonRes as {
          features: Array<{
            properties?: {
              osm_value?: string;
              type?: string;
              name?: string;
              city?: string;
              state?: string;
              country?: string;
              countrycode?: string;
            };
            geometry?: { coordinates?: [number, number] };
          }>;
        }).features)
      : [];

    const settlementTypes = new Set([
      'city',
      'town',
      'village',
      'municipality',
      'administrative',
      'borough',
      'suburb',
      'state_district',
      'province',
    ]);

    const nomSettlements = nomRows.filter(
      (r) => settlementTypes.has(r.addresstype || '') || settlementTypes.has(r.type || '')
    );
    const bestNom = nomSettlements[0] || nomRows[0];

    const bestPhotonCity = photonFeatures.find((f) => {
      const val = f.properties?.osm_value || f.properties?.type || '';
      return ['city', 'town', 'village', 'borough', 'suburb', 'province', 'state'].includes(val);
    });
    const bestMeteo = meteoResults[0];

    if (bestMeteo || bestNom || bestPhotonCity) {
      let cc = (
        bestNom?.address?.country_code ||
        bestPhotonCity?.properties?.countrycode ||
        bestMeteo?.country_code ||
        ''
      ).toUpperCase();
      let display = clean;
      let center: { lat: number; lng: number } | null = null;
      let viewboxParam = '';

      if (
        bestMeteo &&
        typeof bestMeteo.latitude === 'number' &&
        typeof bestMeteo.longitude === 'number'
      ) {
        center = { lat: bestMeteo.latitude, lng: bestMeteo.longitude };
        const cleanName = (bestMeteo.name || '').replace(/^Ciudad de\s+/i, '').trim();
        const mParts = [cleanName, bestMeteo.admin1, bestMeteo.country].filter(
          (v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx
        );
        if (mParts.length > 0) display = mParts.join(', ');
      }

      if (bestNom) {
        const addr = bestNom.address || {};
        const locality =
          addr.city || addr.town || addr.village || addr.municipality || bestNom.name || '';
        const state = addr.state || '';
        const country = addr.country || '';
        const parts = [locality, state, country].filter(
          (v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx
        );
        if (parts.length > 0) {
          display = parts.join(', ');
        }
        const nLat = Number(bestNom.lat);
        const nLng = Number(bestNom.lon);
        if (Number.isFinite(nLat) && Number.isFinite(nLng)) {
          center = { lat: nLat, lng: nLng };
        }
        if (Array.isArray(bestNom.boundingbox) && bestNom.boundingbox.length === 4) {
          const [south, north, west, east] = bestNom.boundingbox;
          viewboxParam = `&viewbox=${west},${north},${east},${south}`;
        }
      }

      if (bestPhotonCity?.geometry?.coordinates?.length === 2) {
        const [pLng, pLat] = bestPhotonCity.geometry.coordinates;
        const pCc = (bestPhotonCity.properties?.countrycode || '').toUpperCase();
        if (Number.isFinite(pLat) && Number.isFinite(pLng) && (!cc || !pCc || cc === pCc)) {
          center = { lat: pLat, lng: pLng };
          if (!cc && pCc) cc = pCc;
          if (display === clean) {
            const p = bestPhotonCity.properties || {};
            const pParts = [p.name || p.city, p.state, p.country].filter(
              (v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx
            );
            if (pParts.length > 0) display = pParts.join(', ');
          }
        }
      }

      return {
        raw: clean,
        cityForGeocode: hasExplicitCountry ? clean : display,
        cityForSearch: hasExplicitCountry ? clean : display,
        countryCode: cc,
        prioritizeArgentina: cc === 'AR',
        center,
        viewboxParam,
      };
    }
  } catch {
    // Fall through cleanly
  }

  return {
    raw: clean,
    cityForGeocode: clean,
    cityForSearch: clean,
    countryCode: '',
    prioritizeArgentina: false,
    center: null,
    viewboxParam: '',
  };
}

function resolveReceiptFile(relativePath: string): string | null {
  const candidates = [
    path.resolve(__dirname, relativePath),
    path.resolve(__dirname, 'dist', relativePath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function mapGeminiError(error: unknown, lang: LangCode = 'es'): { status: number; message: string } {
  const errMsgs = SERVER_ERRORS[lang];
  const errObj = error as { status?: number; message?: string };
  const msg = errObj?.message || errMsgs.geminiGeneric;
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || errObj?.status === 403) {
    return {
      status: 403,
      message: errMsgs.geminiInvalidKey,
    };
  }
  if (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    errObj?.status === 429 ||
    errObj?.status === 503
  ) {
    return {
      status: 503,
      message: errMsgs.geminiBusy,
    };
  }
  return {
    status: 500,
    message: msg,
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/parse-expense', async (req, res) => {
    const { text, participants, language } = req.body as {
      text?: string;
      participants?: string[];
      language?: string;
    };
    const lang = resolveLanguage(language);
    const errMsgs = SERVER_ERRORS[lang];

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: errMsgs.geminiMissingParse,
      });
      return;
    }

    if (!text || !text.trim()) {
      res.status(400).json({ error: errMsgs.missingExpenseText });
      return;
    }

    const activeParticipants = Array.isArray(participants) ? participants.filter(Boolean) : [];
    const outputLangName = PROMPT_LANG_LABEL[lang];

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `User input: "${text.trim()}"\nCurrent group participants: ${
                  activeParticipants.length > 0 ? activeParticipants.join(', ') : 'None yet'
                }`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: `Eres un asistente contable experto en dividir gastos de juntadas, cenas y viajes (en cualquier idioma: español, inglés, francés, chino o ruso).
Extraé todos los gastos mencionados en el texto.
Reglas estrictas:
1. Normalizá los nombres propios con mayúscula inicial (ej: "santi" -> "Santi"). Si coinciden con un nombre de los "Current group participants", usá exactamente ese nombre.
2. Si el texto menciona nuevos nombres que no estaban en la lista, incluilos en "newParticipants".
3. Cada gasto debe tener:
   - description: descripción corta y clara en ${outputLangName} (manteniendo los nombres de ítems claros).
   - amount: monto total numérico positivo (sin signos $ ni separadores de miles).
   - category: EXACTAMENTE uno de los valores internos: "comida", "bebida", "transporte", "otros".
   - payers: lista de { name, amount } con cuánto puso cada persona. Si una sola persona pagó todo, poné un solo elemento con el monto total. Si hubo pago parcial (ej: "Marcos puso 45000 y Sofía 25500"), detallá ambos montos de modo que sumen el total del gasto. Si no se aclara quién pagó, usá el primer participante del grupo o "Pagador".
   - excludedParticipants: nombres de personas explícitamente excluidas de ese gasto (ej: "Sofía y Lucía no toman alcohol" -> ["Sofía", "Lucía"]).
4. Si en una misma oración se dice "Cena $70.500: Marcos pagó $45.000 y Sofía $25.500. Juli no come pizza ($14.800) y Lucas no tomó cerveza ($13.500)", desglosá inteligentemente los ítems con sus exclusiones y mantené la proporción o asigná el monto pagado correctamente para que la suma de gastos refleje exactamente lo pagado.
5. Devolvé una nota breve en "note" resumiendo lo interpretado en ${outputLangName}.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              newParticipants: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              expenses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    category: { type: Type.STRING },
                    payers: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          amount: { type: Type.NUMBER },
                        },
                        required: ['name', 'amount'],
                      },
                    },
                    excludedParticipants: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['description', 'amount', 'category', 'payers', 'excludedParticipants'],
                },
              },
              note: { type: Type.STRING },
            },
            required: ['newParticipants', 'expenses', 'note'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (error) {
      const mapped = mapGeminiError(error, lang);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/scan-receipt', async (req, res) => {
    const { imageBase64, mimeType, sampleKey, qrRawText, language } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      sampleKey?: string;
      qrRawText?: string;
      language?: string;
    };
    const lang = resolveLanguage(language);
    const errMsgs = SERVER_ERRORS[lang];

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: errMsgs.geminiMissingOcr,
      });
      return;
    }

    let finalBase64 = imageBase64;
    let finalMimeType = mimeType || 'image/jpeg';

    if (sampleKey && SAMPLE_RECEIPT_PATHS[sampleKey]) {
      const resolved = resolveReceiptFile(SAMPLE_RECEIPT_PATHS[sampleKey]);
      if (!resolved) {
        res.status(404).json({ error: errMsgs.sampleNotFound });
        return;
      }
      const fileBuffer = fs.readFileSync(resolved);
      finalBase64 = fileBuffer.toString('base64');
      finalMimeType = 'image/jpeg';
    }

    if (!finalBase64) {
      res.status(400).json({ error: errMsgs.missingImage });
      return;
    }

    try {
      const outputLangName = PROMPT_LANG_LABEL[lang];
      const qrContext = qrRawText
        ? `\nDecoded QR text detected: "${qrRawText}". If it is an AFIP/tax invoice QR or a payment/receipt QR, also use those details to extract merchant name, date, and total.`
        : '';

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: finalMimeType,
                data: finalBase64,
              },
            },
            {
              text: `Read this receipt, invoice, or purchase/restaurant QR code and extract the merchant name, date (if visible), full list of line items with quantity and line total price (do NOT include subtotal, tax-included, or grand total rows as items), and the receipt total. If the image only contains a QR code with a total/merchant and no item list, return one item with a clear concept in ${outputLangName} and the detected total. Keep category strictly as one of: "comida", "bebida", "transporte", "otros". Watch out for Latin American/European number formats where dots separate thousands (e.g., $38.500,00 is 38500).${qrContext}`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchantName: { type: Type.STRING },
              date: { type: Type.STRING },
              detectedTotal: { type: Type.NUMBER },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.INTEGER },
                    totalPrice: { type: Type.NUMBER },
                    category: { type: Type.STRING },
                  },
                  required: ['name', 'quantity', 'totalPrice', 'category'],
                },
              },
            },
            required: ['merchantName', 'date', 'detectedTotal', 'items'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (error) {
      const mapped = mapGeminiError(error, lang);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.get('/api/maps-config', (_req, res) => {
    res.json({
      apiKey: getMapsApiKey() || '',
    });
  });

  app.post('/api/nearby-stores', async (req, res) => {
    const {
      lat,
      lng,
      cityQuery,
      mode = 'all',
      storeType = 'all',
      productCategory = 'all',
      openNowOnly = false,
      customQuery = '',
      language,
    } = req.body as {
      lat?: number;
      lng?: number;
      cityQuery?: string;
      mode?: 'all' | 'salidas' | 'compras';
      storeType?:
        | 'all'
        | 'carniceria'
        | 'panaderia'
        | 'supermercado'
        | 'heladeria'
        | 'restaurante'
        | 'restobar'
        | 'juegos_comida';
      productCategory?: 'all' | 'carnes' | 'refrescos' | 'helados' | 'panificados';
      openNowOnly?: boolean;
      customQuery?: string;
      language?: string;
    };

    const lang = resolveLanguage(language);
    const errMsgs = SERVER_ERRORS[lang];
    const mapsLang = MAPS_LANG_BY_CODE[lang];

    const hasCoords =
      typeof lat === 'number' &&
      Number.isFinite(lat) &&
      typeof lng === 'number' &&
      Number.isFinite(lng);
    const trimmedCity = (cityQuery || '').trim();

    if (!hasCoords && !trimmedCity) {
      res.status(400).json({
        error: errMsgs.missingLocation,
      });
      return;
    }

    const cityBias = await resolveCitySearchGlobal(trimmedCity, mapsLang);
    let centerCoords: { lat: number; lng: number } | null = hasCoords
      ? { lat: lat!, lng: lng! }
      : cityBias.center;
    let resolvedCity = hasCoords ? trimmedCity : cityBias.cityForSearch || trimmedCity;

    type StoreBucketKey =
      | 'carniceria'
      | 'panaderia'
      | 'supermercado'
      | 'heladeria'
      | 'restaurante'
      | 'restobar'
      | 'juegos_comida';

    interface NormalizedPlace {
      id: string;
      name: string;
      storeType: StoreBucketKey;
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

    const STORE_LABELS_BY_LANG: Record<LangCode, Record<StoreBucketKey, string>> = {
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

    const STORE_QUERIES_BY_LANG: Record<LangCode, Record<StoreBucketKey, string>> = {
      es: {
        restaurante: 'restaurante parrilla bodegon comida',
        restobar: 'restobar bar tapas hamburguesas cerveza',
        juegos_comida: 'pool billar arcade bowling juegos bar comida',
        carniceria: 'carniceria cortes de carne',
        panaderia: 'panaderia panificados facturas',
        supermercado: 'supermercado bebidas ofertas',
        heladeria: 'heladeria artesanal helados',
      },
      en: {
        restaurante: 'restaurant dining food',
        restobar: 'restobar gastropub bar burgers beer',
        juegos_comida: 'pool hall billiards arcade bowling games bar',
        carniceria: 'butcher shop meat cuts',
        panaderia: 'bakery bread pastries',
        supermercado: 'supermarket grocery drinks',
        heladeria: 'ice cream shop gelato',
      },
      fr: {
        restaurante: 'restaurant cuisine dîner',
        restobar: 'resto-bar bar tapas bière burgers',
        juegos_comida: 'billard pool salle arcade bowling bar jeux',
        carniceria: 'boucherie viande',
        panaderia: 'boulangerie pâtisserie pain',
        supermercado: 'supermarché boissons courses',
        heladeria: 'glacier glace artisanale',
      },
      zh: {
        restaurante: '餐厅 美食 聚餐',
        restobar: '餐酒吧 精酿啤酒 汉堡 小吃',
        juegos_comida: '台球 桌球 电玩城 游戏厅 保龄球 酒吧',
        carniceria: '肉铺 鲜肉 牛排',
        panaderia: '面包店 烘焙 糕点',
        supermercado: '超市 饮料 生鲜',
        heladeria: '冰淇淋店 甜品',
      },
      ru: {
        restaurante: 'ресторан ужин еда',
        restobar: 'рестобар бар крафтовое пиво бургеры',
        juegos_comida: 'бильярд пул аркада игровые автоматы боулинг бар',
        carniceria: 'мясная лавка мясо стейки',
        panaderia: 'пекарня выпечка хлеб',
        supermercado: 'супермаркет напитки продукты',
        heladeria: 'кафе-мороженое джелато',
      },
    };

    const STORE_QUERIES: Record<StoreBucketKey, { label: string; query: string }> = {
      restaurante: {
        label: STORE_LABELS_BY_LANG[lang].restaurante,
        query: STORE_QUERIES_BY_LANG[lang].restaurante,
      },
      restobar: {
        label: STORE_LABELS_BY_LANG[lang].restobar,
        query: STORE_QUERIES_BY_LANG[lang].restobar,
      },
      juegos_comida: {
        label: STORE_LABELS_BY_LANG[lang].juegos_comida,
        query: STORE_QUERIES_BY_LANG[lang].juegos_comida,
      },
      carniceria: {
        label: STORE_LABELS_BY_LANG[lang].carniceria,
        query: STORE_QUERIES_BY_LANG[lang].carniceria,
      },
      panaderia: {
        label: STORE_LABELS_BY_LANG[lang].panaderia,
        query: STORE_QUERIES_BY_LANG[lang].panaderia,
      },
      supermercado: {
        label: STORE_LABELS_BY_LANG[lang].supermercado,
        query: STORE_QUERIES_BY_LANG[lang].supermercado,
      },
      heladeria: {
        label: STORE_LABELS_BY_LANG[lang].heladeria,
        query: STORE_QUERIES_BY_LANG[lang].heladeria,
      },
    };

    const trimmedQuery = (customQuery || '').trim();
    const isGamesQuery =
      /\b(pool|billar|billiards|arcade|bowling|boliche|fichas?|metegol|flipper|ping\s*pong|juegos?|games?|snooker|dardos|laser|fichines)\b/i.test(
        trimmedQuery
      );

    let bucketsToSearch: StoreBucketKey[];
    if (storeType !== 'all' && storeType in STORE_QUERIES) {
      bucketsToSearch = [storeType];
    } else if (mode === 'salidas' && isGamesQuery) {
      bucketsToSearch = ['juegos_comida', 'restobar'];
    } else if (mode === 'salidas') {
      bucketsToSearch = ['restaurante', 'restobar', 'juegos_comida'];
    } else if (productCategory === 'carnes') {
      bucketsToSearch = ['carniceria', 'supermercado'];
    } else if (productCategory === 'panificados') {
      bucketsToSearch = ['panaderia', 'supermercado'];
    } else if (productCategory === 'helados') {
      bucketsToSearch = ['heladeria', 'supermercado'];
    } else if (productCategory === 'refrescos') {
      bucketsToSearch = ['supermercado'];
    } else if (mode === 'compras') {
      bucketsToSearch = ['carniceria', 'panaderia', 'supermercado', 'heladeria'];
    } else {
      bucketsToSearch = ['restaurante', 'restobar', 'juegos_comida', 'carniceria', 'supermercado'];
    }

    const buildGoogleMapsSearchUrl = (cityLabel: string): string => {
      const topicParts: string[] = [];
      if (trimmedQuery) topicParts.push(trimmedQuery);
      if (storeType !== 'all' && storeType in STORE_QUERIES) {
        topicParts.push(STORE_QUERIES[storeType].label);
      } else if (!trimmedQuery) {
        topicParts.push(
          mode === 'salidas'
            ? 'restaurantes restobares pool juegos'
            : 'carnicerias panaderias supermercados heladerias'
        );
      }
      const loc = cityLabel || cityBias.cityForSearch || trimmedCity;
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${topicParts.join(' ')} ${loc}`.trim())}`;
    };

    const buildOsmSearchUrl = (cityLabel: string): string => {
      const loc = cityLabel || cityBias.cityForSearch || trimmedCity;
      return `https://www.openstreetmap.org/search?query=${encodeURIComponent(loc)}`;
    };

    const sortNormalizedPlaces = (items: NormalizedPlace[]): NormalizedPlace[] =>
      items.sort((a, b) => {
        if (trimmedQuery) {
          const tokens = trimmedQuery
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length >= 3);
          const scorePlace = (item: { name: string; storeType: string; storeTypeLabel: string }) => {
            const hay = `${item.name} ${item.storeTypeLabel}`.toLowerCase();
            let score = 0;
            for (const tok of tokens) {
              if (hay.includes(tok)) score += 3;
            }
            if (isGamesQuery && item.storeType === 'juegos_comida') score += 2;
            return score;
          };
          const diff = scorePlace(b) - scorePlace(a);
          if (diff !== 0) return diff;
        }
        if (a.distanceMeters !== null && b.distanceMeters !== null) {
          return a.distanceMeters - b.distanceMeters;
        }
        return (b.rating || 0) - (a.rating || 0);
      });

    // OpenStreetMap Nominatim + Overpass fallback helper
    const searchWithOpenStreetMap = async (): Promise<{
      city: string;
      center: { lat: number; lng: number } | null;
      places: NormalizedPlace[];
    }> => {
      const osmHeaders = {
        'User-Agent': 'CuentasClarasApp/1.0 (+https://cuentasclaras.app)',
        'Accept-Language': mapsLang,
      };

      let osmCenter = centerCoords;
      let osmCity = resolvedCity || trimmedCity;
      let viewboxParam = '';

      // 1. Geocode with Nominatim if we need coordinates or readable city name
      try {
        if (hasCoords && osmCenter) {
          const revUrl = `https://nominatim.openstreetmap.org/reverse?lat=${osmCenter.lat}&lon=${osmCenter.lng}&format=jsonv2&addressdetails=1`;
          const revRes = await fetch(revUrl, {
            headers: osmHeaders,
            signal: AbortSignal.timeout(7000),
          });
          if (revRes.ok) {
            const revData = (await revRes.json()) as {
              address?: Record<string, string>;
            };
            const locality =
              revData.address?.city ||
              revData.address?.town ||
              revData.address?.village ||
              revData.address?.municipality ||
              '';
            const state = revData.address?.state || '';
            if (locality && state && locality.toLowerCase() !== state.toLowerCase()) {
              osmCity = `${locality}, ${state}`;
            } else if (locality || state) {
              osmCity = locality || state;
            }
          }
        } else if (trimmedCity) {
          const fetchNomCity = async (countryCodes?: string) => {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
              cityBias.cityForGeocode
            )}&format=jsonv2&addressdetails=1&limit=1${countryCodes ? `&countrycodes=${countryCodes}` : ''}`;
            const r = await fetch(url, {
              headers: osmHeaders,
              signal: AbortSignal.timeout(7000),
            });
            if (!r.ok) return [];
            return (await r.json()) as Array<{
              lat: string;
              lon: string;
              boundingbox?: [string, string, string, string];
              display_name?: string;
              address?: Record<string, string>;
            }>;
          };

          if (cityBias.viewboxParam) {
            viewboxParam = cityBias.viewboxParam;
          }

          if (!osmCenter || !viewboxParam) {
            let nomResults = await fetchNomCity(
              cityBias.countryCode ? cityBias.countryCode.toLowerCase() : undefined
            );
            if (nomResults.length === 0 && cityBias.countryCode) {
              nomResults = await fetchNomCity(undefined);
            }

            const first = nomResults[0];
            if (first) {
              const parsedLat = Number(first.lat);
              const parsedLng = Number(first.lon);
              if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
                osmCenter = { lat: parsedLat, lng: parsedLng };
              }
              if (Array.isArray(first.boundingbox) && first.boundingbox.length === 4) {
                const [south, north, west, east] = first.boundingbox;
                viewboxParam = `&viewbox=${west},${north},${east},${south}`;
              }
              const addr = first.address || {};
              const locality =
                addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
              const state = addr.state || '';
              const country = addr.country || '';
              const parts = [locality, state, country].filter(
                (v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx
              );
              if (parts.length > 0) {
                osmCity = parts.join(', ');
              }
            }
          }
        }
      } catch {
        // Proceed even if Nominatim geocode fails
      }

      const cityForMapsLink = osmCity || cityBias.cityForSearch || trimmedCity || 'Buenos Aires';
      const osmPlaces: NormalizedPlace[] = [];
      const seenOsmIds = new Set<string>();

      const classifyOsmTags = (tags: Record<string, string>): StoreBucketKey => {
        const amenity = (tags.amenity || '').toLowerCase();
        const shop = (tags.shop || '').toLowerCase();
        const leisure = (tags.leisure || '').toLowerCase();
        const sport = (tags.sport || '').toLowerCase();
        const nameLower = (tags.name || '').toLowerCase();

        if (
          leisure === 'bowling_alley' ||
          leisure === 'amusement_arcade' ||
          leisure === 'adult_gaming_centre' ||
          sport === 'billiards' ||
          sport === 'snooker' ||
          sport === '10pin' ||
          /\b(pool|billar|arcade|bowling|fichines|juegos)\b/i.test(nameLower)
        ) {
          return 'juegos_comida';
        }
        if (amenity === 'bar' || amenity === 'pub' || amenity === 'biergarten') {
          return bucketsToSearch.includes('restobar') ? 'restobar' : bucketsToSearch[0] || 'restobar';
        }
        if (shop === 'butcher') return 'carniceria';
        if (shop === 'bakery' || shop === 'pastry') return 'panaderia';
        if (shop === 'supermarket' || shop === 'convenience' || shop === 'grocery') return 'supermercado';
        if (amenity === 'ice_cream' || shop === 'ice_cream') return 'heladeria';
        if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'cafe') {
          return bucketsToSearch.includes('restaurante')
            ? 'restaurante'
            : bucketsToSearch[0] || 'restaurante';
        }
        return bucketsToSearch[0] || 'restaurante';
      };

      // 2. Query Overpass API around osmCenter
      if (osmCenter) {
        const overpassSelectors: string[] = [];
        const r = 7500;
        const { lat: cLat, lng: cLng } = osmCenter;

        for (const bucket of bucketsToSearch) {
          if (bucket === 'restaurante') {
            overpassSelectors.push(`nwr["amenity"="restaurant"](around:${r},${cLat},${cLng});`);
          } else if (bucket === 'restobar') {
            overpassSelectors.push(`nwr["amenity"~"^(bar|pub|biergarten)$"](around:${r},${cLat},${cLng});`);
          } else if (bucket === 'juegos_comida') {
            overpassSelectors.push(
              `nwr["leisure"~"^(bowling_alley|amusement_arcade|adult_gaming_centre)$"](around:${r},${cLat},${cLng});`,
              `nwr["sport"~"^(billiards|snooker|10pin)$"](around:${r},${cLat},${cLng});`,
              `nwr["amenity"~"^(bar|pub)$"]["name"~"(pool|billar|arcade|bowling|juego)",i](around:${r},${cLat},${cLng});`
            );
          } else if (bucket === 'carniceria') {
            overpassSelectors.push(`nwr["shop"="butcher"](around:${r},${cLat},${cLng});`);
          } else if (bucket === 'panaderia') {
            overpassSelectors.push(`nwr["shop"~"^(bakery|pastry)$"](around:${r},${cLat},${cLng});`);
          } else if (bucket === 'supermercado') {
            overpassSelectors.push(`nwr["shop"~"^(supermarket|convenience|grocery)$"](around:${r},${cLat},${cLng});`);
          } else if (bucket === 'heladeria') {
            overpassSelectors.push(
              `nwr["amenity"="ice_cream"](around:${r},${cLat},${cLng});`,
              `nwr["shop"="ice_cream"](around:${r},${cLat},${cLng});`
            );
          }
        }

        const ql = `[out:json][timeout:8];(\n${overpassSelectors.join('\n')}\n);out center 40;`;
        const overpassEndpoints = [
          'https://overpass-api.de/api/interpreter',
          'https://overpass.kumi.systems/api/interpreter',
        ];

        for (const endpoint of overpassEndpoints) {
          try {
            const ovRes = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': osmHeaders['User-Agent'],
              },
              body: `data=${encodeURIComponent(ql)}`,
              signal: AbortSignal.timeout(7500),
            });
            if (!ovRes.ok) continue;
            const ovData = (await ovRes.json()) as {
              elements?: Array<{
                type: string;
                id: number;
                lat?: number;
                lon?: number;
                center?: { lat: number; lon: number };
                tags?: Record<string, string>;
              }>;
            };
            const elements = ovData.elements || [];
            for (const el of elements) {
              const tags = el.tags || {};
              const name = (tags.name || '').trim();
              if (!name) continue;
              const pLat = el.lat ?? el.center?.lat ?? null;
              const pLng = el.lon ?? el.center?.lon ?? null;
              const keyId = `osm-${el.type}-${el.id}`;
              if (seenOsmIds.has(keyId)) continue;
              seenOsmIds.add(keyId);

              const bucket = classifyOsmTags(tags);
              if (!bucketsToSearch.includes(bucket) && bucketsToSearch.length === 1) {
                continue;
              }
              const addrParts = [
                [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
                tags['addr:suburb'] || tags['addr:city'] || '',
              ].filter(Boolean);

              osmPlaces.push({
                id: keyId,
                name,
                storeType: bucket,
                storeTypeLabel: STORE_LABELS_BY_LANG[lang][bucket],
                address: addrParts.join(', ') || osmCity || '',
                lat: pLat,
                lng: pLng,
                distanceMeters:
                  osmCenter && pLat !== null && pLng !== null
                    ? haversineMeters(osmCenter.lat, osmCenter.lng, pLat, pLng)
                    : null,
                rating: null,
                userRatingCount: null,
                openNow: null,
                priceLevelLabel: null,
                priceRange: null,
                googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${cityForMapsLink}`)}`,
                osmUri: `https://www.openstreetmap.org/${el.type}/${el.id}`,
                websiteUri: tags.website || tags['contact:website'] || null,
              });
            }
            if (osmPlaces.length > 0) break;
          } catch {
            // Try next Overpass mirror or Nominatim fallback
          }
        }
      }

      // 3. Fallback to Nominatim POI search if Overpass yielded nothing
      if (osmPlaces.length === 0) {
        const poiKeywords: Record<StoreBucketKey, string> = {
          restaurante: 'restaurante',
          restobar: 'bar restobar',
          juegos_comida: 'pool billar bowling arcade',
          carniceria: 'carniceria',
          panaderia: 'panaderia',
          supermercado: 'supermercado',
          heladeria: 'heladeria',
        };

        const searchTerms = trimmedQuery
          ? [trimmedQuery, ...bucketsToSearch.slice(0, 2).map((b) => poiKeywords[b])]
          : bucketsToSearch.slice(0, 3).map((b) => poiKeywords[b]);

        await Promise.all(
          searchTerms.map(async (term, idx) => {
            try {
              const targetBucket = bucketsToSearch[idx] || bucketsToSearch[0] || 'restaurante';
              const q = `${term} ${cityForMapsLink}`;
              const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=6${viewboxParam}`;
              const r = await fetch(url, {
                headers: osmHeaders,
                signal: AbortSignal.timeout(6500),
              });
              if (!r.ok) return;
              const rows = (await r.json()) as Array<{
                place_id: number;
                osm_type?: string;
                osm_id?: number;
                lat: string;
                lon: string;
                name?: string;
                display_name?: string;
              }>;
              for (const row of rows) {
                const name = (row.name || row.display_name?.split(',')[0] || '').trim();
                if (!name) continue;
                const id = `nom-${row.place_id}`;
                if (seenOsmIds.has(id)) continue;
                seenOsmIds.add(id);

                const pLat = Number(row.lat);
                const pLng = Number(row.lon);
                const validCoords = Number.isFinite(pLat) && Number.isFinite(pLng);

                osmPlaces.push({
                  id,
                  name,
                  storeType: targetBucket,
                  storeTypeLabel: STORE_LABELS_BY_LANG[lang][targetBucket],
                  address: row.display_name || osmCity || '',
                  lat: validCoords ? pLat : null,
                  lng: validCoords ? pLng : null,
                  distanceMeters:
                    osmCenter && validCoords
                      ? haversineMeters(osmCenter.lat, osmCenter.lng, pLat, pLng)
                      : null,
                  rating: null,
                  userRatingCount: null,
                  openNow: null,
                  priceLevelLabel: null,
                  priceRange: null,
                  googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${cityForMapsLink}`)}`,
                  osmUri:
                    row.osm_type && row.osm_id
                      ? `https://www.openstreetmap.org/${row.osm_type}/${row.osm_id}`
                      : null,
                  websiteUri: null,
                });
              }
            } catch {
              // Ignore single Nominatim query error
            }
          })
        );
      }

      const sorted = sortNormalizedPlaces(osmPlaces);
      const filtered = osmCenter
        ? sorted.filter((p) => p.distanceMeters === null || p.distanceMeters <= 85000)
        : sorted;
      const finalList = (filtered.length > 0 ? filtered : sorted).slice(0, 18);

      return {
        city: osmCity || errMsgs.defaultArea,
        center: osmCenter,
        places: finalList,
      };
    };

    const mapsKey = getMapsApiKey();
    let googleQuotaExceeded = false;

    if (mapsKey) {
      try {
        const regionParam =
          cityBias.countryCode && /^[A-Z]{2}$/.test(cityBias.countryCode)
            ? `&region=${cityBias.countryCode.toLowerCase()}`
            : '';
        const geocodeUrl = hasCoords
          ? `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=${encodeURIComponent(mapsLang)}&key=${encodeURIComponent(mapsKey)}`
          : `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cityBias.cityForGeocode)}${regionParam}&language=${encodeURIComponent(mapsLang)}&key=${encodeURIComponent(mapsKey)}`;

        const geoRes = await fetch(geocodeUrl, { signal: AbortSignal.timeout(7000) });
        if (geoRes.status === 429) {
          googleQuotaExceeded = true;
        } else if (geoRes.ok) {
          const geoData = (await geoRes.json()) as {
            status?: string;
            results?: Array<{
              geometry?: { location?: { lat: number; lng: number } };
              address_components?: AddressComponentLike[];
              formatted_address?: string;
            }>;
          };
          if (geoData.status === 'OVER_QUERY_LIMIT') {
            googleQuotaExceeded = true;
          } else {
            const first = geoData.results?.[0];
            if (first) {
              const detected = extractCityFromComponents(first.address_components);
              if (detected) resolvedCity = detected;
              if (!centerCoords && first.geometry?.location) {
                centerCoords = {
                  lat: first.geometry.location.lat,
                  lng: first.geometry.location.lng,
                };
              }
            }
          }
        }
      } catch {
        // Continue cleanly to Places Text Search or OSM fallback
      }

      if (!googleQuotaExceeded) {
        const fieldMask = [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.shortFormattedAddress',
          'places.location',
          'places.googleMapsUri',
          'places.primaryType',
          'places.primaryTypeDisplayName',
          'places.rating',
          'places.userRatingCount',
          'places.currentOpeningHours.openNow',
          'places.priceLevel',
          'places.priceRange',
          'places.websiteUri',
          'places.addressComponents',
        ].join(',');

        interface RawPlace {
          id: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          shortFormattedAddress?: string;
          location?: { latitude: number; longitude: number };
          googleMapsUri?: string;
          primaryType?: string;
          primaryTypeDisplayName?: { text?: string };
          rating?: number;
          userRatingCount?: number;
          currentOpeningHours?: { openNow?: boolean };
          priceLevel?: string;
          priceRange?: {
            startPrice?: { currencyCode?: string; units?: string };
            endPrice?: { currencyCode?: string; units?: string };
          };
          websiteUri?: string;
          addressComponents?: AddressComponentLike[];
        }

        const PRICE_LEVEL_BY_LANG: Record<LangCode, Record<string, string>> = {
          es: {
            PRICE_LEVEL_FREE: 'Gratis',
            PRICE_LEVEL_INEXPENSIVE: '$ Económico',
            PRICE_LEVEL_MODERATE: '$$ Moderado',
            PRICE_LEVEL_EXPENSIVE: '$$$ Elevado',
            PRICE_LEVEL_VERY_EXPENSIVE: '$$$$ Premium',
          },
          en: {
            PRICE_LEVEL_FREE: 'Free',
            PRICE_LEVEL_INEXPENSIVE: '$ Inexpensive',
            PRICE_LEVEL_MODERATE: '$$ Moderate',
            PRICE_LEVEL_EXPENSIVE: '$$$ Expensive',
            PRICE_LEVEL_VERY_EXPENSIVE: '$$$$ Premium',
          },
          fr: {
            PRICE_LEVEL_FREE: 'Gratuit',
            PRICE_LEVEL_INEXPENSIVE: '$ Abordable',
            PRICE_LEVEL_MODERATE: '$$ Modéré',
            PRICE_LEVEL_EXPENSIVE: '$$$ Élevé',
            PRICE_LEVEL_VERY_EXPENSIVE: '$$$$ Premium',
          },
          zh: {
            PRICE_LEVEL_FREE: '免费',
            PRICE_LEVEL_INEXPENSIVE: '$ 实惠',
            PRICE_LEVEL_MODERATE: '$$ 适中',
            PRICE_LEVEL_EXPENSIVE: '$$$ 偏高',
            PRICE_LEVEL_VERY_EXPENSIVE: '$$$$ 高端',
          },
          ru: {
            PRICE_LEVEL_FREE: 'Бесплатно',
            PRICE_LEVEL_INEXPENSIVE: '$ Недорого',
            PRICE_LEVEL_MODERATE: '$$ Умеренно',
            PRICE_LEVEL_EXPENSIVE: '$$$ Дорого',
            PRICE_LEVEL_VERY_EXPENSIVE: '$$$$ Премиум',
          },
        };
        const PRICE_LEVEL_LABELS = PRICE_LEVEL_BY_LANG[lang];

        try {
          const searchPromises = bucketsToSearch.map(async (bucket) => {
            const meta = STORE_QUERIES[bucket];
            const useUserQueryInPlaces =
              Boolean(trimmedQuery) &&
              (storeType === bucket ||
                bucket === 'juegos_comida' ||
                (!isGamesQuery && mode === 'salidas'));
            const baseTopic = useUserQueryInPlaces ? `${trimmedQuery} ${meta.query}` : meta.query;
            const locationTextForPlaces = resolvedCity || cityBias.cityForSearch;
            const queryText =
              !hasCoords && locationTextForPlaces
                ? `${baseTopic} ${locationTextForPlaces}`
                : baseTopic;

            const pageSize =
              bucketsToSearch.length === 1
                ? 10
                : isGamesQuery && bucket === 'juegos_comida'
                  ? 8
                  : 4;

            const body: Record<string, unknown> = {
              textQuery: queryText,
              languageCode: mapsLang,
              pageSize,
            };

            if (cityBias.countryCode && /^[A-Z]{2}$/.test(cityBias.countryCode)) {
              body.regionCode = cityBias.countryCode;
            }

            if (openNowOnly) {
              body.openNow = true;
            }

            if (centerCoords) {
              body.locationBias = {
                circle: {
                  center: {
                    latitude: centerCoords.lat,
                    longitude: centerCoords.lng,
                  },
                  radius: 10000.0,
                },
              };
            }

            const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': mapsKey,
                'X-Goog-FieldMask': fieldMask,
                'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
              },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(8500),
            });

            const data = (await placesRes.json()) as {
              places?: RawPlace[];
              error?: { status?: string; message?: string };
            };

            if (placesRes.status === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') {
              throw { quotaExceeded: true, message: data.error?.message || 'Quota exceeded' };
            }

            if (!placesRes.ok) {
              throw new Error(data.error?.message || `Places API HTTP ${placesRes.status}`);
            }

            return (data.places || []).map((place) => ({
              bucket,
              bucketLabel: meta.label,
              place,
            }));
          });

          const nested = await Promise.all(searchPromises);
          const flat = nested.flat();

          if (!resolvedCity && flat.length > 0) {
            for (const entry of flat) {
              const fromPlace = extractCityFromComponents(entry.place.addressComponents);
              if (fromPlace) {
                resolvedCity = fromPlace;
                break;
              }
            }
          }

          const seenIds = new Set<string>();
          const normalizedPlaces: NormalizedPlace[] = sortNormalizedPlaces(
            flat
              .filter(({ place }) => {
                if (!place.id || seenIds.has(place.id)) return false;
                seenIds.add(place.id);
                return true;
              })
              .map(({ bucket, bucketLabel, place }) => {
                const pLat = place.location?.latitude;
                const pLng = place.location?.longitude;
                const distanceMeters =
                  centerCoords && typeof pLat === 'number' && typeof pLng === 'number'
                    ? haversineMeters(centerCoords.lat, centerCoords.lng, pLat, pLng)
                    : null;

                if (!centerCoords && typeof pLat === 'number' && typeof pLng === 'number') {
                  centerCoords = { lat: pLat, lng: pLng };
                }

                const startUnits = place.priceRange?.startPrice?.units
                  ? Number(place.priceRange.startPrice.units)
                  : null;
                const endUnits = place.priceRange?.endPrice?.units
                  ? Number(place.priceRange.endPrice.units)
                  : null;

                return {
                  id: place.id,
                  name: place.displayName?.text || errMsgs.defaultStoreName,
                  storeType: bucket,
                  storeTypeLabel: place.primaryTypeDisplayName?.text || bucketLabel,
                  address: place.shortFormattedAddress || place.formattedAddress || '',
                  lat: pLat ?? null,
                  lng: pLng ?? null,
                  distanceMeters,
                  rating: place.rating ?? null,
                  userRatingCount: place.userRatingCount ?? null,
                  openNow: place.currentOpeningHours?.openNow ?? null,
                  priceLevelLabel: place.priceLevel
                    ? PRICE_LEVEL_LABELS[place.priceLevel] || null
                    : null,
                  priceRange:
                    startUnits !== null || endUnits !== null
                      ? {
                          currencyCode:
                            place.priceRange?.startPrice?.currencyCode ||
                            place.priceRange?.endPrice?.currencyCode ||
                            'ARS',
                          startUnits: Number.isFinite(startUnits) ? startUnits : null,
                          endUnits: Number.isFinite(endUnits) ? endUnits : null,
                        }
                      : null,
                  googleMapsUri:
                    place.googleMapsUri ||
                    (typeof pLat === 'number' && typeof pLng === 'number'
                      ? `https://www.google.com/maps/search/?api=1&query=${pLat},${pLng}&query_place_id=${encodeURIComponent(place.id)}`
                      : ''),
                  websiteUri: place.websiteUri || null,
                };
              })
          );

          const inRegionPlaces = centerCoords
            ? normalizedPlaces.filter(
                (p) => p.distanceMeters === null || p.distanceMeters <= 85000
              )
            : normalizedPlaces;
          const finalPlaces = inRegionPlaces.length > 0 ? inRegionPlaces : normalizedPlaces;

          if (finalPlaces.length > 0) {
            const displayCity = resolvedCity || errMsgs.defaultArea;
            res.json({
              city: displayCity,
              center: centerCoords,
              places: finalPlaces,
              provider: 'google',
              fallbackMapsSearchUrl: buildGoogleMapsSearchUrl(displayCity),
              fallbackOsmSearchUrl: buildOsmSearchUrl(displayCity),
            });
            return;
          }
        } catch (error) {
          const errObj = error as { quotaExceeded?: boolean };
          if (errObj?.quotaExceeded) {
            googleQuotaExceeded = true;
          }
          // Fall through seamlessly to OpenStreetMap fallback
        }
      }
    }

    // Backup via OpenStreetMap (Nominatim + Overpass) & Direct Google Maps / OSM Search Links
    try {
      const osmResult = await searchWithOpenStreetMap();
      const displayCity = osmResult.city || resolvedCity || trimmedCity || errMsgs.defaultArea;
      res.json({
        city: displayCity,
        center: osmResult.center || centerCoords,
        places: osmResult.places,
        provider: osmResult.places.length > 0 ? 'osm' : 'fallback_links',
        fallbackMapsSearchUrl: buildGoogleMapsSearchUrl(displayCity),
        fallbackOsmSearchUrl: buildOsmSearchUrl(displayCity),
        ...(googleQuotaExceeded ? { quotaExceeded: true } : {}),
      });
    } catch {
      const displayCity = resolvedCity || trimmedCity || errMsgs.defaultArea;
      res.json({
        city: displayCity,
        center: centerCoords,
        places: [],
        provider: 'fallback_links',
        fallbackMapsSearchUrl: buildGoogleMapsSearchUrl(displayCity),
        fallbackOsmSearchUrl: buildOsmSearchUrl(displayCity),
        ...(googleQuotaExceeded ? { quotaExceeded: true } : {}),
      });
    }
  });

  app.post('/api/search-offers', async (req, res) => {
    const {
      city,
      mode = 'all',
      productCategory = 'all',
      storeType = 'all',
      customQuery = '',
      nearbyStoreNames = [],
      venues = [],
      language,
    } = req.body as {
      city?: string;
      mode?: 'all' | 'salidas' | 'compras';
      productCategory?: 'all' | 'carnes' | 'refrescos' | 'helados' | 'panificados';
      storeType?:
        | 'all'
        | 'carniceria'
        | 'panaderia'
        | 'supermercado'
        | 'heladeria'
        | 'restaurante'
        | 'restobar'
        | 'juegos_comida';
      customQuery?: string;
      nearbyStoreNames?: string[];
      venues?: Array<{ id: string; name: string; storeType: string; address?: string }>;
      language?: string;
    };

    const lang = resolveLanguage(language);
    const errMsgs = SERVER_ERRORS[lang];
    const outputLangName = PROMPT_LANG_LABEL[lang];

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: errMsgs.geminiMissingOffers,
      });
      return;
    }

    const cityBias = await resolveCitySearchGlobal(city || '', MAPS_LANG_BY_CODE[lang]);
    const targetCity = cityBias.cityForSearch || (city || '').trim() || 'Buenos Aires';

    const PRODUCT_LABELS: Record<string, string> = {
      all: 'meat cuts for barbecue/grill, soft drinks/sodas, ice cream, and bread/pastries',
      carnes: 'meat cuts (steak, ribs, sausages, grill cuts)',
      refrescos: 'soft drinks, sodas, flavored water, and beverages',
      helados: 'ice cream tubs, per-kilo offers, and 2-for-1 ice cream promotions',
      panificados: 'bakery bread, artisan loaves, pastries, and burger/sandwich buns',
    };

    const STORE_LABELS: Record<string, string> = {
      all:
        mode === 'salidas'
          ? 'restaurants, restobars, gastropubs, game bars (pool, bowling, arcade) and group dining venues'
          : 'butcher shops, bakeries, supermarkets, ice cream shops, restaurants, and game bars',
      restaurante: 'restaurants, steakhouses, and group dining venues',
      restobar: 'restobars, gastropubs, burger bars, craft beer & happy hour spots',
      juegos_comida: 'pool halls, bowling alleys, arcade bars, and game + dining venues for groups',
      carniceria: 'butcher shops and meat markets',
      panaderia: 'bakeries and pastry shops',
      supermercado: 'supermarkets and wholesalers',
      heladeria: 'ice cream shops',
    };

    const venueList = Array.isArray(venues) && venues.length > 0
      ? venues.slice(0, 10)
      : (Array.isArray(nearbyStoreNames) ? nearbyStoreNames.slice(0, 8) : []).map((name, idx) => ({
          id: `v-${idx}`,
          name,
          storeType,
          address: '',
        }));

    const venueListText =
      venueList.length > 0
        ? `\nReal venues detected in ${targetCity}:\n${venueList
            .map((v) => `- ${v.name} (${v.storeType}${v.address ? `, ${v.address}` : ''})`)
            .join('\n')}`
        : '';

    const trimmedCustomQuery = customQuery.trim();
    const userFilter = trimmedCustomQuery
      ? `\nPrimary user search query: "${trimmedCustomQuery}". Prioritize deals, rates, and venues matching this search!`
      : '';

    const isSalidasFocus =
      mode === 'salidas' ||
      storeType === 'restaurante' ||
      storeType === 'restobar' ||
      storeType === 'juegos_comida';

    const isGameOfferFocus =
      storeType === 'juegos_comida' ||
      /\b(pool|billar|billiards|arcade|bowling|boliche|fichas?|metegol|flipper|ping\s*pong|juegos?|games?|snooker|dardos|fichines)\b/i.test(
        trimmedCustomQuery
      );

    const poolArcadeInstruction = isGameOfferFocus
      ? `\nSpecific Pool & Arcade Game Offers Search Strategy for ${targetCity}:
- Search specifically for game promos & tariffs matching "${trimmedCustomQuery || 'pool, arcade, bowling, juegos'}" in ${targetCity} and at the listed venues above:
  * Pool/Billiards: hourly table price, half-hour or per-game rate, 2-for-1 / happy hour table promos, weekday discounts, and "pool + drinks/food" combos.
  * Arcades: token or game-card prices, bonus credit recharge promos (e.g., load X get Y bonus, 2x1 on games), timed unlimited-play passes, and group/birthday packages.
  * Bowling / other queried games: lane/hour prices, group combos.
- Populate "gameOffers" with concrete game promotions/combos/happy-hour discounts found for each venue, and "gamePrices" with published numeric tariffs (or clear game list + on-site pricing note if no rate is online).`
      : '';

    const offerPrompt = isSalidasFocus
      ? `Search the web for current information in ${targetCity} about dining deals (daily menus, happy hour, 2-for-1 deals, bank or digital wallet discounts) and game deals/prices (pool tables per hour/match, arcade tokens/cards/bonus promos, bowling, board games) for ${STORE_LABELS[storeType] || STORE_LABELS.all}.${userFilter}${venueListText}${poolArcadeInstruction}

IMPORTANT: Write all human-readable text fields ("citySummaryMarkdown", "foodOffers", "gameOffers", "gamePrices", "priceNote") strictly in ${outputLangName}.
Respond ONLY with a valid JSON object (no surrounding prose or code fences) matching this exact schema:
{
  "citySummaryMarkdown": "Structured markdown summary in ${outputLangName} tailored to the search (${trimmedCustomQuery || STORE_LABELS[storeType] || 'hangouts & games'}), with ## sections and bullet points of food deals, pool/arcade promotions, and published game rates in ${targetCity}",
  "venues": [
    {
      "name": "Exact name of one of the venues listed above if info was found",
      "foodOffers": ["Food or drink deal/combo found on the web, written in ${outputLangName}"],
      "hasGames": true,
      "gameOffers": ["Pool, arcade, or bowling deal/promo/happy-hour/combo found for this venue or matching search, written in ${outputLangName}"],
      "gamePrices": ["Published game rate found (e.g. Pool $X/hour, Arcade card/token $Y) or note of available games if tariff is confirmed on-site, written in ${outputLangName}"],
      "estimatedFoodPerPerson": null,
      "estimatedGamePerSession": null,
      "priceNote": "Brief reference or source note in ${outputLangName}"
    }
  ]
}

Strict rules:
1. Base both citySummaryMarkdown and venue details directly on the user's search ("${trimmedCustomQuery || storeType}") and the listed venues in ${targetCity}.
2. DO NOT invent prices or promotions. If Google Search does not return an exact published numeric price for a venue or game, leave estimatedFoodPerPerson and/or estimatedGamePerSession as null and explain clearly in priceNote or gamePrices.
3. If a venue on the list mentions pool tables, arcades, bowling, or games without an online rate, set hasGames: true and state in gamePrices which games it offers and that rates are confirmed on-site.`
      : `Search the web for current deals, supermarket promotions, bank or digital wallet discounts, and promotional prices in ${targetCity} for buying ${PRODUCT_LABELS[productCategory] || PRODUCT_LABELS.all} at ${STORE_LABELS[storeType] || STORE_LABELS.all}.${userFilter}${venueListText}

IMPORTANT: Write all human-readable text fields ("citySummaryMarkdown", "foodOffers", "gameOffers", "gamePrices", "priceNote") strictly in ${outputLangName}.
Respond ONLY with a valid JSON object (no surrounding prose or code fences) matching this exact schema:
{
  "citySummaryMarkdown": "Structured summary in ${outputLangName} using ## headings and concrete bullet points (store/chain, active promo or discount, valid days and cap if applicable)",
  "venues": [
    {
      "name": "Exact name of one of the stores listed above if a deal was found",
      "foodOffers": ["Active promo or applicable bank discount, written in ${outputLangName}"],
      "hasGames": false,
      "gameOffers": [],
      "gamePrices": [],
      "estimatedFoodPerPerson": null,
      "estimatedGamePerSession": null,
      "priceNote": ""
    }
  ]
}

Strict rule: Do not invent stores or prices if they do not appear in the web search; if for a category you only find national chains or bank promos valid in ${targetCity}, state that in citySummaryMarkdown.`;

    interface VenueEnrichment {
      name: string;
      foodOffers: string[];
      hasGames: boolean;
      gameOffers: string[];
      gamePrices: string[];
      estimatedFoodPerPerson: number | null;
      estimatedGamePerSession: number | null;
      priceNote: string;
    }

    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: offerPrompt,
          config: {
            tools: [{ googleSearch: {} }],
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (primaryErr) {
        const errMsg = String((primaryErr as { message?: string })?.message || '');
        const errStatus = (primaryErr as { status?: number })?.status;
        if (
          errStatus === 429 ||
          errStatus === 503 ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand')
        ) {
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: offerPrompt,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
        } else {
          throw primaryErr;
        }
      }

      const rawText = (response.text ?? '').trim();
      let markdown = rawText;
      let venueEnrichments: VenueEnrichment[] = [];

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as {
            citySummaryMarkdown?: string;
            venues?: VenueEnrichment[];
          };
          if (typeof parsed.citySummaryMarkdown === 'string' && parsed.citySummaryMarkdown.trim()) {
            markdown = parsed.citySummaryMarkdown.trim();
          }
          if (Array.isArray(parsed.venues)) {
            venueEnrichments = parsed.venues.map((v) => ({
              name: String(v.name || '').trim(),
              foodOffers: Array.isArray(v.foodOffers) ? v.foodOffers.map(String).filter(Boolean) : [],
              hasGames: Boolean(v.hasGames),
              gameOffers: Array.isArray(v.gameOffers) ? v.gameOffers.map(String).filter(Boolean) : [],
              gamePrices: Array.isArray(v.gamePrices) ? v.gamePrices.map(String).filter(Boolean) : [],
              estimatedFoodPerPerson:
                typeof v.estimatedFoodPerPerson === 'number' && Number.isFinite(v.estimatedFoodPerPerson)
                  ? Math.round(v.estimatedFoodPerPerson)
                  : null,
              estimatedGamePerSession:
                typeof v.estimatedGamePerSession === 'number' && Number.isFinite(v.estimatedGamePerSession)
                  ? Math.round(v.estimatedGamePerSession)
                  : null,
              priceNote: String(v.priceNote || '').trim(),
            }));
          }
        } catch {
          // Keep rawText as markdown fallback when model emits prose
        }
      }

      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const seenUris = new Set<string>();
      const sources: { title: string; uri: string }[] = [];

      for (const chunk of groundingChunks) {
        const web = (chunk as { web?: { uri?: string; title?: string } }).web;
        if (web?.uri && !seenUris.has(web.uri)) {
          seenUris.add(web.uri);
          sources.push({
            title: web.title || web.uri,
            uri: web.uri,
          });
        }
      }

      res.json({
        city: targetCity,
        markdown,
        venueEnrichments,
        sources: sources.slice(0, 10),
      });
    } catch (error) {
      const mapped = mapGeminiError(error, lang);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CuentasClaras server listening on http://localhost:${PORT}`);
  });
}

startServer();
