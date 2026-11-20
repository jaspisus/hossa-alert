import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Apartment } from '../src/hossa.ts';
import { buildChangeMessage, buildInitialMessage, formatApartment, MAX_MESSAGE_LENGTH } from '../src/messages.ts';

const url = 'https://www.hossa.gda.pl/x/#inv=x';
const apt = (number: string, overrides: Partial<Apartment> = {}): Apartment => ({
  number,
  building: 'B2',
  floor: 1,
  rooms: 4,
  areaUsable: 74.84,
  price: 769569.56,
  availability: '2029-1',
  ...overrides,
});

// pl-PL uses a no-break space as the thousands separator.
const normalize = (text: string) => text.replace(/[  ]/g, ' ');

describe('formatApartment', () => {
  it('formats all fields in Polish', () => {
    assert.equal(
      normalize(formatApartment(apt('CCW/B2/11'))),
      'CCW/B2/11 · bud. B2 · piętro 1 · 4 pok. · 74,84 m² · 769 570 zł · odbiór 2029-1',
    );
  });

  it('shows the ground floor as "parter" and skips missing fields', () => {
    const text = formatApartment(apt('X/1', { floor: 0, building: null, price: null, availability: null }));
    assert.equal(normalize(text), 'X/1 · parter · 4 pok. · 74,84 m²');
  });
});

describe('messages', () => {
  it('lists the current apartments on the first run', () => {
    const text = buildInitialMessage([apt('A/1'), apt('A/2')], url);
    assert.match(text, /Pasujące mieszkania \(2\)/);
    assert.match(text, /A\/1/);
    assert.ok(text.endsWith(url));
  });

  it('says so when nothing matches on the first run', () => {
    assert.match(buildInitialMessage([], url), /nic nie pasuje/);
  });

  it('lists only the sections that changed', () => {
    const addedOnly = buildChangeMessage([apt('A/3')], [], url);
    assert.match(addedOnly, /Nowe w wynikach \(1\):\nA\/3/);
    assert.doesNotMatch(addedOnly, /Zniknęły/);

    const both = buildChangeMessage([apt('A/3')], [apt('A/1')], url);
    assert.match(both, /Zniknęły z wyników \(1\):\nA\/1/);
  });

  it('cuts long lists to fit one Telegram message', () => {
    const many = Array.from({ length: 200 }, (_, i) => apt(`CCW/B${i}/${i}`));
    const text = buildChangeMessage(many, many.slice(0, 20), url);
    assert.ok(text.length <= MAX_MESSAGE_LENGTH);
    assert.match(text, /…i \d+ więcej/);
    assert.ok(text.endsWith(url));
  });
});
