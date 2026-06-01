import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as XLSX from 'xlsx';

import DiscrepancyMap from '@/components/discrepancy-map';

type DataRow = Record<string, unknown>;

type DiscrepancyPoint = {
  id: string;
  rowIndex: number;
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
  invoiceTimeDisplay: string;
  arrivedTimeDisplay: string;
  invoiceTimeMs: number | null;
  arrivedTimeMs: number | null;
  timeDeltaMinutes: number | null;
  dateLabel: string | null;
};

type CompareSummary = {
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
};

type KeySelection = {
  invoiceLatKey: string | null;
  invoiceLngKey: string | null;
  arrivedLatKey: string | null;
  arrivedLngKey: string | null;
  whIdKey: string | null;
  offenderKey: string | null;
  invoiceIdKey: string | null;
  customerKey: string | null;
  invoiceTimeKey: string | null;
  arrivedTimeKey: string | null;
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
const WH_ID_ALIASES = ['wh_id', 'warehouse_id', 'distribution_center', 'dc_id', 'dc'];
const OFFENDER_ALIASES = ['route', 'wh_id', 'driver_id', 'vehicle_id', 'truck_id', 'unit_id'];
const INVOICE_ID_ALIASES = ['invoice', 'invoice_id', 'order_id'];
const CUSTOMER_ALIASES = ['customer_name', 'customer', 'customername', 'account_name', 'account', 'store_name', 'ship_to_name', 'bill_to_company_name'];
const INVOICE_TIME_ALIASES = ['invoice_time', 'invoice_datetime', 'invoice_ts', 'scheduled_time', 'requested_time'];
const ARRIVED_TIME_ALIASES = ['arrived_time', 'arrival_time', 'arrived_at', 'arrival_datetime', 'arrived_ts'];
const DATE_ALIASES = ['date', 'invoice_date', 'service_date'];
const OFFENDERS_PER_PAGE = 25;

const lightTheme = {
  pageBg: '#f8fafc',
  heroBg: '#0b132b',
  titleText: '#ffffff',
  subtitleText: '#dbeafe',
  cardBg: '#ffffff',
  cardBorder: '#dbe3ef',
  bodyText: '#0f172a',
  mutedText: '#334155',
  subtleText: '#475569',
  accent: '#1d4ed8',
  accentSoft: '#eff6ff',
  inputBg: '#eff6ff',
  inputBorder: '#bfdbfe',
  metricBg: '#eff6ff',
  metricBorder: '#dbeafe',
  metricLabel: '#1e3a8a',
  metricValue: '#0f172a',
  selectedRowBg: '#eff6ff',
  selectedRowBorder: '#1d4ed8',
  errorText: '#b91c1c',
};

const darkTheme = {
  pageBg: '#0f172a',
  heroBg: '#020617',
  titleText: '#e2e8f0',
  subtitleText: '#cbd5e1',
  cardBg: '#111827',
  cardBorder: '#334155',
  bodyText: '#e2e8f0',
  mutedText: '#cbd5e1',
  subtleText: '#94a3b8',
  accent: '#38bdf8',
  accentSoft: '#172554',
  inputBg: '#1e293b',
  inputBorder: '#334155',
  metricBg: '#1e293b',
  metricBorder: '#334155',
  metricLabel: '#93c5fd',
  metricValue: '#f8fafc',
  selectedRowBg: '#172554',
  selectedRowBorder: '#38bdf8',
  errorText: '#fca5a5',
};

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
  const whIdKey = pickExactKey(allKeys, WH_ID_ALIASES) ?? pickContainsKey(allKeys, ['wh_id', 'warehouse', 'distribution_center', 'dc']);
  const offenderKey = pickExactKey(allKeys, OFFENDER_ALIASES) ?? pickContainsKey(allKeys, ['route', 'wh', 'driver', 'vehicle']);
  const invoiceIdKey = pickExactKey(allKeys, INVOICE_ID_ALIASES) ?? pickContainsKey(allKeys, ['invoice']);
  const customerKey = pickExactKey(allKeys, CUSTOMER_ALIASES) ?? pickContainsKey(allKeys, ['customer', 'account', 'store', 'ship_to']);
  const invoiceTimeKey = pickExactKey(allKeys, INVOICE_TIME_ALIASES) ?? pickContainsKey(allKeys, ['invoice_time', 'scheduled_time', 'requested_time']);
  const arrivedTimeKey = pickExactKey(allKeys, ARRIVED_TIME_ALIASES) ?? pickContainsKey(allKeys, ['arrived_time', 'arrival_time', 'arrived_at']);
  const dateKey = pickExactKey(allKeys, DATE_ALIASES) ?? pickContainsKey(allKeys, ['date']);

  return {
    invoiceLatKey,
    invoiceLngKey,
    arrivedLatKey,
    arrivedLngKey,
    whIdKey,
    offenderKey,
    invoiceIdKey,
    customerKey,
    invoiceTimeKey,
    arrivedTimeKey,
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

function getSecondColumnValue(row: DataRow): unknown {
  const values = Object.values(row);
  return values.length > 1 ? values[1] : null;
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

function parseTimeValue(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20_000) {
      return Math.round((value - 25569) * 86_400_000);
    }

    return Math.round(value);
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const numericText = Number(text);
  if (Number.isFinite(numericText) && text.match(/^\d+(\.\d+)?$/)) {
    if (numericText > 20_000) {
      return Math.round((numericText - 25569) * 86_400_000);
    }

    return Math.round(numericText);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getTime();
  }

  return null;
}

function formatSignedMinutes(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} min`;
}

function formatEasternDateTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(new Date(ms));
}

function formatWallClockFromSerial(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(ms));
}

function formatDateTimeLabel(value: string | null, fallbackMs: number | null): string {
  if (value && value.trim()) {
    if (/^\d+(?:\.\d+)?$/.test(value.trim())) {
      const parsedMs = parseTimeValue(value);
      if (parsedMs != null) {
        return formatWallClockFromSerial(parsedMs);
      }
    }

    return value.trim();
  }

  if (fallbackMs != null) {
    return formatWallClockFromSerial(fallbackMs);
  }

  return 'N/A';
}

function parseDateToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const yearFirstMatch = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s.*)?$/);
  if (yearFirstMatch) {
    const year = Number(yearFirstMatch[1]);
    const month = Number(yearFirstMatch[2]);
    const day = Number(yearFirstMatch[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    ) {
      return candidate.toISOString().slice(0, 10);
    }
  }

  const monthDayYearMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s.*)?$/);
  if (monthDayYearMatch) {
    const first = Number(monthDayYearMatch[1]);
    const second = Number(monthDayYearMatch[2]);
    const year = Number(monthDayYearMatch[3]);
    const useDayFirst = first > 12 && second <= 12;
    const month = useDayFirst ? second : first;
    const day = useDayFirst ? first : second;
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    ) {
      return candidate.toISOString().slice(0, 10);
    }
  }

  const yyyymmddMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmddMatch) {
    const year = Number(yyyymmddMatch[1]);
    const month = Number(yyyymmddMatch[2]);
    const day = Number(yyyymmddMatch[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));

    if (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    ) {
      return candidate.toISOString().slice(0, 10);
    }
  }

  return null;
}

function formatRouteDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return parseDateToIso(value) ?? null;
}

function normalizeRouteDate(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const integerText = String(Math.trunc(value));
    if (Math.abs(value - Math.trunc(value)) < 1e-9 && integerText.length === 8) {
      const parsedInteger = parseDateToIso(integerText);
      if (parsedInteger) {
        return parsedInteger;
      }
    }

    if (value > 20_000) {
      return new Date((value - 25569) * 86_400_000).toISOString().slice(0, 10);
    }

    return formatRouteDate(String(value));
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const parsedIso = parseDateToIso(text);
  if (parsedIso) {
    return parsedIso;
  }

  const numericText = Number(text);
  if (Number.isFinite(numericText) && /^\d+(\.\d+)?$/.test(text)) {
    if (text.length === 8) {
      const parsedInteger = parseDateToIso(text);
      if (parsedInteger) {
        return parsedInteger;
      }
    }

    if (numericText > 20_000) {
      return new Date((numericText - 25569) * 86_400_000).toISOString().slice(0, 10);
    }

    return formatRouteDate(text);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function pickRouteDate(points: Array<{ dateLabel: string | null }>): string | null {
  const counts = new Map<string, number>();

  for (const point of points) {
    const normalizedDate = formatRouteDate(point.dateLabel);
    if (!normalizedDate) {
      continue;
    }

    counts.set(normalizedDate, (counts.get(normalizedDate) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return null;
  }

  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  })[0][0];
}

function pointSelectionKey(point: DiscrepancyPoint): string {
  return `${point.offender}::${point.id}`;
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
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const meaningfulErrors = parsed.errors.filter((entry: { code?: string; message?: string }) => entry.code !== 'UndetectableDelimiter');
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
  const [selectedOffender, setSelectedOffender] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [offenderPage, setOffenderPage] = useState(1);
  const [selectedWhId, setSelectedWhId] = useState('All');
  const [isWhDropdownOpen, setIsWhDropdownOpen] = useState(false);
  const [routeSearchQuery, setRouteSearchQuery] = useState('');
  const [stopSearchQuery, setStopSearchQuery] = useState('');
  const [stopThresholdOnly, setStopThresholdOnly] = useState(false);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const theme = darkMode ? darkTheme : lightTheme;

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
        const whIdRaw = getField(row, keys.whIdKey);
        const whId = String(whIdRaw ?? '').trim() || 'Unknown WH';
        const offenderRaw = getField(row, keys.offenderKey);
        const offender = String(offenderRaw ?? '').trim() || 'Unknown';
        const invoiceRaw = getField(row, keys.invoiceIdKey);
        const invoiceId = String(invoiceRaw ?? '').trim() || `row-${rowIndex + 1}`;
        const customerRaw = getField(row, keys.customerKey);
        const customerName = String(customerRaw ?? '').trim() || null;
        const invoiceTimeRaw = getField(row, keys.invoiceTimeKey);
        const arrivedTimeRaw = getField(row, keys.arrivedTimeKey);
        const invoiceTimeLabel = String(invoiceTimeRaw ?? '').trim() || null;
        const arrivedTimeLabel = String(arrivedTimeRaw ?? '').trim() || null;
        const invoiceTimeMs = parseTimeValue(invoiceTimeRaw);
        const arrivedTimeMs = parseTimeValue(arrivedTimeRaw);
        const invoiceTimeDisplay = formatDateTimeLabel(invoiceTimeLabel, invoiceTimeMs);
        const arrivedTimeDisplay = formatDateTimeLabel(arrivedTimeLabel, arrivedTimeMs);
        const timeDeltaMinutes = invoiceTimeMs != null && arrivedTimeMs != null
          ? (arrivedTimeMs - invoiceTimeMs) / 60_000
          : null;
        const dateBValue = getSecondColumnValue(row);
        const dateRaw = getField(row, keys.dateKey);
        const dateLabel = normalizeRouteDate(dateBValue) ?? normalizeRouteDate(dateRaw);

        return {
          id: String(rowIndex),
          rowIndex,
          invoiceLat,
          invoiceLng,
          arrivedLat,
          arrivedLng,
          distanceMiles,
          offender,
          whId,
          invoiceId,
          customerName,
          invoiceTimeLabel,
          arrivedTimeLabel,
          invoiceTimeDisplay,
          arrivedTimeDisplay,
          invoiceTimeMs,
          arrivedTimeMs,
          timeDeltaMinutes,
          dateLabel,
        } satisfies DiscrepancyPoint;
      })
      .filter((point): point is DiscrepancyPoint => point !== null);
  }, [keys.arrivedLatKey, keys.arrivedLngKey, keys.arrivedTimeKey, keys.customerKey, keys.dateKey, keys.invoiceIdKey, keys.invoiceLatKey, keys.invoiceLngKey, keys.invoiceTimeKey, keys.offenderKey, keys.whIdKey, rows]);

  const whIdOptions = useMemo(() => {
    const uniqueWhIds = Array.from(new Set(points.map((point) => point.whId))).sort((left, right) => left.localeCompare(right));
    return ['All', ...uniqueWhIds];
  }, [points]);

  const whFilteredPoints = useMemo(() => {
    if (selectedWhId === 'All') {
      return points;
    }

    return points.filter((point) => point.whId === selectedWhId);
  }, [points, selectedWhId]);

  const filteredPoints = useMemo(() => {
    const normalizedQuery = routeSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return whFilteredPoints;
    }

    return whFilteredPoints.filter((point) => point.offender.toLowerCase().includes(normalizedQuery));
  }, [routeSearchQuery, whFilteredPoints]);

  const offenderSummaries = useMemo(() => {
    const grouped = new Map<string, { count: number; totalMiles: number; maxMiles: number; overThresholdCount: number }>();

    for (const point of filteredPoints) {
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
  }, [filteredPoints, thresholdMiles]);

  const topOffender = offenderSummaries[0] ?? null;
  const totalOffenderPages = Math.max(1, Math.ceil(offenderSummaries.length / OFFENDERS_PER_PAGE));
  const visibleOffenderPage = Math.min(offenderPage, totalOffenderPages);

  const pagedOffenderSummaries = useMemo(() => {
    const startIndex = (visibleOffenderPage - 1) * OFFENDERS_PER_PAGE;
    return offenderSummaries.slice(startIndex, startIndex + OFFENDERS_PER_PAGE);
  }, [offenderSummaries, visibleOffenderPage]);

  const pageStartCount = offenderSummaries.length === 0 ? 0 : ((visibleOffenderPage - 1) * OFFENDERS_PER_PAGE) + 1;
  const pageEndCount = Math.min(visibleOffenderPage * OFFENDERS_PER_PAGE, offenderSummaries.length);

  const activeOffenderSummary = useMemo(() => {
    if (!offenderSummaries.length) {
      return null;
    }

    if (!selectedOffender) {
      return offenderSummaries[0];
    }

    return offenderSummaries.find((summary) => summary.offender === selectedOffender) ?? offenderSummaries[0];
  }, [offenderSummaries, selectedOffender]);

  const activeOffenderPoints = useMemo(() => {
    if (!activeOffenderSummary) {
      return [];
    }

    return filteredPoints
      .filter((point) => point.offender === activeOffenderSummary.offender)
      .sort((left, right) => right.distanceMiles - left.distanceMiles)
      .slice(0, 120);
  }, [activeOffenderSummary, filteredPoints]);

  const stopTablePoints = useMemo(() => {
    const normalizedQuery = stopSearchQuery.trim().toLowerCase();

    return activeOffenderPoints
      .filter((point) => {
        if (stopThresholdOnly && point.distanceMiles < thresholdMiles) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystack = [
          point.customerName ?? '',
          point.invoiceId,
          point.whId,
          point.offender,
          point.dateLabel ?? '',
          point.invoiceTimeLabel ?? '',
          point.arrivedTimeLabel ?? '',
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => {
        const leftTime = left.invoiceTimeMs ?? left.arrivedTimeMs ?? Number.MAX_SAFE_INTEGER;
        const rightTime = right.invoiceTimeMs ?? right.arrivedTimeMs ?? Number.MAX_SAFE_INTEGER;

        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }

        if (right.distanceMiles !== left.distanceMiles) {
          return right.distanceMiles - left.distanceMiles;
        }

        return left.rowIndex - right.rowIndex;
      });
  }, [activeOffenderPoints, stopSearchQuery, stopThresholdOnly, thresholdMiles]);

  const selectedStop = useMemo(() => {
    if (!stopTablePoints.length) {
      return null;
    }

    if (!selectedStopId) {
      return stopTablePoints[0];
    }

    return stopTablePoints.find((point) => pointSelectionKey(point) === selectedStopId) ?? stopTablePoints[0];
  }, [selectedStopId, stopTablePoints]);

  const visibleStopIndex = useMemo(() => {
    if (!selectedStop) {
      return -1;
    }

    return stopTablePoints.findIndex((point) => pointSelectionKey(point) === pointSelectionKey(selectedStop));
  }, [selectedStop, stopTablePoints]);

  useEffect(() => {
    if (stopTablePoints.length === 0) {
      setSelectedStopId(null);
      setIsPlaybackActive(false);
      return;
    }

    const currentKey = selectedStopId;
    const stillVisible = currentKey ? stopTablePoints.some((point) => pointSelectionKey(point) === currentKey) : false;

    if (!stillVisible) {
      setSelectedStopId(pointSelectionKey(stopTablePoints[0]));
    }
  }, [selectedStopId, stopTablePoints]);

  useEffect(() => {
    if (!isPlaybackActive || stopTablePoints.length <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setSelectedStopId((current) => {
        const index = current ? stopTablePoints.findIndex((point) => pointSelectionKey(point) === current) : -1;
        const nextIndex = index >= 0 ? (index + 1) % stopTablePoints.length : 0;
        return pointSelectionKey(stopTablePoints[nextIndex]);
      });
    }, 1400);

    return () => clearInterval(timer);
  }, [isPlaybackActive, stopTablePoints]);

  const activeTimeSummary = useMemo(() => {
    const pointsWithTimes = activeOffenderPoints.filter((point) => point.timeDeltaMinutes != null);
    if (pointsWithTimes.length === 0) {
      return null;
    }

    const totalMinutes = pointsWithTimes.reduce((total, point) => total + (point.timeDeltaMinutes ?? 0), 0);
    const maxAbsDelta = pointsWithTimes.reduce(
      (currentMax, point) => Math.max(currentMax, Math.abs(point.timeDeltaMinutes ?? 0)),
      0
    );

    return {
      sampleCount: pointsWithTimes.length,
      averageMinutes: totalMinutes / pointsWithTimes.length,
      maxAbsDelta,
    };
  }, [activeOffenderPoints]);

  const activeRouteDate = useMemo(() => pickRouteDate(activeOffenderPoints), [activeOffenderPoints]);

  const compareSummary = useMemo<CompareSummary | null>(() => {
    if (!activeOffenderSummary || activeOffenderPoints.length === 0) {
      return null;
    }

    const routeWhId = selectedWhId === 'All' ? activeOffenderPoints[0]?.whId ?? 'Unknown WH' : selectedWhId;

    return {
      date: activeRouteDate,
      route: activeOffenderSummary.offender,
      whId: routeWhId,
      stopCount: activeOffenderPoints.length,
      averageMiles: activeOffenderSummary.averageMiles,
      maxMiles: activeOffenderSummary.maxMiles,
      averageTimeDeltaMinutes: activeTimeSummary?.averageMinutes ?? null,
      overThresholdCount: activeOffenderSummary.overThresholdCount,
      overThresholdRate: activeOffenderSummary.overThresholdRate,
      riskScore:
        (activeOffenderSummary.averageMiles * 15) +
        (activeOffenderSummary.maxMiles * 6) +
        (activeOffenderSummary.overThresholdRate * 100) +
        ((activeTimeSummary?.maxAbsDelta ?? 0) / 2),
    };
  }, [activeOffenderPoints, activeOffenderSummary, activeRouteDate, activeTimeSummary, selectedWhId]);

  const activeRouteMapUrl = useMemo(() => {
    if (!compareSummary || activeOffenderPoints.length === 0) {
      return null;
    }

    const date = compareSummary.date;
    if (!date) {
      return null;
    }

    const route = encodeURIComponent(compareSummary.route);
    const whId = encodeURIComponent(compareSummary.whId);

    return `https://drivercloud.baldorfood.com/DriverApp/LatLng.aspx?date=${encodeURIComponent(date)}&route=${route}&wh_id=${whId}`;
  }, [activeOffenderPoints.length, compareSummary]);

  async function openActiveRouteMap() {
    if (!activeRouteMapUrl) {
      return;
    }

    await Linking.openURL(activeRouteMapUrl);
  }

  const globalOverThreshold = useMemo(
    () => filteredPoints.filter((point) => point.distanceMiles >= thresholdMiles).length,
    [filteredPoints, thresholdMiles]
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
      setSelectedOffender(null);
      setOffenderPage(1);
      setSelectedWhId('All');
      setIsWhDropdownOpen(false);
      setRouteSearchQuery('');

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
    <ScrollView contentContainerStyle={[styles.page, { backgroundColor: theme.pageBg }]}>
      <View style={[styles.hero, { backgroundColor: theme.heroBg }]}>
        <View style={styles.heroHeader}>
          <Image
            source={require('@/assets/images/baldor-logo.png')}
            style={{ width: 90, height: 52, resizeMode: 'contain' }}
          />
          <Pressable onPress={() => setDarkMode((value) => !value)} style={[styles.themeToggle, { backgroundColor: theme.accentSoft }]}> 
            <Text style={[styles.themeToggleText, { color: theme.bodyText }]}>{darkMode ? 'Light' : 'Dark'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.title, { color: theme.titleText }]}>Arrival Proximity Impact Lab</Text>
        <Text style={[styles.subtitle, { color: theme.subtitleText }]}>
          Upload invoice vs arrived coordinates, rank highest offenders, and map mismatch lines to size the impact of a geofence-based arrival feature.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}> 
        <View style={styles.controls}>
          <Pressable onPress={pickDataFile} style={[styles.button, { backgroundColor: theme.accent }]}>
            <Text style={styles.buttonText}>Upload Invoice/Arrival File</Text>
          </Pressable>
        </View>

        <Text style={[styles.helpText, { color: theme.mutedText }]}> 
          Auto-detected fields should include lat/lng + arrived_lat/arrived_lng. Offender defaults to route when available.
        </Text>
        {fileName ? <Text style={[styles.helpText, { color: theme.mutedText }]}>Loaded: {fileName}</Text> : null}
        {keys.whIdKey ? <Text style={[styles.helpText, { color: theme.mutedText }]}>WH_ID column: {keys.whIdKey}</Text> : null}
        {keys.offenderKey ? <Text style={[styles.helpText, { color: theme.mutedText }]}>Offender dimension: {keys.offenderKey}</Text> : null}
        {keys.customerKey ? <Text style={[styles.helpText, { color: theme.mutedText }]}>Customer dimension: {keys.customerKey}</Text> : null}
        {keys.invoiceTimeKey ? <Text style={[styles.helpText, { color: theme.mutedText }]}>Invoice time column: {keys.invoiceTimeKey}</Text> : null}
        {keys.arrivedTimeKey ? <Text style={[styles.helpText, { color: theme.mutedText }]}>Arrived time column: {keys.arrivedTimeKey}</Text> : null}
        {error ? <Text style={[styles.error, { color: theme.errorText }]}>{error}</Text> : null}
      </View>

      <View
        style={[
          styles.card,
          styles.filtersCard,
          isWhDropdownOpen ? styles.filtersCardOpen : null,
          { backgroundColor: theme.cardBg, borderColor: theme.cardBorder },
        ]}> 
        <Text style={[styles.sectionTitle, { color: theme.bodyText }]}>Filters</Text>
        <View style={styles.filtersGrid}>
          <View style={styles.thresholdBlock}>
            <Text style={[styles.label, { color: theme.mutedText }]}>WH_ID filter (web dropdown style)</Text>
            <View style={styles.dropdownWrap}>
              <Pressable
                onPress={() => setIsWhDropdownOpen((open) => !open)}
                style={[styles.dropdownTrigger, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
                <Text style={[styles.dropdownTriggerText, { color: theme.bodyText }]}>{selectedWhId}</Text>
                <Text style={[styles.dropdownChevron, { color: theme.accent }]}>{isWhDropdownOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {isWhDropdownOpen ? (
                <View style={[styles.dropdownMenu, { backgroundColor: theme.cardBg, borderColor: theme.inputBorder }]}> 
                  {whIdOptions.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => {
                        setSelectedWhId(option);
                        setSelectedOffender(null);
                        setOffenderPage(1);
                        setIsWhDropdownOpen(false);
                      }}
                      style={[
                        styles.dropdownItem,
                        { borderTopColor: theme.cardBorder },
                        option === selectedWhId ? [styles.dropdownItemSelected, { backgroundColor: theme.selectedRowBg }] : null,
                      ]}>
                      <Text
                        style={[
                          styles.dropdownItemText,
                          { color: theme.bodyText },
                          option === selectedWhId ? [styles.dropdownItemTextSelected, { color: theme.accent }] : null,
                        ]}>
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.thresholdBlock}>
            <Text style={[styles.label, { color: theme.mutedText }]}>Route search/filter</Text>
            <TextInput
              value={routeSearchQuery}
              onChangeText={(value) => {
                setRouteSearchQuery(value);
                setSelectedOffender(null);
                setOffenderPage(1);
              }}
              placeholder="Search route code (e.g. DCH, CTI)"
              placeholderTextColor={theme.subtleText}
              style={[styles.thresholdInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.bodyText }]}
            />
          </View>

          <View style={styles.thresholdBlock}>
            <Text style={[styles.label, { color: theme.mutedText }]}>Mismatch threshold (miles)</Text>
            <TextInput
              value={thresholdText}
              onChangeText={setThresholdText}
              keyboardType="decimal-pad"
              style={[styles.thresholdInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.bodyText }]}
            />
          </View>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { backgroundColor: theme.metricBg, borderColor: theme.metricBorder }]}>
          <Text style={[styles.metricLabel, { color: theme.metricLabel }]}>Parsed Rows</Text>
          <Text style={[styles.metricValue, { color: theme.metricValue }]}>{rows.length}</Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: theme.metricBg, borderColor: theme.metricBorder }]}>
          <Text style={[styles.metricLabel, { color: theme.metricLabel }]}>Valid Mismatch Points</Text>
          <Text style={[styles.metricValue, { color: theme.metricValue }]}>{filteredPoints.length}</Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: theme.metricBg, borderColor: theme.metricBorder }]}>
          <Text style={[styles.metricLabel, { color: theme.metricLabel }]}>Over {thresholdMiles} mi</Text>
          <Text style={[styles.metricValue, { color: theme.metricValue }]}>{globalOverThreshold}</Text>
        </View>
      </View>

      {activeOffenderSummary ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.bodyText }]}>Selected Offender</Text>
            <Text style={[styles.offenderHeadline, { color: theme.bodyText }]}>{activeOffenderSummary.offender}</Text>
            <Text style={[styles.offenderCopy, { color: theme.mutedText }]}>
              {activeOffenderSummary.overThresholdCount} of {activeOffenderSummary.invoiceCount} invoices are over {thresholdMiles} mile(s) ({formatPct(activeOffenderSummary.overThresholdRate)}).
            </Text>
            <Text style={[styles.offenderCopy, { color: theme.mutedText }]}>
              Avg mismatch: {activeOffenderSummary.averageMiles.toFixed(2)} mi | Max mismatch: {activeOffenderSummary.maxMiles.toFixed(2)} mi.
            </Text>
            {activeTimeSummary ? (
              <Text style={[styles.offenderCopy, { color: theme.mutedText }]}>
                Avg time delta (arrived - invoice): {formatSignedMinutes(activeTimeSummary.averageMinutes)} across {activeTimeSummary.sampleCount} timed stops. Max absolute delta: {Math.round(activeTimeSummary.maxAbsDelta)} min.
              </Text>
            ) : (
              <Text style={[styles.selectionHint, { color: theme.subtleText }]}>No parseable invoice/arrived time values detected for this route yet.</Text>
            )}
            {topOffender ? (
              <Text style={[styles.selectionHint, { color: theme.subtleText }]}>
                Current highest offender at this threshold: {topOffender.offender}
              </Text>
            ) : null}
            {activeRouteMapUrl ? (
              <Pressable onPress={openActiveRouteMap} style={[styles.routeMapButton, { backgroundColor: theme.accent }]}>
                <Text style={styles.routeMapButtonText}>Open In-Route Map</Text>
              </Pressable>
            ) : (
              <Text style={[styles.selectionHint, { color: theme.subtleText }]}>Need a parseable date to open the in-route map.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.bodyText }]}>Mismatch Map for {activeOffenderSummary.offender}</Text>
            <Text style={[styles.sectionCopy, { color: theme.mutedText }]}>
              Dashed connectors show invoice location to arrived location per invoice. More red means larger discrepancy.
            </Text>
            <DiscrepancyMap
              points={activeOffenderPoints}
              activeOffender={activeOffenderSummary.offender}
              routeMapUrl={activeRouteMapUrl}
              compareSummary={compareSummary}
              selectedPointId={selectedStop ? pointSelectionKey(selectedStop) : null}
              onPointSelect={(pointId) => setSelectedStopId(pointId)}
            />
          </View>

          <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.bodyText }]}>Stop Table + Detail Drawer</Text>
                <Text style={[styles.sectionCopy, { color: theme.mutedText }]}>Click a row or a map point to lock the same stop into the detail view.</Text>
              </View>
              <View style={[styles.scorePill, { backgroundColor: theme.accentSoft, borderColor: theme.cardBorder }]}>
                <Text style={[styles.scorePillLabel, { color: theme.mutedText }]}>Route risk</Text>
                <Text style={[styles.scorePillValue, { color: theme.bodyText }]}>{compareSummary?.riskScore.toFixed(1) ?? 'N/A'}</Text>
              </View>
            </View>

            <View style={styles.stopToolbar}>
              <View style={styles.stopSearchWrap}>
                <Text style={[styles.label, { color: theme.mutedText }]}>Search stops</Text>
                <TextInput
                  value={stopSearchQuery}
                  onChangeText={setStopSearchQuery}
                  placeholder="Customer, invoice, WH, or time"
                  placeholderTextColor={theme.subtleText}
                  style={[styles.thresholdInput, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.bodyText }]}
                />
              </View>

              <View style={styles.stopToggleGroup}>
                <Pressable
                  onPress={() => setStopThresholdOnly((value) => !value)}
                  style={[
                    styles.stopToggleButton,
                    { backgroundColor: stopThresholdOnly ? theme.accent : theme.inputBg, borderColor: theme.inputBorder },
                  ]}>
                  <Text style={[styles.stopToggleText, { color: stopThresholdOnly ? '#ffffff' : theme.bodyText }]}>Over {thresholdMiles} mi only</Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsPlaybackActive((value) => !value)}
                  disabled={stopTablePoints.length <= 1}
                  style={[
                    styles.stopToggleButton,
                    { backgroundColor: isPlaybackActive ? theme.accent : theme.inputBg, borderColor: theme.inputBorder },
                    stopTablePoints.length <= 1 ? styles.stopToggleButtonDisabled : null,
                  ]}>
                  <Text style={[styles.stopToggleText, { color: isPlaybackActive ? '#ffffff' : theme.bodyText }]}>
                    {isPlaybackActive ? 'Pause playback' : 'Play playback'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.stopStepper}>
                <Pressable
                  onPress={() => {
                    if (!stopTablePoints.length || visibleStopIndex < 0) {
                      return;
                    }

                    const previousIndex = visibleStopIndex <= 0 ? stopTablePoints.length - 1 : visibleStopIndex - 1;
                    setSelectedStopId(pointSelectionKey(stopTablePoints[previousIndex]));
                  }}
                  disabled={stopTablePoints.length <= 1}
                  style={[
                    styles.stopStepButton,
                    { backgroundColor: theme.accent },
                    stopTablePoints.length <= 1 ? styles.stopStepButtonDisabled : null,
                  ]}>
                  <Text style={styles.stopStepButtonText}>Prev</Text>
                </Pressable>
                <Text style={[styles.stopStepperText, { color: theme.mutedText }]}>Stop {visibleStopIndex + 1} of {stopTablePoints.length || 0}</Text>
                <Pressable
                  onPress={() => {
                    if (!stopTablePoints.length || visibleStopIndex < 0) {
                      return;
                    }

                    const nextIndex = visibleStopIndex >= stopTablePoints.length - 1 ? 0 : visibleStopIndex + 1;
                    setSelectedStopId(pointSelectionKey(stopTablePoints[nextIndex]));
                  }}
                  disabled={stopTablePoints.length <= 1}
                  style={[
                    styles.stopStepButton,
                    { backgroundColor: theme.accent },
                    stopTablePoints.length <= 1 ? styles.stopStepButtonDisabled : null,
                  ]}>
                  <Text style={styles.stopStepButtonText}>Next</Text>
                </Pressable>
              </View>
            </View>

            {selectedStop ? (
              <View style={[styles.selectedStopDrawer, { backgroundColor: theme.accentSoft, borderColor: theme.cardBorder }]}> 
                <View style={styles.selectedStopHeader}>
                  <View style={styles.selectedStopHeaderLeft}>
                    <Text style={[styles.sectionTitle, { color: theme.bodyText }]}>{selectedStop.customerName ?? 'Unknown customer'}</Text>
                    <Text style={[styles.sectionCopy, { color: theme.mutedText }]}>Invoice {selectedStop.invoiceId} | WH {selectedStop.whId} | {selectedStop.offender}</Text>
                  </View>
                  <View style={styles.selectedStopHeaderRight}>
                    <Text style={[styles.drawerScore, { color: theme.bodyText }]}>{selectedStop.distanceMiles.toFixed(2)} mi</Text>
                    <Text style={[styles.drawerScoreSub, { color: theme.mutedText }]}>{selectedStop.timeDeltaMinutes != null ? formatSignedMinutes(selectedStop.timeDeltaMinutes) : 'N/A'}</Text>
                  </View>
                </View>
                <View style={styles.selectedStopTimestampRow}>
                  <View style={styles.selectedStopTimestampBlock}>
                    <Text style={[styles.drawerTimestampLabel, { color: theme.mutedText }]}>Invoice timestamp (ET)</Text>
                    <Text style={[styles.drawerTimestampValue, { color: theme.bodyText }]}>{formatDateTimeLabel(selectedStop.invoiceTimeLabel, selectedStop.invoiceTimeMs)}</Text>
                  </View>
                  <View style={styles.selectedStopTimestampBlock}>
                    <Text style={[styles.drawerTimestampLabel, { color: theme.mutedText }]}>Arrived timestamp (ET)</Text>
                    <Text style={[styles.drawerTimestampValue, { color: theme.bodyText }]}>{formatDateTimeLabel(selectedStop.arrivedTimeLabel, selectedStop.arrivedTimeMs)}</Text>
                  </View>
                </View>
                <View style={styles.selectedStopGrid}>
                  <Text style={[styles.drawerLine, { color: theme.bodyText }]}>Mismatch distance: {selectedStop.distanceMiles.toFixed(2)} mi</Text>
                  <Text style={[styles.drawerLine, { color: theme.bodyText }]}>Time delta: {selectedStop.timeDeltaMinutes != null ? formatSignedMinutes(selectedStop.timeDeltaMinutes) : 'N/A'}</Text>
                  <Text style={[styles.drawerLine, { color: theme.bodyText }]}>Invoice coords: {selectedStop.invoiceLat.toFixed(5)}, {selectedStop.invoiceLng.toFixed(5)}</Text>
                  <Text style={[styles.drawerLine, { color: theme.bodyText }]}>Arrived coords: {selectedStop.arrivedLat.toFixed(5)}, {selectedStop.arrivedLng.toFixed(5)}</Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.stopTableHead, { borderColor: theme.cardBorder, backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.stopHeadCell, styles.stopCellCustomer, { color: theme.mutedText }]}>Customer / invoice</Text>
              <Text style={[styles.stopHeadCell, styles.stopCellTime, { color: theme.mutedText }]}>Times</Text>
              <Text style={[styles.stopHeadCell, styles.stopCellDistance, { color: theme.mutedText }]}>Mismatch</Text>
              <Text style={[styles.stopHeadCell, styles.stopCellTime, { color: theme.mutedText }]}>WH / score</Text>
            </View>

            <ScrollView style={styles.stopTableScroll} nestedScrollEnabled>
              {stopTablePoints.length > 0 ? (
                stopTablePoints.map((point) => {
                  const isSelected = selectedStop ? pointSelectionKey(point) === pointSelectionKey(selectedStop) : false;
                  const stopScore = point.distanceMiles * 10 + Math.abs(point.timeDeltaMinutes ?? 0) * 0.5;

                  return (
                    <Pressable
                      key={`stop-${point.id}`}
                      onPress={() => setSelectedStopId(pointSelectionKey(point))}
                      style={[
                        styles.stopRow,
                        { borderColor: theme.cardBorder, backgroundColor: isSelected ? theme.selectedRowBg : theme.cardBg },
                        isSelected ? [styles.stopRowSelected, { borderColor: theme.selectedRowBorder }] : null,
                      ]}>
                      <View style={styles.stopCellCustomer}>
                        <Text style={[styles.stopRowTitle, { color: theme.bodyText }]} numberOfLines={1}>
                          {point.customerName ?? 'Unknown customer'}
                        </Text>
                        <Text style={[styles.stopRowMeta, { color: theme.mutedText }]} numberOfLines={1}>
                          Invoice {point.invoiceId} | {point.offender}
                        </Text>
                      </View>
                      <View style={styles.stopCellTime}>
                        <Text style={[styles.stopRowMeta, { color: theme.bodyText }]} numberOfLines={1}>
                          Invoice timestamp: {formatDateTimeLabel(point.invoiceTimeLabel, point.invoiceTimeMs)}
                        </Text>
                        <Text style={[styles.stopRowMeta, { color: theme.mutedText }]} numberOfLines={1}>
                          Arrived timestamp: {formatDateTimeLabel(point.arrivedTimeLabel, point.arrivedTimeMs)}
                        </Text>
                      </View>
                      <View style={styles.stopCellDistance}>
                        <Text style={[styles.stopRowTitle, { color: theme.bodyText }]}>{point.distanceMiles.toFixed(2)} mi</Text>
                        <Text style={[styles.stopRowMeta, { color: theme.mutedText }]}>
                          {point.timeDeltaMinutes != null ? formatSignedMinutes(point.timeDeltaMinutes) : 'N/A'}
                        </Text>
                      </View>
                      <View style={styles.stopCellTime}>
                        <Text style={[styles.stopRowMeta, { color: theme.bodyText }]}>{point.whId}</Text>
                        <Text style={[styles.stopRowMeta, { color: theme.mutedText }]}>
                          Score {stopScore.toFixed(1)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View style={styles.stopEmptyState}>
                  <Text style={[styles.sectionCopy, { color: theme.mutedText }]}>No stops match the current filters.</Text>
                </View>
              )}
            </ScrollView>
          </View>

          <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <Text style={[styles.sectionTitle, { color: theme.bodyText }]}>Top Offenders (Tap to View on Map)</Text>
            <Text style={[styles.sectionCopy, { color: theme.mutedText }]}>
              WH_ID: {selectedWhId} | Route filter: {routeSearchQuery.trim() || 'All'} | Showing {pageStartCount}-{pageEndCount} of {offenderSummaries.length} offenders.
            </Text>
            {pagedOffenderSummaries.map((summary) => (
              <Pressable
                key={summary.offender}
                onPress={() => setSelectedOffender(summary.offender)}
                style={[
                  styles.rankRow,
                  { borderColor: theme.cardBorder },
                  summary.offender === activeOffenderSummary.offender
                    ? [styles.rankRowSelected, { borderColor: theme.selectedRowBorder, backgroundColor: theme.selectedRowBg }]
                    : null,
                ]}>
                <Text
                  style={[
                    styles.rankName,
                    { color: theme.bodyText },
                    summary.offender === activeOffenderSummary.offender ? [styles.rankNameSelected, { color: theme.accent }] : null,
                  ]}>
                  {summary.offender}
                </Text>
                <Text style={[styles.rankValue, { color: theme.mutedText }]}>
                  {summary.overThresholdCount}/{summary.invoiceCount} over {thresholdMiles} mi ({formatPct(summary.overThresholdRate)})
                </Text>
              </Pressable>
            ))}
            <View style={styles.paginationRow}>
              <Pressable
                onPress={() => setOffenderPage((current) => Math.max(1, current - 1))}
                disabled={visibleOffenderPage <= 1}
                style={[
                  styles.paginationButton,
                  { backgroundColor: theme.accent },
                  visibleOffenderPage <= 1 ? styles.paginationButtonDisabled : null,
                ]}>
                <Text style={styles.paginationButtonText}>Previous</Text>
              </Pressable>
              <Text style={[styles.paginationText, { color: theme.mutedText }]}>Page {visibleOffenderPage} of {totalOffenderPages}</Text>
              <Pressable
                onPress={() => setOffenderPage((current) => Math.min(totalOffenderPages, current + 1))}
                disabled={visibleOffenderPage >= totalOffenderPages}
                style={[
                  styles.paginationButton,
                  { backgroundColor: theme.accent },
                  visibleOffenderPage >= totalOffenderPages ? styles.paginationButtonDisabled : null,
                ]}>
                <Text style={styles.paginationButtonText}>Next</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionCopy, { color: theme.mutedText }]}>
            Upload a file to start. The tab will automatically rank the worst offender and draw the impact map.
          </Text>
        </View>
      )}

      <Text style={[styles.footerNote, { color: theme.subtleText }]}>
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
    padding: 18,
    gap: 8,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeToggle: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  themeToggleText: {
    fontSize: 12,
    fontWeight: '700',
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
  filtersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-start',
  },
  filtersCard: {
    position: 'relative',
    zIndex: 30,
  },
  filtersCardOpen: {
    zIndex: 60,
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
    minWidth: 220,
    gap: 4,
  },
  dropdownWrap: {
    position: 'relative',
    zIndex: 80,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dropdownTriggerText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownChevron: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    zIndex: 90,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    maxHeight: 180,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  dropdownItemSelected: {
    backgroundColor: '#eff6ff',
  },
  dropdownItemText: {
    color: '#0f172a',
    fontSize: 12,
  },
  dropdownItemTextSelected: {
    color: '#1d4ed8',
    fontWeight: '700',
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
    position: 'relative',
    zIndex: 1,
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
  selectionHint: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
  },
  routeMapButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  routeMapButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  rankRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  rankRowSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
  },
  rankName: {
    color: '#0f172a',
    fontWeight: '800',
  },
  rankNameSelected: {
    color: '#1d4ed8',
  },
  rankValue: {
    color: '#334155',
    fontSize: 12,
  },
  highlightRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  highlightTitle: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  highlightValue: {
    color: '#334155',
    fontSize: 12,
  },
  paginationRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  paginationButton: {
    borderRadius: 10,
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  paginationButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  paginationButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  paginationText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  scorePill: {
    minWidth: 120,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  scorePillLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scorePillValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  stopToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  stopSearchWrap: {
    flexGrow: 1,
    minWidth: 240,
    gap: 4,
  },
  stopToggleGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  stopToggleButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  stopToggleButtonDisabled: {
    opacity: 0.45,
  },
  stopToggleText: {
    fontSize: 12,
    fontWeight: '800',
  },
  stopStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stopStepButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stopStepButtonDisabled: {
    opacity: 0.45,
  },
  stopStepButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  stopStepperText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stopTableHead: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  stopHeadCell: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stopCellCustomer: {
    flex: 1.4,
    minWidth: 180,
  },
  stopCellTime: {
    flex: 1.2,
    minWidth: 150,
  },
  stopCellDistance: {
    flex: 0.8,
    minWidth: 96,
  },
  stopTableScroll: {
    maxHeight: 420,
  },
  stopRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 10,
  },
  stopRowSelected: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  stopRowTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  stopRowMeta: {
    fontSize: 11,
    lineHeight: 16,
  },
  stopEmptyState: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  selectedStopDrawer: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  selectedStopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  selectedStopHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  selectedStopHeaderRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  drawerScore: {
    fontSize: 16,
    fontWeight: '900',
  },
  drawerScoreSub: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectedStopTimestampRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  selectedStopTimestampBlock: {
    flexGrow: 1,
    minWidth: 220,
    gap: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff80',
    borderWidth: 1,
    borderColor: '#dbe3ef',
  },
  drawerTimestampLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  drawerTimestampValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  selectedStopGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  drawerLine: {
    minWidth: 180,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  footerNote: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
  },
});
