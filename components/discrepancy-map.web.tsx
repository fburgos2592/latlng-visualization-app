import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatEasternDateTime, formatSignedMinutes } from '@/lib/formatters';

type DiscrepancyPoint = {
  id: string;
  rowIndex?: number;
  invoiceLat: number;
  invoiceLng: number;
  arrivedLat: number;
  arrivedLng: number;
  distanceMiles: number;
  offender: string;
  driverUsername?: string | null;
  truckId?: string | null;
  truckName?: string | null;
  whId: string;
  invoiceId: string;
  customerName: string | null;
  invoiceTimeLabel: string | null;
  arrivedTimeLabel: string | null;
  invoiceTimeDisplay: string;
  arrivedTimeDisplay: string;
  invoiceTimeMs: number | null;
  arrivedTimeMs: number | null;
  timeDeltaMinutes: number | null;
  dateLabel?: string | null;
};

type TripHistoryPoint = {
  time: string;
  latitude: number;
  longitude: number;
  speedMilesPerHour?: number;
};

type SpeedingEvent = {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  speedMilesPerHour: number;
};

type IdleCluster = {
  id: string;
  startTime: string;
  endTime: string;
  centerLat: number;
  centerLng: number;
  durationMinutes: number;
  pointCount: number;
};

type HarshEvent = {
  id: string;
  kind: 'harsh_brake' | 'rapid_accel' | 'hard_corner';
  time: string;
  latitude: number;
  longitude: number;
  speedMilesPerHour: number;
  deltaMphPerSecond: number;
};

type PingGapEvent = {
  id: string;
  startTime: string;
  endTime: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  gapMinutes: number;
  distanceMiles: number;
};

type ProximityHit = {
  id: string;
  kind: 'invoice' | 'arrived';
  label: string;
  time: string;
  latitude: number;
  longitude: number;
  distanceMiles: number;
};

type RiskSegment = {
  id: string;
  startTime: string;
  endTime: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceMiles: number;
  durationMinutes: number;
  riskScore: number;
  riskBand: 'low' | 'medium' | 'high';
};

type DiscrepancyMapProps = {
  points: DiscrepancyPoint[];
  activeOffender: string;
  tripHistoryPoints?: TripHistoryPoint[];
  showTripHistory?: boolean;
  speedingEvents?: SpeedingEvent[];
  showSpeedingEvents?: boolean;
  idleClusters?: IdleCluster[];
  showIdleClusters?: boolean;
  harshEvents?: HarshEvent[];
  showHarshEvents?: boolean;
  pingGapEvents?: PingGapEvent[];
  showPingGapEvents?: boolean;
  proximityHits?: ProximityHit[];
  showProximityHits?: boolean;
  riskSegments?: RiskSegment[];
  showRiskSegments?: boolean;
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

function buildInvoicePopupHtml(point: DiscrepancyPoint): string {
  const customer = point.customerName ?? 'Unknown';
  const timeDelta = point.timeDeltaMinutes != null ? formatSignedMinutes(point.timeDeltaMinutes) : 'N/A';
  const truck = point.truckName ?? point.truckId ?? null;
  const driver = point.driverUsername ?? null;
  const mismatchColor = colorForMiles(point.distanceMiles);

  const row = (label: string, value: string, color = '#0f172a', mono = false) =>
    `<tr><td style="color:#64748b;padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top;">${label}</td><td style="font-weight:600;color:${color};${mono ? 'font-family:monospace;font-size:11px;' : ''}">${value}</td></tr>`;

  return [
    `<div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.55;min-width:230px;max-width:300px;">`,
    `<div style="font-weight:800;font-size:13px;margin-bottom:6px;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:5px;">Invoice ${point.invoiceId}</div>`,
    `<table style="border-collapse:collapse;width:100%;">`,
    row('Customer', customer),
    row('Route', point.offender),
    driver ? row('Driver', driver) : '',
    truck ? row('Truck', truck) : '',
    row('WH', point.whId),
    point.dateLabel ? row('Date', point.dateLabel) : '',
    row('Mismatch', `${point.distanceMiles.toFixed(2)} mi`, mismatchColor),
    row('Invoice time', point.invoiceTimeDisplay),
    row('Arrived time', point.arrivedTimeDisplay),
    row('Time delta', timeDelta),
    row('Invoice coords', `${point.invoiceLat.toFixed(5)}, ${point.invoiceLng.toFixed(5)}`, '#475569', true),
    row('Arrived coords', `${point.arrivedLat.toFixed(5)}, ${point.arrivedLng.toFixed(5)}`, '#475569', true),
    `</table></div>`,
  ].join('');
}

function colorForRiskBand(riskBand: 'low' | 'medium' | 'high'): string {
  if (riskBand === 'high') {
    return '#dc2626';
  }

  if (riskBand === 'medium') {
    return '#f59e0b';
  }

  return '#16a34a';
}

export default function DiscrepancyMap({
  points,
  activeOffender,
  tripHistoryPoints = [],
  showTripHistory = true,
  speedingEvents = [],
  showSpeedingEvents = true,
  idleClusters = [],
  showIdleClusters = true,
  harshEvents = [],
  showHarshEvents = true,
  pingGapEvents = [],
  showPingGapEvents = true,
  proximityHits = [],
  showProximityHits = true,
  riskSegments = [],
  showRiskSegments = true,
  routeMapUrl,
  compareSummary,
  selectedPointId,
  onPointSelect,
}: DiscrepancyMapProps) {
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

      const tripLatLngs: [number, number][] = showTripHistory
        ? tripHistoryPoints
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
        .map((point) => [point.latitude, point.longitude])
        : [];

      if (points.length === 0 && tripLatLngs.length === 0) {
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

      if (tripLatLngs.length > 0) {
        const tripLine = L.polyline(tripLatLngs, {
          color: '#1d4ed8',
          weight: 5,
          opacity: 0.72,
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(layerRef.current);

        tripLine.bindTooltip('Samsara trip history', { permanent: false });

        const startPoint = tripLatLngs[0];
        const endPoint = tripLatLngs[tripLatLngs.length - 1];

        L.circleMarker(startPoint, {
          radius: 7,
          color: '#1d4ed8',
          fillColor: '#60a5fa',
          fillOpacity: 1,
          weight: 2,
        })
          .bindTooltip('Trip start', { permanent: false })
          .bindPopup(`<strong>Samsara trip start</strong><br/>${formatEasternDateTime(Date.parse(tripHistoryPoints[0].time))}`)
          .addTo(layerRef.current);

        L.circleMarker(endPoint, {
          radius: 7,
          color: '#7c3aed',
          fillColor: '#c084fc',
          fillOpacity: 1,
          weight: 2,
        })
          .bindTooltip('Trip end', { permanent: false })
          .bindPopup(`<strong>Samsara trip end</strong><br/>${formatEasternDateTime(Date.parse(tripHistoryPoints[tripHistoryPoints.length - 1].time))}`)
          .addTo(layerRef.current);

        for (const tripPoint of tripLatLngs) {
          overviewBounds.extend(tripPoint);
        }
      }

      if (showRiskSegments) {
        for (const segment of riskSegments) {
          const start: [number, number] = [segment.startLat, segment.startLng];
          const end: [number, number] = [segment.endLat, segment.endLng];
          const bandColor = colorForRiskBand(segment.riskBand);

          L.polyline([start, end], {
            color: bandColor,
            weight: 7,
            opacity: 0.55,
            lineCap: 'round',
          })
            .bindTooltip(`Risk ${segment.riskBand.toUpperCase()} (${segment.riskScore.toFixed(1)})`, { permanent: false })
            .bindPopup(`<strong>Segment risk</strong><br/>Band: ${segment.riskBand}<br/>Score: ${segment.riskScore.toFixed(1)}<br/>Distance: ${segment.distanceMiles.toFixed(2)} mi<br/>Duration: ${Math.max(0, Math.round(segment.durationMinutes))} min<br/>${formatEasternDateTime(Date.parse(segment.startTime))} to ${formatEasternDateTime(Date.parse(segment.endTime))}`)
            .addTo(layerRef.current);

          overviewBounds.extend(start);
          overviewBounds.extend(end);
        }
      }

      if (showSpeedingEvents) {
        for (const event of speedingEvents) {
          const eventLatLng: [number, number] = [event.latitude, event.longitude];
          L.circleMarker(eventLatLng, {
            radius: 5,
            color: '#991b1b',
            fillColor: '#ef4444',
            fillOpacity: 0.95,
            weight: 2,
          })
            .bindTooltip(`Speeding ${Math.round(event.speedMilesPerHour)} mph`, { permanent: false })
            .bindPopup(`<strong>Speeding event</strong><br/>${Math.round(event.speedMilesPerHour)} mph<br/>${formatEasternDateTime(Date.parse(event.time))}`)
            .addTo(layerRef.current);

          overviewBounds.extend(eventLatLng);
        }
      }

      if (showIdleClusters) {
        for (const cluster of idleClusters) {
          const idleCenter: [number, number] = [cluster.centerLat, cluster.centerLng];
          const radiusMeters = Math.max(45, Math.min(180, cluster.durationMinutes * 3));

          L.circle(idleCenter, {
            radius: radiusMeters,
            color: '#92400e',
            fillColor: '#f59e0b',
            fillOpacity: 0.22,
            weight: 2,
          })
            .bindTooltip(`Idle cluster ${Math.round(cluster.durationMinutes)} min`, { permanent: false })
            .bindPopup(`<strong>Idle cluster</strong><br/>${Math.round(cluster.durationMinutes)} min<br/>${cluster.pointCount} low-speed pings<br/>${formatEasternDateTime(Date.parse(cluster.startTime))} to ${formatEasternDateTime(Date.parse(cluster.endTime))}`)
            .addTo(layerRef.current);

          overviewBounds.extend(idleCenter);
        }
      }

      if (showHarshEvents) {
        for (const event of harshEvents) {
          const latLng: [number, number] = [event.latitude, event.longitude];
          const eventColor = event.kind === 'harsh_brake'
            ? '#dc2626'
            : event.kind === 'rapid_accel'
              ? '#ea580c'
              : '#7c3aed';
          const eventLabel = event.kind === 'harsh_brake'
            ? 'Harsh brake'
            : event.kind === 'rapid_accel'
              ? 'Rapid accel'
              : 'Hard corner';

          L.circleMarker(latLng, {
            radius: 5,
            color: '#111827',
            fillColor: eventColor,
            fillOpacity: 0.92,
            weight: 1.5,
          })
            .bindTooltip(`${eventLabel} @ ${Math.round(event.speedMilesPerHour)} mph`, { permanent: false })
            .bindPopup(`<strong>${eventLabel}</strong><br/>Speed: ${Math.round(event.speedMilesPerHour)} mph<br/>Delta: ${event.deltaMphPerSecond.toFixed(2)} mph/s<br/>${formatEasternDateTime(Date.parse(event.time))}`)
            .addTo(layerRef.current);

          overviewBounds.extend(latLng);
        }
      }

      if (showPingGapEvents) {
        for (const gap of pingGapEvents) {
          const start: [number, number] = [gap.startLat, gap.startLng];
          const end: [number, number] = [gap.endLat, gap.endLng];
          const midLatLng: [number, number] = [(gap.startLat + gap.endLat) / 2, (gap.startLng + gap.endLng) / 2];

          L.polyline([start, end], {
            color: '#be185d',
            weight: 4,
            opacity: 0.75,
            dashArray: '6 6',
          })
            .bindTooltip(`GPS gap ${gap.gapMinutes.toFixed(1)} min`, { permanent: false })
            .bindPopup(`<strong>GPS ping gap</strong><br/>Gap: ${gap.gapMinutes.toFixed(1)} min<br/>Jump: ${gap.distanceMiles.toFixed(2)} mi<br/>${formatEasternDateTime(Date.parse(gap.startTime))} to ${formatEasternDateTime(Date.parse(gap.endTime))}`)
            .addTo(layerRef.current);

          L.circleMarker(midLatLng, {
            radius: 4,
            color: '#831843',
            fillColor: '#f472b6',
            fillOpacity: 0.95,
            weight: 1.5,
          }).addTo(layerRef.current);

          overviewBounds.extend(start);
          overviewBounds.extend(end);
          overviewBounds.extend(midLatLng);
        }
      }

      if (showProximityHits) {
        for (const hit of proximityHits) {
          const latLng: [number, number] = [hit.latitude, hit.longitude];
          const hitColor = hit.kind === 'invoice' ? '#2563eb' : '#0f766e';

          L.circleMarker(latLng, {
            radius: 4,
            color: hitColor,
            fillColor: '#ffffff',
            fillOpacity: 0.95,
            weight: 2,
          })
            .bindTooltip(`${hit.kind === 'invoice' ? 'Invoice' : 'Arrived'} hit`, { permanent: false })
            .bindPopup(`<strong>Customer geofence hit</strong><br/>Type: ${hit.kind}<br/>Target: ${hit.label}<br/>Distance: ${(hit.distanceMiles * 5280).toFixed(0)} ft<br/>${formatEasternDateTime(Date.parse(hit.time))}`)
            .addTo(layerRef.current);

          overviewBounds.extend(latLng);
        }
      }

      for (const point of points) {
        const invoice: [number, number] = [point.invoiceLat, point.invoiceLng];
        const arrived: [number, number] = [point.arrivedLat, point.arrivedLng];
        const color = colorForMiles(point.distanceMiles);
        const customerLabel = point.customerName ?? 'Unknown customer';
        const isSelected = selectedPointId === point.id;
        const lineColor = isSelected ? '#2563eb' : color;
        const lineWeight = isSelected ? 6 : 3;
        const lineOpacity = isSelected ? 1 : 0.85;
        const tooltipHtml = buildInvoicePopupHtml(point);
        const tooltipOpts = { sticky: true, direction: 'auto' as const, opacity: 1 };

        L.polyline([invoice, arrived], {
          color: lineColor,
          weight: lineWeight,
          opacity: lineOpacity,
          dashArray: '4 6',
        })
          .on('click', () => onPointSelect?.(point.id))
          .bindTooltip(tooltipHtml, tooltipOpts)
          .addTo(layerRef.current);

        L.circleMarker(invoice, {
          radius: isSelected ? 8 : 5,
          color: isSelected ? '#1e40af' : '#1d4ed8',
          fillColor: isSelected ? '#93c5fd' : '#60a5fa',
          fillOpacity: 0.95,
          weight: 2,
        })
          .on('click', () => onPointSelect?.(point.id))
          .bindTooltip(tooltipHtml, tooltipOpts)
          .addTo(layerRef.current);

        L.circleMarker(arrived, {
          radius: isSelected ? 8 : 5,
          color: isSelected ? '#9a3412' : '#7c2d12',
          fillColor: isSelected ? '#fdba74' : '#fb923c',
          fillOpacity: 0.98,
          weight: 2,
        })
          .on('click', () => onPointSelect?.(point.id))
          .bindTooltip(tooltipHtml, tooltipOpts)
          .addTo(layerRef.current);

        overviewBounds.extend(invoice);
        overviewBounds.extend(arrived);

        if (selectedBounds && point.id === selectedPointId) {
          selectedBounds.extend(invoice);
          selectedBounds.extend(arrived);
        }
      }

      if (selectedBounds && selectedPoint && tripLatLngs.length === 0) {
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
  }, [
    activeOffender,
    idleClusters,
    onPointSelect,
    pingGapEvents,
    points,
    proximityHits,
    riskSegments,
    selectedPointId,
    showHarshEvents,
    showIdleClusters,
    showPingGapEvents,
    showProximityHits,
    showRiskSegments,
    showSpeedingEvents,
    showTripHistory,
    speedingEvents,
    harshEvents,
    tripHistoryPoints,
  ]);

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
        <Text style={styles.legendItem}>Blue line Samsara trip</Text>
        <Text style={styles.legendItem}>Risk ribbons green/amber/red</Text>
        <Text style={styles.legendItem}>Red dots speeding events</Text>
        <Text style={styles.legendItem}>Amber circles idle clusters</Text>
        <Text style={styles.legendItem}>Pink dashed lines GPS gaps</Text>
        <Text style={styles.legendItem}>Teal/blue rings customer hits</Text>
        <Text style={styles.legendItem}>Orange/red/purple harsh events</Text>
        <Text style={styles.legendItem}>Purple dot trip end</Text>
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
