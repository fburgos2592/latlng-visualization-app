# LatLng Visualization App

Web app for route and arrival-quality analysis, with a dedicated Impact experience for invoice vs arrived coordinate mismatches, route comparison, and stop-level drilldown.

## Live Links

- Frontend (GitHub Pages): https://fburgos2592.github.io/latlng-visualization-app/
- Routing proxy (Render): https://latlng-visualization-app.onrender.com/

## What The App Does

The app currently ships with a tabbed workflow:

- Home: upload route telemetry and inspect mapped route behavior.
- Explore: additional map exploration views.
- Impact: "Arrival Proximity Impact Lab" for discrepancy analysis between invoice and arrived coordinates.

The Impact tab is designed for operational triage:

- Upload CSV or Excel discrepancy files.
- Auto-detect coordinate and key business columns.
- Rank top offenders by mismatch severity.
- Filter by warehouse (`wh_id`), route/offender search, mismatch threshold, and stop search.
- Compare a mismatch map with the actual in-route route page side by side.
- Drill into a stop table with customer, invoice, arrival, coordinates, time delta, and a route risk score.
- Step through stops with playback and keep the map selection synchronized with the table.
- Show timeline fields in ops-first order: arrived first, invoice second.
- Keep map popup timestamps aligned with the same display values used in the table and detail drawer.
- Page through large offender sets.

The compare view uses the same shared route context everywhere:

- WH
- Date
- Route
- Stop count
- Average mismatch
- Worst mismatch
- Average time delta
- Over-threshold count and rate
- Composite risk score

## Impact Input Expectations

The parser supports aliases and fuzzy matching for common column names.

Primary location fields:

- Invoice latitude: `lat`, `invoice_lat`, `invoice_latitude`
- Invoice longitude: `lng`, `lon`, `long`, `invoice_lng`, `invoice_longitude`
- Arrived latitude: `arrived_lat`, `arrival_lat`, `arrive_lat`
- Arrived longitude: `arrived_lng`, `arrived_lon`, `arrival_lng`, `arrive_lng`

Common metadata fields:

- Warehouse: `wh_id`, `warehouse_id`, `distribution_center`, `dc_id`, `dc`
- Offender/route grouping: `route`, `driver_id`, `vehicle_id`, `truck_id`, `unit_id`
- Invoice ID: `invoice`, `invoice_id`, `order_id`
- Customer: `customer_name`, `customer`, `account_name`, `store_name`
- Time context: `invoice_time`, `arrived_time`, `arrival_time`, `arrived_at`

Time rendering notes:

- Spreadsheet numeric serial values are converted to readable wall-clock timestamps in the UI.
- If source files already contain readable time strings, the app preserves those values for display.
- Time delta is displayed as `arrived - invoice`.

For route-linking, the app also prefers a parseable date field, and it can fall back to a second-column date value when present.

## Architecture

Frontend:

- Expo Router + React Native Web
- Static export hosted on GitHub Pages
- Leaflet-based web map rendering

Backend proxy:

- Node + Express service in `server/`
- Endpoint: `GET /route`
- Proxies TomTom route requests using server-side `TOMTOM_API_KEY`

External route compare:

- The in-route panel loads the DriverCloud route page in an iframe.
- The external page is cross-origin, so the app treats it as opaque and syncs only through the URL, shared summary, and local stop selection.

## Security

- `TOMTOM_API_KEY` stays on the server only.
- No API key is embedded in frontend assets.
- Keep `server/.env` local/private.

## Local Development

Frontend:

```bash
npm install
npm run web
```

Backend:

```bash
cd server
npm install
npm start
```

Create `server/.env`:

```env
TOMTOM_API_KEY=your_key_here
PORT=3001
```

## Build And Deploy

Export static web build:

```bash
npm run export:web
```

Publish GitHub Pages build:

```bash
npm run deploy
```

`deploy` runs `expo export -p web` and publishes `dist` to `gh-pages`.

Current live workflow:

- Push changes to `main`.
- Run `npm run deploy`.
- Hard refresh GitHub Pages if the latest build is not visible immediately.

## Tech Stack

- Expo Router
- React Native + React Native Web
- Leaflet
- Papa Parse
- SheetJS (`xlsx`)
- Express + CORS + dotenv
- TomTom Routing API (via proxy)

Optional future data source:

- Samsara API can be layered in on the server side for actual route traces, stop times, dwell, and route execution telemetry.

## Notes

- On GitHub Pages, browser cache can delay visual updates. Hard refresh after deploy if changes do not appear immediately.
- Large files are supported, but keeping only required columns improves parsing speed.
- The compare view is best used with route/date/warehouse fields populated so the in-route URL can resolve correctly.

## Recent Web Updates

- Bottom tab navigation was tuned for Windows/Edge viewport behavior.
- Home, Explore, and Impact labels are restored and visible on web.
- Web tab icons use explicit Material icon names for reliable rendering.
- Impact now includes split-view route comparison, a shared summary bar, stop search, playback, and a selected-stop detail drawer.
- Impact timeline presentation now shows arrived before invoice in the drawer, stop table, and map popup.
- Timestamp display was hardened so map and table use the same formatted values.
- Deployment flow remains: push to `main`, then run `npm run deploy` to publish `dist` to `gh-pages`.
