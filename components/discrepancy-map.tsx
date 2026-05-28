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

export default function DiscrepancyMap({ points, activeOffender }: DiscrepancyMapProps) {
  return (
    <View style={styles.shell}>
      <Text style={styles.title}>Interactive mismatch map is available on web.</Text>
      <Text style={styles.copy}>
        Load this same file in the browser to inspect invoice vs arrived gaps for {activeOffender} across {points.length} invoices.
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
