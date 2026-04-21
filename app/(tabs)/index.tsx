import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as XLSX from 'xlsx';

import ParkingMap from '@/components/parking-map';

type CsvRow = Record<string, unknown>;

type Point = {
  id: string;
  latitude: number;
  longitude: number;
  vehicleId: string | null;
  speed: number | null;
};

type RouteStop = {
  id: string;
  latitude: number;
  longitude: number;
  vehicleId: string | null;
};

type Hotspot = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  vehicleCount: number;
  vehicleIds: string[];
  averageSpeed: number | null;
};

type Bounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type CoordinateKeys = {
  latitudeKey: string | null;
  longitudeKey: string | null;
};

const LATITUDE_ALIASES = ['lat', 'latitude', 'vehicle_lat', 'vehicle_latitude'];
const LONGITUDE_ALIASES = ['lng', 'lon', 'long', 'longitude', 'vehicle_lng', 'vehicle_lon', 'vehicle_longitude'];
const VEHICLE_ID_ALIASES = ['vehicle_id', 'truck_id', 'unit_id', 'vehicle'];
const SPEED_ALIASES = ['speed', 'mph'];
const HOTSPOT_PRECISION = 3;
const ROUTE_PRECISION = 4;

function toNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function pickBestKey(candidates: string[], aliases: string[]): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const normalizedLookup = new Map(candidates.map((candidate) => [normalizeKey(candidate), candidate]));

  for (const alias of aliases) {
    const match = normalizedLookup.get(alias);
    if (match) {
      return match;
    }
  }

  return candidates[0] ?? null;
}

function detectCoordinateKeys(rows: CsvRow[]): CoordinateKeys {
  const allKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const latitudeCandidates = allKeys.filter((key) => {
    const normalized = normalizeKey(key);
    return normalized.includes('lat');
  });

  const longitudeCandidates = allKeys.filter((key) => {
    const normalized = normalizeKey(key);
    return normalized.includes('lng') || normalized.includes('lon') || normalized.includes('longitude');
  });

  return {
    latitudeKey: pickBestKey(latitudeCandidates, LATITUDE_ALIASES),
    longitudeKey: pickBestKey(longitudeCandidates, LONGITUDE_ALIASES),
  };
}

function detectOptionalKey(rows: CsvRow[], aliases: string[]): string | null {
  const allKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const exactMatch = pickBestKey(allKeys, aliases);
  if (exactMatch) {
    return exactMatch;
  }

  const containsMatches = allKeys.filter((key) => {
    const normalized = normalizeKey(key);
    return aliases.some((alias) => normalized.includes(normalizeKey(alias)));
  });

  return containsMatches[0] ?? null;
}

function roundCoordinate(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function getField(row: CsvRow, key: string | null): unknown {
  if (!key) {
    return undefined;
  }

  if (row[key] !== undefined) {
    return row[key];
  }

  const normalizedEntries = Object.entries(row).reduce<Record<string, unknown>>((acc, [entryKey, value]) => {
    acc[normalizeKey(entryKey)] = value;
    return acc;
  }, {});

  return normalizedEntries[normalizeKey(key)];
}

function getBounds(points: Point[]): Bounds {
  if (points.length === 0) {
    return {
      minLat: -90,
      maxLat: 90,
      minLng: -180,
      maxLng: 180,
    };
  }

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  const latPad = Math.max((maxLat - minLat) * 0.1, 0.25);
  const lngPad = Math.max((maxLng - minLng) * 0.1, 0.25);

  return {
    minLat: Math.max(-90, minLat - latPad),
    maxLat: Math.min(90, maxLat + latPad),
    minLng: Math.max(-180, minLng - lngPad),
    maxLng: Math.min(180, maxLng + lngPad),
  };
}

function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

async function readCsvText(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if ('file' in asset && asset.file) {
    return asset.file.text();
  }

  const response = await fetch(asset.uri);
  return response.text();
}

async function readBinaryData(asset: DocumentPicker.DocumentPickerAsset): Promise<ArrayBuffer> {
  if ('file' in asset && asset.file) {
    return asset.file.arrayBuffer();
  }

  const response = await fetch(asset.uri);
  return response.arrayBuffer();
}

function parseCsvRows(csvText: string): CsvRow[] {
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const meaningfulErrors = parsed.errors.filter((entry) => entry.code !== 'UndetectableDelimiter');
  if (meaningfulErrors.length > 0) {
    throw new Error(meaningfulErrors[0].message || 'CSV parse error');
  }

  return parsed.data ?? [];
}

function parseWorkbookRows(buffer: ArrayBuffer): CsvRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<CsvRow>(sheet, { defval: '' });
}

function isSpreadsheetUpload(asset: DocumentPicker.DocumentPickerAsset): boolean {
  const fileName = asset.name?.toLowerCase() ?? '';
  const mimeType = asset.mimeType?.toLowerCase() ?? '';

  return (
    fileName.endsWith('.xlsx') ||
    fileName.endsWith('.xls') ||
    mimeType.includes('spreadsheetml') ||
    mimeType === 'application/vnd.ms-excel'
  );
}

export default function HomeScreen() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const coordinateKeys = useMemo(() => detectCoordinateKeys(rows), [rows]);
  const vehicleIdKey = useMemo(() => detectOptionalKey(rows, VEHICLE_ID_ALIASES), [rows]);
  const speedKey = useMemo(() => detectOptionalKey(rows, SPEED_ALIASES), [rows]);

  const points = useMemo(() => {
    return rows
      .map((row, index) => {
        const latitude = toNumber(getField(row, coordinateKeys.latitudeKey));
        const longitude = toNumber(getField(row, coordinateKeys.longitudeKey));
        const vehicleIdRaw = getField(row, vehicleIdKey);
        const vehicleId = String(vehicleIdRaw ?? '').trim() || null;
        const speed = toNumber(getField(row, speedKey));

        if (latitude == null || longitude == null) {
          return null;
        }

        return {
          id: String(index),
          latitude,
          longitude,
          vehicleId,
          speed,
        } satisfies Point;
      })
      .filter((point): point is Point => point !== null);
  }, [coordinateKeys.latitudeKey, coordinateKeys.longitudeKey, rows, speedKey, vehicleIdKey]);

  const invalidRowCount = rows.length - points.length;
  const bounds = useMemo(() => getBounds(points), [points]);
  const hotspots = useMemo(() => {
    const grouped = new Map<
      string,
      {
        totalLat: number;
        totalLng: number;
        count: number;
        vehicleIds: Set<string>;
        totalSpeed: number;
        speedSamples: number;
      }
    >();

    for (const point of points) {
      const groupLat = roundCoordinate(point.latitude, HOTSPOT_PRECISION);
      const groupLng = roundCoordinate(point.longitude, HOTSPOT_PRECISION);
      const groupKey = `${groupLat}:${groupLng}`;
      const existing = grouped.get(groupKey) ?? {
        totalLat: 0,
        totalLng: 0,
        count: 0,
        vehicleIds: new Set<string>(),
        totalSpeed: 0,
        speedSamples: 0,
      };

      existing.totalLat += point.latitude;
      existing.totalLng += point.longitude;
      existing.count += 1;

      if (point.vehicleId) {
        existing.vehicleIds.add(point.vehicleId);
      }

      if (point.speed != null) {
        existing.totalSpeed += point.speed;
        existing.speedSamples += 1;
      }

      grouped.set(groupKey, existing);
    }

    return Array.from(grouped.entries())
      .map(([key, value]) => ({
        id: key,
        latitude: value.totalLat / value.count,
        longitude: value.totalLng / value.count,
        count: value.count,
        vehicleCount: value.vehicleIds.size,
        vehicleIds: Array.from(value.vehicleIds).sort(),
        averageSpeed: value.speedSamples > 0 ? value.totalSpeed / value.speedSamples : null,
      }))
      .sort((left, right) => right.count - left.count);
  }, [points]);

  const routeStops = useMemo(() => {
    const orderedStops: RouteStop[] = [];
    let previousKey: string | null = null;

    for (const point of points) {
      const roundedLat = roundCoordinate(point.latitude, ROUTE_PRECISION);
      const roundedLng = roundCoordinate(point.longitude, ROUTE_PRECISION);
      const currentKey = `${roundedLat}:${roundedLng}`;

      if (currentKey === previousKey) {
        continue;
      }

      orderedStops.push({
        id: point.id,
        latitude: point.latitude,
        longitude: point.longitude,
        vehicleId: point.vehicleId,
      });
      previousKey = currentKey;
    }

    return orderedStops;
  }, [points]);

  async function pickCsv() {
    setError('');

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setError('Could not read the selected file.');
        return;
      }

      const parsedRows = isSpreadsheetUpload(asset)
        ? parseWorkbookRows(await readBinaryData(asset))
        : parseCsvRows(await readCsvText(asset));

      const detectedKeys = detectCoordinateKeys(parsedRows);

      setFileName(asset.name ?? 'Uploaded CSV');
      setRows(parsedRows);

      if (parsedRows.length > 0 && (!detectedKeys.latitudeKey || !detectedKeys.longitudeKey)) {
        setError('Could not find coordinate columns. Expected headers like lat/lng, latitude/longitude, or vehicle_lat/vehicle_lng.');
        return;
      }

      setError('');
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Unable to open or parse that file.';
      setError(message);
      setRows([]);
      setFileName('');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Static Web Export Ready</Text>
        <Text style={styles.title}>CSV Latitude/Longitude Visualizer</Text>
        <Text style={styles.subtitle}>
          Upload a CSV and preview every valid coordinate in a browser-safe geographic plot that can
          be exported to GitHub Pages.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.toolbar}>
          <Pressable onPress={pickCsv} style={styles.button}>
            <Text style={styles.buttonText}>Choose CSV</Text>
          </Pressable>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Rows</Text>
            <Text style={styles.metaValue}>{rows.length}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Valid points</Text>
            <Text style={styles.metaValue}>{points.length}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Skipped rows</Text>
            <Text style={styles.metaValue}>{invalidRowCount}</Text>
          </View>
        </View>

        <Text style={styles.helpText}>
          Expected columns: <Text style={styles.helpStrong}>lat,lng</Text>,{' '}
          <Text style={styles.helpStrong}>latitude,longitude</Text>, or{' '}
          <Text style={styles.helpStrong}>vehicle_lat,vehicle_lng</Text>. CSV and Excel uploads are supported.
        </Text>
        <Text style={styles.helpText}>
          Best fit for GitHub Pages: {Platform.OS === 'web' ? 'browser upload is ready here' : 'open the web build to test browser uploads'}.
        </Text>
        {fileName ? <Text style={styles.fileName}>Loaded: {fileName}</Text> : null}
        {coordinateKeys.latitudeKey && coordinateKeys.longitudeKey ? (
          <Text style={styles.helpText}>
            Detected coordinate columns: <Text style={styles.helpStrong}>{coordinateKeys.latitudeKey}</Text> and{' '}
            <Text style={styles.helpStrong}>{coordinateKeys.longitudeKey}</Text>
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.plotHeader}>
          <Text style={styles.sectionTitle}>Parking Map</Text>
          <Text style={styles.sectionCopy}>
            Repeated coordinates are grouped into parking hotspots so the places your trucks return
            to most often stand out on the map.
          </Text>
        </View>

        <ParkingMap hotspots={hotspots} routeStops={routeStops} />

        <Text style={styles.mapNote}>
          Hotspots are grouped by nearby coordinates rounded to about 3 decimal places, roughly a
          city block scale. Larger circles mean more repeated stops at that location.
        </Text>
        <Text style={styles.mapNote}>
          The blue route follows the uploaded stop order and is snapped to roads with a public
          routing service. Consecutive duplicate GPS points are removed before routing.
        </Text>

        <View style={styles.boundsRow}>
          <Text style={styles.boundsText}>Min lat: {formatCoordinate(bounds.minLat)}</Text>
          <Text style={styles.boundsText}>Max lat: {formatCoordinate(bounds.maxLat)}</Text>
          <Text style={styles.boundsText}>Min lng: {formatCoordinate(bounds.minLng)}</Text>
          <Text style={styles.boundsText}>Max lng: {formatCoordinate(bounds.maxLng)}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Top Parking Hotspots</Text>
        {hotspots.slice(0, 12).map((hotspot, index) => (
          <View key={hotspot.id} style={styles.previewRow}>
            <Text style={styles.previewIndex}>#{index + 1}</Text>
            <Text style={styles.previewValue}>Lat {formatCoordinate(hotspot.latitude)}</Text>
            <Text style={styles.previewValue}>Lng {formatCoordinate(hotspot.longitude)}</Text>
            <Text style={styles.previewValue}>Stops {hotspot.count}</Text>
            <Text style={styles.previewValue}>Vehicles {hotspot.vehicleCount}</Text>
            {hotspot.averageSpeed != null ? (
              <Text style={styles.previewValue}>Avg speed {hotspot.averageSpeed.toFixed(2)}</Text>
            ) : null}
          </View>
        ))}
        {hotspots.length > 12 ? (
          <Text style={styles.moreText}>Showing first 12 of {hotspots.length} hotspot groups.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Route Summary</Text>
        <View style={styles.boundsRow}>
          <Text style={styles.boundsText}>Uploaded points: {points.length}</Text>
          <Text style={styles.boundsText}>Road-routed stops: {routeStops.length}</Text>
          <Text style={styles.boundsText}>Hotspot groups: {hotspots.length}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 16,
    backgroundColor: '#f4f7fb',
  },
  hero: {
    paddingVertical: 12,
    gap: 8,
  },
  eyebrow: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 760,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#0f766e',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  metaBlock: {
    minWidth: 96,
    borderRadius: 14,
    backgroundColor: '#ecfeff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  metaLabel: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
  },
  helpText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  helpStrong: {
    color: '#0f172a',
    fontWeight: '700',
  },
  fileName: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '600',
  },
  plotHeader: {
    gap: 6,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
  },
  sectionCopy: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
  mapNote: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  boundsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  boundsText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 10,
  },
  previewIndex: {
    minWidth: 40,
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
  },
  previewValue: {
    color: '#334155',
    fontSize: 14,
  },
  moreText: {
    color: '#64748b',
    fontSize: 13,
    fontStyle: 'italic',
  },
});
