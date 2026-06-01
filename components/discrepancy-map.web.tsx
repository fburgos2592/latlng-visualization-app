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
  whId: string;
  invoiceId: string;
  customerName: string | null;
  invoiceTimeLabel: string | null;
  arrivedTimeLabel: string | null;
  timeDeltaMinutes: number | null;
};

type DiscrepancyMapProps = {
  points: DiscrepancyPoint[];
  activeOffender: string;
  routeMapUrl?: string | null;
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

function formatSignedMinutes(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} min`;
}

export default function DiscrepancyMap({ points, activeOffender, routeMapUrl }: DiscrepancyMapProps) {
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
        const customerLabel = point.customerName ?? 'Unknown customer';
        const invoiceTimeLabel = point.invoiceTimeLabel ?? 'N/A';
        const arrivedTimeLabel = point.arrivedTimeLabel ?? 'N/A';
        const timeDeltaLabel = point.timeDeltaMinutes != null ? formatSignedMinutes(point.timeDeltaMinutes) : 'N/A';

        L.polyline([invoice, arrived], {
          color,
          weight: 3,
          opacity: 0.85,
          dashArray: '4 6',
        })
          .bindPopup(
            `<strong>${activeOffender}</strong><br/>WH_ID: ${point.whId}<br/>Customer: ${customerLabel}<br/>Invoice: ${point.invoiceId}<br/>Distance mismatch: ${point.distanceMiles.toFixed(2)} mi<br/>Invoice time: ${invoiceTimeLabel}<br/>Arrived time: ${arrivedTimeLabel}<br/>Time delta: ${timeDeltaLabel}`
          )
          .bindTooltip(`${customerLabel} (${timeDeltaLabel})`, { permanent: false })
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
          .bindTooltip(`Arrived: ${customerLabel}`, { permanent: false })
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
      <View style={styles.compareGrid}>
        <View style={styles.comparePane}>
          <View style={styles.paneHeader}>
            <Text style={styles.paneTitle}>Mismatch map</Text>
            <Text style={styles.paneSub}>Invoice to arrived lines</Text>
          </View>
          <View ref={containerRef} style={styles.map} />
        </View>
        {routeMapUrl ? (
          <View style={styles.comparePane}>
            <View style={styles.paneHeader}>
              <Text style={styles.paneTitle}>In-route map</Text>
              <Text style={styles.paneSub}>WH + date + route</Text>
            </View>
            <View style={styles.routeFrameWrap}>
              <iframe
                src={routeMapUrl}
                title="In-route map compare"
                style={styles.routeFrame as any}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </View>
          </View>
        ) : null}
      </View>
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
  compareGrid: {
    flexDirection: 'row',
    gap: 0,
    minHeight: 520,
  },
  comparePane: {
    flex: 1,
    minWidth: 0,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  paneHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    gap: 2,
  },
  paneTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  paneSub: {
    color: '#475569',
    fontSize: 11,
  },
  map: {
    width: '100%',
    minHeight: 460,
  },
  routeFrameWrap: {
    flex: 1,
    minHeight: 460,
    backgroundColor: '#f8fafc',
  },
  routeFrame: {
    width: '100%',
    height: '100%',
    border: 0,
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
