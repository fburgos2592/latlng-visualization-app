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

export default function ParkingMap({ hotspots, routeGroups }: ParkingMapProps) {
  const stopCount = routeGroups.reduce((total, group) => total + group.stops.length, 0);

  return (
    <View style={styles.shell}>
      <Text style={styles.title}>Map preview is available on the web build.</Text>
      <Text style={styles.copy}>
        Upload the same file in the GitHub Pages site to inspect {hotspots.length} hotspot groups and
        truck-specific road routes across {stopCount} ordered stops on an interactive map.
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