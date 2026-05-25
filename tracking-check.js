// require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const VEHICLES_API = 'https://addmin-api.evoeld.com/api/vehicles/searching-list';
const REPORT_BASE = 'https://front-api.evoeld.com/test/report-calcuate/';
const AUTH_TOKEN = 'XTBk6hWD3cM5OTnxosj6iYYE5kOlnOj2lbXsK0CE1finjV8kh5CXyEBcqegzlNj2';
const REPORT_KEY = "I4LXkwGLXOkNOUODcyBu07FxRGMG2Jmk";
const FROM_DATE = '01-04-2026';
const TO_DATE = '30-04-2026';

const COMPANY_ID = 5234;

const VEHICLES_PER_PAGE = parseInt('10000', 10);
const RETRIES = Math.max(0, parseInt('2', 10));
const RETRY_DELAY_MS = Math.max(100, parseInt('500', 10));

if (!AUTH_TOKEN) {
  console.error('ERROR: AUTH_TOKEN not set');
  process.exit(1);
}
if (!REPORT_KEY) {
  console.error('ERROR: REPORT_KEY not set');
  process.exit(1);
}

const axiosInstance = axios.create({
  timeout: 30000,
  headers: {
    Authorization: AUTH_TOKEN,
    'Content-Type': 'application/json'
  }
});

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function retry(fn, attempts = RETRIES, delayMs = RETRY_DELAY_MS) {
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        const backoff = delayMs * Math.pow(2, i);
        console.warn(`Attempt ${i+1} failed. Retrying after ${backoff}ms...`);
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

async function fetchVehiclesForCompany(companyId) {
  const url = `${VEHICLES_API}?page=1&perPage=${VEHICLES_PER_PAGE}&truckSearch=&vinSearch=&vehicleId=&companyId=${encodeURIComponent(companyId)}&uid=&companyUid=&isActive=`;
  const res = await retry(() => axiosInstance.get(url));
  const body = res.data;
  const arr = Array.isArray(body.data) ? body.data : (Array.isArray(body) ? body : []);
  const vehicleIds = arr.map(v => v.id || v.vehicleId || v._id).filter(Boolean);
  console.log(`Company ${companyId}: found ${vehicleIds.length} vehicles`);
  return vehicleIds;
}

function buildReportUrl({ vehicleId, companyId }) {
  // NOTE: removed 'tracking' parameter as requested
  const q = new URLSearchParams({
    vehicleId: String(vehicleId),
    companyId: String(companyId),
    from_date: FROM_DATE,
    to_date: TO_DATE,
    key: REPORT_KEY
  });
  return `${REPORT_BASE}?${q.toString()}`;
}

function safeArray(x) { return Array.isArray(x) ? x : []; }
function sumNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * computeTotals for a response JSON.
 * For each of: ifta, iftaByLog, both
 * returns:
 *  - count (entries)
 *  - miles (sum of miles)
 *  - jumpSum (sum of top-level entry.jump)
 *  - totalMilesPlusJumps = miles + jumpSum
 */
function computeTotals(responseJson = {}) {
  const ifta = safeArray(responseJson.ifta);
  const iftaByLog = safeArray(responseJson.iftaByLog);
  const both = safeArray(responseJson.both);

  function sectionTotals(arr) {
    const count = arr.length;
    let miles = 0;
    let jumpSum = 0;

    for (const e of arr) {
      miles += sumNumber(e.miles);
      // only sum top-level jump field (per your instruction)
      if (e.jump !== null && e.jump !== undefined) {
        jumpSum += sumNumber(e.jump);
      }
    }

    return {
      count,
      miles,
      jumpSum,
      totalMilesPlusJumps: miles + jumpSum
    };
  }

  const tIf = sectionTotals(ifta);
  const tLog = sectionTotals(iftaByLog);
  const tBoth = sectionTotals(both);

  return {
    ifta: tIf,
    iftaByLog: tLog,
    both: tBoth,
    anyData: (tIf.count + tLog.count + tBoth.count) > 0
  };
}

async function callReport(vehicleId, companyId) {
  const url = buildReportUrl({ vehicleId, companyId });
  const res = await retry(() => axiosInstance.get(url));
  return res;
}

async function processVehicle(vehicleId, companyId) {
  try {
    const res = await callReport(vehicleId, companyId);
    const responseJson = res.data || {};
    const totals = computeTotals(responseJson);

    if (!totals.anyData) {
      return {
        vehicleId,
        companyId,
        status: 'skipped',
        reason: 'empty_ifta_iftaByLog_both',
        httpStatus: res.status
      };
    }

    return {
      vehicleId,
      companyId,
      status: 'ok',
      httpStatus: res.status,
      totals: {
        ifta: totals.ifta,
        iftaByLog: totals.iftaByLog,
        both: totals.both
      }
    };
  } catch (err) {
    console.error(`Error processing vehicle ${vehicleId} company ${companyId}:`, (err && err.message) || err);
    return {
      vehicleId,
      companyId,
      status: 'error',
      error: (err && err.message) || String(err)
    };
  }
}

async function runForCompany(companyId, outResults) {
  const vehicles = await fetchVehiclesForCompany(companyId);
  for (const vid of vehicles) {
    console.log(`Processing company ${companyId} vehicle ${vid} ...`);
    const res = await processVehicle(vid, companyId);
    outResults.push(res);
    await sleep(200);
  }
}

/**
 * aggregateCompanyTotals(results)
 * Aggregates counts, miles, jumpSum and totalMilesPlusJumps across vehicles.
 */
function aggregateCompanyTotals(results) {
  const zero = () => ({ count: 0, miles: 0, jumpSum: 0, totalMilesPlusJumps: 0 });
  const companyTotals = {
    vehiclesProcessed: 0,
    skipped: 0,
    errors: 0,
    perSection: {
      ifta: zero(),
      iftaByLog: zero(),
      both: zero()
    }
  };

  for (const r of results) {
    if (r.status === 'error') {
      companyTotals.errors++;
      continue;
    }
    if (r.status === 'skipped') {
      companyTotals.skipped++;
      continue;
    }
    if (r.status === 'ok') {
      companyTotals.vehiclesProcessed++;
      const t = r.totals || {};
      for (const sec of ['ifta', 'iftaByLog', 'both']) {
        const add = t[sec] || {};
        companyTotals.perSection[sec].count += add.count || 0;
        companyTotals.perSection[sec].miles += add.miles || 0;
        companyTotals.perSection[sec].jumpSum += add.jumpSum || 0;
        companyTotals.perSection[sec].totalMilesPlusJumps += add.totalMilesPlusJumps || 0;
      }
    }
  }

  return companyTotals;
}

async function main() {
  try {
    const companyId = COMPANY_ID;
    const results = [];

    await runForCompany(companyId, results);

    const companyTotals = aggregateCompanyTotals(results);

    const out = {
      generatedAt: new Date().toISOString(),
      companyId,
      vehicleResults: results,
      companyTotals
    };

    const outPath = path.join(process.cwd(), `report-results-${companyId}-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(`Done. Wrote ${results.length} vehicle records to ${outPath}`);

    console.log('Summary:');
    console.log('  vehicles processed (ok):', companyTotals.vehiclesProcessed);
    console.log('  skipped (empty reports):', companyTotals.skipped);
    console.log('  errors:', companyTotals.errors);
    console.log('  company totals (ifta):', companyTotals.perSection.ifta);
    console.log('  company totals (iftaByLog):', companyTotals.perSection.iftaByLog);
    console.log('  company totals (both):', companyTotals.perSection.both);

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(2);
  }
}

main();