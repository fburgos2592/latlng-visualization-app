import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type DiscrepancyPoint = {
  id: string;
  invoiceLat: number;
  invoiceLng: number;
  arrivedLat: number;
  arrivedLng: number;
  distanceMiles: number;
  offender: string;
  invoiceId: string;
};

type DiscrepancyMapProps = {
  points: DiscrepancyPoint[];
  activeOffender: string;
};

const DEFAULT_CENTER: [number, number] = [40.83, -73.94];

function colorForMiles(miles: number): string {
  if (miles >= 3) {
    return '#b91c1c';
  }

  if (miles >= 2) {
    return '#dc2626';
  }

  if (miles >= 1) {
    return '#f97316';
  }

  return '#15803d';
}

export default function DiscrepancyMap({ points, activeOffender }: DiscrepancyMapProps) {
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

      if (points.length === 0) {
        mapRef.current.setView(DEFAULT_CENTER, 9);
        mapRef.current.invalidateSize();
        return;
      }

      const bounds = L.latLngBounds([]);

      for (const point of points) {
        const invoice: [number, number] = [point.invoiceLat, point.invoiceLng];
        const arrived: [number, number] = [point.arrivedLat, point.arrivedLng];
        const color = colorForMiles(point.distanceMiles);

        L.polyline([invoice, arrived], {
          color,
          weight: 3,
          opacity: 0.85,
          dashArray: '4 6',
        })
          .bindPopup(
            `<strong>${activeOffender}</strong><br/>Invoice: ${point.invoiceId}<br/>Distance mismatch: ${point.distanceMiles.toFixed(2)} mi`
          )
          .addTo(layerRef.current);

        L.circleMarker(invoice, {
          radius: 5,
          color: '#1d4ed8',
          fillColor: '#60a5fa',
          fillOpacity: 0.9,
          weight: 2,
        })
          .bindTooltip('Invoice location', { permanent: false })
          .addTo(layerRef.current);

        L.circleMarker(arrived, {
          radius: 5,
          color: '#7c2d12',
          fillColor: '#fb923c',
          fillOpacity: 0.95,
          weight: 2,
        })
          .bindTooltip('Arrived location', { permanent: false })
          .addTo(layerRef.current);

        bounds.extend(invoice);
        bounds.extend(arrived);
      }

      mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      mapRef.current.invalidateSize();
    }

    renderMap().catch(() => {
      // Keep map area stable if leaflet fails to initialize.
    });

    return () => {
      disposed = true;
    };
  }, [activeOffender, points]);

  return (
    <View style={styles.shell}>
      <View ref={containerRef} style={styles.map} />
      <View style={styles.legendRow}>
        <Text style={styles.legendTitle}>Legend:</Text>
        <Text style={styles.legendItem}>Blue dot invoice</Text>
        <Text style={styles.legendItem}>Orange dot arrived</Text>
        <Text style={styles.legendItem}>Redder line bigger mismatch</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  map: {
    width: '100%',
    minHeight: 520,
  },
  legendRow: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  legendTitle: {
    color: '#0f172a',
    fontWeight: '700',
  },
  legendItem: {
    color: '#334155',
    fontSize: 12,
  },
});
