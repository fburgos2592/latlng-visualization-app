import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as XLSX from 'xlsx';

import GeoDiffMap from '@/components/geo-diff-map';

type CsvRow = Record<string, unknown>;

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

const LAT_ALIASES = ['lat', 'latitude', 'invoice_lat', 'inv_lat'];
const LNG_ALIASES = ['lng', 'lon', 'long', 'longitude', 'invoice_lng', 'inv_lng'];
const ARRIVED_LAT_ALIASES = ['arrived_lat', 'arr_lat', 'actual_lat', 'delivery_lat', 'dest_lat'];
const ARRIVED_LNG_ALIASES = ['arrived_lng', 'arr_lng', 'actual_lng', 'delivery_lng', 'dest_lng'];
const INVOICE_ALIASES = ['invoice', 'invoice_num', 'invoice_number', 'invoice_id', 'inv_num'];
const ROUTE_ALIASES = ['route', 'route_id', 'route_num', 'route_number'];
const WH_ID_ALIASES = ['wh_id', 'warehouse_id', 'warehouse', 'wh'];
const DATE_ALIASES = ['date', 'delivery_date', 'stop_date', 'invoice_date'];

const MAX_MAP_PAIRS = 500;
const TOP_TABLE_ROWS = 15;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function pickBestKey(candidates: string[], aliases: string[]): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const normalizedLookup = new Map(candidates.map((c) => [normalizeKey(c), c]));

  for (const alias of aliases) {
    const match = normalizedLookup.get(alias);
    if (match) {
      return match;
    }
  }

  return null;
}

function detectKey(rows: CsvRow[], aliases: string[]): string | null {
  const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const exact = pickBestKey(allKeys, aliases);

  if (exact) {
    return exact;
  }

  return (
    allKeys.find((k) => aliases.some((a) => normalizeKey(k).includes(normalizeKey(a)))) ?? null
  );
}

function getField(row: CsvRow, key: string | null): unknown {
  if (!key) {
    return undefined;
  }

  if (row[key] !== undefined) {
    return row[key];
  }

  const normalized = Object.entries(row).reduce<Record<string, unknown>>((acc, [k, v]) => {
    acc[normalizeKey(k)] = v;
    return acc;
  }, {});

  return normalized[normalizeKey(key)];
}

function toCoordinate(value: unknown): number | null {
  const raw = String(value ?? '')
    .trim()
    .replace(/,/g, '.');
  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLat(v: number): boolean {
  return v >= -90 && v <= 90;
}

function isValidLng(v: number): boolean {
  return v >= -180 && v <= 180;
}

function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCoord(v: number): string {
  return v.toFixed(6);
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

  const meaningfulErrors = parsed.errors.filter((e) => e.code !== 'UndetectableDelimiter');

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

export default function GeoDiffScreen() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const theme = darkMode ? dark : light;

  const latKey = useMemo(() => detectKey(rows, LAT_ALIASES), [rows]);
  const lngKey = useMemo(() => detectKey(rows, LNG_ALIASES), [rows]);
  const arrivedLatKey = useMemo(() => detectKey(rows, ARRIVED_LAT_ALIASES), [rows]);
  const arrivedLngKey = useMemo(() => detectKey(rows, ARRIVED_LNG_ALIASES), [rows]);
  const invoiceKey = useMemo(() => detectKey(rows, INVOICE_ALIASES), [rows]);
  const routeKey = useMemo(() => detectKey(rows, ROUTE_ALIASES), [rows]);
  const whIdKey = useMemo(() => detectKey(rows, WH_ID_ALIASES), [rows]);
  const dateKey = useMemo(() => detectKey(rows, DATE_ALIASES), [rows]);

  const pairs = useMemo<DiffPair[]>(() => {
    if (!latKey || !lngKey || !arrivedLatKey || !arrivedLngKey) {
      return [];
    }

    const result: DiffPair[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const invoiceLat = toCoordinate(getField(row, latKey));
      const invoiceLng = toCoordinate(getField(row, lngKey));
      const arrivedLat = toCoordinate(getField(row, arrivedLatKey));
      const arrivedLng = toCoordinate(getField(row, arrivedLngKey));

      if (
        invoiceLat == null ||
        invoiceLng == null ||
        arrivedLat == null ||
        arrivedLng == null ||
        !isValidLat(invoiceLat) ||
        !isValidLng(invoiceLng) ||
        !isValidLat(arrivedLat) ||
        !isValidLng(arrivedLng)
      ) {
        continue;
      }

      const distanceMiles = haversineDistanceMiles(invoiceLat, invoiceLng, arrivedLat, arrivedLng);
      const invoiceVal = invoiceKey ? String(getField(row, invoiceKey) ?? '').trim() : '';
      const routeVal = routeKey ? String(getField(row, routeKey) ?? '').trim() : '';
      const whIdVal = whIdKey ? String(getField(row, whIdKey) ?? '').trim() : '';
      const dateVal = dateKey ? String(getField(row, dateKey) ?? '').trim() : '';

      result.push({
        id: String(index),
        invoiceLat,
        invoiceLng,
        arrivedLat,
        arrivedLng,
        distanceMiles,
        invoice: invoiceVal || null,
        route: routeVal || null,
        whId: whIdVal || null,
        date: dateVal || null,
      });
    }

    return result.sort((a, b) => b.distanceMiles - a.distanceMiles);
  }, [rows, latKey, lngKey, arrivedLatKey, arrivedLngKey, invoiceKey, routeKey, whIdKey, dateKey]);

  const stats = useMemo(() => {
    if (pairs.length === 0) {
      return null;
    }

    const total = pairs.length;
    const within01 = pairs.filter((p) => p.distanceMiles < 0.1).length;
    const within1 = pairs.filter((p) => p.distanceMiles < 1).length;
    const within5 = pairs.filter((p) => p.distanceMiles < 5).length;
    const over1 = total - within1;
    const over5 = total - within5;
    const maxDist = pairs[0]?.distanceMiles ?? 0;
    const avgDist = pairs.reduce((sum, p) => sum + p.distanceMiles, 0) / total;

    return { total, within01, within1, within5, over1, over5, maxDist, avgDist };
  }, [pairs]);

  const topPairs = useMemo(() => pairs.slice(0, TOP_TABLE_ROWS), [pairs]);

  async function pickFile() {
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

      setFileName(asset.name ?? 'Uploaded file');
      setRows(parsedRows);

      const detectedLat = detectKey(parsedRows, LAT_ALIASES);
      const detectedArrivedLat = detectKey(parsedRows, ARRIVED_LAT_ALIASES);

      if (parsedRows.length > 0 && (!detectedLat || !detectedArrivedLat)) {
        setError(
          'Could not find both invoice and arrived coordinate columns. Expected headers like lat/lng and arrived_lat/arrived_lng.'
        );
      } else {
        setError('');
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Unable to open or parse that file.';
      setError(message);
      setRows([]);
      setFileName('');
    }
  }

  const hasColumns = latKey && lngKey && arrivedLatKey && arrivedLngKey;

  return (
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: theme.pageBg }]}>
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <Pressable
            onPress={() => setDarkMode((d) => !d)}
            style={[styles.themeToggle, { backgroundColor: theme.toggleBg }]}
          >
            <Text style={[styles.themeToggleText, { color: theme.toggleText }]}>
              {darkMode ? '☀ Light' : '☾ Dark'}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.title, { color: theme.titleText }]}>
          Invoice vs Arrived Geo Diff
        </Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Upload a CSV or Excel export with both invoice coordinates (
          <Text style={{ fontWeight: '700' }}>lat</Text>,{' '}
          <Text style={{ fontWeight: '700' }}>lng</Text>) and arrived coordinates (
          <Text style={{ fontWeight: '700' }}>arrived_lat</Text>,{' '}
          <Text style={{ fontWeight: '700' }}>arrived_lng</Text>) to visualize delivery discrepancies
          on the map.
        </Text>
        <View style={styles.heroChips}>
          <Text style={[styles.heroChip, { backgroundColor: theme.chipGreen, color: theme.chipGreenText }]}>
            {'< 0.1 mi'}
          </Text>
          <Text style={[styles.heroChip, { backgroundColor: theme.chipYellow, color: theme.chipYellowText }]}>
            0.1 – 1 mi
          </Text>
          <Text style={[styles.heroChip, { backgroundColor: theme.chipOrange, color: theme.chipOrangeText }]}>
            1 – 5 mi
          </Text>
          <Text style={[styles.heroChip, { backgroundColor: theme.chipRed, color: theme.chipRedText }]}>
            {'> 5 mi'}
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
        <View style={styles.toolbar}>
          <Pressable onPress={pickFile} style={[styles.button, { backgroundColor: theme.accent }]}>
            <Text style={styles.buttonText}>Choose File</Text>
          </Pressable>
          <View style={[styles.metaBlock, { backgroundColor: theme.metaBg }]}>
            <Text style={[styles.metaLabel, { color: theme.accent }]}>Rows</Text>
            <Text style={[styles.metaValue, { color: theme.bodyText }]}>{rows.length}</Text>
          </View>
          <View style={[styles.metaBlock, { backgroundColor: theme.metaBg }]}>
            <Text style={[styles.metaLabel, { color: theme.accent }]}>Valid pairs</Text>
            <Text style={[styles.metaValue, { color: theme.bodyText }]}>{pairs.length}</Text>
          </View>
        </View>

        <Text style={[styles.helpText, { color: theme.muted }]}>
          Expected columns:{' '}
          <Text style={[styles.helpStrong, { color: theme.bodyText }]}>lat, lng</Text> (invoice
          location) and{' '}
          <Text style={[styles.helpStrong, { color: theme.bodyText }]}>
            arrived_lat, arrived_lng
          </Text>{' '}
          (actual delivery location). Optional:{' '}
          <Text style={[styles.helpStrong, { color: theme.bodyText }]}>
            invoice, route, wh_id, date
          </Text>
          . CSV and Excel supported.
        </Text>
        <Text style={[styles.helpText, { color: theme.muted }]}>
          Best fit for GitHub Pages:{' '}
          {Platform.OS === 'web'
            ? 'browser upload is ready here'
            : 'open the web build to test browser uploads'}
          .
        </Text>

        {fileName ? (
          <Text style={[styles.fileName, { color: theme.bodyText }]}>Loaded: {fileName}</Text>
        ) : null}

        {hasColumns ? (
          <View style={styles.detectedCols}>
            <Text style={[styles.helpText, { color: theme.muted }]}>
              Invoice coords:{' '}
              <Text style={[styles.helpStrong, { color: theme.bodyText }]}>{latKey}</Text> /{' '}
              <Text style={[styles.helpStrong, { color: theme.bodyText }]}>{lngKey}</Text>
            </Text>
            <Text style={[styles.helpText, { color: theme.muted }]}>
              Arrived coords:{' '}
              <Text style={[styles.helpStrong, { color: theme.bodyText }]}>{arrivedLatKey}</Text> /{' '}
              <Text style={[styles.helpStrong, { color: theme.bodyText }]}>{arrivedLngKey}</Text>
            </Text>
            {invoiceKey ? (
              <Text style={[styles.helpText, { color: theme.muted }]}>
                Invoice #{' '}
                <Text style={[styles.helpStrong, { color: theme.bodyText }]}>{invoiceKey}</Text>
                {routeKey ? (
                  <>
                    {' · Route '}
                    <Text style={[styles.helpStrong, { color: theme.bodyText }]}>{routeKey}</Text>
                  </>
                ) : null}
                {whIdKey ? (
                  <>
                    {' · WH '}
                    <Text style={[styles.helpStrong, { color: theme.bodyText }]}>{whIdKey}</Text>
                  </>
                ) : null}
                {dateKey ? (
                  <>
                    {' · Date '}
                    <Text style={[styles.helpStrong, { color: theme.bodyText }]}>{dateKey}</Text>
                  </>
                ) : null}
              </Text>
            ) : null}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {stats ? (
        <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: theme.titleText }]}>Distance Summary</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statTile, { backgroundColor: theme.metaBg }]}>
              <Text style={[styles.statValue, { color: theme.bodyText }]}>{stats.total}</Text>
              <Text style={[styles.statLabel, { color: theme.muted }]}>Total pairs</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#dcfce7' }]}>
              <Text style={[styles.statValue, { color: '#15803d' }]}>{stats.within01}</Text>
              <Text style={[styles.statLabel, { color: '#166534' }]}>{'< 0.1 mi'}</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#fef9c3' }]}>
              <Text style={[styles.statValue, { color: '#854d0e' }]}>
                {stats.within1 - stats.within01}
              </Text>
              <Text style={[styles.statLabel, { color: '#713f12' }]}>0.1 – 1 mi</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#ffedd5' }]}>
              <Text style={[styles.statValue, { color: '#c2410c' }]}>
                {stats.within5 - stats.within1}
              </Text>
              <Text style={[styles.statLabel, { color: '#9a3412' }]}>1 – 5 mi</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#fee2e2' }]}>
              <Text style={[styles.statValue, { color: '#dc2626' }]}>{stats.over5}</Text>
              <Text style={[styles.statLabel, { color: '#991b1b' }]}>{'> 5 mi'}</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: theme.metaBg }]}>
              <Text style={[styles.statValue, { color: theme.bodyText }]}>
                {stats.avgDist.toFixed(2)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.muted }]}>Avg mi</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: theme.metaBg }]}>
              <Text style={[styles.statValue, { color: theme.bodyText }]}>
                {stats.maxDist.toFixed(2)}
              </Text>
              <Text style={[styles.statLabel, { color: theme.muted }]}>Max mi</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: '#fee2e2' }]}>
              <Text style={[styles.statValue, { color: '#dc2626' }]}>
                {((stats.over1 / stats.total) * 100).toFixed(1)}%
              </Text>
              <Text style={[styles.statLabel, { color: '#991b1b' }]}>{'Over 1 mi'}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
        <View style={styles.plotHeader}>
          <Text style={[styles.sectionTitle, { color: theme.titleText }]}>Discrepancy Map</Text>
          <Text style={[styles.sectionCopy, { color: theme.muted }]}>
            Blue dots mark invoice coordinates. Colored dots mark arrived coordinates. Lines connect
            each pair, colored by distance tier. Showing up to {MAX_MAP_PAIRS} pairs sorted by
            largest discrepancy first.
          </Text>
        </View>

        <GeoDiffMap pairs={pairs} maxPairs={MAX_MAP_PAIRS} />

        {pairs.length > MAX_MAP_PAIRS ? (
          <Text style={[styles.mapNote, { color: theme.muted }]}>
            Displaying top {MAX_MAP_PAIRS} of {pairs.length} pairs by distance on the map.
          </Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg }]}>
        <Text style={[styles.sectionTitle, { color: theme.titleText }]}>
          Top {Math.min(topPairs.length, TOP_TABLE_ROWS)} Discrepancies
        </Text>
        {topPairs.length === 0 ? (
          <Text style={[styles.helpText, { color: theme.muted }]}>
            Upload a file to see the largest coordinate discrepancies here.
          </Text>
        ) : null}
        {topPairs.map((pair, index) => (
          <View
            key={pair.id}
            style={[styles.tableRow, { borderBottomColor: theme.divider }]}
          >
            <View style={styles.tableRank}>
              <Text style={[styles.rankText, { color: theme.accent }]}>#{index + 1}</Text>
            </View>
            <View style={styles.tableBody}>
              <View style={styles.tableTopLine}>
                {pair.whId ? (
                  <Text style={[styles.tag, { color: theme.bodyText }]}>{pair.whId}</Text>
                ) : null}
                {pair.route ? (
                  <Text style={[styles.tag, { color: theme.bodyText }]}>{pair.route}</Text>
                ) : null}
                {pair.invoice ? (
                  <Text style={[styles.tag, { color: theme.muted }]}>{pair.invoice}</Text>
                ) : null}
                {pair.date ? (
                  <Text style={[styles.tag, { color: theme.muted }]}>{pair.date}</Text>
                ) : null}
              </View>
              <View style={styles.tableCoords}>
                <Text style={[styles.coordLabel, { color: theme.muted }]}>Invoice</Text>
                <Text style={[styles.coordVal, { color: theme.bodyText }]}>
                  {formatCoord(pair.invoiceLat)}, {formatCoord(pair.invoiceLng)}
                </Text>
              </View>
              <View style={styles.tableCoords}>
                <Text style={[styles.coordLabel, { color: theme.muted }]}>Arrived</Text>
                <Text style={[styles.coordVal, { color: theme.bodyText }]}>
                  {formatCoord(pair.arrivedLat)}, {formatCoord(pair.arrivedLng)}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.distBadge,
                {
                  backgroundColor:
                    pair.distanceMiles < 0.1
                      ? '#dcfce7'
                      : pair.distanceMiles < 1
                        ? '#fef9c3'
                        : pair.distanceMiles < 5
                          ? '#ffedd5'
                          : '#fee2e2',
                },
              ]}
            >
              <Text
                style={[
                  styles.distText,
                  {
                    color:
                      pair.distanceMiles < 0.1
                        ? '#15803d'
                        : pair.distanceMiles < 1
                          ? '#854d0e'
                          : pair.distanceMiles < 5
                            ? '#c2410c'
                            : '#dc2626',
                  },
                ]}
              >
                {pair.distanceMiles.toFixed(2)} mi
              </Text>
            </View>
          </View>
        ))}
        {pairs.length > TOP_TABLE_ROWS ? (
          <Text style={[styles.moreText, { color: theme.muted }]}>
            Showing top {TOP_TABLE_ROWS} of {pairs.length} pairs by distance.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const light = {
  pageBg: '#f3f6fb',
  cardBg: '#ffffff',
  accent: '#0f766e',
  titleText: '#0b132b',
  bodyText: '#0f172a',
  muted: '#4b5563',
  metaBg: '#e8f7f5',
  divider: '#e2e8f0',
  toggleBg: '#0b132b',
  toggleText: '#f8fafc',
  chipGreen: '#dcfce7',
  chipGreenText: '#166534',
  chipYellow: '#fef9c3',
  chipYellowText: '#713f12',
  chipOrange: '#ffedd5',
  chipOrangeText: '#9a3412',
  chipRed: '#fee2e2',
  chipRedText: '#991b1b',
};

const dark = {
  pageBg: '#0b1220',
  cardBg: '#151f33',
  accent: '#2dd4bf',
  titleText: '#f8fafc',
  bodyText: '#dbe7ff',
  muted: '#9fb4d7',
  metaBg: '#123b46',
  divider: '#2a3d5c',
  toggleBg: '#f8fafc',
  toggleText: '#0b1220',
  chipGreen: '#14532d',
  chipGreenText: '#86efac',
  chipYellow: '#422006',
  chipYellowText: '#fde68a',
  chipOrange: '#431407',
  chipOrangeText: '#fdba74',
  chipRed: '#450a0a',
  chipRedText: '#fca5a5',
};

const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 16,
  },
  hero: {
    paddingVertical: 14,
    gap: 10,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  themeToggle: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  themeToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 760,
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroChip: {
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  card: {
    borderRadius: 22,
    padding: 18,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  button: {
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  helpText: {
    fontSize: 14,
    lineHeight: 20,
  },
  helpStrong: {
    fontWeight: '700',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  detectedCols: {
    gap: 4,
  },
  error: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statTile: {
    minWidth: 90,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  plotHeader: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  sectionCopy: {
    fontSize: 14,
    lineHeight: 20,
  },
  mapNote: {
    fontSize: 14,
    lineHeight: 20,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tableRank: {
    width: 34,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tableBody: {
    flex: 1,
    gap: 3,
  },
  tableTopLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    fontSize: 13,
    fontWeight: '600',
  },
  tableCoords: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  coordLabel: {
    fontSize: 11,
    fontWeight: '700',
    width: 48,
  },
  coordVal: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  distBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  distText: {
    fontSize: 13,
    fontWeight: '800',
  },
  moreText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
