const express = require('express');
const cors = require('cors');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const TOMTOM_KEY = process.env.TOMTOM_API_KEY;
const SAMSARA_TOKEN = process.env.SAMSARA_API_TOKEN;

app.use(cors());

app.get('/route', async (req, res) => {
  if (!TOMTOM_KEY) {
    return res.status(500).json({ error: 'TOMTOM_API_KEY not configured on server' });
  }

  // req.query.waypoints = "lat,lng:lat,lng:..."
  // req.query.* = any additional TomTom params (travelMode, vehicleWeight, etc.)
  const { waypoints, ...rest } = req.query;

  if (!waypoints) {
    return res.status(400).json({ error: 'Missing waypoints parameter' });
  }

  const params = new URLSearchParams({ ...rest, key: TOMTOM_KEY });
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${encodeURIComponent(waypoints)}/json?${params}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach TomTom API', detail: err.message });
  }
});

app.get('/samsara/*', async (req, res) => {
  if (!SAMSARA_TOKEN) {
    return res.status(500).json({ error: 'SAMSARA_API_TOKEN not configured on server' });
  }

  const endpointPath = String(req.params[0] || '').trim();
  if (!endpointPath) {
    return res.status(400).json({ error: 'Missing Samsara endpoint path' });
  }

  if (endpointPath.includes('://')) {
    return res.status(400).json({ error: 'Invalid endpoint path' });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          params.append(key, String(item));
        }
      }
      continue;
    }

    if (value != null) {
      params.set(key, String(value));
    }
  }

  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const queryString = params.toString();
  const url = `https://api.samsara.com${normalizedPath}${queryString ? `?${queryString}` : ''}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: `Bearer ${SAMSARA_TOKEN}`,
        Accept: 'application/json',
      },
    });

    const payloadText = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    res.status(upstream.status);
    res.setHeader('content-type', contentType);
    return res.send(payloadText);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Samsara API', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Routing proxy listening on http://localhost:${PORT}`);
  console.log(`TomTom key configured: ${TOMTOM_KEY ? 'yes' : 'NO - set TOMTOM_API_KEY in server/.env'}`);
  console.log(`Samsara token configured: ${SAMSARA_TOKEN ? 'yes' : 'NO - set SAMSARA_API_TOKEN in server/.env'}`);
});
