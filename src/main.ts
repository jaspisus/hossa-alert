import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { type Config, ConfigError, loadConfig } from './config.ts';
import { diffApartments, initialState } from './diff.ts';
import { fetchApartments } from './hossa.ts';
import { buildChangeMessage, buildInitialMessage } from './messages.ts';
import { readState, type State, writeState } from './state.ts';
import { sendMessage } from './telegram.ts';

const RETRY_DELAY_MS = 2 * 60 * 1000;

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);
const logError = (message: string, error: unknown) =>
  console.error(`${new Date().toISOString()} ${message}: ${error instanceof Error ? error.message : error}`);

/** Sends the message (unless dry run), then saves the state. A send failure throws before saving, so it's retried. */
async function deliver(config: Config, dryRun: boolean, text: string, next: State): Promise<void> {
  if (dryRun) {
    log(`[dry run] Would send and save state:\n${text}`);
    return;
  }
  await sendMessage(config.telegramBotToken, config.telegramChatId, text);
  await writeState(config.stateFile, next);
  log('Message sent, state saved');
}

async function runCheck(config: Config, dryRun: boolean): Promise<void> {
  const apartments = await fetchApartments(config.searchQuery);
  const now = new Date().toISOString();
  log(`Found ${apartments.length}: ${apartments.map((a) => a.number).join(', ') || '(none)'}`);

  // Re-read on every check, so a one-off `--once` run in a second container is picked up.
  const state = await readState(config.stateFile);
  if (!state) {
    log('No saved state yet, sending the first summary');
    await deliver(config, dryRun, buildInitialMessage(apartments, config.searchUrl), initialState(apartments, now));
    return;
  }

  const { added, removed, next } = diffApartments(state, apartments, now);
  const missing = Object.values(next.known).filter((k) => k.missedChecks > 0).map((k) => k.apartment.number);
  if (missing.length > 0) log(`Missing once, waiting for the next check before reporting: ${missing.join(', ')}`);

  if (added.length === 0 && removed.length === 0) {
    log('No changes');
    if (!dryRun && JSON.stringify(next) !== JSON.stringify(state)) await writeState(config.stateFile, next);
    return;
  }
  log(`New: ${added.map((a) => a.number).join(', ') || '-'}; gone: ${removed.map((a) => a.number).join(', ') || '-'}`);
  await deliver(config, dryRun, buildChangeMessage(added, removed, config.searchUrl), next);
}

async function runCheckWithRetry(config: Config, dryRun: boolean): Promise<void> {
  try {
    await runCheck(config, dryRun);
    return;
  } catch (error) {
    logError(`Check failed, retrying in ${RETRY_DELAY_MS / 60_000} minutes`, error);
  }
  await sleep(RETRY_DELAY_MS);
  try {
    await runCheck(config, dryRun);
  } catch (error) {
    logError('Retry failed, will try again at the next scheduled check', error);
  }
}

async function runScheduler(config: Config, dryRun: boolean): Promise<never> {
  const intervalMs = config.checkIntervalMin * 60 * 1000;
  for (;;) {
    const started = Date.now();
    await runCheckWithRetry(config, dryRun);
    const next = new Date(Math.max(Date.now(), started + intervalMs));
    log(`Next check at ${next.toISOString()}`);
    await sleep(next.getTime() - Date.now());
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      once: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const once = values.once;
  const dryRun = values['dry-run'];

  let config: Config;
  try {
    config = loadConfig(process.env, { requireTelegram: !dryRun });
  } catch (error) {
    logError(error instanceof ConfigError ? 'Configuration error' : 'Startup failed', error);
    process.exit(1);
  }

  log(
    `Starting${dryRun ? ' (dry run)' : ''}: every ${config.checkIntervalMin} min, ` +
      `search ${config.searchUrl}, state ${config.stateFile}`,
  );

  if (once) {
    try {
      await runCheck(config, dryRun);
    } catch (error) {
      logError('Check failed', error);
      process.exit(1);
    }
    return;
  }

  await runScheduler(config, dryRun);
}

// The container sends SIGTERM on `docker compose down`; Node as PID 1 would otherwise ignore it.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log(`Received ${signal}, exiting`);
    process.exit(0);
  });
}

await main();
