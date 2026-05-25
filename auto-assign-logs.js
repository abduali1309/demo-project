"use strict";

const Constants = require("@models/Constants");
const checkLog = require("@models/Logs2/Violation/CheckLog");
const IsSameLog = require("@models/Logs2/IsSameLog");
const { throwError } = require(".");

function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toIso(ms) {
  return new Date(ms).toISOString();
}

function isFiniteMs(ms) {
  return Number.isFinite(ms);
}

function getOpenAwareEndMs(log) {
  if (!log || log.end_date == null) return Number.POSITIVE_INFINITY;
  const endMs = toMs(log.end_date);
  return isFiniteMs(endMs) ? endMs : Number.POSITIVE_INFINITY;
}

function toOutputDate(template, ms) {
  if (!isFiniteMs(ms)) return null;
  return typeof template === "number" ? ms : toIso(ms);
}

function normalizeOwner(log, targetDriverId, targetCodriverId) {
  return {
    ...log,
    driverId: targetDriverId,
    codriverId: targetCodriverId ?? null,
  };
}

function normalizeLogsForShift(arr) {
  return (arr || [])
    .filter((l) => l && l.start_date)
    .map((log) => {
      const start = Number.isFinite(log.start_date) ? log.start_date : toMs(log.start_date);
      const end = log.end_date
        ? (Number.isFinite(log.end_date) ? log.end_date : toMs(log.end_date))
        : Date.now();
      return { ...log, start_date: start, end_date: end };
    });
}

function buildShiftWindows(boundaries, nowMs) {
  const b = (boundaries || [])
    .map(toMs)
    .filter(isFiniteMs)
    .sort((a, c) => a - c);
  const windows = [];
  for (let i = 0; i < b.length - 1; i++) windows.push({ start: b[i], end: b[i + 1] });
  if (b.length && b[b.length - 1] < nowMs) windows.push({ start: b[b.length - 1], end: nowMs });
  return windows;
}

function overlapsRange(log, start, end) {
  const s = toMs(log.start_date);
  const e = getOpenAwareEndMs(log);
  if (!isFiniteMs(s)) return false;
  if (s === e) return s >= start && s < end;
  return !(e <= start || s >= end);
}

function clipLogToRange(log, start, end) {
  const s = toMs(log.start_date);
  const originalEnd = getOpenAwareEndMs(log);
  if (s === originalEnd) {
    if (!isFiniteMs(s) || s < start || s >= end) return null;
    return {
      ...log,
      start_date: toOutputDate(log.start_date, s),
      end_date: toOutputDate(log.end_date ?? log.start_date, s),
    };
  }
  const e = Math.min(originalEnd, end);
  if (!isFiniteMs(s)) return null;
  const ns = Math.max(s, start);
  const ne = Math.min(e, end);
  if (ne < ns) return null;
  if (ne === ns && s !== originalEnd) return null;
  return {
    ...log,
    start_date: toOutputDate(log.start_date, ns),
    end_date: toOutputDate(log.end_date ?? log.start_date, ne),
  };
}

function collectLogsInRange(logs, start, end) {
  const out = [];
  for (const l of logs || []) {
    const c = clipLogToRange(l, start, end);
    if (c) out.push(c);
  }
  out.sort((a, b) => toMs(a.start_date) - toMs(b.start_date));
  return out;
}

function isPointAuthLog(log) {
  return Boolean(log) && log.event_type === 5 && isPointEvent(log);
}

function stripWindowStartAuthLogs(logs, start, graceMs = 60 * 1000) {
  return (logs || []).filter((log) => {
    if (!isPointAuthLog(log)) return true;
    const ts = toMs(log.start_date);
    if (!Number.isFinite(ts)) return true;
    return ts < start || ts > (start + graceMs);
  });
}

function removeRange(logs, start, end) {
  const out = [];
  for (const l of logs || []) {
    const s = toMs(l.start_date);
    const e = getOpenAwareEndMs(l);
    if (!isFiniteMs(s)) continue;

    const keepOnLeftBoundary = e < start || (e === start && !isPointAuthLog(l));
    if (keepOnLeftBoundary || s >= end) {
      out.push(l);
      continue;
    }
    if (s < start) {
      out.push({
        ...l,
        end_date: toOutputDate(l.end_date ?? l.start_date, start),
      });
    }
    if (e > end) {
      out.push({
        ...l,
        start_date: toOutputDate(l.start_date, end),
        end_date: l.end_date == null ? null : l.end_date,
      });
    }
  }
  out.sort((a, b) => toMs(a.start_date) - toMs(b.start_date));
  return out;
}

function buildOffDutyLog({ driverId, codriverId = null, companyId, start, end, vehicleId = null }) {
  return {
    driverId,
    codriverId,
    companyId,
    vehicleId,
    record_status: Constants.RECORD_STATUS_ACTIVE,
    event_type: Constants.EVENT_TYPE_DUTY,
    event_code: Constants.EVENT_CODE_OFF_DUTY,
    start_date: toIso(start),
    end_date: toIso(end),
    origin: Constants.ORIGIN_SYSTEM ?? 2,
    status: "off",
    creator: "system",
  };
}

function pickSwitchOffsetSeconds(randomFn = Math.random) {
  const sample = randomFn();
  const raw = Number.isFinite(sample) ? sample : 0;
  const normalized = Math.max(0, Math.min(raw, 0.999999999));
  return 10 + Math.floor(normalized * 41);
}

function getBoundaryDutyLog(logs, side) {
  const dutyLogs = (logs || []).filter((log) => log && checkLog(log, "duty"));
  if (!dutyLogs.length) return null;
  if (side === "end") return dutyLogs[dutyLogs.length - 1];
  return dutyLogs[0];
}

function buildSwitchAuthLog({
  driverId,
  codriverId = null,
  companyId,
  boundaryAt,
  authAt = null,
  eventCode,
  status,
  referenceLog = null,
  randomFn = Math.random,
}) {
  const at = Number.isFinite(authAt)
    ? authAt
    : boundaryAt - (pickSwitchOffsetSeconds(randomFn) * 1000);
  return {
    id: null,
    driverId,
    codriverId,
    companyId,
    vehicleId: referenceLog?.vehicleId ?? null,
    record_status: Constants.RECORD_STATUS_ACTIVE,
    event_type: 5,
    event_code: eventCode,
    start_date: toIso(at),
    end_date: toIso(at),
    origin: Constants.ORIGIN_SYSTEM ?? 2,
    status,
    creator: "system",
    note: null,
    address: referenceLog?.address ?? null,
    coordinates: referenceLog?.coordinates ?? null,
    odometr: referenceLog?.odometr ?? null,
    engine_hours: referenceLog?.engine_hours ?? null,
    inspection: false,
    trailer: referenceLog?.trailer ?? null,
    document: referenceLog?.document ?? null,
    vin_number: referenceLog?.vin_number ?? null,
  };
}

function checkExistOfCodriverDutyLog(codriverLogs, start, end) {
  for (const log of codriverLogs || []) {
    if (!overlapsRange(log, start, end)) continue;
    if (log.record_status !== Constants.RECORD_STATUS_ACTIVE || log.inspection) continue;

    const isDuty = checkLog(log, "duty") || log.event_type === Constants.EVENT_TYPE_DUTY || log.event_type === Constants.EVENT_TYPE_DUTY_INDICATES;
    const isOff = checkLog(log, "off") || checkLog(log, "sleep");

    if (isDuty && !isOff) {
      return { exist: true, logId: log.id };
    }
  }
  return { exist: false };
}

function getContinuousRestBeforeWindowRange(logs, end, requiredRestMs = Constants.SHIFT_CONDITION_SECOND * 1000) {
  if (!Number.isFinite(end) || !Number.isFinite(requiredRestMs) || requiredRestMs <= 0) return false;

  const start = end - requiredRestMs;
  let cursor = start;

  const dutyLogs = (logs || [])
    .filter((log) => (
      log &&
      log.record_status === Constants.RECORD_STATUS_ACTIVE &&
      !log.inspection &&
      checkLog(log, "duty") &&
      overlapsRange(log, start, end)
    ))
    .slice()
    .sort((a, b) => toMs(a.start_date) - toMs(b.start_date));

  if (!dutyLogs.length) return null;

  for (const log of dutyLogs) {
    if (!isRestLog(log)) return null;

    const segmentStart = Math.max(start, toMs(log.start_date));
    const segmentEnd = Math.min(end, getOpenAwareEndMs(log));

    if (!Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd) || segmentEnd <= segmentStart) continue;
    if (segmentStart > cursor) return null;

    cursor = Math.max(cursor, segmentEnd);
    if (cursor >= end) {
      return { start, end };
    }
  }

  return cursor >= end ? { start, end } : null;
}

function hasContinuousRestBeforeWindow(logs, end, requiredRestMs = Constants.SHIFT_CONDITION_SECOND * 1000) {
  return Boolean(getContinuousRestBeforeWindowRange(logs, end, requiredRestMs));
}

function filterEligibleCodriverWindows(windows, codriverLogs) {
  let candidateCount = 0;
  let eligibleCount = 0;

  const filtered = (windows || []).map((window) => {
    if (window?.owner !== "codriver") return window;

    candidateCount += 1;
    if (hasContinuousRestBeforeWindow(codriverLogs, window.start)) {
      eligibleCount += 1;
      return window;
    }

    return {
      ...window,
      owner: "driver",
    };
  });

  if (candidateCount > 0 && eligibleCount === 0) {
    throwError(
      "No eligible shift can be moved to co-driver. Co-driver was not in continuous rest for 10 hours before any candidate shift start.",
      400
    );
  }

  return filtered;
}

function buildOwnership(windows, nowMs, currentShiftInDriver) {
  const out = windows.map((w, idx) => ({
    start: w.start,
    end: w.end,
    owner: idx % 2 === 0 ? "driver" : "codriver",
  }));

  let curIdx = out.findIndex((w) => nowMs >= w.start && nowMs < w.end);
  if (curIdx < 0 && out.length && nowMs === out[out.length - 1].end) {
    curIdx = out.length - 1;
  }
  if (curIdx >= 0) {
    out[curIdx].owner = currentShiftInDriver ? "driver" : "codriver";
    for (let i = curIdx - 1; i >= 0; i--) out[i].owner = out[i + 1].owner === "driver" ? "codriver" : "driver";
    for (let i = curIdx + 1; i < out.length; i++) out[i].owner = out[i - 1].owner === "driver" ? "codriver" : "driver";
  } else if (out.length) {
    out[out.length - 1].owner = currentShiftInDriver ? "driver" : "codriver";
    for (let i = out.length - 2; i >= 0; i--) {
      out[i].owner = out[i + 1].owner === "driver" ? "codriver" : "driver";
    }
  }

  return out;
}

function canMergeLogs(prev, next) {
  if (!prev || !next) return false;
  if (!IsSameLog(prev, next)) return false;
  if ((prev.driverId ?? null) !== (next.driverId ?? null)) return false;
  if ((prev.codriverId ?? null) !== (next.codriverId ?? null)) return false;
  if ((prev.record_status ?? null) !== (next.record_status ?? null)) return false;
  if (Boolean(prev.inspection) !== Boolean(next.inspection)) return false;

  const prevEnd = getOpenAwareEndMs(prev);
  const nextStart = toMs(next.start_date);
  if (!isFiniteMs(nextStart)) return false;

  return prevEnd >= nextStart;
}

function isPointEvent(log) {
  return toMs(log?.start_date) === toMs(log?.end_date);
}

function isDutyLog(log) {
  return checkLog(log, "duty");
}

function applyMergedEnd(target, source) {
  const targetEnd = getOpenAwareEndMs(target);
  const sourceEnd = getOpenAwareEndMs(source);

  if (!Number.isFinite(targetEnd) || !Number.isFinite(sourceEnd)) {
    target.end_date = null;
    return;
  }

  if (sourceEnd > targetEnd) {
    target.end_date = source.end_date == null
      ? null
      : toOutputDate(source.end_date, sourceEnd);
  }
}

function findSkippableMergeIndex(merged, current) {
  if (!isDutyLog(current)) return -1;

  for (let i = merged.length - 1; i >= 0; i--) {
    const candidate = merged[i];
    if (canMergeLogs(candidate, current)) return i;

    if (isDutyLog(candidate)) return -1;
    if (!isPointEvent(candidate)) return -1;
  }

  return -1;
}

function mergeLogs(logs) {
  const sorted = (logs || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => toMs(a.start_date) - toMs(b.start_date));
  const merged = [];

  for (const log of sorted) {
    const prev = merged[merged.length - 1];
    if (!canMergeLogs(prev, log)) {
      const mergeIndex = findSkippableMergeIndex(merged, log);
      if (mergeIndex >= 0) {
        applyMergedEnd(merged[mergeIndex], log);
        continue;
      }

      merged.push({ ...log });
      continue;
    }

    applyMergedEnd(prev, log);
  }

  return merged;
}

function isRestLog(log) {
  return checkLog(log, "off") || checkLog(log, "sleep") || checkLog(log, "personal_conveyance");
}

function canAbsorbWindowIntoRest(prev, next) {
  if (!prev || !next) return false;
  if (!isRestLog(prev) || !isRestLog(next)) return false;
  if (!IsSameLog(prev, next)) return false;
  if ((prev.driverId ?? null) !== (next.driverId ?? null)) return false;
  if ((prev.codriverId ?? null) !== (next.codriverId ?? null)) return false;
  return true;
}

function absorbWindowIntoAdjacentRest(logs, start, end) {
  const out = (logs || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => toMs(a.start_date) - toMs(b.start_date));

  let prevIndex = -1;
  let nextIndex = -1;

  for (let i = 0; i < out.length; i++) {
    const log = out[i];
    const logStart = toMs(log.start_date);
    const logEnd = getOpenAwareEndMs(log);

    if (logEnd <= start) prevIndex = i;
    if (nextIndex < 0 && logStart >= end) nextIndex = i;
  }

  const prev = prevIndex >= 0 ? out[prevIndex] : null;
  const next = nextIndex >= 0 ? out[nextIndex] : null;

  if (prev && isRestLog(prev)) {
    if (canAbsorbWindowIntoRest(prev, next)) {
      prev.end_date = next.end_date;
      out.splice(nextIndex, 1);
      return out;
    }

    if (next && isRestLog(next)) {
      prev.end_date = next.start_date;
      return out;
    }

    if (!next) return out;

    prev.end_date = next.start_date;
    return out;
  }

  if (next && isRestLog(next)) {
    next.start_date = toOutputDate(next.start_date, start);
    return out;
  }

  return out;
}

function hasPriorBoundaryAuthLog(logs, candidate, boundaryAt) {
  const boundaryStart = boundaryAt - (60 * 1000);
  return (logs || []).some((log) => (
    log &&
    log !== candidate &&
    log.event_type === 5 &&
    (log.driverId ?? null) === (candidate.driverId ?? null) &&
    (log.codriverId ?? null) === (candidate.codriverId ?? null) &&
    toMs(log.start_date) >= boundaryStart &&
    toMs(log.start_date) < boundaryAt &&
    toMs(log.start_date) === toMs(log.end_date)
  ));
}

function pruneBoundaryWindowAuthLogs(logs, windows) {
  const sorted = (logs || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => toMs(a.start_date) - toMs(b.start_date));

  return sorted.filter((log) => {
    if (!isPointAuthLog(log)) return true;

    const ts = toMs(log.start_date);
    if (!Number.isFinite(ts)) return true;

    return !(windows || []).some((window) => (
      ts >= window.start &&
      ts <= (window.start + (60 * 1000)) &&
      hasPriorBoundaryAuthLog(sorted, log, window.start)
    ));
  });
}

function findRestBridgeTemplate(sourceLogs, start, end) {
  const sorted = (sourceLogs || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => toMs(a.start_date) - toMs(b.start_date));

  return sorted.find((log) => isRestLog(log) && overlapsRange(log, start, start + 1))
    || sorted.find((log) => {
      if (!isRestLog(log)) return false;
      const logStart = toMs(log.start_date);
      return Number.isFinite(logStart) && logStart >= start && logStart < end;
    })
    || null;
}

function buildRestBridgeLog({
  template,
  referenceLog,
  driverId,
  codriverId,
  companyId,
  start,
  end,
}) {
  if (template) {
    return {
      ...template,
      id: null,
      driverId,
      codriverId: codriverId ?? null,
      companyId,
      record_status: Constants.RECORD_STATUS_ACTIVE,
      start_date: toOutputDate(template.start_date, start),
      end_date: toOutputDate(template.end_date ?? template.start_date, end),
    };
  }

  return {
    ...buildOffDutyLog({
      driverId,
      codriverId,
      companyId,
      start,
      end,
      vehicleId: referenceLog?.vehicleId ?? null,
    }),
    address: referenceLog?.address ?? null,
    coordinates: referenceLog?.coordinates ?? null,
    odometr: referenceLog?.odometr ?? null,
    engine_hours: referenceLog?.engine_hours ?? null,
    inspection: false,
    note: null,
    trailer: referenceLog?.trailer ?? null,
    document: referenceLog?.document ?? null,
    vin_number: referenceLog?.vin_number ?? null,
  };
}

function hasNonRestDutyOverlap(logs, start, end) {
  return (logs || []).some((log) => (
    log &&
    checkLog(log, "duty") &&
    !isRestLog(log) &&
    overlapsRange(log, start, end)
  ));
}

function addCodriverRestBridges({
  codriverOut,
  sourceDriverLogs,
  windows,
  companyId,
  driverId,
  codriverId,
}) {
  const codriverWindows = (windows || [])
    .filter((window) => window?.owner === "codriver")
    .slice()
    .sort((a, b) => a.start - b.start);

  if (codriverWindows.length < 2) return (codriverOut || []).slice();

  const out = (codriverOut || []).slice();

  for (let index = 1; index < codriverWindows.length; index++) {
    const previous = codriverWindows[index - 1];
    const current = codriverWindows[index];
    const bridgeStart = previous?.end;
    const bridgeEnd = current?.start;

    if (!Number.isFinite(bridgeStart) || !Number.isFinite(bridgeEnd) || bridgeEnd <= bridgeStart) continue;
    if (hasNonRestDutyOverlap(out, bridgeStart, bridgeEnd)) continue;

    const template = findRestBridgeTemplate(sourceDriverLogs, bridgeStart, bridgeEnd);
    const referenceLog = template
      || getBoundaryDutyLog(
        (sourceDriverLogs || []).filter((log) => overlapsRange(log, previous.start, previous.end)),
        "end"
      )
      || getBoundaryDutyLog(
        (sourceDriverLogs || []).filter((log) => overlapsRange(log, current.start, current.end)),
        "start"
      );

    out.push(buildRestBridgeLog({
      template,
      referenceLog,
      driverId: codriverId,
      codriverId: driverId,
      companyId,
      start: bridgeStart,
      end: bridgeEnd,
    }));
  }

  return out;
}

function addTrailingCodriverRestTail({
  codriverOut,
  sourceDriverLogs,
  windows,
  companyId,
  driverId,
  codriverId,
}) {
  const sortedWindows = (windows || [])
    .filter((window) => Number.isFinite(window?.start) && Number.isFinite(window?.end))
    .slice()
    .sort((a, b) => a.start - b.start);

  const codriverWindows = sortedWindows.filter((window) => window.owner === "codriver");
  if (!codriverWindows.length) return (codriverOut || []).slice();

  const lastCodriverWindow = codriverWindows[codriverWindows.length - 1];
  const lastCodriverIndex = sortedWindows.findIndex((window) => (
    window.start === lastCodriverWindow.start &&
    window.end === lastCodriverWindow.end &&
    window.owner === lastCodriverWindow.owner
  ));
  if (lastCodriverIndex < 0 || lastCodriverIndex >= (sortedWindows.length - 1)) {
    return (codriverOut || []).slice();
  }

  const nextWindow = sortedWindows[lastCodriverIndex + 1];
  if (nextWindow?.owner !== "driver") return (codriverOut || []).slice();

  const tailStart = lastCodriverWindow.end;
  const tailEnd = nextWindow.start;
  if (!Number.isFinite(tailStart) || !Number.isFinite(tailEnd) || tailEnd <= tailStart) {
    return (codriverOut || []).slice();
  }

  const template = findRestBridgeTemplate(sourceDriverLogs, tailStart, tailEnd);
  if (!template) return (codriverOut || []).slice();
  if (hasNonRestDutyOverlap(codriverOut, tailStart, tailEnd)) return (codriverOut || []).slice();

  const out = (codriverOut || []).slice();
  out.push(buildRestBridgeLog({
    template,
    referenceLog: template,
    driverId: codriverId,
    codriverId: driverId,
    companyId,
    start: tailStart,
    end: tailEnd,
  }));

  return out;
}

function collectDutyCoverageRanges(logs, start, end) {
  const segments = (logs || [])
    .filter((log) => (
      log &&
      log.record_status === Constants.RECORD_STATUS_ACTIVE &&
      !log.inspection &&
      checkLog(log, "duty") &&
      overlapsRange(log, start, end)
    ))
    .map((log) => ({
      start: Math.max(start, toMs(log.start_date)),
      end: Math.min(end, getOpenAwareEndMs(log)),
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const segment of segments) {
    const prev = merged[merged.length - 1];
    if (!prev || segment.start > prev.end) {
      merged.push({ ...segment });
      continue;
    }

    prev.end = Math.max(prev.end, segment.end);
  }

  return merged;
}

function subtractCoveredRanges(start, end, coveredRanges) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const gaps = [];
  let cursor = start;

  for (const range of coveredRanges || []) {
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) continue;
    if (range.end <= cursor) continue;
    if (range.start > cursor) {
      gaps.push({
        start: cursor,
        end: Math.min(range.start, end),
      });
    }

    cursor = Math.max(cursor, range.end);
    if (cursor >= end) break;
  }

  if (cursor < end) {
    gaps.push({ start: cursor, end });
  }

  return gaps.filter((range) => range.end > range.start);
}

function addLeadingCodriverRestWindows({
  driverOut,
  codriverOut,
  sourceDriverLogs,
  windows,
  driverId,
  codriverId,
}) {
  let nextDriverOut = (driverOut || []).slice();
  let nextCodriverOut = (codriverOut || []).slice();

  const codriverWindows = (windows || [])
    .filter((window) => window?.owner === "codriver" && Number.isFinite(window?.start))
    .slice()
    .sort((a, b) => a.start - b.start);

  for (const window of codriverWindows) {
    const restRange = getContinuousRestBeforeWindowRange(sourceDriverLogs, window.start);
    if (!restRange) continue;

    nextDriverOut = removeRange(nextDriverOut, restRange.start, restRange.end);

    const sourceRestLogs = (sourceDriverLogs || []).filter((log) => (
      log &&
      log.record_status === Constants.RECORD_STATUS_ACTIVE &&
      !log.inspection &&
      isRestLog(log) &&
      overlapsRange(log, restRange.start, restRange.end)
    ));
    if (!sourceRestLogs.length) continue;

    const uncoveredRanges = subtractCoveredRanges(
      restRange.start,
      restRange.end,
      collectDutyCoverageRanges(nextCodriverOut, restRange.start, restRange.end)
    );

    for (const range of uncoveredRanges) {
      const movedLogs = collectLogsInRange(sourceRestLogs, range.start, range.end)
        .filter(isRestLog)
        .map((log) => normalizeOwner(log, codriverId, driverId));

      nextCodriverOut.push(...movedLogs);
    }
  }

  return {
    driverOut: nextDriverOut,
    codriverOut: nextCodriverOut,
  };
}

function hasBoundaryAuthLog(logs, candidate, boundaryAt) {
  const boundaryStart = boundaryAt - (60 * 1000);
  return (logs || []).some((log) => (
    log &&
    log.event_type === 5 &&
    log.event_code === candidate.event_code &&
    (log.driverId ?? null) === (candidate.driverId ?? null) &&
    (log.codriverId ?? null) === (candidate.codriverId ?? null) &&
    toMs(log.start_date) >= boundaryStart &&
    toMs(log.start_date) <= boundaryAt &&
    toMs(log.start_date) === toMs(log.end_date)
  ));
}

function isSessionAuthLog(log) {
  return isPointAuthLog(log) && (log.event_code === 1 || log.event_code === 2);
}

function keepOnlyFinalBoundarySwitchAuth(logs, boundaryAt, expectedEventCode) {
  const boundaryStart = boundaryAt - (60 * 1000);
  const sorted = (logs || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => toMs(a.start_date) - toMs(b.start_date));

  const kept = sorted
    .filter((log) => (
      isPointAuthLog(log) &&
      log.event_code === expectedEventCode &&
      toMs(log.start_date) >= boundaryStart &&
      toMs(log.start_date) <= boundaryAt
    ))
    .slice()
    .sort((a, b) => toMs(b.start_date) - toMs(a.start_date))[0] || null;

  return sorted.filter((log) => {
    if (!isPointAuthLog(log)) return true;

    const ts = toMs(log.start_date);
    if (!Number.isFinite(ts) || ts < boundaryStart || ts > boundaryAt) return true;
    if (!kept) return false;
    return log === kept;
  });
}

function pruneBoundarySwitchAuthPairs({
  driverOut,
  codriverOut,
  windows,
}) {
  let nextDriverOut = (driverOut || []).slice();
  let nextCodriverOut = (codriverOut || []).slice();

  for (const window of windows || []) {
    if (!Number.isFinite(window?.start)) continue;

    if (window.owner === "codriver") {
      nextDriverOut = keepOnlyFinalBoundarySwitchAuth(nextDriverOut, window.start, 2);
      nextCodriverOut = keepOnlyFinalBoundarySwitchAuth(nextCodriverOut, window.start, 1);
      continue;
    }

    nextDriverOut = keepOnlyFinalBoundarySwitchAuth(nextDriverOut, window.start, 1);
    nextCodriverOut = keepOnlyFinalBoundarySwitchAuth(nextCodriverOut, window.start, 2);
  }

  return {
    driverOut: nextDriverOut,
    codriverOut: nextCodriverOut,
  };
}

function pruneShortAuthBlips(logs, blipMs = 60 * 1000) {
  let working = (logs || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => toMs(a.start_date) - toMs(b.start_date));

  while (true) {
    const authEntries = working
      .map((log, index) => ({ log, index }))
      .filter(({ log }) => isSessionAuthLog(log));
    const removeIndexes = new Set();

    for (let i = 0; i < authEntries.length - 1; i++) {
      const current = authEntries[i];
      const next = authEntries[i + 1];
      const currentTs = toMs(current.log.start_date);
      const nextTs = toMs(next.log.start_date);

      if (!Number.isFinite(currentTs) || !Number.isFinite(nextTs)) continue;
      if (current.log.event_code === next.log.event_code) continue;
      if ((nextTs - currentTs) > blipMs) continue;

      const prev = authEntries[i - 1]?.log || null;
      const after = authEntries[i + 2]?.log || null;
      const prevMatches = prev && prev.event_code === current.log.event_code;
      const nextMatches = after && after.event_code === next.log.event_code;

      if (!prevMatches && !nextMatches) continue;

      removeIndexes.add(current.index);
      removeIndexes.add(next.index);
      i += 1;
    }

    if (!removeIndexes.size) return working;
    working = working.filter((_, index) => !removeIndexes.has(index));
  }
}

function isAuthInsideAnyWindow(log, windows) {
  const ts = toMs(log?.start_date);
  if (!Number.isFinite(ts)) return false;

  return (windows || []).some((window) => (
    Number.isFinite(window?.start) &&
    Number.isFinite(window?.end) &&
    ts >= window.start &&
    ts < window.end
  ));
}

function collapseRepeatedAuthStates(logs, windows) {
  const sorted = (logs || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => toMs(a.start_date) - toMs(b.start_date));
  const out = [];
  let lastAuthCode = null;

  for (const log of sorted) {
    if (!isSessionAuthLog(log)) {
      out.push(log);
      continue;
    }

    if (!isAuthInsideAnyWindow(log, windows) && lastAuthCode === log.event_code) continue;

    out.push(log);
    lastAuthCode = log.event_code;
  }

  return out;
}

function pruneRedundantAuthLogs(logs, windows) {
  return collapseRepeatedAuthStates(pruneShortAuthBlips(logs), windows);
}

function appendSwitchAuthLogs({
  driverOut,
  codriverOut,
  windows,
  companyId,
  driverId,
  codriverId,
  windowBoundaryLogs,
  randomFn = Math.random,
}) {
  let nextDriverOut = driverOut.slice();
  let nextCodriverOut = codriverOut.slice();

  (windows || []).forEach((window, index) => {
    const boundaryLogs = windowBoundaryLogs[index] || {};
    const switchAt = window.start;
    const authAt = switchAt - (pickSwitchOffsetSeconds(randomFn) * 1000);

    if (window.owner === "codriver") {
      const logout = buildSwitchAuthLog({
        driverId,
        codriverId,
        companyId,
        boundaryAt: switchAt,
        authAt,
        eventCode: 2,
        status: "logout",
        referenceLog: boundaryLogs.startLog,
        randomFn,
      });
      const login = buildSwitchAuthLog({
        driverId: codriverId,
        codriverId: driverId,
        companyId,
        boundaryAt: switchAt,
        authAt,
        eventCode: 1,
        status: "login",
        referenceLog: boundaryLogs.startLog,
        randomFn,
      });

      if (!hasBoundaryAuthLog(nextDriverOut, logout, switchAt)) nextDriverOut.push(logout);
      if (!hasBoundaryAuthLog(nextCodriverOut, login, switchAt)) nextCodriverOut.push(login);
      return;
    }

    const logout = buildSwitchAuthLog({
      driverId: codriverId,
      codriverId: driverId,
      companyId,
      boundaryAt: switchAt,
      authAt,
      eventCode: 2,
      status: "logout",
      referenceLog: boundaryLogs.startLog,
      randomFn,
    });
    const login = buildSwitchAuthLog({
      driverId,
      codriverId,
      companyId,
      boundaryAt: switchAt,
      authAt,
      eventCode: 1,
      status: "login",
      referenceLog: boundaryLogs.startLog,
      randomFn,
    });

    if (!hasBoundaryAuthLog(nextCodriverOut, logout, switchAt)) nextCodriverOut.push(logout);
    if (!hasBoundaryAuthLog(nextDriverOut, login, switchAt)) nextDriverOut.push(login);
  });

  return { driverOut: nextDriverOut, codriverOut: nextCodriverOut };
}

function pruneTerminalOpenEndedTail(logs, sourceLogs, end, nowMs) {
  if (!Number.isFinite(nowMs) || end < (nowMs - 1000)) return (logs || []).slice();

  const openEndedIds = new Set(
    (sourceLogs || [])
      .filter((log) => log?.id && log.end_date == null)
      .map((log) => log.id)
  );

  if (!openEndedIds.size) return (logs || []).slice();

  return (logs || []).filter((log) => !(
    log?.id &&
    openEndedIds.has(log.id) &&
    toMs(log.start_date) === end
  ));
}

function setLastLogEndDate(logs, hasRightLog) {
  const out = (logs || []).slice();
  if (hasRightLog || !out.length) return out;
  const targetIndex = out
    .map((log, index) => ({ log, index }))
    .reverse()
    .find(({ log }) => toMs(log?.start_date) !== toMs(log?.end_date))?.index;

  if (targetIndex == null) return out;

  out[targetIndex] = {
    ...out[targetIndex],
    end_date: null,
  };
  return out;
}


function assignLogsToDriverCodriver({
  shifts,
  windows: providedWindows,
  driverLogs,
  codriverLogs,
  companyId,
  driverId,
  codriverId,
  currentShiftInDriver = true,
  nowMs = Date.now(),
  hasDriverRightLog = true,
  hasCodriverRightLog = true,
  enforceCodriverRestEligibility = false,
  randomFn = Math.random,
}) {
  const allWindows = Array.isArray(providedWindows) ? providedWindows.slice() : buildShiftWindows(shifts, nowMs);
  const last8 = allWindows.slice(-8);
  if (!last8.length) {
    return { driverOut: driverLogs || [], codriverOut: codriverLogs || [], windows: [] };
  }

  const ownedWindows = buildOwnership(last8, nowMs, currentShiftInDriver);
  const windows = enforceCodriverRestEligibility
    ? filterEligibleCodriverWindows(ownedWindows, codriverLogs)
    : ownedWindows;

  for (const w of windows) {
    const res = checkExistOfCodriverDutyLog(codriverLogs, w.start, w.end);
    if (res.exist) {
      throwError(
        `Co-driver duty log exists in protected shift range. logId=${res.logId}, range=${new Date(w.start).toISOString()} - ${new Date(w.end).toISOString()}`,
        400
      );
    }
  }

  let driverOut = Array.isArray(driverLogs) ? driverLogs.slice() : [];
  let codriverOut = Array.isArray(codriverLogs) ? codriverLogs.slice() : [];
  const windowBoundaryLogs = [];

  for (const w of windows) {
    driverOut = removeRange(driverOut, w.start, w.end);
    codriverOut = removeRange(codriverOut, w.start, w.end);
  }

  for (const w of windows) {
    const sourceDriverLogs = (driverLogs || []).filter((log) => overlapsRange(log, w.start, w.end));
    const sourceCodriverLogs = (codriverLogs || []).filter((log) => overlapsRange(log, w.start, w.end));
    const realDriver = stripWindowStartAuthLogs(
      collectLogsInRange(sourceDriverLogs, w.start, w.end),
      w.start
    );
    windowBoundaryLogs.push({
      startLog: getBoundaryDutyLog(realDriver, "start"),
      endLog: getBoundaryDutyLog(realDriver, "end"),
    });

    if (w.owner === "driver") {
      driverOut.push(...realDriver.map((log) => normalizeOwner(log, driverId, codriverId)));
      driverOut = pruneTerminalOpenEndedTail(driverOut, sourceDriverLogs, w.end, nowMs);
      codriverOut = pruneTerminalOpenEndedTail(codriverOut, sourceCodriverLogs, w.end, nowMs);
      codriverOut = absorbWindowIntoAdjacentRest(codriverOut, w.start, w.end);
    } else {
      const moved = realDriver.map((log) => normalizeOwner(log, codriverId, driverId));
      codriverOut.push(...moved);
      codriverOut = pruneTerminalOpenEndedTail(codriverOut, sourceCodriverLogs, w.end, nowMs);
      driverOut = pruneTerminalOpenEndedTail(driverOut, sourceDriverLogs, w.end, nowMs);
      driverOut = absorbWindowIntoAdjacentRest(driverOut, w.start, w.end);
    }
  }

  ({ driverOut, codriverOut } = addLeadingCodriverRestWindows({
    driverOut,
    codriverOut,
    sourceDriverLogs: driverLogs,
    windows,
    driverId,
    codriverId,
  }));

  codriverOut = addCodriverRestBridges({
    codriverOut,
    sourceDriverLogs: driverLogs,
    windows,
    companyId,
    driverId,
    codriverId,
  });
  codriverOut = addTrailingCodriverRestTail({
    codriverOut,
    sourceDriverLogs: driverLogs,
    windows,
    companyId,
    driverId,
    codriverId,
  });

  ({ driverOut, codriverOut } = appendSwitchAuthLogs({
    driverOut,
    codriverOut,
    windows,
    companyId,
    driverId,
    codriverId,
    windowBoundaryLogs,
    randomFn,
  }));
  ({ driverOut, codriverOut } = pruneBoundarySwitchAuthPairs({
    driverOut,
    codriverOut,
    windows,
  }));

  driverOut = pruneBoundaryWindowAuthLogs(driverOut, windows);
  codriverOut = pruneBoundaryWindowAuthLogs(codriverOut, windows);
  driverOut = pruneRedundantAuthLogs(driverOut, windows);
  codriverOut = pruneRedundantAuthLogs(codriverOut, windows);
  driverOut = mergeLogs(driverOut);
  codriverOut = mergeLogs(codriverOut);
  driverOut = setLastLogEndDate(driverOut, hasDriverRightLog);
  codriverOut = setLastLogEndDate(codriverOut, hasCodriverRightLog);

  return { driverOut, codriverOut, windows };
}

module.exports = {
  normalizeLogsForShift,
  buildShiftWindows,
  assignLogsToDriverCodriver,
};
