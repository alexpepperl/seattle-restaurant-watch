# Seattle Restaurant Watch

A static, public-source tracker of restaurant break-ins, attempted entries, outdoor theft and vandalism. The pilot now defaults to Ballard, with deeper official-data and public-source discovery. Full Seattle coverage is a future phase. This is not an official police database.

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

- The curated collection contains 18 separately documented incidents at 15 locations, including a Ballard pilot of 14 incidents at 13 locations and four retained Alki sample incidents. Every entry links its supporting report. New entries include Sloop Tavern, Highland Espresso and Dough Joy. Dates with no exact reported day retain explicit uncertainty bounds.
- The site filters by incident date, neighborhood, category and text. Date ranges overlap uncertain windows, with date precision shown explicitly. Monthly bars exclude cross-month uncertain dates rather than inventing a month.
- Repeat-location counts require two separately mapped incidents in the selected range. Earlier undated incidents may be mentioned in context without adding to counts. Adjoining Alki businesses share one premises record.
- Reported cost floors sum available lower estimates. Unknown and upper-only costs are excluded. These figures are owner/media estimates, not audited bills, grant shortfalls, net insurance losses or proof of policy effects.
- Restaurant sites may change or close. Visit links do not certify current operating status. Copine's May 2026 and Five Guys Ballard's July 2026 reported closures are explicitly labeled, with closure-story links instead of dining recommendations. A prior burglary is not proof of why a business closed.
- The original Seattle Times article is credited as inspiration, not quoted or summarized as if its unavailable full text had been verified. Other public reporting supports all mapped entries.

## Automatic source checks

The GitHub workflow checks nine Ballard-oriented RSS channels at minute 17 every six hours, on pushes to `main`, and on manual workflow dispatch: My Ballard's current feed plus three archive-search channels, SPD Blotter, KING 5, FOX 13, KIRO 7 and Ballard Alliance. Four channels from My Ballard remain one publisher, not four corroborating sources. Regional feeds require Ballard-area context as well as an incident and food-business match. It stores only matching headline metadata, not articles. Keyword matching can miss reports or flag irrelevant ones; archives may surface old stories. Rolling feed windows and scheduling gaps can miss articles. The previous West Seattle / Capitol Hill feed scope is deferred from this Ballard pilot.

New headlines appear under **On our radar**, not on the incident map. A reviewer must verify and deduplicate each report, identify the business, record a supported incident date or honest uncertainty window, check the address, summarize in original words, and edit [the curated dataset](public/data/incidents.json). A map point must not be generated from an unverified headline or inferred from citywide burglary totals.

The browser rechecks published JSON every five minutes while visible. Its update button fetches published data; it does not trigger GitHub Actions or a fresh remote scrape. The site distinguishes the manually reviewed date, automated check time, source update time, failures and overdue downloads (18 hours). Retained leads are capped at 300. Source failures preserve older complete data, publish explicit health errors, and mark the Actions run as failed after deployment. GitHub schedules are best-effort, may be delayed and can be disabled by GitHub after extended inactivity.

The local monitor can be run with `npm run refresh`; rebuild afterwards. The monitor never writes incident records. Temporary network failures, HTTP 429 and server errors receive at most two short backoff retries. Access-denied responses are not retried or bypassed.

## Official police listings

[The police collector](scripts/police.mjs) downloads two public Socrata datasets:

- `tazs-3rd5`: approved SPD crime records, restricted to NIBRS `220` (burglary), official `BALLARD NORTH` / `BALLARD SOUTH` neighborhood values and dates since January 1, 2025. Multiple offense rows are grouped by report number; offense IDs remain available. No restaurant identity or commercial-premises type is provided.
- `33kz-ixgy`: calls for service with burglary in the initial or final call type, same neighborhoods and start date. SQL projection removes repeated officer-dispatch rows and local grouping uses the CAD event number. Initial and final types and clearances remain distinct. A final commercial/non-residential label is filterable but does not identify a restaurant or prove a crime.

Every request is paginated with a stable order. Required fields are checked against live metadata. Source update timestamps are compared before and after pagination; a changing dataset, schema mismatch or safety limit fails rather than publishing an incomplete success-shaped count. Each source retains its previous complete snapshot on failure. Counts are per report / CAD event, never the number of responding officers, and must not be added to each other or to media incidents.

The [police snapshot](public/data/police.json) includes the exact API query, source metadata URLs, source-update timestamps and per-source health. These approved records can lag incidents by days. The source update time is separate from the download time; the UI flags a source older than 72 hours. Missing offense dates are explicitly labeled as report-date fallback. Date strings from SPD are displayed as supplied rather than assigned an invented timezone.

The map's optional blue-circle overlay uses only the main date filter and approved crime reports, not the restaurant search or incident type. It contains all-premises burglary context, not confirmed restaurants. Only a single valid, unredacted, source-provided blurred point is shown per report; redacted, invalid and multi-location points are omitted, never geocoded or reconstructed. CAD records are deliberately kept off the map and are displayed at neighborhood / beat level without address or coordinates.

The police table shares the main date window, but has its own search, record-type tabs, commercial-call filter, pagination and CSV export. An API record link is metadata, not a full police narrative. Actual narratives require a public-records request; none has been automatically submitted. No automatic proximity/date matching attributes police cases to restaurant reports.

## Public social sources and access

The [source directory](public/data/sources.json) contains 24 source entries across official data, journalism, business/community and public social channels. Entries explicitly distinguish automatic connections, manual discovery and limited access.

Owner Instagram links for Saleh's, Sloop Tavern and Dough Joy come from the original news articles; Highland's profile and recovery fundraiser are also linked. These references are not treated as independently read post text, independent corroboration or extra incidents. Public My Ballard / Ballard Alliance Facebook pages, Visit Ballard Instagram, Reddit search links and an indexed KING 5 YouTube report broaden manual discovery. No social feed is falsely labeled as automatically monitored.

Automated Reddit RSS returned HTTP 403. Instagram often exposes no readable post text without platform access. Private Facebook groups and Nextdoor content are excluded. Official platform authorization or owner-provided submissions would be needed for reliable ongoing social ingestion. No login restrictions, paywalls or access controls are bypassed. Google News RSS is not republished because its feed explicitly restricts reuse to personal, non-commercial feed readers.

## Publishing

The repository is intended for `alexpepperl/seattle-restaurant-watch`. Enable **Settings → Pages → Source: GitHub Actions**. The included workflow builds and publishes the static `dist` artifact. Relative assets work under the project subpath at https://alexpepperl.github.io/seattle-restaurant-watch/.

## Data standards

Sources contain original publication dates. Incident dates are separate. Range endpoints are bounds, not asserted exact dates. An inferred weekday-to-date conversion is labeled. Entries distinguish burglary, attempted entry, theft/property damage and vandalism; “sourced” does not mean police-confirmed. Suspects are not named, and alleged links between incidents are not treated as fact.

Most map coordinates were obtained from the public ArcGIS address geocoder on November 10, 2026. The Five Guys pin is an approximate intersection placement and Fire Tacos is an approximate business-address placement. No point represents a verified crime-scene coordinate. Concentration circles scale with the small collection's incident counts; they are not a statistical heatmap or neighborhood risk rating.

The current city repair-grant cap was checked directly against [Seattle's official rules](https://www.seattle.gov/economic-development/grants-and-funding/back-to-business/storefront-repair-fund) on November 10, 2026: generally $5,000, storefront repairs only, reimbursement after payment, stolen goods excluded, limited exceptions possible. This policy context is manually maintained, not automatically refreshed. Older reporting may cite $3,000.

The site advocates effective lawful enforcement, investigation, prevention and measurable outcomes alongside recovery aid. It does not claim that grants are proven wasteful, that assistance causes crime, or that a restaurant closed because of break-ins without specific evidence.

## Dependencies and privacy

Leaflet is packaged locally at build time. OpenStreetMap provides the standard raster map tiles; Google Fonts supplies optional typefaces (system-font fallback). Those providers receive ordinary browser requests. The map uses only interactive viewport tile loading, retains normal browser caching and displays OpenStreetMap attribution; do not add bulk/offline downloads or strip the browser referrer. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and move to an appropriate hosted provider if traffic outgrows the community service. There is no analytics, account system, location permission request or private social-media scraping. Public GitHub issues are used for source suggestions and corrections; never submit private data or accusations.

Tests cover source/data consistency, pilot scope, totals, repeat premises, date overlap, chart accounting, HTML escaping, CSV formula protection, unsafe URLs, RSS host/area matching, failures, retries, source-registry references, police pagination, changing snapshots, redaction, CAD/incident deduplication and classification differences.
