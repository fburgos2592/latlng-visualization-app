# LatLng Visualization App

Web app for exploring truck stop data from CSV or Excel uploads. The app detects latitude and longitude columns, plots repeated stop locations as parking hotspots, and draws ordered per-truck routes on top of an OpenStreetMap base layer.

Live site:

- https://fburgos2592.github.io/latlng-visualization-app/

## What It Does

- Uploads `.csv`, `.xls`, or `.xlsx` files directly in the browser.
- Detects coordinate columns such as `lat/lng`, `latitude/longitude`, and `vehicle_lat/vehicle_lng`.
- Groups repeated coordinates into parking hotspots so frequent truck stop locations stand out.
- Draws routes per `vehicle_id`, ordered from oldest to newest stop times.
- Snaps routes to roads using TomTom truck routing.
- Applies commercial/truck restrictions with configurable vehicle profile settings (weight, axle, length, width, height).
- Falls back to a straight-line route if routing is unavailable or no TomTom key is provided.
- Shows hotspot counts, vehicle counts, and average speed when that data is present.

## Supported Upload Format

The app is built to handle files like the truck telemetry sample with columns such as:

- `vehicle_lat`
- `vehicle_lng`
- `vehicle_id`
- `speed`

It also works with more generic coordinate headers:

- `lat` / `lng`
- `latitude` / `longitude`

Header matching is case-insensitive and tolerant of common naming variants.

## How The Map Works

- Orange circles represent parking hotspots.
- Larger circles mean more repeated stops at that location.
- Route lines are per truck and colorized from red (start) to green (end).
- When routing succeeds, route lines follow truck-allowed roads.
- When routing fails, route lines fall back to dashed straight paths.

Hotspots are grouped by nearby coordinates rounded to roughly city-block precision, which helps separate meaningful parking behavior from minor GPS jitter.

## Local Development

Before testing truck-aware routing, create a TomTom API key at https://developer.tomtom.com and paste it into the app's TomTom API key field.

If `node` and `npm` are already on your `PATH`:

```bash
npm install
npm run web
```

If you need the Windows-specific path used in this repo session:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location "C:\Users\FBurgos\Documents\latlng-visualization-app"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run web
```

## Production Build

Create the static web bundle:

```bash
npm run export:web
```

Serve the exported bundle locally:

```bash
npm run serve:dist
```

## Deployment

This project is configured for GitHub Pages.

Deploy the latest static build:

```bash
npm run deploy
```

That command:

- exports the web app into `dist`
- publishes `dist` to the `gh-pages` branch

## Tech Stack

- Expo Router
- React Native Web
- Leaflet
- OpenStreetMap tiles
- TomTom Routing API (truck travel mode)
- Papa Parse
- SheetJS (`xlsx`)

## Current Limitations

- TomTom routing requires an API key and internet access.
- Very large stop sets may be sampled for performance and API limits.
- Parking detection is still coordinate-based, not dwell-time based.

## Good Next Steps

- Filter to low-speed points only to isolate likely parking events.
- Split or filter the map by `vehicle_id`.
- Add dwell-time logic from timestamps like `reading_start` and `reading_finish`.
- Add date filtering and route playback.
