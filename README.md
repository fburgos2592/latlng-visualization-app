# Truck Route Intelligence Dashboard

Interactive web dashboard for operational route analysis. The app ingests truck telemetry files, detects parking hotspots, and renders per-vehicle routes with truck-aware road snapping via a secure backend proxy.

## Live Links

- Frontend (GitHub Pages): https://fburgos2592.github.io/latlng-visualization-app/
- Routing API proxy (Render): https://latlng-visualization-app.onrender.com/

## Executive Summary

This project provides a practical decision-support layer for fleet operations:

- Converts raw GPS rows into route intelligence in-browser.
- Highlights repeat stop behavior (parking hotspots) for route and productivity analysis.
- Uses truck-aware routing (height/weight/axle constraints) instead of passenger-car defaults.
- Protects the routing API key behind a backend proxy (no key exposure in browser code).
- Includes graceful fallback behavior so maps remain usable if upstream routing is unavailable.

## Core Capabilities

- Upload support for CSV and Excel files (`.csv`, `.xls`, `.xlsx`).
- Automatic coordinate detection for common schemas:
	- `lat` / `lng`
	- `latitude` / `longitude`
	- `vehicle_lat` / `vehicle_lng`
- Optional field inference for:
	- `vehicle_id`
	- `speed`
	- multiple timestamp aliases (`reading_start`, `reading_finish`, `timestamp`, etc.)
- Per-vehicle route reconstruction ordered by event time (or row order fallback).
- Hotspot clustering to reduce GPS jitter and surface recurring stop locations.
- Truck profile controls for routing constraints:
	- vehicle weight
	- axle weight
	- number of axles
	- length, width, height
- On-map routing mode indicator:
	- `Routing: API`
	- `Routing: Fallback`
	- `Routing: Mixed`

## Architecture

### Frontend (static)

- Hosted on GitHub Pages.
- Built with Expo Router + React Native Web + Leaflet.
- Renders maps using OpenStreetMap tiles.
- Calls backend proxy endpoint for routing.

### Backend proxy (server)

- Hosted on Render (Node + Express).
- Endpoint: `GET /route`
- Accepts query params such as:
	- `waypoints` (`lat,lng:lat,lng:...`)
	- `travelMode`, `vehicleWeight`, `vehicleHeight`, etc.
- Injects `TOMTOM_API_KEY` from server environment.
- Proxies requests to TomTom Routing API and returns JSON payloads to frontend.

## Security Posture

- API key is server-side only (`TOMTOM_API_KEY` on Render).
- No sensitive key in frontend bundle.
- Browser traffic goes to Render proxy, not directly to TomTom with embedded credentials.
- `.env` remains local/private and is not committed.

## Routing Behavior

- Primary path: truck-aware route geometry from proxy/API.
- Fallback path: dashed straight-line segments per vehicle when routing fails.
- Mixed mode: some vehicles routed via API, others shown as fallback.

This ensures map continuity even during API cold starts or temporary network issues.

## Local Development

### Frontend

```bash
npm install
npm run web
```

Windows session variant used in this repo:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location "C:\Users\FBurgos\Documents\latlng-visualization-app"
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run web
```

### Backend proxy

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

## Build and Deploy

### Frontend static export

```bash
npm run export:web
```

### Publish to GitHub Pages

```bash
npm run deploy
```

`deploy` runs `predeploy` (`expo export -p web`) and publishes `dist` to `gh-pages`.

### Backend deployment (Render)

- Service type: Web Service
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `TOMTOM_API_KEY`

## Tech Stack

- Expo Router
- React Native Web
- Leaflet
- OpenStreetMap
- Express + CORS + dotenv
- TomTom Routing API (truck mode)
- Papa Parse
- SheetJS (`xlsx`)

## Known Constraints

- Render free tier may cold-start after idle periods.
- Very large stop sets are sampled to stay responsive and within routing limits.
- Hotspot detection is coordinate-cluster based; dwell-time heuristics are not yet applied.

## Next Iteration Ideas

- Add date/time filters and route playback.
- Add dwell-time-based parking confidence scoring.
- Add per-vehicle toggle and compare mode.
- Persist user-selected truck profiles.
- Add optional analytics export for downstream BI.
