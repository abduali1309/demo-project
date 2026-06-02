'use strict';

const fs = require('fs/promises');
const path = require('path');

// Node 18+ has fetch built in
const BASE_URL = 'https://front-api.tteld.com/api/dashboards/get-daily-logs/';



// Lenny - 8cbed93f-5d78-4089-87bd-11abdc14b18f
// Josiah - e7514a5e-bdfb-4504-9637-117adfee5af8
// Mary Beth - 6adc2174-b79c-42ac-bded-7bc5f1c5728f
// Mary Linton - 44141d2c-a62e-4969-9e78-c5c32e7af153
// Bill Williamson - 654a3988-8169-41f2-8690-61a38a38a9c4
// Javier Escuella - 37674434-4f40-4a62-90ad-9cb552902625


const MAIN_DRIVER_UID = 'e7c762fd-13e8-4c92-90c8-ef38866cb053';
const CODRIVER_UID = null;

const AUTH_TOKEN = 'HTGdAqCxk3VVkKiNJbasTnvzDZ9hMlCucQMsUtKYPjKscAOQ4oRQXQ8sPjXEFeXH';
const COMPANY_UID = '42b94f1a-a395-4f7f-8913-a3c88e343292';

const START_DATE = '2026-06-01'; // YYYY-MM-DD
const END_DATE = '2026-06-02';   // YYYY-MM-DD

const OUTPUT_DIR = path.join(__dirname, 'mock-logs/ssb/');

const HEADERS = {
  Authorization: AUTH_TOKEN,
  companyuid: COMPANY_UID,
  'content-type': 'application/json',
  Accept: 'application/json, text/plain, */*',
};

function buildRequestDate(dateStr) {
  return `${dateStr}T11:00:00.000Z`;
}

function getDatesBetween(startDate, endDate) {
  const dates = [];
  const current = new Date(`${startDate}T11:00:00.000Z`);
  const end = new Date(`${endDate}T11:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

async function fetchLogs(driverUid, dateStr) {
  const url = `${BASE_URL}${driverUid}/${buildRequestDate(dateStr)}?mode=inject_requested`;

  const res = await fetch(url, {
    method: 'GET',
    headers: HEADERS,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed for ${driverUid} on ${dateStr}: ${res.status} ${res.statusText} ${text}`);
  }

  const data = await res.json();
  return Array.isArray(data?.logs) ? data.logs : [];
}

function dedupeById(logs) {
  const map = new Map();

  for (const log of logs) {
    const key = log?.id ?? JSON.stringify([
      log?.start_date,
      log?.end_date,
      log?.event_code,
      log?.event_type,
      log?.status,
      log?.driverId,
      log?.codriverId,
    ]);

    if (!map.has(key)) {
      map.set(key, log);
    }
  }

  return [...map.values()];
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function nextIndex(prefix, ext) {
  let files = [];
  try {
    files = await fs.readdir(OUTPUT_DIR);
  } catch {
    files = [];
  }

  let max = 0;
  const regex = new RegExp(`^${prefix}(\\d+)\\.${ext}$`);

  for (const file of files) {
    const match = file.match(regex);
    if (match) {
      const n = Number(match[1]);
      if (n > max) max = n;
    }
  }

  return max + 1;
}

async function saveAsJsonAndJsonl(prefix, logs, meta) {
  const index = await nextIndex(prefix, 'json');
  const baseName = `${prefix}${index}`;

  const jsonPath = path.join(OUTPUT_DIR, `${baseName}.json`);
  const jsonlPath = path.join(OUTPUT_DIR, `${baseName}.jsonl`);

  const jsonPayload = {
    ...meta,
    count: logs.length,
    logs, // full original log objects
  };

  await fs.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8');
  await fs.writeFile(
    jsonlPath,
    logs.map((item) => JSON.stringify(item)).join('\n') + '\n',
    'utf8'
  );

  return { jsonPath, jsonlPath };
}

async function collectAllLogs(driverUid, startDate, endDate) {
  const dates = getDatesBetween(startDate, endDate);
  const allLogs = [];

  for (const date of dates) {
    const logs = await fetchLogs(driverUid, date);
    allLogs.push(...logs);
  }

  return dedupeById(allLogs);
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const [mainDriverLogs, codriverLogs] = await Promise.all([
    collectAllLogs(MAIN_DRIVER_UID, START_DATE, END_DATE),
    // collectAllLogs(CODRIVER_UID, START_DATE, END_DATE),
  ]);

  const mainSaved = await saveAsJsonAndJsonl('driverlogs', mainDriverLogs, {
    driverUid: MAIN_DRIVER_UID,
    startDate: START_DATE,
    endDate: END_DATE,
    role: 'main-driver',
  });

  // const coSaved = await saveAsJsonAndJsonl('codriverlogs', codriverLogs, {
  //   driverUid: CODRIVER_UID,
  //   startDate: START_DATE,
  //   endDate: END_DATE,
  //   role: 'co-driver',
  // });

  console.log('Saved successfully:');
  console.log('Main driver JSON :', mainSaved.jsonPath);
  console.log('Main driver JSONL:', mainSaved.jsonlPath);
  // console.log('Co-driver JSON   :', coSaved.jsonPath);
  // console.log('Co-driver JSONL  :', coSaved.jsonlPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});