# tastr

> `// your movie profile, read from your data.`

**tastr** turns a watch-history export (Trakt, Letterboxd, or Bingers) into a full
taste profile: who directs the films you love, which genres and decades you
actually watch, how far you got with each series you started, how you compare to the
crowd, a Spotify-Wrapped-style yearly recap, and a suggestions engine that recommends
what to watch next — and what to watch to fill the gaps in your taste.

Everything runs **local-first**: your import never leaves the browser. It's parsed
client-side, cached in `localStorage`/IndexedDB, and the only server-side call the
app makes on your behalf is proxying [TMDB](https://www.themoviedb.org/) requests
(so your TMDB API key isn't exposed to the browser).

## Features

### Import
Drop the `.zip` export from one of three supported services and tastr detects the
format automatically:

| Source | What's read |
|---|---|
| **Letterboxd** | `diary.csv` / `watched.csv` (+ `ratings.csv` if present) — films only |
| **Trakt** | the JSON export (movie *and* episode history, show and episode ratings) |
| **Bingers** | `watches.csv` (+ `ratings.csv` if present), movies and episodes |

Rewatches, ratings, and watch dates are normalized into a single internal format
regardless of source. Episodes keep their season and episode number, so the series
section can tell ten episodes apart from one episode watched ten times. Everything is
stored in the browser — nothing is uploaded to a server.

### Dashboard
- **Top 10 directors and actors**, ranked by a custom affinity score that combines
  how much you've watched someone with how far above your personal average you rate
  them, with Bayesian shrinkage so two five-star films can't outrank a director
  you've followed for a decade.
- **Charts by decade and by genre**, with a "you vs. the crowd" mode comparing your
  ratings against TMDB's public average.

### Series
Television counted the way television works — in episodes, not titles. A show is one
row but sixty viewings, so nothing here reuses the film maths:

- **How far you got** with everything you started: episodes seen against episodes
  aired, and a status that follows from it — *finished*, *in progress*, *dropped*
  (left unfinished for over a year) or *sampled* (three episodes or fewer).
- **Time actually spent**, episodes × runtime, rewatches included.
- **A devotion score** — `log₂(1 + episodes) × quality × completion` — where quality is
  the same Bayesian-shrunk distance from your own average used for directors, except a
  rating on the *series* counts as three episode ratings, because it judges the whole
  thing rather than one instalment.
- **Genres ranked by episodes watched**, not by number of shows: two long-runners
  outweigh six miniseries, which a count of titles gets backwards.
- **Top creators and actors**, weighted by the episodes you watched *them* in — a
  recurring lead and a guest star are not the same credit, a distinction that billing
  order makes for films and episode count makes here.

Anything that needs TMDB (episode totals, runtimes, genres, cast) degrades to a
visible "unanalyzed" instead of guessing.

### Wrapped
An annual recap, picked per watch-year: eight cards (how you rate old vs. new
movies, how deep you dig into genres/directors, how you compare to the crowd, your
rhythm across the year, how much you rewatch...) each resolving to a trait, plus an
overall verdict and a shareable image export.

### Suggestions
Two lists built from your taste profile:
- **For you** — unseen films that match what you watch and rate well, sourced from
  TMDB recommendations on your favorite films, filmographies of directors/actors you
  love, and the best of your top genres. Ranked by *taste × crowd consensus*, with
  the crowd signal weighted by how much your ratings actually agree with the public.
- **Blind spots** — genres, decades, and director filmographies you've barely
  touched, each paired with the most canonical film to close the gap.

Choose **all time** (recent viewings weighted roughly 2× a viewing from three years
back) or **recent tastes** (last 3 years only) as the basis for the profile.

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure TMDB

Most features (credits, genres, ratings comparison, suggestions) need a
[TMDB](https://www.themoviedb.org/settings/api) API key. Create `.env.local`:

```bash
# either a v3 API key (32 hex chars) or a v4 Read Access Token — both work
TMDB_API_KEY=your_key_here
```

Without it, import and basic browsing still work; anything needing movie
metadata shows a "TMDB not configured" notice instead of failing.

### 3. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to your
browser's preferred locale (`en` or `it`).

### 4. Try it

Go to **Upload**, drop a `.zip` export from Letterboxd, Trakt, or Bingers, then
check out **Dashboard**, **Series**, **Wrapped**, and **Suggestions**. (A Letterboxd
export has no episodes in it, so the Series section will tell you it found none.)

## Scripts

```bash
pnpm dev      # start the dev server
pnpm build    # production build
pnpm start    # run the production build
pnpm lint     # eslint
```

## Tech stack

- **Next.js 16** (App Router, React 19)
- **TypeScript**, strict mode
- **Tailwind CSS 4**
- **IndexedDB** for the TMDB credits/suggestions cache (films and series in separate
  stores — TMDB numbers the two independently), **localStorage** for the active import
- No backend, no database — the only server code is the `/api/tmdb/*` proxy route
  that attaches your API key to outbound TMDB requests

## Project structure

```
src/
├── app/[lang]/            # localized pages: home, upload, dashboard, series, wrapped, suggestions
├── app/api/tmdb/[...path]/  # TMDB proxy route
├── components/
│   ├── dashboard/         # top people panel, charts, credits enrichment hook
│   ├── series/            # tv section: show ranking, watch habits, tv credits hook
│   ├── wrapped/           # yearly recap cards, deck, share-image export
│   ├── suggestions/       # taste-profile-driven recommendation UI
│   ├── upload/            # drag-and-drop import flow
│   └── ui/                # shared building blocks (Panel, Button, Badge, toasts…)
├── lib/
│   ├── importers/         # per-source parsers (letterboxd, trakt, bingers) + registry
│   ├── analysis/          # movies, shows, people ranking, charts, wrapped, taste profile, recommendations
│   ├── enrich/             # TMDB credits enrichment (films and series) + candidate harvesting
│   ├── tmdb.ts             # typed TMDB client (via the proxy route)
│   ├── idb.ts               # small IndexedDB wrapper
│   └── storage.ts           # localStorage-backed active import store
├── i18n/ & dictionaries/  # English and Italian translations
└── proxy.ts                # locale-detection redirect middleware
```

## Internationalization

tastr ships with **English** and **Italian**. Locale is detected from the browser
via `Accept-Language` and can be switched from the nav bar; every page lives under
`/[lang]/...`.

## Privacy

Your watch history is parsed and analyzed entirely in your browser. The app talks
to TMDB (through the bundled proxy) to fetch public movie metadata — titles,
genres, cast/crew, ratings — but never sends your personal viewing data, ratings,
or import file anywhere.

## License

No license file is currently included — treat this as all-rights-reserved unless
the repository owner adds one.
