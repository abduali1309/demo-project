/**
 * check-missing-tracking.js
 *
 * npm install axios
 *
 * Usage:
 *   node check-missing-tracking.js
 *   node check-missing-tracking.js --start=2026-04-11 --end=2026-04-13
 *   node check-missing-tracking.js --perPage=50 --concurrency=5
 *
 * Notes:
 * - The script queries each UTC calendar day at 11:00:00.000Z,
 *   matching the style of your example endpoint.
 * - A driver is considered problematic for a day only if:
 *     1) original logs contain at least one driving record
 *        (event_type = 1 AND event_code = 3)
 *     2) tracking response is empty / missing
 */

const axios = require('axios');
const fs = require('fs');

// =====================
// CONFIG
// =====================
const DRIVER_LIST_URL = 'https://front-api.rtelogs.com/api/users/searching-list';
const ORIGINAL_LOGS_URL = 'https://front-api-aws.rtelogs.com/api/dashboards/get-original-logs';
const TRACKINGS_URL = 'https://front-api-aws.rtelogs.com/api/dashboards/v2/gettrackings';

// Put your tokens here or, better, set them in env vars.
const DRIVER_LIST_AUTH = process.env.DRIVER_LIST_AUTH || '4a6OgXail9c0613TZJ657cth9VA0tbsJxzuFAUn9WEV1PrrGLzrPiCktDpJLMKhp';
const DASHBOARD_AUTH = process.env.DASHBOARD_AUTH || 'BOhnLiQC1wml1KJIQWYA9NebMFcFbHuUpvuWsDWqpS3yQrBPC88em6RNwjn1DsV8';
const COMPANY_UID = process.env.COMPANY_UID || 'd599bd63-084e-4ddf-bee7-c62d275fe294';
const COMPANY_ID = process.env.COMPANY_ID || 18;

// Request settings
const DEFAULT_PER_PAGE = 50;
const DEFAULT_CONCURRENCY = 5;
const PROBE_HOUR_UTC = 11;

// =====================
// CLI args
// =====================
function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

const startArg = getArg('start');
const endArg = getArg('end');
const perPage = parseInt(getArg('perPage', String(DEFAULT_PER_PAGE)), 10);
const concurrency = parseInt(getArg('concurrency', String(DEFAULT_CONCURRENCY)), 10);
const outputFile = getArg('output', 'problem-drivers.json');

// Default range: today, yesterday, day before (UTC calendar days)
function utcDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function makeUtcNoonIso(dateStr) {
  // dateStr = YYYY-MM-DD
  return `${dateStr}T${String(PROBE_HOUR_UTC).padStart(2, '0')}:00:00.000Z`;
}

function getDateRange() {
  const today = new Date();
  const defaultEnd = utcDateOnly(today);
  const defaultStart = utcDateOnly(addUtcDays(today, -2));

  const start = startArg || defaultStart;
  const end = endArg || defaultEnd;

  return { start, end };
}

function buildDateList(startDateStr, endDateStr) {
  const start = new Date(`${startDateStr}T00:00:00.000Z`);
  const end = new Date(`${endDateStr}T00:00:00.000Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid --start or --end date. Use YYYY-MM-DD.');
  }
  if (start > end) {
    throw new Error('--start cannot be after --end.');
  }

  const dates = [];
  for (let d = new Date(start); d <= end; d = addUtcDays(d, 1)) {
    dates.push(utcDateOnly(d));
  }
  return dates;
}

// =====================
// HTTP client
// =====================
const http = axios.create({
  timeout: 45000,
});

function authHeaders() {
  return {
    Accept: 'application/json, text/plain, */*',
    Authorization: DASHBOARD_AUTH,
    companyuid: COMPANY_UID,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Origin: 'https://dash.rtelogs.com',
    Referer: 'https://dash.rtelogs.com/',
    'User-Agent': 'Mozilla/5.0',
  };
}

function driverListHeaders() {
  return {
    Accept: 'application/json, text/plain, */*',
    Authorization: DRIVER_LIST_AUTH,
    Origin: 'https://addmin.rtelogs.com',
    Referer: 'https://addmin.rtelogs.com/',
    'User-Agent': 'Mozilla/5.0',
  };
}

// =====================
// API helpers
// =====================
async function fetchDriversPage(page, perPage) {
  const params = {
    page,
    perPage,
    searchUserName: '',
    searchName: '',
    searchEmail: '',
    searchLicenseNumber: '',
    uid: '',
    companyUid: '',
    companyId: COMPANY_ID,
    publicId: '',
    status: true,
    role: 'driver',
  };

  const res = await http.get(DRIVER_LIST_URL, {
    headers: driverListHeaders(),
    params,
  });

  const data = Array.isArray(res.data?.data) ? res.data.data : [];
  return data;
}

async function fetchAllDrivers(perPage) {
  const all = [];
  let page = 1;

  while (true) {
    const rows = await fetchDriversPage(page, perPage);
    if (!rows.length) break;

    all.push(...rows);

    if (rows.length < perPage) break;
    page += 1;
  }

  return all;
}

async function fetchOriginalLogs(driverUid, isoDateTime) {
  const url = `${ORIGINAL_LOGS_URL}/${driverUid}/${encodeURIComponent(isoDateTime)}`;
  const res = await http.get(url, { headers: authHeaders() });
  const data = Array.isArray(res.data?.data) ? res.data.data : [];
  return data;
}

async function fetchTrackings(driverUid, isoDateTime) {
  const url = `${TRACKINGS_URL}/${driverUid}/${encodeURIComponent(isoDateTime)}`;
  const res = await http.get(url, { headers: authHeaders() });
  return Array.isArray(res.data) ? res.data : [];
}

function hasDrivingLog(originalLogs) {
  return originalLogs.some(
    row => Number(row.event_type) === 1 && Number(row.event_code) === 3
  );
}

// =====================
// Simple concurrency pool
// =====================
async function runPool(items, worker, limit) {
  const results = new Array(items.length);
  let index = 0;

  async function runner() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.max(1, limit) }, () => runner());
  await Promise.all(workers);
  return results;
}

// =====================
// Main check
// =====================
async function main() {
  const { start, end } = getDateRange();
  const days = buildDateList(start, end);

  console.log(`Checking range: ${start} -> ${end}`);
  console.log(`Probe hour: ${PROBE_HOUR_UTC}:00:00.000Z`);
  console.log(`Loading drivers...`);

  const drivers = await fetchAllDrivers(perPage);
  console.log(`Found ${drivers.length} drivers`);

  const problematic = new Map(); // uid -> { driver, missingDays: [] }

  // Check each driver/day pair
  for (const day of days) {
    const isoDateTime = makeUtcNoonIso(day);
    console.log(`\nChecking day: ${day} (${isoDateTime})`);

    await runPool(
      drivers,
      async driver => {
        const uid = driver.uid;
        if (!uid) return;

        try {
          const originalLogs = await fetchOriginalLogs(uid, isoDateTime);

          if (!hasDrivingLog(originalLogs)) {
            return; // no driving logs, nothing to flag
          }

          const trackings = await fetchTrackings(uid, isoDateTime);

          if (!trackings || trackings.length === 0) {
            if (!problematic.has(uid)) {
              problematic.set(uid, {
                driver: {
                  id: driver.id,
                  uid: driver.uid,
                  first_name: driver.first_name,
                  second_name: driver.second_name,
                  username: driver.username,
                  publicId: driver.publicId,
                  companyId: driver.companyId,
                },
                missingDays: [],
              });
            }

            problematic.get(uid).missingDays.push({
              day,
              probe: isoDateTime,
              originalDrivingLogs: originalLogs.filter(
                row => Number(row.event_type) === 1 && Number(row.event_code) === 3
              ).length,
            });
          }
        } catch (err) {
          console.error(
            `Error for driver ${driver.uid} (${driver.first_name || ''} ${driver.second_name || ''}) on ${day}:`,
            err?.response?.status || err.message
          );
        }
      },
      concurrency
    );
  }

  const result = Array.from(problematic.values()).sort((a, b) =>
    (a.driver.second_name || '').localeCompare(b.driver.second_name || '')
  );

  const summary = {
    checkedRange: { start, end },
    totalDriversChecked: drivers.length,
    problematicDrivers: result.length,
    results: result,
  };

  fs.writeFileSync(outputFile, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\nDone.`);
  console.log(`Problematic drivers: ${result.length}`);
  console.log(`Saved to: ${outputFile}`);

  // Also print a compact list in console
  for (const item of result) {
    const name = `${item.driver.first_name || ''} ${item.driver.second_name || ''}`.trim();
    console.log(
      `- ${name || 'Unknown'} | uid=${item.driver.uid} | missingDays=${item.missingDays
        .map(d => d.day)
        .join(', ')}`
    );
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});