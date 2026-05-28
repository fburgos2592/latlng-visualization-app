import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as XLSX from 'xlsx';

import DiscrepancyMap from '@/components/discrepancy-map';

type DataRow = Record<string, unknown>;

type DiscrepancyPoint = {
  id: string;
  invoiceLat: number;
  invoiceLng: number;
  arrivedLat: number;
  arrivedLng: number;
  distanceMiles: number;
  offender: string;
  invoiceId: string;
  dateLabel: string | null;
};

type KeySelection = {
  invoiceLatKey: string | null;
  invoiceLngKey: string | null;
  arrivedLatKey: string | null;
  arrivedLngKey: string | null;
  offenderKey: string | null;
  invoiceIdKey: string | null;
  dateKey: string | null;
};

type OffenderSummary = {
  offender: string;
  invoiceCount: number;
  averageMiles: number;
  maxMiles: number;
  overThresholdCount: number;
  overThresholdRate: number;
};

const INVOICE_LAT_ALIASES = ['lat', 'invoice_lat', 'invoice_latitude'];
const INVOICE_LNG_ALIASES = ['lng', 'lon', 'long', 'invoice_lng', 'invoice_longitude'];
const ARRIVED_LAT_ALIASES = ['arrived_lat', 'arrival_lat', 'arrive_lat'];
const ARRIVED_LNG_ALIASES = ['arrived_lng', 'arrived_lon', 'arrival_lng', 'arrive_lng'];
const OFFENDER_ALIASES = ['route', 'wh_id', 'driver_id', 'vehicle_id', 'truck_id', 'unit_id'];
const INVOICE_ID_ALIASES = ['invoice', 'invoice_id', 'order_id'];
const DATE_ALIASES = ['date', 'invoice_date', 'service_date'];

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function toNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function pickExactKey(keys: string[], aliases: string[]): string | null {
  const normalizedLookup = new Map(keys.map((key) => [normalizeKey(key), key]));

  for (const alias of aliases) {
    const match = normalizedLookup.get(normalizeKey(alias));
    if (match) {
      return match;
    }
  }

  return null;
}

function pickContainsKey(keys: string[], aliases: string[]): string | null {
  const normalizedAliases = aliases.map((alias) => normalizeKey(alias));

  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (normalizedAliases.some((alias) => normalized.includes(alias))) {
      return key;
    }
  }

  return null;
}

function detectKeys(rows: DataRow[]): KeySelection {
  const allKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const invoiceLatKey = pickExactKey(allKeys, INVOICE_LAT_ALIASES) ?? pickContainsKey(allKeys, ['lat']);
  const invoiceLngKey = pickExactKey(allKeys, INVOICE_LNG_ALIASES) ?? pickContainsKey(allKeys, ['lng', 'lon', 'longitude']);
  const arrivedLatKey = pickExactKey(allKeys, ARRIVED_LAT_ALIASES) ?? pickContainsKey(allKeys, ['arrived_lat', 'arrival_lat']);
  const arrivedLngKey = pickExactKey(allKeys, ARRIVED_LNG_ALIASES) ?? pickContainsKey(allKeys, ['arrived_lng', 'arrival_lng']);
  const offenderKey = pickExactKey(allKeys, OFFENDER_ALIASES) ?? pickContainsKey(allKeys, ['route', 'wh', 'driver', 'vehicle']);
  const invoiceIdKey = pickExactKey(allKeys, INVOICE_ID_ALIASES) ?? pickContainsKey(allKeys, ['invoice']);
  const dateKey = pickExactKey(allKeys, DATE_ALIASES) ?? pickContainsKey(allKeys, ['date']);

  return {
    invoiceLatKey,
    invoiceLngKey,
    arrivedLatKey,
    arrivedLngKey,
    offenderKey,
    invoiceIdKey,
    dateKey,
  };
}

function getField(row: DataRow, key: string | null): unknown {
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

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
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

function parseCsvRows(csvText: string): DataRow[] {
  const parsed = Papa.parse<DataRow>(csvText, {
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

function parseWorkbookRows(buffer: ArrayBuffer): DataRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<DataRow>(sheet, { defval: '' });
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

export default function ImpactScreen() {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [thresholdText, setThresholdText] = useState('1');

  const thresholdMiles = useMemo(() => {
    const parsed = Number(thresholdText);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [thresholdText]);

  const keys = useMemo(() => detectKeys(rows), [rows]);

  const points = useMemo(() => {
    return rows
      .map((row, rowIndex) => {
        const invoiceLat = toNumber(getField(row, keys.invoiceLatKey));
        const invoiceLng = toNumber(getField(row, keys.invoiceLngKey));
        const arrivedLat = toNumber(getField(row, keys.arrivedLatKey));
        const arrivedLng = toNumber(getField(row, keys.arrivedLngKey));

        if (invoiceLat == null || invoiceLng == null || arrivedLat == null || arrivedLng == null) {
          return null;
        }

        const distanceMiles = haversineMiles(invoiceLat, invoiceLng, arrivedLat, arrivedLng);
        const offenderRaw = getField(row, keys.offenderKey);
        const offender = String(offenderRaw ?? '').trim() || 'Unknown';
        const invoiceRaw = getField(row, keys.invoiceIdKey);
        const invoiceId = String(invoiceRaw ?? '').trim() || `row-${rowIndex + 1}`;
        const dateRaw = getField(row, keys.dateKey);
        const dateLabel = String(dateRaw ?? '').trim() || null;

        return {
          id: String(rowIndex),
          invoiceLat,
          invoiceLng,
          arrivedLat,
          arrivedLng,
          distanceMiles,
          offender,
          invoiceId,
          dateLabel,
        } satisfies DiscrepancyPoint;
      })
      .filter((point): point is DiscrepancyPoint => point !== null);
  }, [keys.arrivedLatKey, keys.arrivedLngKey, keys.dateKey, keys.invoiceIdKey, keys.invoiceLatKey, keys.invoiceLngKey, keys.offenderKey, rows]);

  const offenderSummaries = useMemo(() => {
    const grouped = new Map<string, { count: number; totalMiles: number; maxMiles: number; overThresholdCount: number }>();

    for (const point of points) {
      const existing = grouped.get(point.offender) ?? {
        count: 0,
        totalMiles: 0,
        maxMiles: 0,
        overThresholdCount: 0,
      };

      existing.count += 1;
      existing.totalMiles += point.distanceMiles;
      existing.maxMiles = Math.max(existing.maxMiles, point.distanceMiles);

      if (point.distanceMiles >= thresholdMiles) {
        existing.overThresholdCount += 1;
      }

      grouped.set(point.offender, existing);
    }

    return Array.from(grouped.entries())
      .map(([offender, value]) => {
        const averageMiles = value.totalMiles / value.count;
        const overThresholdRate = value.overThresholdCount / value.count;

        return {
          offender,
          invoiceCount: value.count,
          averageMiles,
          maxMiles: value.maxMiles,
          overThresholdCount: value.overThresholdCount,
          overThresholdRate,
        } satisfies OffenderSummary;
      })
      .sort((left, right) => {
        if (right.overThresholdRate !== left.overThresholdRate) {
          return right.overThresholdRate - left.overThresholdRate;
        }

        if (right.averageMiles !== left.averageMiles) {
          return right.averageMiles - left.averageMiles;
        }

        return right.invoiceCount - left.invoiceCount;
      });
  }, [points, thresholdMiles]);

  const topOffender = offenderSummaries[0] ?? null;

  const topOffenderPoints = useMemo(() => {
    if (!topOffender) {
      return [];
    }

    return points
      .filter((point) => point.offender === topOffender.offender)
      .sort((left, right) => right.distanceMiles - left.distanceMiles)
      .slice(0, 120);
  }, [points, topOffender]);

  const globalOverThreshold = useMemo(
    () => points.filter((point) => point.distanceMiles >= thresholdMiles).length,
    [points, thresholdMiles]
  );

  async function pickDataFile() {
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

      const detected = detectKeys(parsedRows);

      setRows(parsedRows);
      setFileName(asset.name ?? 'Uploaded file');

      if (!detected.invoiceLatKey || !detected.invoiceLngKey || !detected.arrivedLatKey || !detected.arrivedLngKey) {
        setError(
          'Expected columns like lat/lng and arrived_lat/arrived_lng were not detected. Please include invoice and arrival coordinates.'
        );
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
        <Text style={styles.title}>Arrival Proximity Impact Lab</Text>
        <Text style={styles.subtitle}>
          Upload invoice vs arrived coordinates, rank highest offenders, and map mismatch lines to size the impact of a geofence-based arrival feature.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.controls}>
          <Pressable onPress={pickDataFile} style={styles.button}>
            <Text style={styles.buttonText}>Upload Invoice/Arrival File</Text>
          </Pressable>
          <View style={styles.thresholdBlock}>
            <Text style={styles.label}>Mismatch threshold (miles)</Text>
            <TextInput
              value={thresholdText}
              onChangeText={setThresholdText}
              keyboardType="decimal-pad"
              style={styles.thresholdInput}
            />
          </View>
        </View>

        <Text style={styles.helpText}>
          Auto-detected fields should include lat/lng + arrived_lat/arrived_lng. Offender defaults to route when available.
        </Text>
        {fileName ? <Text style={styles.helpText}>Loaded: {fileName}</Text> : null}
        {keys.offenderKey ? <Text style={styles.helpText}>Offender dimension: {keys.offenderKey}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Parsed Rows</Text>
          <Text style={styles.metricValue}>{rows.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Valid Mismatch Points</Text>
          <Text style={styles.metricValue}>{points.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Over {thresholdMiles} mi</Text>
          <Text style={styles.metricValue}>{globalOverThreshold}</Text>
        </View>
      </View>

      {topOffender ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Highest Offender</Text>
            <Text style={styles.offenderHeadline}>{topOffender.offender}</Text>
            <Text style={styles.offenderCopy}>
              {topOffender.overThresholdCount} of {topOffender.invoiceCount} invoices are over {thresholdMiles} mile(s) ({formatPct(topOffender.overThresholdRate)}).
            </Text>
            <Text style={styles.offenderCopy}>
              Avg mismatch: {topOffender.averageMiles.toFixed(2)} mi | Max mismatch: {topOffender.maxMiles.toFixed(2)} mi.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Mismatch Map for {topOffender.offender}</Text>
            <Text style={styles.sectionCopy}>
              Dashed connectors show invoice location to arrived location per invoice. More red means larger discrepancy.
            </Text>
            <DiscrepancyMap points={topOffenderPoints} activeOffender={topOffender.offender} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Top Offenders</Text>
            {offenderSummaries.slice(0, 8).map((summary) => (
              <View key={summary.offender} style={styles.rankRow}>
                <Text style={styles.rankName}>{summary.offender}</Text>
                <Text style={styles.rankValue}>
                  {summary.overThresholdCount}/{summary.invoiceCount} over {thresholdMiles} mi ({formatPct(summary.overThresholdRate)})
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionCopy}>
            Upload a file to start. The tab will automatically rank the worst offender and draw the impact map.
          </Text>
        </View>
      )}

      <Text style={styles.footerNote}>
        {Platform.OS === 'web'
          ? 'Web mode includes full interactive map rendering.'
          : 'Open web mode for full map rendering and hover popups.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: 18,
    paddingBottom: 28,
    backgroundColor: '#f8fafc',
    gap: 14,
  },
  hero: {
    borderRadius: 18,
    backgroundColor: '#0b132b',
    padding: 18,
    gap: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#dbeafe',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe3ef',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 8,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  button: {
    borderRadius: 12,
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  thresholdBlock: {
    minWidth: 180,
    gap: 4,
  },
  label: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  thresholdInput: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    color: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  helpText: {
    color: '#334155',
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    color: '#b91c1c',
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    padding: 12,
    gap: 2,
  },
  metricLabel: {
    color: '#1e3a8a',
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCopy: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
  },
  offenderHeadline: {
    color: '#7f1d1d',
    fontSize: 24,
    fontWeight: '900',
  },
  offenderCopy: {
    color: '#1e293b',
    fontSize: 13,
    lineHeight: 19,
  },
  rankRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  rankName: {
    color: '#0f172a',
    fontWeight: '800',
  },
  rankValue: {
    color: '#334155',
    fontSize: 12,
  },
  footerNote: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
  },
});
