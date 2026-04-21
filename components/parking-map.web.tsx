import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

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
};

const DEFAULT_CENTER: [number, number] = [40.83, -73.94];

export default function ParkingMap({ hotspots }: ParkingMapProps) {
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
  }, [hotspots]);

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