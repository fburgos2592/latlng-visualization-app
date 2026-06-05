import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

type DiffPair = {
  id: string;
  invoiceLat: number;
  invoiceLng: number;
  arrivedLat: number;
  arrivedLng: number;
  distanceMiles: number;
  invoice: string | null;
  route: string | null;
  whId: string | null;
  date: string | null;
};

type GeoDiffMapProps = {
  pairs: DiffPair[];
  maxPairs?: number;
};

const DEFAULT_CENTER: [number, number] = [40.83, -73.94];
const DEFAULT_MAX_PAIRS = 500;

function getDistanceColor(miles: number): string {
  if (miles < 0.1) return '#16a34a';
  if (miles < 1) return '#eab308';
  if (miles < 5) return '#f97316';
  return '#dc2626';
}

export default function GeoDiffMap({ pairs, maxPairs = DEFAULT_MAX_PAIRS }: GeoDiffMapProps) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

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

      if (pairs.length === 0) {
        mapRef.current.setView(DEFAULT_CENTER, 9);
        mapRef.current.invalidateSize();
        return;
      }

      const displayed = pairs.slice(0, maxPairs);

      for (const pair of displayed) {
        const color = getDistanceColor(pair.distanceMiles);
        const invoiceCoord: [number, number] = [pair.invoiceLat, pair.invoiceLng];
        const arrivedCoord: [number, number] = [pair.arrivedLat, pair.arrivedLng];

        const popupLines = [
          pair.whId ? `<b>WH:</b> ${pair.whId}` : null,
          pair.route ? `<b>Route:</b> ${pair.route}` : null,
          pair.invoice ? `<b>Invoice:</b> ${pair.invoice}` : null,
          pair.date ? `<b>Date:</b> ${pair.date}` : null,
          `<b>Distance:</b> ${pair.distanceMiles.toFixed(3)} mi`,
          `<b>Invoice coords:</b> ${pair.invoiceLat.toFixed(6)}, ${pair.invoiceLng.toFixed(6)}`,
          `<b>Arrived coords:</b> ${pair.arrivedLat.toFixed(6)}, ${pair.arrivedLng.toFixed(6)}`,
        ]
          .filter(Boolean)
          .join('<br/>');

        L.polyline([invoiceCoord, arrivedCoord], {
          color,
          weight: 2,
          opacity: 0.8,
        })
          .bindPopup(popupLines)
          .addTo(layerRef.current);

        L.circleMarker(invoiceCoord, {
          radius: 5,
          color: '#1d4ed8',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.85,
        })
          .bindTooltip('Invoice location', { permanent: false })
          .bindPopup(`<b>Invoice location</b><br/>${popupLines}`)
          .addTo(layerRef.current);

        L.circleMarker(arrivedCoord, {
          radius: 5,
          color: '#7f1d1d',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        })
          .bindTooltip('Arrived location', { permanent: false })
          .bindPopup(`<b>Arrived location</b><br/>${popupLines}`)
          .addTo(layerRef.current);
      }

      const allCoords = displayed.flatMap((p) => [
        [p.invoiceLat, p.invoiceLng] as [number, number],
        [p.arrivedLat, p.arrivedLng] as [number, number],
      ]);
      const bounds = L.latLngBounds(allCoords);
      mapRef.current.fitBounds(bounds.pad(0.1));
      mapRef.current.invalidateSize();
    }

    renderMap();

    return () => {
      disposed = true;
    };
  }, [pairs, maxPairs]);

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
});
