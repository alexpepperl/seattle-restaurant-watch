# Seattle Restaurant Watch

A static, public-source tracker of restaurant break-ins, attempted entries, outdoor theft and vandalism. Built for the Seattle community, not an official police database.

## Run locally

Requires Node.js 22+.

```shell
npm ci
npm test
npm run refresh
npm run build
npm start
```

Open http://127.0.0.1:4173. The server binds to localhost only. `PORT` overrides the default.

## What is live, and what is curated?

- The initial collection contains 15 separately documented incidents at 12 locations in Ballard and Alki, from July 2025 through November 2026. Every entry links its supporting report.
- The site filters by incident date, neighborhood, category and text. Date ranges overlap uncertain windows, with date precision shown explicitly. Monthly bars exclude cross-month uncertain dates rather than inventing a month.
- Repeat-location counts require two separately mapped incidents in the selected range. Earlier undated incidents may be mentioned in context without adding to counts. Adjoining Alki businesses share one premises record.
- Reported cost floors sum available lower estimates. Unknown and upper-only costs are excluded. These figures are owner/media estimates, not audited bills, grant shortfalls, net insurance losses or proof of policy effects.
- Restaurant sites may change or close. Visit links do not certify current operating status. Copine's May 2026 reported closure is explicitly labeled, with a closure-story link instead of a dining recommendation. The report cites multiple pressures, not crime alone.
- The original Seattle Times article is credited as inspiration, not quoted or summarized as if its unavailable full text had been verified. Other public reporting supports all mapped entries.

## Automatic source checks

The GitHub workflow checks My Ballard, West Seattle Blog and Capitol Hill Seattle RSS feeds at minute 17 every six hours, on pushes to `main`, and on manual workflow dispatch. It stores only matching headline metadata, not articles. RSS keyword matching can miss reports or flag irrelevant ones. Feeds expose a rolling window, so gaps in scheduled execution can miss articles.

New headlines appear under **On our radar**, not on the incident map. A reviewer must verify and deduplicate each report, identify the business, record a supported incident date or honest uncertainty window, check the address, summarize in original words, and edit [the curated dataset](public/data/incidents.json). A map point must not be generated from an unverified headline or inferred from citywide burglary totals.

The browser rechecks published JSON every five minutes while visible. Its update button fetches published data; it does not trigger GitHub Actions or a fresh remote scrape. The site distinguishes the manually reviewed date, automated feed-check time, feed failures and overdue checks (18 hours). Retained leads are capped at 100. Feed failures preserve older leads, publish explicit health errors, and mark the Actions run as failed after deployment. GitHub schedules are best-effort, may be delayed and can be disabled by GitHub after extended inactivity.

The local monitor can be run with `npm run refresh`; rebuild afterwards. The monitor never writes incident records. Temporary network failures, HTTP 429 and server errors receive at most two short backoff retries. Access-denied responses are not retried or bypassed.

## Publishing

The repository is intended for `alexpepperl/seattle-restaurant-watch`. Enable **Settings → Pages → Source: GitHub Actions**. The included workflow builds and publishes the static `dist` artifact. Relative assets work under the project subpath at https://alexpepperl.github.io/seattle-restaurant-watch/.

## Data standards

Sources contain original publication dates. Incident dates are separate. Range endpoints are bounds, not asserted exact dates. An inferred weekday-to-date conversion is labeled. Entries distinguish burglary, attempted entry, theft/property damage and vandalism; “sourced” does not mean police-confirmed. Suspects are not named, and alleged links between incidents are not treated as fact.

Most map coordinates were obtained from the public ArcGIS address geocoder on November 10, 2026. The Five Guys pin is an approximate intersection placement and Fire Tacos is an approximate business-address placement. No point represents a verified crime-scene coordinate. Concentration circles scale with the small collection's incident counts; they are not a statistical heatmap or neighborhood risk rating.

The current city repair-grant cap was checked directly against [Seattle's official rules](https://www.seattle.gov/economic-development/grants-and-funding/back-to-business/storefront-repair-fund) on November 10, 2026: generally $5,000, storefront repairs only, reimbursement after payment, stolen goods excluded, limited exceptions possible. This policy context is manually maintained, not automatically refreshed. Older reporting may cite $3,000.

The site advocates effective lawful enforcement, investigation, prevention and measurable outcomes alongside recovery aid. It does not claim that grants are proven wasteful, that assistance causes crime, or that a restaurant closed because of break-ins without specific evidence.

## Dependencies and privacy

Leaflet is packaged locally at build time. OpenStreetMap provides the standard raster map tiles; Google Fonts supplies optional typefaces (system-font fallback). Those providers receive ordinary browser requests. The map uses only interactive viewport tile loading, retains normal browser caching and displays OpenStreetMap attribution; do not add bulk/offline downloads or strip the browser referrer. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and move to an appropriate hosted provider if traffic outgrows the community service. There is no analytics, account system, location permission request or private social-media scraping. Public GitHub issues are used for source suggestions and corrections; never submit private data or accusations.

Tests cover source/data consistency, totals, repeat premises, filter boundaries, uncertain dates, chart accounting, HTML escaping, unsafe URL exclusion, malformed RSS, source-host validation, failures and lead deduplication.
