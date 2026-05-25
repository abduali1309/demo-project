type Nullable<T> = T | null | undefined;

interface Coordinates {
  lng: number;
  lat: number;
}

interface AutoShiftLog {
  event_code?: number;
  event_type?: number;
  record_status?: number;
  status?: string;
  start_date?: string;
  end_date?: string | null;
  old_start_date?: string | null;
  old_end_date?: string | null;
  address?: string;
  note?: string | null;
  coordinates?: Coordinates | null;
  odometr?: number;
  engine_hours?: number;
  driver_signature?: string | null;
  diagnostic?: unknown;
  document?: string | null;
  trailer?: string | null;
  inspection?: unknown;
  certify_date?: string | null;
  is_blocked?: boolean;
  vin_number?: string | null;
  id?: number | null;
  driverId?: number;
  codriverId?: number | null;
  vehicleId?: number;
  companyId?: number;
  vehicle?: {
    truck_number?: string;
    uid?: string;
    id?: number;
  };
}

interface AutoShiftResponse {
  logs: AutoShiftLog[];
  originalLogs: AutoShiftLog[];
  selectedLog?: AutoShiftLog;
  updatedLog?: AutoShiftLog;
  message?: string;
  type?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function hasValue<T>(value: Nullable<T>): value is T {
  return value !== null && value !== undefined && value !== "";
}

function toTimestamp(value: string, label: string): number {
  const time = new Date(value).getTime();
  assert(!Number.isNaN(time), `${label} must be a valid date`);
  return time;
}

function reverseCopy<T>(arr: T[]): T[] {
  return [...arr].reverse();
}


function identityKey(log: AutoShiftLog): string {
  return [
    log?.event_code ?? "",
    log?.event_type ?? "",
    log?.record_status ?? "",
    log?.status ?? "",
    log?.address ?? "",
    log?.note ?? "",
    log?.odometr ?? "",
    log?.engine_hours ?? "",
    log?.driverId ?? "",
    log?.codriverId ?? "",
    log?.vehicleId ?? "",
    log?.companyId ?? "",
    log?.document ?? "",
    log?.trailer ?? "",
    log?.inspection ?? "",
    log?.certify_date ?? "",
    log?.vin_number ?? "",
    log?.is_blocked ?? "",
    JSON.stringify(log?.coordinates ?? null),
    JSON.stringify(log?.vehicle ?? null),
  ].join("|");
}

function durationMs(log: AutoShiftLog, label: string): number {
  assert(hasValue(log.start_date), `${label} must have start_date`);
  assert(hasValue(log.end_date), `${label} must have end_date`);

  const start = toTimestamp(log.start_date, `${label}.start_date`);
  const end = toTimestamp(log.end_date, `${label}.end_date`);

  assert(end >= start, `${label}.end_date must be greater than or equal to start_date`);
  return end - start;
}

function isDutyLog(log: AutoShiftLog): boolean {
  const eventType = Number(log?.event_type);
  const eventCode = Number(log?.event_code);

  return (
    (eventType === 1 && eventCode >= 1 && eventCode <= 4) ||
    (eventType === 3 && (eventCode === 1 || eventCode === 2))
  );
}

function isInfoLog(log: AutoShiftLog): boolean {
  return !isDutyLog(log);
}

function briefLog(log: AutoShiftLog, index: number): string {
  return [
    `${index}`,
    `id=${log.id ?? "null"}`,
    `event_type=${log.event_type ?? "null"}`,
    `event_code=${log.event_code ?? "null"}`,
    `start=${log.start_date ?? "null"}`,
    `end=${log.end_date ?? "null"}`
  ].join(" | ");
}


function assertAdjacentTimes(
  leftMs: number,
  rightMs: number,
  leftLabel: string,
  rightLabel: string,
  toleranceMs = 1
): void {
  const diff = rightMs - leftMs;

  assert(
    diff >= 0 && diff <= toleranceMs,
    `${leftLabel} and ${rightLabel} must be connected within ${toleranceMs}ms, but diff=${diff}ms`
  );
}

function validateDutyConnectivityOnly(logs: AutoShiftLog[], label: string): void {
  const ordered = logs.map((log, originalIndex) => ({ log, originalIndex })).reverse();
  const dutyLogs = ordered.filter(({ log }) => isDutyLog(log));

  for (let i = 0; i < dutyLogs.length - 1; i++) {
    const current = dutyLogs[i];
    const next = dutyLogs[i + 1];

    assert(hasValue(current.log.end_date), `${label} duty[${current.originalIndex}] must have end_date\n${briefLog(current.log, current.originalIndex)}`);
    assert(hasValue(next.log.start_date), `${label} duty[${next.originalIndex}] must have start_date`);

    const currentEnd = toTimestamp(current.log.end_date!, `${label}.duty[${current.originalIndex}].end_date`);
    const nextStart = toTimestamp(next.log.start_date!, `${label}.duty[${next.originalIndex}].start_date`);

    assertAdjacentTimes(
      currentEnd,
      nextStart,
      `${label} duty end_date (${current.originalIndex})`,
      `${label} duty start_date (${next.originalIndex})`
    );
  }
}

function validateInfoLogs(logs: AutoShiftLog[], label: string): void {
  const ordered = logs.map((log, originalIndex) => ({ log, originalIndex }));

  ordered.forEach(({ log, originalIndex }) => {
    if (!isInfoLog(log)) return;

    assert(hasValue(log.start_date), `${label}[${originalIndex}] info log must have start_date`);
    assert(hasValue(log.end_date), `${label}[${originalIndex}] info log must have end_date`);

    const start = toTimestamp(log.start_date!, `${label}[${originalIndex}].start_date`);
    const end = toTimestamp(log.end_date!, `${label}[${originalIndex}].end_date`);

    assert(
      start === end,
      `${label}[${originalIndex}] info log must have same start_date and end_date\n${briefLog(log, originalIndex)}`
    );
  });
}

function buildDutyGroups(logs: AutoShiftLog[], label: string): Array<{
  duty: AutoShiftLog;
  infoLogs: AutoShiftLog[];
}> {
  const ordered = reverseCopy(logs);
  const groups: Array<{ duty: AutoShiftLog; infoLogs: AutoShiftLog[] }> = [];
  let currentGroup: { duty: AutoShiftLog; infoLogs: AutoShiftLog[] } | null = null;

  for (let i = 0; i < ordered.length; i++) {
    const log = ordered[i];

    if (isDutyLog(log)) {
      currentGroup = { duty: log, infoLogs: [] };
      groups.push(currentGroup);
      continue;
    }

    if (!isInfoLog(log)) {
      continue;
    }

    assert(currentGroup !== null, `${label}[${i}] info log appears before the first duty log`);

    const dutyStart = toTimestamp(currentGroup.duty.start_date!, `${label}.duty.start_date`);
    const dutyEnd = hasValue(currentGroup.duty.end_date)
      ? toTimestamp(currentGroup.duty.end_date!, `${label}.duty.end_date`)
      : Number.POSITIVE_INFINITY;

    const infoStart = toTimestamp(log.start_date!, `${label}[${i}].start_date`);
    const infoEnd = hasValue(log.end_date)
      ? toTimestamp(log.end_date!, `${label}[${i}].end_date`)
      : infoStart;

    assert(
      infoStart >= dutyStart,
      `${label}[${i}] info log starts before its duty log`
    );

    assert(
      infoEnd <= dutyEnd,
      `${label}[${i}] info log ends after its duty log`
    );

    currentGroup.infoLogs.push(log);
  }

  return groups;
}

function validateAllLogsHaveDates(logs: AutoShiftLog[], label: string): void {
  const ordered = logs.map((log, originalIndex) => ({ log, originalIndex })).reverse();

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    assert(hasValue(item.log.start_date), `${label}[${item.originalIndex}] must have start_date`);

    if (i === ordered.length - 1) {
      // true last chronological log may have null end_date
      continue;
    }

    assert(
      hasValue(item.log.end_date),
      `${label}[${item.originalIndex}] must have end_date\n${briefLog(item.log, item.originalIndex)}`
    );
  }
}

function validateDutyGroups(originalLogs: AutoShiftLog[], shiftedLogs: AutoShiftLog[]): void {
  const originalGroups = buildDutyGroups(originalLogs, "originalLogs");
  const shiftedGroups = buildDutyGroups(shiftedLogs, "logs");

  assert(
    originalGroups.length === shiftedGroups.length,
    "logs and originalLogs must contain the same number of duty groups"
  );

  // for (let i = 0; i < originalGroups.length; i++) {
  //   const originalDuty = originalGroups[i].duty;
  //   const shiftedDuty = shiftedGroups[i].duty;

  //   assert(
  //     identityKey(originalDuty) === identityKey(shiftedDuty),
  //     `Duty log mismatch at group index ${i}`
  //   );

  //   assert(
  //     originalGroups[i].infoLogs.length === shiftedGroups[i].infoLogs.length,
  //     `Info log count mismatch inside duty group ${i}`
  //   );

    // for (let j = 0; j < originalGroups[i].infoLogs.length; j++) {
    //   const originalInfo = originalGroups[i].infoLogs[j];
    //   const shiftedInfo = shiftedGroups[i].infoLogs[j];

    //   assert(
    //     identityKey(originalInfo) === identityKey(shiftedInfo),
    //     `Info log mismatch in duty group ${i} at index ${j}`
    //   );
    // }
  // }
}

function validateDrivingDurationsMatch(beforeLogs: AutoShiftLog[], afterLogs: AutoShiftLog[]): void {
  const beforeMap = new Map<string, number[]>();
  const afterMap = new Map<string, number[]>();

  const collect = (logs: AutoShiftLog[], target: Map<string, number[]>, label: string) => {
    const ordered = reverseCopy(logs);

    ordered.forEach((log, index) => {
      if (!isDutyLog(log)) return;

      const key = identityKey(log);
      const ms = durationMs(log, `${label}[${index}]`);

      const list = target.get(key) ?? [];
      list.push(ms);
      target.set(key, list);
    });
  };

  collect(beforeLogs, beforeMap, "originalLogs");
  collect(afterLogs, afterMap, "logs");

  assert(
    beforeMap.size === afterMap.size,
    "logs and originalLogs must contain the same duty log matchers"
  );

  for (const [key, beforeDurations] of beforeMap.entries()) {
    const afterDurations = afterMap.get(key);

    assert(afterDurations, `No matching duty log found in logs for matcher: ${key}`);
    assert(
      beforeDurations.length === afterDurations.length,
      `Matched duty log count mismatch for matcher: ${key}`
    );

    for (let i = 0; i < beforeDurations.length; i++) {
      assert(
        beforeDurations[i] === afterDurations[i],
        `Driving duration mismatch for matcher ${key} at index ${i}`
      );
    }
  }
}

function validateSelectedAndUpdatedLog(
  selectedLog: Nullable<AutoShiftLog>,
  updatedLog: Nullable<AutoShiftLog>,
  minimumHours = 10
): void {
  assert(selectedLog && typeof selectedLog === "object", "selectedLog must be present");
  assert(updatedLog && typeof updatedLog === "object", "updatedLog must be present");

  assert(hasValue(selectedLog.start_date), "selectedLog must have start_date");
  assert(hasValue(selectedLog.end_date), "selectedLog must have end_date");
  assert(hasValue(updatedLog.start_date), "updatedLog must have start_date");
  assert(hasValue(updatedLog.end_date), "updatedLog must have end_date");

  assert(updatedLog.id === selectedLog.id, "updatedLog.id must match selectedLog.id");
  assert(
    updatedLog.start_date === selectedLog.start_date,
    "updatedLog.start_date must match selectedLog.start_date"
  );
  assert(
    updatedLog.old_start_date === selectedLog.start_date,
    "updatedLog.old_start_date must match selectedLog.start_date"
  );
  assert(
    updatedLog.old_end_date === selectedLog.end_date,
    "updatedLog.old_end_date must match selectedLog.end_date"
  );

  const updatedDuration = durationMs(updatedLog, "updatedLog");
  assert(
    updatedDuration >= minimumHours * 60 * 60 * 1000,
    `updatedLog duration must be at least ${minimumHours} hours`
  );
}

export function validateAutoShiftResponse(response: AutoShiftResponse): void {
  assert(response && typeof response === "object", "Response must be an object");
  assert(Array.isArray(response.logs), "logs must be an array");
  assert(Array.isArray(response.originalLogs), "originalLogs must be an array");

  // validateAllLogsHaveDates(response.originalLogs, "originalLogs");
  // validateAllLogsHaveDates(response.logs, "logs");

  validateDutyConnectivityOnly(response.logs, "logs");
  validateDutyConnectivityOnly(response.originalLogs, "originalLogs");
  // validateInfoLogs(response.logs, "logs");
  // validateInfoLogs(response.originalLogs, "originalLogs");

  validateDutyGroups(response.originalLogs, response.logs);
  validateDrivingDurationsMatch(response.originalLogs, response.logs);
  validateSelectedAndUpdatedLog(response.selectedLog ?? null, response.updatedLog ?? null, 10);
}

async function main() {
  const driverUid = "03677503-ac0e-4d19-af0d-13167138663d";
  const companyUid = "399519c7-902e-40e0-9be8-e6749cf76f76";
  const authorization = "1hGYmSirX6HZd3jaN24GdkVyIdHG56AQbQd1mlB6laiL9uoKAl9TbCztRWzSBpFz";
  const logId = 180919;
  const isCycle = false;

  const url =
    `https://uat.tteld.com/api/logs/auto-shift?` +
    `driverUid=${driverUid}&logId=${logId}&isCycle=${isCycle}&isVerified=false&checkOregon=true`;

  const response: AutoShiftResponse = await fetch(url, {
    method: "POST",
    headers: {
      // Accept: "application/json, text/plain, */*",
      Authorization: authorization,
      companyuid: companyUid,
    },
  }).then((r) => r.json());

  validateAutoShiftResponse(response);
  console.log("Auto-shift response is valid");
}

main().catch((err) => {
  console.error("Validation failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});