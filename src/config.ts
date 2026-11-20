export interface Config {
  telegramBotToken: string;
  telegramChatId: string;
  /** The search page URL as copied from the browser; linked in every message. */
  searchUrl: string;
  /** API query string taken from the search URL's #fragment (filters and sorting). */
  searchQuery: string;
  checkIntervalMin: number;
  stateFile: string;
}

export class ConfigError extends Error {}

export const DEFAULT_SEARCH_URL =
  'https://www.hossa.gda.pl/centrum-chwarzno-wiczlino/wyniki-wyszukiwania/' +
  '#rooms[]=4&rooms[]=4&floor[]=0&floor[]=3&area_usable[]=30&area_usable[]=80' +
  '&inv=centrum-chwarzno-wiczlino&type=a&sort=-area_usable&a_status=dost%C4%99pny';

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readInteger(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max}, got "${raw}"`);
  }
  return value;
}

/**
 * Returns the search filters from a hossa.gda.pl search page URL. The site keeps them in the
 * #fragment and its own frontend sends them unchanged as the query of /api/apartments/.
 */
export function parseSearchUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`SEARCH_URL is not a valid URL: "${raw}"`);
  }
  if (url.hostname !== 'www.hossa.gda.pl' && url.hostname !== 'hossa.gda.pl') {
    throw new ConfigError(`SEARCH_URL must point to hossa.gda.pl, got "${url.hostname}"`);
  }
  const query = url.hash.replace(/^#/, '');
  if (!query) {
    throw new ConfigError('SEARCH_URL has no filters after "#". Copy the URL after running a search on the site.');
  }
  return query;
}

export function loadConfig(env: Env, options: { requireTelegram: boolean }): Config {
  const telegramBotToken = read(env, 'TELEGRAM_BOT_TOKEN') ?? '';
  const telegramChatId = read(env, 'TELEGRAM_CHAT_ID') ?? '';
  if (options.requireTelegram) {
    const missing = [
      !telegramBotToken && 'TELEGRAM_BOT_TOKEN',
      !telegramChatId && 'TELEGRAM_CHAT_ID',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new ConfigError(`Missing ${missing.join(' and ')} in .env (not needed with --dry-run).`);
    }
  }

  const searchUrl = read(env, 'SEARCH_URL') ?? DEFAULT_SEARCH_URL;
  return {
    telegramBotToken,
    telegramChatId,
    searchUrl,
    searchQuery: parseSearchUrl(searchUrl),
    checkIntervalMin: readInteger(env, 'CHECK_INTERVAL_MIN', 15, 5, 1440),
    stateFile: read(env, 'STATE_FILE') ?? 'data/state.json',
  };
}
