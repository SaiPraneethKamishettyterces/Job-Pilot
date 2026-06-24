# Job sources — coverage, freshness & compliance

Single auditable record of where JobPilot's job pool comes from. All sources are
**free**. Each adapter fails soft (returns `[]` on error) so one bad source never
sinks an ingest cycle. Per-source enable flags live in `config.sources.enabled`
(`SOURCE_*` env vars); see `.env.example`.

**Freshness principle:** every adapter maps the source's posting timestamp →
`RawJob.postedAt` (ISO). The pool tracks `postedAt` (source) + `firstSeenAt`
(ingest) + `lastSeenAt`; matching orders `postedAt DESC NULLS LAST` and filters by
`MATCH_FRESHNESS_HOURS`. The `GET /api/jobs/candidates` API exposes `sortBy=recent`,
`freshnessHours`, and a derived `postedAgoLabel`.

## Aggregators (free)

| Source | Method | Key? | Timestamp → postedAt | Flag | Default | ToS / notes |
|---|---|---|---|---|---|---|
| Remotive | JSON API | No | `publication_date` | `SOURCE_REMOTIVE` | on | Poll ≤4×/day |
| RemoteOK | JSON API | No | `date`/epoch | `SOURCE_REMOTEOK` | on | Public API; attribution |
| Arbeitnow | JSON API | No | `created_at` | `SOURCE_ARBEITNOW` | on | Public board API |
| The Muse | JSON API | Optional | `publication_date` | `SOURCE_THEMUSE` | on | Key raises rate limit |
| Adzuna | Search API | Yes (free) | `created` | `SOURCE_ADZUNA` | on | Demand-driven by keyword |
| USAJOBS | Search API | Yes (free) | `PublicationStartDate` | `SOURCE_USAJOBS` | on | UA must be contact email |
| **Jobicy** | JSON API | No | `pubDate` | `SOURCE_JOBICY` | on | Public API; attribution requested |
| **WeWorkRemotely** | Category RSS | No | `<pubDate>` | `SOURCE_WEWORKREMOTELY` | on | RSS syndication only — never scrape HTML |
| **Himalayas** | JSON API | No | `pubDate` (epoch/ISO) | `SOURCE_HIMALAYAS` | on | Public API |
| **WorkingNomads** | JSON API | No | `pub_date` | `SOURCE_WORKINGNOMADS` | on | Poll ~1×/day |

Bold = added in Part 1.7 (the fresh/time-of-release expansion).

## ATS board APIs (free, public — company career portals)

`greenhouse`, `lever`, `ashby`, `workable`, `recruitee`, `personio`,
`smartrecruiters`, `workday`, and **`breezy`** (`{token}.breezy.hr/json`,
`published_date`) + **`teamtailor`** (`{token}.teamtailor.com/jobs.json`,
`created-at`; best-effort). Boards come from the curated seed (`npm run seed:sources`)
and the wide registry sync below; coverage grows as the registry compounds.

### Registry sync — the biggest free coverage lever
Bulk-imports tens of thousands of company ATS boards from public MIT-licensed GitHub
datasets into `JobSource`. **Cost is governed by embeddings**, not board count, so it
ships with guardrails:
- `ATS_REGISTRY_SYNC_ENABLED` (master, default off), `ATS_SEED_STAPPLY` (on),
  `ATS_SEED_FEASHLIAA`/`ATS_SEED_OPENJOBS` (off — enable after observing volume).
- `INGEST_MAX_BOARDS_PER_RUN` (1500) — demand-resolved boards first, then the
  registry rotated least-recently-checked-first.
- `INGEST_MAX_EMBEDDINGS_PER_RUN` (2000) — **the key cost cap**; remaining postings
  embed on later cycles.
- Enable + run once: `npm run seed:registry`.

## Deferred (documented toggles — not active)

| Source | Why deferred | Flag / key |
|---|---|---|
| Hacker News "Who is hiring" | Very fresh (per-comment `created_at`) but lower parse precision | `SOURCE_HACKERNEWS` (off) |
| Findwork.dev | Free but needs a key | `FINDWORK_API_KEY` (self-skip) |
| Jooble | Free but needs a key; demand-driven | `JOOBLE_API_KEY` (self-skip) |
| Reed (UK) | Free but needs a key; demand-driven | `REED_API_KEY` (self-skip) |

## Deliberately EXCLUDED (ToS / bot-protection — do NOT add)

LinkedIn, Indeed (direct), Glassdoor, ZipRecruiter, Google Jobs, Monster — **no
compliant free API; direct scraping violates their ToS / requires bot-protection
bypass.** LinkedIn/Indeed remain on the **paid Apify track only**. No HTML scrapers,
no login/CAPTCHA bypass — ever.
