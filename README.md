# LatLng Visualization App

Web app for route and arrival-quality analysis, with a dedicated Impact experience for invoice vs arrived coordinate mismatches.

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
- Filter by warehouse (`wh_id`) and route/offender search.
- View mismatch lines on map (invoice point to arrived point).
- See customer name and arrived/invoice time context in highlights.
- Page through large offender sets.

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

## Architecture

Frontend:

- Expo Router + React Native Web
- Static export hosted on GitHub Pages
- Leaflet-based web map rendering

Backend proxy:

- Node + Express service in `server/`
- Endpoint: `GET /route`
- Proxies TomTom route requests using server-side `TOMTOM_API_KEY`

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

## Tech Stack

- Expo Router
- React Native + React Native Web
- Leaflet
- Papa Parse
- SheetJS (`xlsx`)
- Express + CORS + dotenv
- TomTom Routing API (via proxy)

## Notes

- On GitHub Pages, browser cache can delay visual updates. Hard refresh after deploy if changes do not appear immediately.
- Large files are supported, but keeping only required columns improves parsing speed.

## Recent Web Updates

- Bottom tab navigation was tuned for Windows/Edge viewport behavior.
- Home, Explore, and Impact labels are restored and visible on web.
- Web tab icons use explicit Material icon names for reliable rendering.
- Deployment flow remains: push to `main`, then run `npm run deploy` to publish `dist` to `gh-pages`.
