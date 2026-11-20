import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, DEFAULT_SEARCH_URL, loadConfig, parseSearchUrl } from '../src/config.ts';
import { apiUrl, parsePage } from '../src/hossa.ts';

describe('parseSearchUrl / apiUrl', () => {
  it('turns the #fragment of the search page into the API query', () => {
    const url = apiUrl(parseSearchUrl(DEFAULT_SEARCH_URL), 2);
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://www.hossa.gda.pl/api/apartments/');
    assert.deepEqual(parsed.searchParams.getAll('rooms[]'), ['4', '4']);
    assert.deepEqual(parsed.searchParams.getAll('area_usable[]'), ['30', '80']);
    assert.equal(parsed.searchParams.get('inv'), 'centrum-chwarzno-wiczlino');
    assert.equal(parsed.searchParams.get('a_status'), 'dostępny');
    assert.equal(parsed.searchParams.get('page'), '2');
    assert.match(url, /a_status=dost%C4%99pny/);
  });

  it('replaces an existing page parameter', () => {
    const parsed = new URL(apiUrl('inv=x&page=5', 1));
    assert.deepEqual(parsed.searchParams.getAll('page'), ['1']);
  });

  it('rejects URLs without filters or from another site', () => {
    assert.throws(() => parseSearchUrl('https://www.hossa.gda.pl/centrum-chwarzno-wiczlino/wyniki-wyszukiwania/'), ConfigError);
    assert.throws(() => parseSearchUrl('https://example.com/#inv=x'), ConfigError);
    assert.throws(() => parseSearchUrl('not a url'), ConfigError);
  });
});

describe('loadConfig', () => {
  it('uses defaults and requires Telegram only outside dry run', () => {
    const config = loadConfig({}, { requireTelegram: false });
    assert.equal(config.checkIntervalMin, 15);
    assert.equal(config.searchUrl, DEFAULT_SEARCH_URL);
    assert.throws(() => loadConfig({}, { requireTelegram: true }), /TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID/);
  });

  it('validates CHECK_INTERVAL_MIN', () => {
    assert.equal(loadConfig({ CHECK_INTERVAL_MIN: '30' }, { requireTelegram: false }).checkIntervalMin, 30);
    assert.throws(() => loadConfig({ CHECK_INTERVAL_MIN: '1' }, { requireTelegram: false }), ConfigError);
    assert.throws(() => loadConfig({ CHECK_INTERVAL_MIN: 'abc' }, { requireTelegram: false }), ConfigError);
  });
});

describe('parsePage', () => {
  const item = {
    id: 1,
    number: 'CCW/B2/11',
    building: 'B2',
    floor: 1,
    rooms: 4,
    area_usable: '74.84',
    price: '769569.56',
    availability: '2029-1',
  };

  it('maps API items to apartments', () => {
    const page = parsePage({ data: [item], meta: { last_page: 1 } });
    assert.equal(page.lastPage, 1);
    assert.deepEqual(page.apartments, [
      { number: 'CCW/B2/11', building: 'B2', floor: 1, rooms: 4, areaUsable: 74.84, price: 769569.56, availability: '2029-1' },
    ]);
  });

  it('keeps missing optional fields as null', () => {
    const [apartment] = parsePage({ data: [{ number: 'X/1', price: null, area_usable: '' }], meta: { last_page: 1 } }).apartments;
    assert.equal(apartment?.price, null);
    assert.equal(apartment?.areaUsable, null);
    assert.equal(apartment?.floor, null);
  });

  it('accepts an empty result', () => {
    assert.deepEqual(parsePage({ data: [], meta: { last_page: 1 } }).apartments, []);
  });

  it('throws on an unexpected shape instead of returning no apartments', () => {
    assert.throws(() => parsePage(null), /not an object/);
    assert.throws(() => parsePage({ data: {}, meta: { last_page: 1 } }), /"data"/);
    assert.throws(() => parsePage({ data: [] }), /last_page/);
    assert.throws(() => parsePage({ data: [{ id: 1 }], meta: { last_page: 1 } }), /no "number"/);
  });
});
