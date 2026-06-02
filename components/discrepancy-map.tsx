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

type TripHistoryPoint = {
  time: string;
  latitude: number;
  longitude: number;
  speedMilesPerHour?: number;
};

type DiscrepancyMapProps = {
  points: DiscrepancyPoint[];
  activeOffender: string;
  tripHistoryPoints?: TripHistoryPoint[];
  showTripHistory?: boolean;
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

export default function DiscrepancyMap({ points, activeOffender, tripHistoryPoints = [], showTripHistory = true }: DiscrepancyMapProps) {
  return (
    <View style={styles.shell}>
      <Text style={styles.title}>Interactive mismatch map is available on web.</Text>
      <Text style={styles.copy}>
        Load this same file in the browser to inspect invoice vs arrived gaps for {activeOffender} across {points.length} invoices. {tripHistoryPoints.length > 0 && showTripHistory ? 'Samsara trip history is also visible on the web map.' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#eef2ff',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  copy: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 380,
  },
});
