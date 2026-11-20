import type { Apartment } from './hossa.ts';
import type { KnownApartment, State } from './state.ts';

/**
 * An apartment counts as gone only after it is missing from this many checks in a row,
 * so a one-off glitch on the site doesn't send a "gone" + "new" pair.
 */
export const MISSES_TO_REMOVE = 2;

export interface Diff {
  added: Apartment[];
  removed: Apartment[];
  next: State;
}

export function initialState(current: Apartment[], now: string): State {
  const known: Record<string, KnownApartment> = {};
  for (const apartment of current) known[apartment.number] = { apartment, firstSeen: now, missedChecks: 0 };
  return { initializedAt: now, known };
}

export function diffApartments(state: State, current: Apartment[], now: string): Diff {
  const added: Apartment[] = [];
  const removed: Apartment[] = [];
  const known: Record<string, KnownApartment> = {};
  const present = new Set<string>();

  for (const apartment of current) {
    present.add(apartment.number);
    const previous = state.known[apartment.number];
    if (previous) {
      // Still listed: refresh its data (e.g. price) and reset the miss counter.
      known[apartment.number] = { apartment, firstSeen: previous.firstSeen, missedChecks: 0 };
    } else {
      added.push(apartment);
      known[apartment.number] = { apartment, firstSeen: now, missedChecks: 0 };
    }
  }

  for (const [number, entry] of Object.entries(state.known)) {
    if (present.has(number)) continue;
    const missedChecks = entry.missedChecks + 1;
    if (missedChecks >= MISSES_TO_REMOVE) {
      removed.push(entry.apartment);
    } else {
      known[number] = { ...entry, missedChecks };
    }
  }

  removed.sort((a, b) => a.number.localeCompare(b.number, 'pl', { numeric: true }));
  return { added, removed, next: { initializedAt: state.initializedAt, known } };
}
