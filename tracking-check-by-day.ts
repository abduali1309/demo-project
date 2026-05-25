type TimezoneOption = {
  label: string;
  value: string; // e.g. "America/New_York"
};

type Tracking = {
  id: number;
  date: string;     // ISO string in UTC
  odometr: number;  // odometer value from API
  driverId?: number;
  vehicleId?: number;
};

type DailyOdometerChange = {
  day: string; // YYYY-MM-DD in the chosen timezone
  firstOdometer: number | null;
  lastOdometer: number | null;
  difference: number | null;
  points: number;
};

type ApiTrackingResponse = Tracking[];

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function getLocalDayKey(date: Date, timeZone: string): string {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function addDaysToDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Convert a local calendar day in a timezone to the UTC instant for 00:00:00 local time.
 * This works with DST zones like America/New_York.
 */
function zonedStartOfDayToUtc(dayKey: string, timeZone: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);

  // Initial guess: the same wall-clock time in UTC
  let utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0);

  for (let i = 0; i < 4; i++) {
    const actual = getDatePartsInTimeZone(new Date(utcMillis), timeZone);

    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );

    const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
    const diff = targetAsUtc - actualAsUtc;

    if (Math.abs(diff) < 1000) break;
    utcMillis += diff;
  }

  return new Date(utcMillis);
}

function getUtcRangeForLocalDay(dayKey: string, timeZone: string) {
  const startUtc = zonedStartOfDayToUtc(dayKey, timeZone);
  const nextDayKey = addDaysToDayKey(dayKey, 1);
  const endUtc = new Date(zonedStartOfDayToUtc(nextDayKey, timeZone).getTime() - 1);

  return {
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
  };
}

async function fetchTrackingsById(params: {
  id: number | string;
  fromUtc: string;
  toUtc: string;
  token: string;
}): Promise<ApiTrackingResponse> {
  const { id, fromUtc, toUtc, token } = params;

  const url = new URL(`https://addmin-api.evoeld.com/api/admins/get-trackings/${id}`);
  url.searchParams.set("from", fromUtc);
  url.searchParams.set("to", toUtc);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: token,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch trackings: ${res.status} ${res.statusText} - ${text}`);
  }

  return (await res.json()) as ApiTrackingResponse;
}

function buildDailyOdometerReport(
  trackings: Tracking[],
  timeZone: string,
  fromUtc: string,
  toUtc: string
): DailyOdometerChange[] {
  const grouped = new Map<string, Tracking[]>();

  const sorted = [...trackings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const row of sorted) {
    const dayKey = getLocalDayKey(new Date(row.date), timeZone);
    const arr = grouped.get(dayKey) ?? [];
    arr.push(row);
    grouped.set(dayKey, arr);
  }

  const startDay = getLocalDayKey(new Date(fromUtc), timeZone);
  const endDay = getLocalDayKey(new Date(toUtc), timeZone);

  const result: DailyOdometerChange[] = [];
  for (
    let day = startDay;
    day <= endDay;
    day = addDaysToDayKey(day, 1)
  ) {
    const rows = grouped.get(day) ?? [];

    if (rows.length === 0) {
      result.push({
        day,
        firstOdometer: null,
        lastOdometer: null,
        difference: null,
        points: 0,
      });
      continue;
    }

    const first = rows[0].odometr;
    const last = rows[rows.length - 1].odometr;

    result.push({
      day,
      firstOdometer: first ?? null,
      lastOdometer: last ?? null,
      difference:
        typeof first === "number" && typeof last === "number"
          ? last - first
          : null,
      points: rows.length,
    });
  }

  return result;
}

export async function getDailyOdometerReport(params: {
  id: number | string;
  fromUtc: string;
  toUtc: string;
  token: string;
  tz: TimezoneOption;
}) {
  const { id, fromUtc, toUtc, token, tz } = params;

  const trackings = await fetchTrackingsById({
    id,
    fromUtc,
    toUtc,
    token,
  });

  const daily = buildDailyOdometerReport(trackings, tz.value, fromUtc, toUtc);

  const totalDifference = daily.reduce((sum, day) => {
    return sum + (typeof day.difference === "number" ? day.difference : 0);
  }, 0);

  return {
    timezone: tz,
    range: {
      fromUtc,
      toUtc,
    },
    daily,
    totalDifference,
  };
}


async function main(){
    const tz = {
  label: "Eastern Standard Time",
  value: "America/New_York",
};

const report = await getDailyOdometerReport({
  id: 96679,
  fromUtc: "2026-04-01T04:00:00.000Z",
  toUtc: "2026-05-01T03:59:00.000Z",
  token: "XTBk6hWD3cM5OTnxosj6iYYE5kOlnOj2lbXsK0CE1finjV8kh5CXyEBcqegzlNj2", // keep token outside code
  tz,
});

let total = 0;
for (const day of report.daily) {
  if (typeof day.difference === "number") {
    total += day.difference;
  }
}

console.log(report.daily);
console.log(`Total odometer difference for the month: ${total}`);
}

main()