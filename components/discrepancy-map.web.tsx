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
  invoiceTimeMs: number | null;
  arrivedTimeMs: number | null;
  timeDeltaMinutes: number | null;
};

type DiscrepancyMapProps = {
  points: DiscrepancyPoint[];
  activeOffender: string;
  routeMapUrl?: string | null;
  compareSummary?: {
    date: string | null;
    route: string;
    whId: string;
    stopCount: number;
    averageMiles: number;
    maxMiles: number;
    averageTimeDeltaMinutes: number | null;
    overThresholdCount: number;
    overThresholdRate: number;
    riskScore: number;
  } | null;
  selectedPointId?: string | null;
  onPointSelect?: (pointId: string) => void;
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

function formatEasternDateTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(new Date(ms));
}

export default function DiscrepancyMap({ points, activeOffender, routeMapUrl, compareSummary, selectedPointId, onPointSelect }: DiscrepancyMapProps) {
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

      const overviewBounds = L.latLngBounds([]);
      let selectedBounds: any = null;
      const selectedPoint = selectedPointId ? points.find((point) => point.id === selectedPointId) ?? null : null;

      if (selectedPoint) {
        selectedBounds = L.latLngBounds([]);
      }

      for (const point of points) {
        const invoice: [number, number] = [point.invoiceLat, point.invoiceLng];
        const arrived: [number, number] = [point.arrivedLat, point.arrivedLng];
        const color = colorForMiles(point.distanceMiles);
        const customerLabel = point.customerName ?? 'Unknown customer';
        const invoiceTimeLabel = point.invoiceTimeMs != null ? formatEasternDateTime(point.invoiceTimeMs) : point.invoiceTimeLabel ?? 'N/A';
        const arrivedTimeLabel = point.arrivedTimeMs != null ? formatEasternDateTime(point.arrivedTimeMs) : point.arrivedTimeLabel ?? 'N/A';
        const timeDeltaLabel = point.timeDeltaMinutes != null ? formatSignedMinutes(point.timeDeltaMinutes) : 'N/A';
        const isSelected = selectedPointId === point.id;
        const lineColor = isSelected ? '#2563eb' : color;
        const lineWeight = isSelected ? 6 : 3;
        const lineOpacity = isSelected ? 1 : 0.85;

        L.polyline([invoice, arrived], {
          color: lineColor,
          weight: lineWeight,
          opacity: lineOpacity,
          dashArray: '4 6',
        })
          .on('click', () => onPointSelect?.(point.id))
          .bindPopup(
            `<strong>${activeOffender}</strong><br/>WH_ID: ${point.whId}<br/>Customer: ${customerLabel}<br/>Invoice: ${point.invoiceId}<br/>Distance mismatch: ${point.distanceMiles.toFixed(2)} mi<br/>Invoice time: ${invoiceTimeLabel}<br/>Arrived time: ${arrivedTimeLabel}<br/>Time delta: ${timeDeltaLabel}`
          )
          .bindTooltip(`${customerLabel} (${timeDeltaLabel})`, { permanent: false })
          .addTo(layerRef.current);

        L.circleMarker(invoice, {
          radius: isSelected ? 8 : 5,
          color: isSelected ? '#1e40af' : '#1d4ed8',
          fillColor: isSelected ? '#93c5fd' : '#60a5fa',
          fillOpacity: 0.95,
          weight: 2,
        })
          .on('click', () => onPointSelect?.(point.id))
          .bindTooltip('Invoice location', { permanent: false })
          .addTo(layerRef.current);

        L.circleMarker(arrived, {
          radius: isSelected ? 8 : 5,
          color: isSelected ? '#9a3412' : '#7c2d12',
          fillColor: isSelected ? '#fdba74' : '#fb923c',
          fillOpacity: 0.98,
          weight: 2,
        })
          .on('click', () => onPointSelect?.(point.id))
          .bindTooltip(`Arrived: ${customerLabel}`, { permanent: false })
          .addTo(layerRef.current);

        overviewBounds.extend(invoice);
        overviewBounds.extend(arrived);

        if (selectedBounds && point.id === selectedPointId) {
          selectedBounds.extend(invoice);
          selectedBounds.extend(arrived);
        }
      }

      if (selectedBounds && selectedPoint) {
        mapRef.current.flyToBounds(selectedBounds, {
          padding: [80, 80],
          maxZoom: 15,
          duration: 0.7,
        });
      } else {
        mapRef.current.fitBounds(overviewBounds, { padding: [30, 30], maxZoom: 13 });
      }

      mapRef.current.invalidateSize();
    }

    renderMap().catch(() => {
      // Keep map area stable if leaflet fails to initialize.
    });

    return () => {
      disposed = true;
    };
  }, [activeOffender, points, selectedPointId]);

  return (
    <View style={styles.shell}>
      {compareSummary ? (
        <View style={styles.summaryBar}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>WH</Text>
            <Text style={styles.summaryValue}>{compareSummary.whId}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Date</Text>
            <Text style={styles.summaryValue}>{compareSummary.date ?? 'N/A'}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Route</Text>
            <Text style={styles.summaryValue}>{compareSummary.route}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Stops</Text>
            <Text style={styles.summaryValue}>{compareSummary.stopCount}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Avg mismatch</Text>
            <Text style={styles.summaryValue}>{compareSummary.averageMiles.toFixed(2)} mi</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Worst</Text>
            <Text style={styles.summaryValue}>{compareSummary.maxMiles.toFixed(2)} mi</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Avg time delta</Text>
            <Text style={styles.summaryValue}>
              {compareSummary.averageTimeDeltaMinutes != null ? `${Math.round(compareSummary.averageTimeDeltaMinutes)} min` : 'N/A'}
            </Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Over threshold</Text>
            <Text style={styles.summaryValue}>
              {compareSummary.overThresholdCount} ({Math.round(compareSummary.overThresholdRate * 100)}%)
            </Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Risk score</Text>
            <Text style={styles.summaryValue}>{compareSummary.riskScore.toFixed(1)}</Text>
          </View>
        </View>
      ) : null}
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
  summaryBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  summaryPill: {
    minWidth: 110,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3ef',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  summaryLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
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
