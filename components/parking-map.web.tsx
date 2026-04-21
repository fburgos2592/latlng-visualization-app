import React, { useEffect, useRef, useState } from 'react';
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
  routeGroups: Array<{
    vehicleId: string;
    stops: Array<{
      id: string;
      latitude: number;
      longitude: number;
      vehicleId: string | null;
    }>;
  }>;
};

const DEFAULT_CENTER: [number, number] = [40.83, -73.94];
const MAX_ROUTE_STOPS = 80;
const OSRM_CHUNK_SIZE = 25;
const MAX_ROUTE_GROUPS = 12;
const ROUTE_START_COLOR = '#dc2626';
const ROUTE_END_COLOR = '#16a34a';

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

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.replace('#', '');
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function interpolateColor(startHex: string, endHex: string, progress: number): string {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);

  return rgbToHex(
    start.red + (end.red - start.red) * progress,
    start.green + (end.green - start.green) * progress,
    start.blue + (end.blue - start.blue) * progress
  );
}

function drawGradientRoute(
  leaflet: any,
  layerGroup: any,
  coordinates: Array<[number, number]>,
  label: string,
  options?: { weight?: number; opacity?: number; dashArray?: string }
) {
  if (coordinates.length < 2) {
    return;
  }

  const segmentCount = coordinates.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const progress = segmentCount === 1 ? 1 : index / (segmentCount - 1);
    leaflet
      .polyline([coordinates[index], coordinates[index + 1]], {
        color: interpolateColor(ROUTE_START_COLOR, ROUTE_END_COLOR, progress),
        weight: options?.weight ?? 4,
        opacity: options?.opacity ?? 0.85,
        dashArray: options?.dashArray,
      })
      .addTo(layerGroup);
  }

  leaflet
    .circleMarker(coordinates[0], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: ROUTE_START_COLOR,
      fillOpacity: 1,
    })
    .bindTooltip(`Start • ${label}`, { permanent: false })
    .addTo(layerGroup);

  leaflet
    .circleMarker(coordinates[coordinates.length - 1], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: ROUTE_END_COLOR,
      fillOpacity: 1,
    })
    .bindTooltip(`End • ${label}`, { permanent: false })
    .addTo(layerGroup);
}

  export default function ParkingMap({ hotspots, routeGroups }: ParkingMapProps) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [routeStatus, setRouteStatus] = useState('');

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

      setRouteStatus('');

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

      const groupsToRender = routeGroups
        .filter((group) => group.stops.length >= 2)
        .slice(0, MAX_ROUTE_GROUPS);
      const statusMessages: string[] = [];

      for (const routeGroup of groupsToRender) {
        const preparedStops = sampleStops(routeGroup.stops, MAX_ROUTE_STOPS);
        const label = `Truck ${routeGroup.vehicleId}`;
        const fallbackLine = preparedStops.map((stop) => [stop.latitude, stop.longitude] as [number, number]);
        let fallbackPolyline: any = null;

        if (fallbackLine.length >= 2) {
          fallbackPolyline = L.layerGroup().addTo(layerRef.current);
          drawGradientRoute(L, fallbackPolyline, fallbackLine, label, {
            weight: 3,
            opacity: 0.45,
            dashArray: '8 8',
          });
        }

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
            if (fallbackPolyline) {
              layerRef.current.removeLayer(fallbackPolyline);
            }

            drawGradientRoute(L, layerRef.current, routeCoordinates, label, {
              weight: 5,
              opacity: 0.9,
            });
          }

          if (routeGroup.stops.length > MAX_ROUTE_STOPS) {
            statusMessages.push(`${label}: sampled ${MAX_ROUTE_STOPS} of ${routeGroup.stops.length} stops.`);
          }
        } catch {
          statusMessages.push(`${label}: routing unavailable, showing straight-line fallback.`);
        }
      }

      if (routeGroups.length > MAX_ROUTE_GROUPS) {
        statusMessages.push(`Showing top ${MAX_ROUTE_GROUPS} truck routes by stop count.`);
      }

      if (statusMessages.length > 0) {
        setRouteStatus(statusMessages.join(' '));
      } else if (groupsToRender.length > 0) {
        setRouteStatus('Routes are now drawn per truck (vehicle_id), each from red start to green end.');
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
  }, [hotspots, routeGroups]);

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
      {routeStatus ? <Text style={styles.status}>{routeStatus}</Text> : null}
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