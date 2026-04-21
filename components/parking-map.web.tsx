import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Hotspot = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  vehicleCount: number;
  vehicleIds: string[];
  averageSpeed: number | null;
};

type ParkingMapProps = {
  hotspots: Hotspot[];
  routeStops: Array<{
    id: string;
    latitude: number;
    longitude: number;
    vehicleId: string | null;
  }>;
};

const DEFAULT_CENTER: [number, number] = [40.83, -73.94];
const MAX_ROUTE_STOPS = 80;
const OSRM_CHUNK_SIZE = 25;

function sampleStops<T>(stops: T[], maxCount: number): T[] {
  if (stops.length <= maxCount) {
    return stops;
  }

  const sampled: T[] = [];
  for (let index = 0; index < maxCount; index += 1) {
    const sourceIndex = Math.round((index * (stops.length - 1)) / (maxCount - 1));
    sampled.push(stops[sourceIndex]);
  }

  return sampled;
}

function chunkStops<T>(stops: T[], chunkSize: number): T[][] {
  if (stops.length <= chunkSize) {
    return [stops];
  }

  const chunks: T[][] = [];
  let startIndex = 0;

  while (startIndex < stops.length) {
    const nextChunk = stops.slice(startIndex, startIndex + chunkSize);
    chunks.push(nextChunk);
    if (startIndex + chunkSize >= stops.length) {
      break;
    }
    startIndex += chunkSize - 1;
  }

  return chunks;
}

export default function ParkingMap({ hotspots, routeStops }: ParkingMapProps) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const routeStatusRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;

    async function renderMap() {
      const leafletModule = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      if (disposed || !containerRef.current) {
        return;
      }

      const L = leafletModule.default ?? leafletModule;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: true,
          preferCanvas: true,
          scrollWheelZoom: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      if (layerRef.current) {
        layerRef.current.clearLayers();
      } else {
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      if (routeStatusRef.current) {
        routeStatusRef.current.textContent = '';
      }

      if (hotspots.length === 0) {
        mapRef.current.setView(DEFAULT_CENTER, 9);
        mapRef.current.invalidateSize();
        return;
      }

      for (const hotspot of hotspots) {
        const radius = Math.max(6, Math.min(22, 6 + Math.sqrt(hotspot.count) * 3));
        const vehicleSummary = hotspot.vehicleIds.length > 0
          ? hotspot.vehicleIds.slice(0, 5).join(', ')
          : 'No vehicle id column detected';
        const speedSummary = hotspot.averageSpeed != null
          ? hotspot.averageSpeed.toFixed(2)
          : 'N/A';

        L.circleMarker([hotspot.latitude, hotspot.longitude], {
          radius,
          color: '#0f766e',
          weight: 2,
          fillColor: '#f97316',
          fillOpacity: 0.65,
        })
          .bindPopup(
            `<strong>Parking hotspot</strong><br/>Stops: ${hotspot.count}<br/>Vehicles: ${hotspot.vehicleCount}<br/>Avg speed: ${speedSummary}<br/>Vehicle ids: ${vehicleSummary}`
          )
          .addTo(layerRef.current);
      }

      const preparedStops = sampleStops(routeStops, MAX_ROUTE_STOPS);

      if (preparedStops.length >= 2) {
        try {
          const routeChunks = chunkStops(preparedStops, OSRM_CHUNK_SIZE);
          const routeCoordinates: Array<[number, number]> = [];

          for (const chunk of routeChunks) {
            const coordinateString = chunk
              .map((stop) => `${stop.longitude},${stop.latitude}`)
              .join(';');

            const response = await fetch(
              `https://router.project-osrm.org/route/v1/driving/${coordinateString}?overview=full&geometries=geojson`
            );

            if (!response.ok) {
              throw new Error('OSRM request failed');
            }

            const payload = await response.json();
            const geometry = payload.routes?.[0]?.geometry?.coordinates;

            if (!Array.isArray(geometry) || geometry.length === 0) {
              continue;
            }

            for (const coordinate of geometry) {
              routeCoordinates.push([coordinate[1], coordinate[0]]);
            }
          }

          if (routeCoordinates.length >= 2) {
            L.polyline(routeCoordinates, {
              color: '#2563eb',
              weight: 4,
              opacity: 0.75,
            }).addTo(layerRef.current);
          }

          if (routeStops.length > MAX_ROUTE_STOPS && routeStatusRef.current) {
            routeStatusRef.current.textContent = `Showing a sampled road route across ${MAX_ROUTE_STOPS} of ${routeStops.length} ordered stops.`;
          }
        } catch {
          const fallbackLine = preparedStops.map((stop) => [stop.latitude, stop.longitude] as [number, number]);
          if (fallbackLine.length >= 2) {
            L.polyline(fallbackLine, {
              color: '#2563eb',
              weight: 3,
              opacity: 0.6,
              dashArray: '8 8',
            }).addTo(layerRef.current);
          }

          if (routeStatusRef.current) {
            routeStatusRef.current.textContent = 'Routing service was unavailable, so the map is showing a straight-line path between stops.';
          }
        }
      }

      if (hotspots.length === 1) {
        mapRef.current.setView([hotspots[0].latitude, hotspots[0].longitude], 15);
      } else {
        const bounds = L.latLngBounds(hotspots.map((hotspot) => [hotspot.latitude, hotspot.longitude]));
        mapRef.current.fitBounds(bounds.pad(0.2));
      }

      mapRef.current.invalidateSize();
    }

    renderMap();

    return () => {
      disposed = true;
    };
  }, [hotspots]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  return (
    <View style={styles.shell}>
      <View ref={containerRef} style={styles.map} />
      <Text ref={routeStatusRef} style={styles.status} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 460,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#bfd7ea',
    backgroundColor: '#dff4ff',
  },
  map: {
    flex: 1,
    minHeight: 460,
  },
  status: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    color: '#0f172a',
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
});