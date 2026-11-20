export interface Apartment {
  /** Apartment number shown on the site, e.g. "CCW/B2/11". Unique key. */
  number: string;
  building: string | null;
  floor: number | null;
  rooms: number | null;
  areaUsable: number | null;
  price: number | null;
  /** Handover term, e.g. "2029-1". */
  availability: string | null;
}

export interface ApiPage {
  apartments: Apartment[];
  lastPage: number;
}

const API_URL = 'https://www.hossa.gda.pl/api/apartments/';
const REQUEST_TIMEOUT_MS = 20_000;
/** Safety cap: the site returns 25 apartments per page. */
const MAX_PAGES = 40;

export function apiUrl(searchQuery: string, page: number): string {
  const params = new URLSearchParams(searchQuery);
  params.set('page', String(page));
  return `${API_URL}?${params}`;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null;

/** Validates one page of the API response. Throws on anything unexpected, so an outage never looks like "no apartments". */
export function parsePage(body: unknown): ApiPage {
  const invalid = (reason: string) => new Error(`Unexpected Hossa API response: ${reason}`);
  if (typeof body !== 'object' || body === null) throw invalid('not an object');
  const { data, meta } = body as Record<string, unknown>;
  if (!Array.isArray(data)) throw invalid('"data" is not an array');
  const lastPage = (meta as Record<string, unknown> | undefined)?.last_page;
  if (typeof lastPage !== 'number' || !Number.isInteger(lastPage) || lastPage < 1) {
    throw invalid('"meta.last_page" is missing');
  }

  const apartments = data.map((item: unknown, index): Apartment => {
    const raw = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const number = toText(raw.number);
    if (!number) throw invalid(`item ${index} has no "number"`);
    return {
      number,
      building: toText(raw.building),
      floor: toNumber(raw.floor),
      rooms: toNumber(raw.rooms),
      areaUsable: toNumber(raw.area_usable),
      price: toNumber(raw.price),
      availability: toText(raw.availability),
    };
  });
  return { apartments, lastPage };
}

async function fetchPage(searchQuery: string, page: number): Promise<ApiPage> {
  const response = await fetch(apiUrl(searchQuery, page), {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; apartment-watch)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Hossa API page ${page} failed: HTTP ${response.status}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Hossa API page ${page} did not return JSON`);
  }
  return parsePage(body);
}

/** Fetches every page of the search results, deduplicated by apartment number, in the site's order. */
export async function fetchApartments(searchQuery: string): Promise<Apartment[]> {
  const first = await fetchPage(searchQuery, 1);
  if (first.lastPage > MAX_PAGES) {
    throw new Error(`Hossa API reports ${first.lastPage} pages; the search is too broad (limit ${MAX_PAGES})`);
  }
  const all = [...first.apartments];
  for (let page = 2; page <= first.lastPage; page++) {
    all.push(...(await fetchPage(searchQuery, page)).apartments);
  }
  const byNumber = new Map<string, Apartment>();
  for (const apartment of all) {
    if (!byNumber.has(apartment.number)) byNumber.set(apartment.number, apartment);
  }
  return [...byNumber.values()];
}
