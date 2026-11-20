import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffApartments, initialState, MISSES_TO_REMOVE } from '../src/diff.ts';
import type { Apartment } from '../src/hossa.ts';

const apt = (number: string, price = 500000): Apartment => ({
  number,
  building: 'B1',
  floor: 1,
  rooms: 4,
  areaUsable: 70,
  price,
  availability: '2029-1',
});

const numbers = (list: Apartment[]) => list.map((a) => a.number);

describe('diffApartments', () => {
  const start = initialState([apt('A/1'), apt('A/2')], 't0');

  it('reports nothing when the results are unchanged', () => {
    const { added, removed, next } = diffApartments(start, [apt('A/1'), apt('A/2')], 't1');
    assert.deepEqual(added, []);
    assert.deepEqual(removed, []);
    assert.deepEqual(next, start);
  });

  it('reports a new number', () => {
    const { added, next } = diffApartments(start, [apt('A/1'), apt('A/2'), apt('A/3')], 't1');
    assert.deepEqual(numbers(added), ['A/3']);
    assert.equal(next.known['A/3']?.firstSeen, 't1');
  });

  it(`reports a missing number only after ${MISSES_TO_REMOVE} checks in a row`, () => {
    const first = diffApartments(start, [apt('A/1')], 't1');
    assert.deepEqual(first.removed, []);
    assert.equal(first.next.known['A/2']?.missedChecks, 1);

    const second = diffApartments(first.next, [apt('A/1')], 't2');
    assert.deepEqual(numbers(second.removed), ['A/2']);
    assert.equal(second.next.known['A/2'], undefined);
  });

  it('resets the miss counter when the number comes back in time', () => {
    const missed = diffApartments(start, [apt('A/1')], 't1').next;
    const back = diffApartments(missed, [apt('A/1'), apt('A/2')], 't2');
    assert.deepEqual(back.added, []);
    assert.equal(back.next.known['A/2']?.missedChecks, 0);
    assert.equal(back.next.known['A/2']?.firstSeen, 't0');
  });

  it('reports a removed number as new when it returns later', () => {
    const once = diffApartments(start, [apt('A/1')], 't1').next;
    const gone = diffApartments(once, [apt('A/1')], 't2').next;
    const { added } = diffApartments(gone, [apt('A/1'), apt('A/2')], 't3');
    assert.deepEqual(numbers(added), ['A/2']);
  });

  it('refreshes data of listed apartments without reporting them', () => {
    const { added, next } = diffApartments(start, [apt('A/1', 600000), apt('A/2')], 't1');
    assert.deepEqual(added, []);
    assert.equal(next.known['A/1']?.apartment.price, 600000);
  });

  it('handles an empty start and an empty result', () => {
    const empty = initialState([], 't0');
    assert.deepEqual(numbers(diffApartments(empty, [apt('A/1')], 't1').added), ['A/1']);
    assert.deepEqual(diffApartments(empty, [], 't1').next.known, {});
  });
});
