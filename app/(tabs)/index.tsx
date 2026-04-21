import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as XLSX from 'xlsx';

import ParkingMap from '@/components/parking-map';

type CsvRow = Record<string, unknown>;

type Point = {
  id: string;
  latitude: number;
  longitude: number;
  vehicleId: string | null;
  speed: number | null;
  eventTimeMs: number | null;
  rowIndex: number;
};

type RouteStop = {
  id: string;
  latitude: number;
  longitude: number;
  vehicleId: string | null;
};

type RouteGroup = {
  vehicleId: string;
  stops: RouteStop[];
};

type TruckProfile = {
  vehicleCommercial: boolean;
  vehicleWeightKg: number;
  vehicleAxleWeightKg: number;
  vehicleNumberOfAxles: number;
  vehicleLengthM: number;
  vehicleWidthM: number;
  vehicleHeightM: number;
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
const START_TIME_ALIASES = ['reading_start', 'start_time', 'started_at', 'stop_start'];
const END_TIME_ALIASES = ['reading_finish', 'end_time', 'finished_at', 'stop_end'];
const TIME_ALIASES = [
  'reading_start',
  'reading_finish',
  'timestamp',
  'datetime',
  'event_time',
  'add_time',
  'time',
];
const HOTSPOT_PRECISION = 3;
const ROUTE_PRECISION = 4;
const DEFAULT_TRUCK_PROFILE: TruckProfile = {
  vehicleCommercial: true,
  vehicleWeightKg: 15000,
  vehicleAxleWeightKg: 7000,
  vehicleNumberOfAxles: 2,
  vehicleLengthM: 10.0,
  vehicleWidthM: 2.6,
  vehicleHeightM: 3.8,
};

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

function parseTimeValue(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date numbers are days since 1899-12-30.
    if (value > 20_000) {
      return Math.round((value - 25569) * 86_400_000);
    }

    return Math.round(value);
  }

  const text = String(value).trim();
  if (text.length === 0) {
    return null;
  }

  const numericText = Number(text);
  if (Number.isFinite(numericText) && text.match(/^\d+(\.\d+)?$/)) {
    if (numericText > 20_000) {
      return Math.round((numericText - 25569) * 86_400_000);
    }

    return Math.round(numericText);
  }

  // Common US format: 4/20/26 11:34 AM (or with 4-digit year / seconds)
  const usDateTimeMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[\s,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?)?$/
  );
  if (usDateTimeMatch) {
    const month = Number.parseInt(usDateTimeMatch[1], 10) - 1;
    const day = Number.parseInt(usDateTimeMatch[2], 10);
    const rawYear = Number.parseInt(usDateTimeMatch[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    let hour = Number.parseInt(usDateTimeMatch[4] ?? '0', 10);
    const minute = Number.parseInt(usDateTimeMatch[5] ?? '0', 10);
    const second = Number.parseInt(usDateTimeMatch[6] ?? '0', 10);
    const meridiem = (usDateTimeMatch[7] ?? '').toUpperCase();

    if (meridiem === 'PM' && hour < 12) {
      hour += 12;
    }
    if (meridiem === 'AM' && hour === 12) {
      hour = 0;
    }

    const parsed = new Date(year, month, day, hour, minute, second);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.getTime();
  }

  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  if (timeMatch) {
    const hours = Number.parseInt(timeMatch[1], 10);
    const minutes = Number.parseInt(timeMatch[2], 10);
    const seconds = Number.parseInt(timeMatch[3] ?? '0', 10);
    const millis = Number.parseInt((timeMatch[4] ?? '0').padEnd(3, '0').slice(0, 3), 10);

    if ([hours, minutes, seconds, millis].every(Number.isFinite)) {
      return (((hours * 60 + minutes) * 60 + seconds) * 1000) + millis;
    }
  }

  return null;
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
  const [tomtomApiKey, setTomtomApiKey] = useState('');
  const [truckProfile, setTruckProfile] = useState<TruckProfile>(DEFAULT_TRUCK_PROFILE);
  const coordinateKeys = useMemo(() => detectCoordinateKeys(rows), [rows]);
  const vehicleIdKey = useMemo(() => detectOptionalKey(rows, VEHICLE_ID_ALIASES), [rows]);
  const speedKey = useMemo(() => detectOptionalKey(rows, SPEED_ALIASES), [rows]);
  const startTimeKey = useMemo(() => detectOptionalKey(rows, START_TIME_ALIASES), [rows]);
  const endTimeKey = useMemo(() => detectOptionalKey(rows, END_TIME_ALIASES), [rows]);
  const routeTimeKey = useMemo(() => detectOptionalKey(rows, TIME_ALIASES), [rows]);

  const points = useMemo(() => {
    return rows
      .map((row, index) => {
        const latitude = toNumber(getField(row, coordinateKeys.latitudeKey));
        const longitude = toNumber(getField(row, coordinateKeys.longitudeKey));
        const vehicleIdRaw = getField(row, vehicleIdKey);
        const vehicleId = String(vehicleIdRaw ?? '').trim() || null;
        const speed = toNumber(getField(row, speedKey));
        const startTimeMs = parseTimeValue(getField(row, startTimeKey));
        const endTimeMs = parseTimeValue(getField(row, endTimeKey));
        const fallbackTimeMs = parseTimeValue(getField(row, routeTimeKey));
        const eventTimeMs = startTimeMs ?? endTimeMs ?? fallbackTimeMs;

        if (latitude == null || longitude == null) {
          return null;
        }

        return {
          id: String(index),
          latitude,
          longitude,
          vehicleId,
          speed,
          eventTimeMs,
          rowIndex: index,
        } satisfies Point;
      })
      .filter((point): point is Point => point !== null);
  }, [coordinateKeys.latitudeKey, coordinateKeys.longitudeKey, endTimeKey, routeTimeKey, rows, speedKey, startTimeKey, vehicleIdKey]);

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

  const routeGroups = useMemo(() => {
    const groupedPoints = new Map<string, Point[]>();

    for (const point of points) {
      const vehicleKey = point.vehicleId?.trim() || 'Unassigned';
      const existing = groupedPoints.get(vehicleKey) ?? [];
      existing.push(point);
      groupedPoints.set(vehicleKey, existing);
    }

    const groups: RouteGroup[] = [];

    for (const [vehicleId, grouped] of groupedPoints.entries()) {
      const pointsInRouteOrder = [...grouped];
      const hasUsableTime = pointsInRouteOrder.some((point) => point.eventTimeMs != null);

      if (hasUsableTime) {
        pointsInRouteOrder.sort((left, right) => {
          const leftTime = left.eventTimeMs;
          const rightTime = right.eventTimeMs;

          if (leftTime == null && rightTime == null) {
            return left.rowIndex - right.rowIndex;
          }

          if (leftTime == null) {
            return 1;
          }

          if (rightTime == null) {
            return -1;
          }

          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }

          return left.rowIndex - right.rowIndex;
        });
      }

      const stops: RouteStop[] = [];
      let previousKey: string | null = null;

      for (const point of pointsInRouteOrder) {
        const roundedLat = roundCoordinate(point.latitude, ROUTE_PRECISION);
        const roundedLng = roundCoordinate(point.longitude, ROUTE_PRECISION);
        const currentKey = `${roundedLat}:${roundedLng}`;

        if (currentKey === previousKey) {
          continue;
        }

        stops.push({
          id: point.id,
          latitude: point.latitude,
          longitude: point.longitude,
          vehicleId: point.vehicleId,
        });
        previousKey = currentKey;
      }

      groups.push({
        vehicleId,
        stops,
      });
    }

    return groups.sort((left, right) => right.stops.length - left.stops.length);
  }, [points]);

  const routedStopCount = useMemo(
    () => routeGroups.reduce((total, group) => total + group.stops.length, 0),
    [routeGroups]
  );

  function updateTruckProfile(field: keyof TruckProfile, value: string) {
    const parsed = Number(value);

    setTruckProfile((current) => ({
      ...current,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    }));
  }

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
        {startTimeKey || endTimeKey || routeTimeKey ? (
          <Text style={styles.helpText}>
            Route order uses stop times: <Text style={styles.helpStrong}>{startTimeKey ?? 'n/a'}</Text>
            {' '}to{' '}
            <Text style={styles.helpStrong}>{endTimeKey ?? 'n/a'}</Text>
            {routeTimeKey && routeTimeKey !== startTimeKey && routeTimeKey !== endTimeKey ? (
              <>
                {' '}with fallback time column <Text style={styles.helpStrong}>{routeTimeKey}</Text>
              </>
            ) : null}
          </Text>
        ) : (
          <Text style={styles.helpText}>
            No time column detected. Route order is currently based on uploaded row order.
          </Text>
        )}
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

        <View style={styles.routingConfig}>
          <Text style={styles.configTitle}>TomTom Truck Routing Settings</Text>
          <Text style={styles.helpText}>
            Paste a TomTom API key to route trucks on commercial-allowed roads with height/weight restrictions.
          </Text>
          <TextInput
            value={tomtomApiKey}
            onChangeText={setTomtomApiKey}
            style={styles.input}
            placeholder="TomTom API key"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.inputsRow}>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Weight kg</Text>
              <TextInput
                value={String(truckProfile.vehicleWeightKg)}
                onChangeText={(value) => updateTruckProfile('vehicleWeightKg', value)}
                style={styles.input}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Axle weight kg</Text>
              <TextInput
                value={String(truckProfile.vehicleAxleWeightKg)}
                onChangeText={(value) => updateTruckProfile('vehicleAxleWeightKg', value)}
                style={styles.input}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Axles</Text>
              <TextInput
                value={String(truckProfile.vehicleNumberOfAxles)}
                onChangeText={(value) => updateTruckProfile('vehicleNumberOfAxles', value)}
                style={styles.input}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.inputsRow}>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Length m</Text>
              <TextInput
                value={String(truckProfile.vehicleLengthM)}
                onChangeText={(value) => updateTruckProfile('vehicleLengthM', value)}
                style={styles.input}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Width m</Text>
              <TextInput
                value={String(truckProfile.vehicleWidthM)}
                onChangeText={(value) => updateTruckProfile('vehicleWidthM', value)}
                style={styles.input}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Height m</Text>
              <TextInput
                value={String(truckProfile.vehicleHeightM)}
                onChangeText={(value) => updateTruckProfile('vehicleHeightM', value)}
                style={styles.input}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        <ParkingMap
          hotspots={hotspots}
          routeGroups={routeGroups}
          tomtomApiKey={tomtomApiKey}
          truckProfile={truckProfile}
        />

        <Text style={styles.mapNote}>
          Hotspots are grouped by nearby coordinates rounded to about 3 decimal places, roughly a
          city block scale. Larger circles mean more repeated stops at that location.
        </Text>
        <Text style={styles.mapNote}>
          Routes are built per truck (`vehicle_id`) in stop-time order (oldest to newest), then
          snapped to roads using TomTom truck routing. Consecutive duplicate GPS points are
          removed before routing.
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
          <Text style={styles.boundsText}>Vehicle routes: {routeGroups.length}</Text>
          <Text style={styles.boundsText}>Road-routed stops: {routedStopCount}</Text>
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
  routingConfig: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    backgroundColor: '#f8fafc',
  },
  configTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  inputsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inputBlock: {
    flexGrow: 1,
    minWidth: 140,
    gap: 6,
  },
  inputLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
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
