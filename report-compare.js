// report-compare.js
// npm i axios
// node report-compare.js

const axios = require('axios');
const fs = require('fs/promises');
const path = require('path');

// ===== HARD CODED TEST VALUES =====
const COMPANY_ID = 323;
const FROM_DATE = '01-05-2026';
const TO_DATE = '20-05-2026';
const PLATFORM = "evoeld"

// Choose one:
// const VEHICLES_API_BASE = 'https://addmin-api.evoeld.com';
const VEHICLES_API_BASE = `https://addmin-api.${PLATFORM}.com`;

const REPORT_API_BASE = `https://support-api.${PLATFORM}.com`;

// const REPORT_API_BASE = 'https://support-api.evoeld.com';

const REPORT_PATH = '/test/report-calcuate/';
const REPORT_KEY = 'I4LXkwGLXOkNOUODcyBu07FxRGMG2Jmk';
const AUTH_TOKEN = 'ckf7mYMYJEmWGo2QaSFxb87fwQ4w3PoLanCxuhGwqayAwXOg78HSBwACe38xvX91';

const OUTPUT_FILE = path.resolve(__dirname, `output/report-differences-${COMPANY_ID}-${PLATFORM}-2.json`);

const STATE_NAME_TO_ABBR = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
};

function normalizeState(input) {
  if (!input) return 'UNKNOWN';
  const cleaned = String(input).trim().toUpperCase();
  if (!cleaned) return 'UNKNOWN';
  if (cleaned.length === 2) return cleaned;
  return STATE_NAME_TO_ABBR[cleaned] || cleaned;
}

function sumByState(rows, useShortStateFirst) {
  const totals = {};

  for (const row of rows || []) {
    const rawState = useShortStateFirst ? (row.state_short || row.state) : row.state;
    const state = normalizeState(rawState);
    const miles = Number(row.miles || 0);
    totals[state] = (totals[state] || 0) + miles;
  }

  return totals;
}

function sumJump(rows) {
  return (rows || []).reduce((sum, row) => sum + Number(row.jump || 0), 0);
}

function compareStateTotals(iftaTotals, movementTotals) {
  const states = new Set([
    ...Object.keys(iftaTotals),
    ...Object.keys(movementTotals),
  ]);

  const differences = Array.from(states).map((state) => {
    const iftaMiles = Number(iftaTotals[state] || 0);
    const movementMiles = Number(movementTotals[state] || 0);

    return {
      state,
      iftaMiles,
      movementMiles,
      difference: iftaMiles - movementMiles,
    };
  });

  const mismatches = differences
    .filter((row) => row.difference !== 0)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  return { differences, mismatches };
}

const client = axios.create({
  timeout: 120000,
  headers: {
    Authorization: AUTH_TOKEN,
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
  },
});

async function fetchVehicles(companyId) {
  const url = `${VEHICLES_API_BASE.replace(/\/+$/, '')}/api/vehicles/searching-list`;

  const res = await client.get(url, {
    params: {
      page: 1,
      perPage: 10000,
      truckSearch: '',
      vinSearch: '',
      vehicleId: '',
      companyId,
      uid: '',
      companyUid: '',
      isActive: '',
    },
  });

  const payload = res.data;
  const list =
    (Array.isArray(payload?.data) && payload.data) ||
    (Array.isArray(payload?.rows) && payload.rows) ||
    (Array.isArray(payload) && payload) ||
    [];

  return list;
}

async function fetchReport(companyId, vehicleId, fromDate, toDate) {
  const base = REPORT_API_BASE.replace(/\/+$/, '');
  const pathPart = REPORT_PATH.startsWith('/') ? REPORT_PATH : `/${REPORT_PATH}`;
  const url = `${base}${pathPart}`;

  const res = await client.get(url, {
    params: {
      key: REPORT_KEY,
      from_date: fromDate,
      to_date: toDate,
      vehicleId,
      companyId,
    },
  });

  return res.data || {};
}

async function main() {
  if (!REPORT_KEY || REPORT_KEY.includes('PASTE_')) {
    throw new Error('Set REPORT_KEY before running the script.');
  }
  if (!AUTH_TOKEN || AUTH_TOKEN.includes('PASTE_')) {
    throw new Error('Set AUTH_TOKEN before running the script.');
  }

  console.log(`Fetching vehicles for companyId=${COMPANY_ID}...`);
  const vehicles = await fetchVehicles(COMPANY_ID);
  console.log(`Found ${vehicles.length} vehicles.`);

  const truckReports = [];
  const failures = [];

  for (let i = 0; i < vehicles.length; i++) {
    const vehicle = vehicles[i];
    const vehicleId = vehicle?.id;

    if (!vehicleId) continue;

    try {
      console.log(
        `[${i + 1}/${vehicles.length}] Checking vehicleId=${vehicleId} ${vehicle.truck_number || ''}`
      );

      const report = await fetchReport(
        COMPANY_ID,
        vehicleId,
        FROM_DATE,
        TO_DATE
      );

      const iftaTotals = sumByState(report.ifta, false);
      const movementTotals = sumByState(report.movementReport, true);

      const iftaJumpTotal = sumJump(report.ifta);
      const movementJumpTotal = sumJump(report.movementReport);

      const { mismatches: stateMismatches } = compareStateTotals(
        iftaTotals,
        movementTotals
      );

      const iftaTotalMiles = Object.values(iftaTotals).reduce((sum, n) => sum + n, 0);
      const movementTotalMiles = Object.values(movementTotals).reduce((sum, n) => sum + n, 0);

      const shouldSkip =
        iftaTotalMiles === 0 && movementTotalMiles === 0;

      if (shouldSkip) {
        continue;
      }

      const hasDifference =
        stateMismatches.length > 0 ||
        iftaTotalMiles !== movementTotalMiles ||
        iftaJumpTotal !== movementJumpTotal;

      truckReports.push({
        vehicleId,
        truckNumber: vehicle.truck_number,
        vin: vehicle.vin,
        uid: vehicle.uid,
        hasDifference,
        iftaTotals,
        movementTotals,
        differences: stateMismatches,
        summary: {
          iftaTotalMiles,
          movementTotalMiles,
          iftaJumpTotal,
          movementJumpTotal,
          iftaPlusJumpTotal: iftaTotalMiles + iftaJumpTotal,
        },
      });
    } catch (error) {
      failures.push({
        vehicleId,
        truckNumber: vehicle.truck_number,
        vin: vehicle.vin,
        error: error?.response?.data
          ? JSON.stringify(error.response.data)
          : error.message || String(error),
      });
    }
  }

  const output = {
    meta: {
      companyId: COMPANY_ID,
      fromDate: FROM_DATE,
      toDate: TO_DATE,
      vehiclesCount: vehicles.length,
      checkedCount: vehicles.filter((v) => !!v.id).length,
      writtenCount: truckReports.length,
      failedCount: failures.length,
      vehiclesApiBase: VEHICLES_API_BASE,
      reportApiBase: REPORT_API_BASE,
      reportPath: REPORT_PATH,
    },
    trucks: truckReports,
    failures,
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log(`Saved to ${OUTPUT_FILE}`);
  console.log(`Written trucks: ${truckReports.length}`);
  console.log(`Failures: ${failures.length}`);
}

main().catch((err) => {
  console.error('Script failed:', err?.response?.data || err?.message || err);
  process.exit(1);
});
