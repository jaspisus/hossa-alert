# hossa-alert

Sends a Telegram message when a new apartment appears in a [hossa.gda.pl](https://www.hossa.gda.pl) search, and when one disappears from it (sold, reserved, or no longer matching the filters).

It runs as a single Docker container, next to `winter-tire-alert`, and uses the same Telegram bot.

## How it works

1. Every `CHECK_INTERVAL_MIN` minutes (default 15) the app takes the filters from the `#fragment` of `SEARCH_URL` and asks the site's JSON API for the results: `https://www.hossa.gda.pl/api/apartments/?<filters>&page=N`. That's the same request the search page makes in the browser. It fetches every page.
2. Apartments are matched by their number (e.g. `CCW/B2/11`) against the saved state:
   - **new number** → reported right away;
   - **missing number** → reported only after **2 checks in a row** without it, so a one-off glitch on the site doesn't send a false "gone" + "new" pair;
   - a number that comes back after being reported as gone is reported as new again.
3. On the very first run the app sends one summary of all apartments that currently match.
4. The state is saved only after Telegram confirms the message, so a failed send is retried at the next check. If the site is down or returns something unexpected, the check fails and nothing changes.

## Configuration (`.env`)

```sh
cp .env.example .env
nano .env
chmod 600 .env   # the file contains the bot token
```

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | required | Bot token from @BotFather (the bot shared with winter-tire-alert) |
| `TELEGRAM_CHAT_ID` | required | Target chat id |
| `SEARCH_URL` | Centrum Chwarzno-Wiczlino, 4 rooms, floors 0–3, 30–80 m², available | Search page URL copied from the browser after setting the filters. Everything after `#` is used. |
| `CHECK_INTERVAL_MIN` | `15` | Minutes between checks (5–1440) |
| `STATE_FILE` | `data/state.json` (`/data/state.json` in the image) | Where the known apartments are saved |

To change the filters, run the search on the site, copy the URL into `SEARCH_URL`, then reset the state (see below). Otherwise the change shows up as a burst of "new" and "gone" apartments.

## Run

```sh
docker compose run --rm hossa-alert node src/main.ts --once --dry-run   # one check, prints the message, sends and saves nothing
docker compose up -d --build
docker compose logs -f
```

| Task | Command (run in `~/hossa-alert`) |
|---|---|
| Status / logs | `docker compose ps` / `docker compose logs -f` |
| One-off check | `docker compose exec hossa-alert node src/main.ts --once --dry-run` |
| Change settings | edit `.env`, then `docker compose up -d` |
| Reset state (sends the first-run summary again) | `docker compose down -v && docker compose up -d` |
| Stop / uninstall | `docker compose down` / `docker compose down -v --rmi local` |

## Development

Node.js 24 runs the TypeScript directly; there is no build step and there are no runtime dependencies. Without Node on the host, run everything in a container:

```sh
docker run --rm -v "$PWD":/app:ro -w /app node:24-slim npm test
docker run --rm -v "$PWD":/app -w /app -e STATE_FILE=/tmp/state.json node:24-slim node src/main.ts --once --dry-run
```

`npm run typecheck` needs `npm install` (typescript, @types/node) first.
