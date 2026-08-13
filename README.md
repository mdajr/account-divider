# account-divider

Split a savings balance into named buckets and see what's left to allocate.

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

