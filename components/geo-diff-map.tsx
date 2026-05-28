import { StyleSheet, Text, View } from 'react-native';

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
};

export default function GeoDiffMap({ pairs }: GeoDiffMapProps) {
  return (
    <View style={styles.shell}>
      <Text style={styles.title}>Map preview is available on the web build.</Text>
      <Text style={styles.copy}>
        Open the web build to see {pairs.length} invoice vs arrived discrepancy pairs on an
        interactive map.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#bfd7ea',
    backgroundColor: '#ecfeff',
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
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 360,
  },
});
