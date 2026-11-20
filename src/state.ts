import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Apartment } from './hossa.ts';

export interface KnownApartment {
  apartment: Apartment;
  firstSeen: string;
  /** Consecutive checks in which the apartment was missing from the results. */
  missedChecks: number;
}

export interface State {
  initializedAt: string;
  /** Keyed by apartment number. */
  known: Record<string, KnownApartment>;
}

function parseState(raw: string, file: string): State {
  const invalid = (reason: string) =>
    new Error(`Invalid state file ${file}: ${reason}. Reset it as described in the README.`);

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw invalid('not valid JSON');
  }
  if (typeof data !== 'object' || data === null) throw invalid('not an object');

  const { initializedAt, known } = data as Record<string, unknown>;
  if (typeof initializedAt !== 'string') throw invalid('initializedAt must be a string');
  if (typeof known !== 'object' || known === null || Array.isArray(known)) throw invalid('known must be an object');

  const result: State = { initializedAt, known: {} };
  for (const [number, value] of Object.entries(known)) {
    const entry = value as Partial<KnownApartment> | null;
    if (typeof entry?.apartment?.number !== 'string' || typeof entry.firstSeen !== 'string') {
      throw invalid(`entry "${number}" must have apartment.number and firstSeen`);
    }
    result.known[number] = {
      apartment: entry.apartment,
      firstSeen: entry.firstSeen,
      missedChecks: typeof entry.missedChecks === 'number' ? entry.missedChecks : 0,
    };
  }
  return result;
}

/** Returns null when there is no state file yet. */
export async function readState(file: string): Promise<State | null> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return parseState(raw, file);
}

export async function writeState(file: string, state: State): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  // Write to a temporary file first so a crash never leaves a half-written state file.
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}
