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

Prices come from [stooq.com](https://stooq.com)'s CSV endpoint — no API key, no account, and
permissive CORS, which is what a site with no backend needs. They're delayed, which is fine for
"roughly what will this be worth" and useless for trading.

Every failure path falls back to typing a price in by hand:

- Prices refresh when the app opens if the cached one is over 15 minutes old, and **Refresh prices**
  re-fetches everything on demand.
- A price you type yourself is marked as yours and survives the automatic refresh; only the explicit
  Refresh button replaces it.
- A failed fetch leaves the last known price in place rather than blanking it. A vest with no price
  at all counts as $0 and is called out under the timeline, so it never quietly inflates a total.

## Data

`AppState` is versioned and validated on every load and import (`src/storage.ts`). Version 1 files —
buckets with no dates, no deposits — load and upgrade in place, with each existing bucket becoming an
open-ended reserve, which is what the app did before dates existed.

Amounts are whole-dollar integers, and the two quantities that genuinely need finer precision are
scaled integers too: share prices in cents, withholding rates in basis points. Nothing in the totals
is a float.

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
