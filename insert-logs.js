'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const readline = require('readline');
const { randomUUID } = require('crypto');

const INPUT_DIR = path.join(__dirname, 'mock-logs/billandjavier/4/'); // folder containing driverlogs*.jsonl / codriverlogs*.jsonl

const INSERT_ACTIVE_URL = 'https://njtest.tteld.com/api/dashboards/v2/insertlog';
const ACCEPT_ACTIVE_URL = 'https://njtest.tteld.com/api/dashboards/accept-requested-logs';
const SET_INFO_URL = 'https://njtest.tteld.com/api/dashboards/v2/setinfolog';

const HEADERS = {
  Authorization: '6aohspHyluen1m1eKRVbAjVsaWAKOwMSy9GpiafMYJpum1pDXIGeA9U7Iu1L4W8D',
  Companyuid: '399519c7-902e-40e0-9be8-e6749cf76f76',
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const sleep = (ms = 1000) => new Promise((resolve) => setTimeout(resolve, ms));

function getDayKey(dateStr) {
  if (!dateStr) return null;
  return String(dateStr).slice(0, 10); // YYYY-MM-DD
}

function buildTimestamp(dayKey) {
  return `${dayKey}T11:00:00.000Z`;
}

function isDutyLog(log) {
  const eventType = Number(log?.event_type);
  const eventCode = Number(log?.event_code);

  return (
    (eventType === 1 && [1, 2, 3, 4].includes(eventCode)) ||
    (eventType === 3 && [1, 2].includes(eventCode))
  );
}

function isInfoLog(log) {
  const eventType = Number(log?.event_type);
  return [2, 4, 5, 6].includes(eventType);
}

function normalizeCoordinates(log) {
  const coords =
    log?.coordinates ||
    log?.gps_coordinates ||
    log?.fused_coordinates ||
    log?.eld_coordinates ||
    null;

  if (!coords || typeof coords !== 'object') return null;

  const lat = Number(coords.lat);
  const lng = Number(coords.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return { lat, lng };
}

function stripServerFields(log) {
  const {
    id,
    createdAt,
    updatedAt,
    vehicle,
    driverId,
    codriverId,
    companyId,
    eldId,
    editedById,
    sendedById,
    ...rest
  } = log || {};

  return rest;
}

function buildDutyPayload(log) {
  const base = stripServerFields(log);

  return {
    record_status: 3, // same behavior as your existing active-log insert
    status: base.status ?? null,
    event_type: Number(base.event_type),
    event_code: Number(base.event_code),
    start_date: base.start_date ?? null,
    end_date: base.end_date ?? null,
    address: base.address ?? null,
    note: base.note ?? '',
    odometr: base.odometr ?? null,
    engine_hours: base.engine_hours ?? null,
    coordinates: normalizeCoordinates(base),
    trailer: base.trailer ?? null,
    codriverUid: base.codriverUid ?? null,
    sequenceId: base.sequenceId ?? null,
    document: base.document ?? '',
    client_id: base.client_id || randomUUID(),
    vehicleId: base.vehicleId ?? base.vehicle?.id ?? null,

    // keep these only if your backend accepts them; otherwise remove them
    lock_type: base.lock_type ?? null,
    inspection_info: base.inspection_info ?? null,
    pairedId: base.pairedId ?? null,
    malfunction: base.malfunction ?? null,
    diagnostic: base.diagnostic ?? null,
    shipping_document: base.shipping_document ?? null,
    inspection: base.inspection ?? null,
    certify_date: base.certify_date ?? null,
    vin_number: base.vin_number ?? null,
  };
}

function buildInfoPayload(log) {
  const base = stripServerFields(log);

  return {
    record_status: base.record_status ?? null,
    status: base.status ?? null,
    event_type: Number(base.event_type),
    event_code: Number(base.event_code),
    start_date: base.start_date ?? null,
    end_date: base.end_date ?? null,
    address: base.address ?? null,
    odometr: base.odometr ?? null,
    engine_hours: base.engine_hours ?? null,
    coordinates: normalizeCoordinates(base),
    trailer: base.trailer ?? null,
    codriverUid: base.codriverUid ?? null,

    document: base.document ?? '1',
    vehicleUid: base.vehicleUid ?? base.vehicle?.uid ?? null,

    // optional extras from source payload
    note: base.note ?? '',
    lock_type: base.lock_type ?? null,
    inspection_info: base.inspection_info ?? null,
    pairedId: base.pairedId ?? null,
    malfunction: base.malfunction ?? null,
    diagnostic: base.diagnostic ?? null,
    shipping_document: base.shipping_document ?? null,
    inspection: base.inspection ?? null,
    certify_date: base.certify_date ?? null,
    vin_number: base.vin_number ?? null,
  };
}

async function readJsonlFile(filePath) {
  const logs = [];
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      logs.push(JSON.parse(trimmed));
    } catch (err) {
      console.warn(`Skipping invalid JSON line in ${path.basename(filePath)}: ${err.message}`);
    }
  }

  return logs;
}

async function loadAllLogsFromDir(inputDir) {
  const files = (await fsp.readdir(inputDir))
    .filter((f) => f.endsWith('.jsonl'))
    .sort();

  const all = [];

  for (const file of files) {
    const fullPath = path.join(inputDir, file);
    console.log(`\n📄 Reading ${file}`);
    const logs = await readJsonlFile(fullPath);
    console.log(`   → ${logs.length} log lines`);
    all.push(...logs);
  }

  return all;
}

function groupByDriverAndDay(logs) {
  const groups = new Map();

  for (const log of logs) {
    const driverUid = log?.driverUid || log?.codriverUid;
    const dayKey = getDayKey(log?.start_date || log?.end_date);

    if (!driverUid || !dayKey) {
      console.warn(`Skipping log without driverUid/day: id=${log?.id ?? 'n/a'}`);
      continue;
    }

    const key = `${driverUid}__${dayKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        driverUid,
        dayKey,
        dutyLogs: [],
        infoLogs: [],
        skipped: [],
      });
    }

    const bucket = groups.get(key);

    if (isDutyLog(log)) {
      bucket.dutyLogs.push(log);
    } else if (isInfoLog(log)) {
      bucket.infoLogs.push(log);
    } else {
      bucket.skipped.push(log);
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.driverUid === b.driverUid) return a.dayKey.localeCompare(b.dayKey);
    return a.driverUid.localeCompare(b.driverUid);
  });
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }

  return res.json().catch(() => ({}));
}

async function insertDutyLogs(driverUid, dayKey, dutyLogs) {
  if (!dutyLogs.length) return;

  const timestamp = buildTimestamp(dayKey);
  const payload = dutyLogs.map(buildDutyPayload);
  const url = `${INSERT_ACTIVE_URL}/${driverUid}/${timestamp}`;

  await postJson(url, payload);
  console.log(`✅ Inserted duty logs: ${dutyLogs.length} for ${driverUid} @ ${dayKey}`);
}

async function acceptDutyLogs(driverUid, dayKey) {
  const timestamp = buildTimestamp(dayKey);
  const uid3 = randomUUID();
  const url = `${ACCEPT_ACTIVE_URL}/${driverUid}/${timestamp}?uid3=${uid3}`;

  await postJson(url, {});
  console.log(`✅ Accepted duty logs for ${driverUid} @ ${dayKey}`);
}

async function insertInfoLogs(driverUid, infoLogs) {
  if (!infoLogs.length) return;

  const MAX_PARALLEL = 10;

  const payloads = infoLogs.map(buildInfoPayload);

  for (let i = 0; i < payloads.length; i += MAX_PARALLEL) {
    const batch = payloads.slice(i, i + MAX_PARALLEL);

    const results = await Promise.allSettled(
      batch.map((payload) => {
        const url = `${SET_INFO_URL}/${driverUid}`;
        return postJson(url, payload);
      })
    );

    results.forEach((r, idx) => {
      const n = i + idx + 1;
      if (r.status === 'fulfilled') {
        console.log(` ✅ Info log ${n} inserted`);
      } else {
        console.error(` ❌ Info log ${n} failed: ${r.reason.message}`);
      }
    });
  }
}

(async () => {
  const allLogs = await loadAllLogsFromDir(INPUT_DIR);
  console.log(`\nTotal parsed logs: ${allLogs.length}`);

  const groups = groupByDriverAndDay(allLogs);
  console.log(`Grouped into ${groups.length} driver/day buckets`);

  for (const group of groups) {
    const { driverUid, dayKey, dutyLogs, infoLogs, skipped } = group;

    console.log(`\n📦 Driver ${driverUid} | Day ${dayKey}`);
    console.log(`   duty: ${dutyLogs.length}, info: ${infoLogs.length}, skipped: ${skipped.length}`);

    try {
      if (dutyLogs.length) {
        await insertDutyLogs(driverUid, dayKey, dutyLogs);
        await acceptDutyLogs(driverUid, dayKey);
      }
    } catch (err) {
      console.error(`❌ Duty log flow failed for ${driverUid} @ ${dayKey}:`, err.message);
    }

    try {
      if (infoLogs.length) {
        await insertInfoLogs(driverUid, infoLogs);
      }
    } catch (err) {
      console.error(`❌ Info log flow failed for ${driverUid} @ ${dayKey}:`, err.message);
    }

    if (skipped.length) {
      console.log(`ℹ️ Skipped ${skipped.length} logs that do not match duty/info rules`);
    }

    await sleep(1000);
  }

  console.log('\n🎉 All jsonl logs processed!');
})().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});