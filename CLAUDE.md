# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Telegram alert when a new apartment number appears in a hossa.gda.pl search, or one disappears from it. One Docker container, checking every `CHECK_INTERVAL_MIN` (15) minutes. Usage and operation are in `README.md`. Stack and conventions are deliberately the same as `../winter-tire-alert/` (`telegram.ts` and the `state.ts` pattern are copied from there).

## Commands

There is no Node on the host; use a container:

```sh
docker run --rm -v "$PWD":/app:ro -w /app node:24-slim npm test
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app node:24-slim sh -c 'npm install && npm run typecheck'
docker run --rm -v "$PWD":/app -w /app -e STATE_FILE=/tmp/state.json node:24-slim node src/main.ts --once --dry-run
docker compose logs -f                # the deployed service
```

## Technical constraints

- Node 24 runs `.ts` directly: relative imports end in `.ts`, `import type` for types, erasable syntax only (no `enum`, `namespace`, parameter properties).
- No runtime dependencies (built-in `fetch`, `node:test`, `Intl`). The `Dockerfile` copies only `package.json` and `src/`.

## Architecture

- Data source: `https://www.hossa.gda.pl/api/apartments/` (found in the site's Vue bundle). The search page's `#fragment` is passed unchanged as the query; the server applies the filters. 25 per page, follow `meta.last_page`. Apartment key: `number`.
- `config.ts` → `parseSearchUrl()` takes the filters from `SEARCH_URL`. `hossa.ts` → `parsePage()` validates the response strictly and throws on any odd shape, so an outage never looks like "everything is gone".
- `diff.ts` (pure, main test target): a new number → `added`. A missing number → `missedChecks++`, and it's reported as `removed` only at `MISSES_TO_REMOVE` (2) misses in a row.
- `main.ts`: no state file → one first-run summary. The state is written only after a successful Telegram send (or when there are no changes but the data or miss counters changed). The state is re-read on every check.
- `messages.ts`: plain-text Polish messages, cut to Telegram's 4096-character limit.

## Conventions

- `.env` holds the bot token, which is **shared with winter-tire-alert**. Never read, print or edit it; the user edits it in their own terminal.
- Error messages must never include the api.telegram.org URL (it contains the token).
- When adding an environment variable, update `config.ts`, `.env.example` and the README table together.
