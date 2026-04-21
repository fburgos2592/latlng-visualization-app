const express = require('express');
const cors = require('cors');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const TOMTOM_KEY = process.env.TOMTOM_API_KEY;

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

app.listen(PORT, () => {
  console.log(`Routing proxy listening on http://localhost:${PORT}`);
  console.log(`TomTom key configured: ${TOMTOM_KEY ? 'yes' : 'NO - set TOMTOM_API_KEY in server/.env'}`);
});
