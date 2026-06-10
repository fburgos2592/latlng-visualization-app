export function parseTimeValue(value: unknown): number | null {
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

export function formatSignedMinutes(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} min`;
}

export function formatEasternDateTime(ms: number): string {
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

export function formatWallClockFromSerial(ms: number): string {
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

export function formatDateTimeLabel(value: string | null, fallbackMs: number | null): string {
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
