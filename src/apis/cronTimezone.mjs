function parseCronField(field, min, max) {
  const allowed = new Set();
  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) throw new Error(`Empty cron segment in "${field}"`);
    const [rangePart, stepPart] = trimmed.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid cron step "${stepPart}"`);
    }
    let start = min;
    let end = max;
    if (rangePart !== "*") {
      if (rangePart.includes("-")) {
        const [a, b] = rangePart.split("-").map(Number);
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < min || b > max || a > b) {
          throw new Error(`Invalid cron range "${rangePart}"`);
        }
        start = a;
        end = b;
      } else {
        const val = Number(rangePart);
        if (!Number.isInteger(val) || val < min || val > max) {
          throw new Error(`Cron value "${rangePart}" out of range ${min}-${max}`);
        }
        start = val;
        end = stepPart ? max : val;
      }
    }
    for (let v = start; v <= end; v += step) {
      allowed.add(v);
    }
  }
  return allowed;
}

const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  return {
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    weekday: WEEKDAY_MAP[parts.weekday]
  };
}

/**
 * Compute the next N run timestamps for a standard 5-field cron expression in a given IANA timezone.
 */
export function getNextCronRuns(expr, timeZone = "UTC", count = 5, fromDate = new Date()) {
  if (typeof expr !== "string" || !expr.trim()) {
    throw new Error("Missing cron expression");
  }
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error("Cron expression must have exactly 5 fields (minute hour day month weekday)");
  }
  // Validate timezone early.
  new Intl.DateTimeFormat("en-US", { timeZone }).format(fromDate);

  const minutes = parseCronField(fields[0], 0, 59);
  const hours = parseCronField(fields[1], 0, 23);
  const days = parseCronField(fields[2], 1, 31);
  const months = parseCronField(fields[3], 1, 12);
  const weekdays = parseCronField(fields[4], 0, 7);
  if (weekdays.has(7)) weekdays.add(0);

  const targetCount = Math.min(Math.max(1, Number(count) || 5), 20);
  const results = [];
  let cursorMs = Math.floor(fromDate.getTime() / 60000) * 60000 + 60000;
  const maxSteps = 525960; // Up to ~1 year of minutes.

  for (let i = 0; i < maxSteps && results.length < targetCount; i += 1) {
    const candidate = new Date(cursorMs);
    const z = getZonedParts(candidate, timeZone);
    if (
      minutes.has(z.minute) &&
      hours.has(z.hour) &&
      months.has(z.month) &&
      days.has(z.day) &&
      weekdays.has(z.weekday)
    ) {
      results.push({
        utc: candidate.toISOString(),
        local: candidate.toLocaleString("sv-SE", { timeZone })
      });
    }
    cursorMs += 60000;
  }

  return {
    expression: expr.trim(),
    timeZone,
    count: results.length,
    nextRuns: results
  };
}

/**
 * Convert an ISO timestamp to any target IANA timezone.
 */
export function convertTimezone(isoTime, targetTz = "UTC") {
  const date = isoTime ? new Date(isoTime) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid time parameter");
  }
  const formatted = date.toLocaleString("sv-SE", { timeZone: targetTz });
  return {
    inputUtc: date.toISOString(),
    targetTimeZone: targetTz,
    localTime: formatted,
    unixSeconds: Math.floor(date.getTime() / 1000)
  };
}
