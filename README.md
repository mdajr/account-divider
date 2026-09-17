# account-divider

Split a savings balance into named buckets, then project it forward through the money you expect to
come in and go out.

**Live:** https://mdajr.github.io/account-divider/

- Enter your account balance, then add buckets with a name, amount, and optional note.
- **Unallocated** — the money not yet assigned — is the headline figure, alongside the running
  **Allocated** total.
- A stacked bar shows the split, with a dotted marker at the allocated total (and a second marker
  at the balance when you've over-allocated).
- Over-allocating is allowed on purpose: unallocated goes negative and turns red so you can
  reshuffle amounts freely while planning.
- Whole dollars only — no cents anywhere.
- Colors are auto-assigned and editable; double-click a swatch to reset it to the default.
- Everything is stored in your browser's localStorage. Use **Export JSON** to keep a backup or move
  data to another device.

## Planning forward

Give money a date and the **Timeline** grows a snapshot for that day — the same bar chart, drawn
against the cash you'd have on hand then. Snapshots run top to bottom, starting from Today.

- **Spend dates on buckets.** A bucket with a date is reserved right up to that day and then gone,
  along with the cash: put the bathroom renovation on 18 Jan 2027 and the 19th shows what's left.
  A bucket with **no** date is an open-ended reserve — an emergency fund is held in every snapshot,
  forever, because it never actually gets spent.
- **Cash deposits.** A known sum on a known day: a security deposit refund, a tax refund, a bonus.
- **RSU vests.** Ticker, units and the withholding rate, and the vest is valued at the latest share
  price less tax — so the number moves with the stock instead of being frozen at whatever you typed.

Each snapshot reports three figures: **on hand** (balance, plus everything deposited by that date,
minus everything spent by it), **reserved** (undated buckets plus dated ones not yet paid), and
**unallocated** (what's left over). Unallocated goes red when reservations outrun the cash, exactly
as it does for today.

Anything dated on or before today is treated as already settled and folded into the Today row,
since that money is presumably already in the balance you typed.

### Share prices

There is no backend to proxy through, so prices are fetched from the browser. The catch, established
by testing rather than assumed: **neither price source sends `Access-Control-Allow-Origin`.** Stooq's
`/q/l` endpoint answers 404 outright; its `/q/d/l` endpoint and Yahoo's chart API both answer
normally, but the browser refuses to let JavaScript read a reply that carries no CORS header. No
amount of client-side work changes that — it is the server's header, not the request.

So lookups go through a **public CORS relay**: a free service that fetches the upstream server-side
and re-serves the body with permissive headers. Three relays are crossed with two upstreams, tried in
order until one returns a price:

| | Stooq (`/q/d/l`, CSV) | Yahoo (`query1`, chart JSON) |
|---|---|---|
| **AllOrigins** | ✓ | ✓ |
| **CodeTabs** | ✓ | ✓ |
| **corsproxy.io** | ✓ | ✓ |

Whichever combination works is remembered for the session and tried first next time, so a dead
service costs one wasted request per reload rather than one per fetch.

**This means a third party sees every lookup** — which ticker, and that this browser asked. That is
the cost of having no backend. It is stated in the UI next to the switch that turns it off, and with
it off the app makes no outbound requests at all.

These relays are free services with no accountability: they rate-limit, break, and disappear. None of
them is load-bearing:

- **Test sources** runs all six combinations against one ticker and reports what each did:
  `HTTP 503` (the server answered and the browser let us read the status), `answered, but …` (a 200
  whose body wasn't a price — a relay error page, an unknown ticker), or `blocked — CORS or network`
  (`fetch` threw; this is a CORS refusal *or* a transport failure *or* an error response with no CORS
  headers, and the browser hides which, so only the Network tab shows the real status).
- A failed fetch leaves the last known price in place rather than blanking it.
- A vest with no price counts as $0 and is called out under the timeline, so it never quietly
  inflates a total.
- A price you type yourself is marked as yours and survives the automatic refresh; only the explicit
  Refresh button replaces it.
- Each price shows which relay and upstream supplied it, and when.

Prices refresh when the app opens if the cached one is over 15 minutes old.

## Data

`AppState` is versioned and validated on every load and import (`src/storage.ts`). Version 1 files —
buckets with no dates, no deposits — load and upgrade in place, with each existing bucket becoming an
open-ended reserve, which is what the app did before dates existed.

Amounts are whole-dollar integers, and the two quantities that genuinely need finer precision are
scaled integers too: share prices in cents, withholding rates in basis points. Nothing in the totals
is a float.

A cached price records `source` (`fetched` or `manual`) and `via` (which source supplied it). The
earlier single-source spelling, `source: 'stooq'`, migrates to `fetched` on load.

## Development

```sh
npm install
npm run dev      # http://localhost:5173/account-divider/
npm test         # vitest
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds, and publishes `dist/`
to GitHub Pages.

Two things this depends on:

- **Repo Settings → Pages → Source must be set to "GitHub Actions."** The workflow cannot set this
  itself; until it's set, the deploy job succeeds but nothing is published.
- **`vite.config.ts` sets `base: '/account-divider/'`** to match the repo name. If the repo is ever
  renamed, update it or every built asset 404s in production.
