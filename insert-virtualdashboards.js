
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const http = require('http');
const https = require('https');

// API base
const BASE = 'https://us.ontime-logs.com';
const ENDPOINT = '/api/virtualDashboards/drivers/create';
const ELD_QUERY_NAME = 'eldType';

// concurrency & retry (safe defaults)
const REQUEST_TIMEOUT = 30000;
const MAX_RETRIES = 4;
const RETRY_BACKOFF_MS = 700;
const CONCURRENCY = 50; // number of parallel outstanding requests (tune down for stability)

const GLOBAL_SEED = 12345; // set null if you prefer randomness

const PROGRESS_FILE = path.resolve(__dirname, 'progress.json');

const dryRun = false;
const DRYRUN_PRINT_FIRST = 5;

// ---------- runPlan: edit this to configure what to insert ----------
const runPlan = [
  {
    eldType: 'PT',               // 'PT' | 'PROTRUX' | 'iosix'
    startIso: '2026-05-04T11:05:22.053Z',
    endIso:   '2026-05-05T08:01:22.053Z',
    driverId: 645,
    vehicleId: 474,
    intervalMinutes: 60,           // 1 minute or 2 minutes etc
    accessTokenKey: 'whDtTJ17LWdG6h5indHcCNhqAPrZsGBXS5TqrRYsIhvEA2MfsctSPBSm3FCx2WTi', // optional key in driver_tokens.json
    overrides: { VIN: '4V4NC9EH2MN280632' } // optional overrides for payload fields
  },
  // {
  //   eldType: 'PROTRUX',               // 'PT' | 'PROTRUX' | 'iosix'
  //   startIso: '2026-03-11T05:59:05.301Z',
  //   endIso:   '2026-03-11T23:01:22.694Z',
  //   driverId: 1537,
  //   vehicleId: 107,
  //   intervalMinutes: 60,           // 1 minute or 2 minutes etc
  //   accessTokenKey: 'F6SB5QXYPGduoZM0l3q25EzSQtNITddKdJFGea5AHJ2svbyKA5HYGwgaLM59Ct10', // optional key in driver_tokens.json
  //   overrides: { VIN: '4V4NC9EH9NN319184' } // optional overrides for payload fields
  // },
  // {
  //   eldType: 'IOSIX',               // 'PT' | 'PROTRUX' | 'iosix'
  //   startIso: '2026-03-11T17:01:22.053Z',
  //   endIso:   '2026-03-11T23:01:22.053Z',
  //   driverId: 1537,
  //   vehicleId: 107,
  //   intervalMinutes: 60,           // 1 minute or 2 minutes etc
  //   accessTokenKey: 'F6SB5QXYPGduoZM0l3q25EzSQtNITddKdJFGea5AHJ2svbyKA5HYGwgaLM59Ct10', // optional key in driver_tokens.json
  //   overrides: { VIN: '4V4NC9EH9NN319184' } // optional overrides for payload fields 3AKJHHFG4NSNP7116
  // },

  // Add more jobs as needed...
];
// ----------------- end CONFIG -----------------

// axios instance with keepAlive
const axiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT,
//   httpAgent: new http.Agent({ keepAlive: true, maxSockets: 200 }),
    httpsAgent: new https.Agent({
    keepAlive: true,
    maxSockets: 200,
    rejectUnauthorized: true
  }),
  validateStatus: null
});

// small helpers
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------- deterministic RNG ----------------
function makeRng(seed = null) {
  let s = (seed !== null && seed !== undefined) ? (seed >>> 0) : (Math.floor(Math.random() * 2 ** 31) >>> 0);
  return {
    next() {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    }
  };
}
const GLOBAL_RNG = makeRng(GLOBAL_SEED);

function randFloat(rng, min, max, decimals = 1) {
  const v = rng.next() * (max - min) + min;
  return Number(v.toFixed(decimals));
}
function randInt(rng, min, max) {
  return Math.floor(rng.next() * (max - min + 1)) + min;
}
function randBool(rng, p = 0.5) {
  return rng.next() < p;
}
function maybeNull(rng, factory, nullProbability = 0.5) {
  // return randBool(rng, 1 - nullProbability) ? factory() : null;
  return factory();
}
function randHexString(rng, len = 8) {
  const chars = '0123456789ABCDEF';
  let s = '';
  for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(rng.next() * chars.length));
  return s;
}

// ----------------- Payload builders -----------------

// PT30 builder (fields based on your Dart pt structure)
function buildPt30Payload(isoDate, vehicleId, overrides = {}, seed = null) {
  const rng = makeRng(seed ?? Math.floor(GLOBAL_RNG.next() * 1e9));
  const p = {
    date: isoDate ?? null,
    createdAt: isoDate ?? null,
    updatedAt: isoDate ?? null,
    seatBelt: "nullmas",
    engineLoad: randFloat(rng, 0, 100, 1),
    totalEngineIdleTime: maybeNull(rng, () => randFloat(rng, 0, 100000, 1), 0.8),
    bus: 'J1939-virtualdashboardtesting1',
    engineRPM: randInt(rng, 0, 6000),
    engineFuelEconomy: maybeNull(rng, () => randFloat(rng, 0, 50, 1), 0.7),
    vin: overrides.VIN ?? maybeNull(rng, () => `VIN${randHexString(rng, 8)}`, 0.6),
    oilTemperature: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.7),
    gear: maybeNull(rng, () => randInt(rng, 0, 18), 0.7),
    transmissionOilTemperature: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.8),
    intercoolerTemperature: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.8),
    fuelTankTemperature: maybeNull(rng, () => randFloat(rng, -20, 120, 0), 0.2) ?? 80,
    engineSpeed: randInt(rng, 0, 3000),
    intakeTemperature: maybeNull(rng, () => randFloat(rng, -40, 120, 1), 0.6),
    engineFuelRate: randFloat(rng, 0, 5000, 1),
    turboOilTemperature: maybeNull(rng, () => randFloat(rng, -40, 200, 1), 0.85),
    fuelLevelPercent: randFloat(rng, 0, 100, 1),
    coolantTemperature: randFloat(rng, -40, 120, 0),
    totalPtoTime: maybeNull(rng, () => randFloat(rng, 0, 100000, 1), 0.85),
    coolantLevelPercent: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.7),
    defLevelPercent: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.7),
    totalEngineHours: randFloat(rng, 0, 50000, 1),
    totalFuelUsed: maybeNull(rng, () => randFloat(rng, 0, 1000000, 1), 0.3),
    oilPressure: maybeNull(rng, () => randFloat(rng, 0, 700, 1), 0.6),
    oilLevelPercent: randFloat(rng, 0, 1000, 1),
    totalEngineIdleFuel: maybeNull(rng, () => randFloat(rng, 0, 100000, 1), 0.85),
    engineOdometer: randFloat(rng, 0, 800000, 1),
    ambientPressure: maybeNull(rng, () => randFloat(rng, 50, 120, 1), 0.6),
    ambientTemperature: maybeNull(rng, () => randFloat(rng, -40, 50, 1), 0.6),
    fuelLevel2Percent: randFloat(rng, 0, 100, 1),
    dtcNo: randInt(rng, 0, 10),
    vehicleId: vehicleId,
    dtcStatus: 'success',
    dtcCount: randInt(rng, 0, 6),
    dtcVersion: randInt(rng, 0, 5),
    dtcMil: randBool(rng, 0.2),
    dtcBus: 'J1939',
    dtcError: ["520941-3"],
    dtcPTError: randBool(rng, 0.9) ? 'noError' : `err${randHexString(rng, 4)}`
  };

  for (let i = 0; i < p.dtcCount; i++) p.dtcError.push(randHexString(rng, 8));

  // apply overrides
  Object.assign(p, overrides);
  return p;
}

// Protrux builder using the Dart fields you provided earlier (full set)
function buildProtruxPayload(isoDate, vehicleId, overrides = {}, seed = null) {
  const rng = makeRng(seed ?? Math.floor(GLOBAL_RNG.next() * 1e9));

  const p = {
    date: isoDate ?? null,
    createdAt: isoDate ?? null,
    updatedAt: isoDate ?? null,
    bus: 'J1939-virtualdashboardtesting2',
    gear: overrides.gear ?? maybeNull(rng, () => randInt(rng, 0, 18), 0.7),
    seatBelt:  "nullmas", //overrides.seatBelt ?? maybeNull(rng, () => randInt(rng, 0, 1), 0.6),
    engineRPM: overrides.engineRPM ?? randInt(rng, 0, 6000),
    engineSpeed: overrides.engineSpeed ?? randInt(rng, 0, 3000),
    oilPressure: overrides.oilPressure ?? maybeNull(rng, () => randInt(rng, 0, 700), 0.6),
    oilTemperature: overrides.oilTemperature ?? maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.7),
    coolantTemperature: overrides.coolantTemperature ?? maybeNull(rng, () => randFloat(rng, -40, 130, 1), 0.5),
    intakeTemperature: overrides.intakeTemperature ?? maybeNull(rng, () => randFloat(rng, -40, 120, 1), 0.6),
    fuelTankTemperature: overrides.fuelTankTemperature ?? maybeNull(rng, () => randFloat(rng, -40, 120, 1), 0.4),
    intercoolerTemperature: overrides.intercoolerTemperature ?? maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.7),
    turboOilTemperature: overrides.turboOilTemperature ?? maybeNull(rng, () => randFloat(rng, -40, 200, 1), 0.85),
    transmissionOilTemperature: overrides.transmissionOilTemperature ?? maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.8),
    dtcNo: randInt(rng, 0, 8),
    ambientTemperature: maybeNull(rng, () => randFloat(rng, -30, 50, 1), 0.5),
    engineOdometer: randFloat(rng, 0, 800000, 1),
    engineLoad: randInt(rng, 0, 100),
    oilLevelPercent: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.5),
    coolantLevelPercent: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.6),
    fuelLevelPercent: randFloat(rng, 0, 100, 1),
    fuelLevel2Percent: randFloat(rng, 0, 100, 1),
    defLevelPercent: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.7),
    engineFuelRate: randFloat(rng, 0, 5000, 1),
    engineFuelEconomy: maybeNull(rng, () => randFloat(rng, 0, 50, 1), 0.7),
    ambientPressure: maybeNull(rng, () => randFloat(rng, 50, 120, 1), 0.6),
    totalEngineHours: randFloat(rng, 0, 20000, 1),
    totalFuelUsed: maybeNull(rng, () => randFloat(rng, 0, 500000, 1), 0.4),
    vin: overrides.VIN ?? maybeNull(rng, () => `VIN${randHexString(rng, 8)}`, 0.5),
    vehicleId: vehicleId,
    dtcCount: randInt(rng, 0, 6),
    dtcError: ["520349-14"],
    dtcStatus: 'success',
    dtcPTError: randBool(rng, 0.95) ? 'noError' : `err${randHexString(rng, 4)}`
  };

  for (let i = 0; i < p.dtcCount; i++) p.dtcError.push(randHexString(rng, 8));
  Object.assign(p, overrides);
  return p;
}

// iosix builder (nested records)
function buildIosixPayload(isoDate, vehicleId, overrides = {}, seed = null) {
  const rng = makeRng(seed ?? Math.floor(GLOBAL_RNG.next() * 1e9));

  const emissionRecord = {
    nOxInlet: maybeNull(rng, () => randFloat(rng, 0, 5000, 2), 0.7),
    nOxOutlet: maybeNull(rng, () => randFloat(rng, 0, 5000, 2), 0.8),
    ashLoad: maybeNull(rng, () => randFloat(rng, 0, 100, 2), 0.9),
    dpfSootLoad: maybeNull(rng, () => randFloat(rng, 0, 100, 2), 0.8),
    dpfRegenStatus: maybeNull(rng, () => randInt(rng, 0, 3), 0.85),
    dpfDifferentialPressure: maybeNull(rng, () => randFloat(rng, 0, 200, 2), 0.8),
    egrValvePosition: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.75),
    afterTreatmentFuelPressure: maybeNull(rng, () => randFloat(rng, 0, 500, 1), 0.85),
    engineExhaustTemperature: maybeNull(rng, () => randFloat(rng, -40, 800, 1), 0.7),
    exhaustTemperature1: maybeNull(rng, () => randFloat(rng, -40, 800, 1), 0.8),
    exhaustTemperature2: maybeNull(rng, () => randFloat(rng, -40, 800, 1), 0.9),
    exhaustTemperature3: maybeNull(rng, () => randFloat(rng, -40, 800, 1), 0.95),
    defFluidLevel: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.6),
    defTankTemperature: maybeNull(rng, () => randFloat(rng, -40, 80, 1), 0.8),
    scrInducementFaultStatus: maybeNull(rng, () => randInt(rng, 0, 3), 0.95),
  };

  const engineRecord = {
    oilPressureKpa: maybeNull(rng, () => randFloat(rng, 0, 700, 1), 0.6),
    turboBoostKpa: maybeNull(rng, () => randFloat(rng, 0, 500, 1), 0.75),
    intakePressureKpa: maybeNull(rng, () => randFloat(rng, 0, 300, 1), 0.6),
    fuelPressureKpa: maybeNull(rng, () => randFloat(rng, 0, 500, 1), 0.7),
    crankCasePressureKpa: maybeNull(rng, () => randFloat(rng, -10, 50, 2), 0.8),
    loadPct: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.4),
    massAirFlowGalPerSec: maybeNull(rng, () => randFloat(rng, 0, 20, 3), 0.8),
    turboRpm: maybeNull(rng, () => randInt(rng, 0, 8000), 0.85),
    intakeTempC: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.7),
    engineCoolantTempC: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.6),
    engineOilTempC: maybeNull(rng, () => randFloat(rng, -40, 200, 1), 0.7),
    fuelTempC: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.8),
    chargeCoolerTempC: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.85),
    torgueNm: maybeNull(rng, () => randFloat(rng, 0, 5000, 1), 0.75),
    engineOilLevelPct: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.6),
    engineCoolandLevelPct: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.6),
    tripFuelL: maybeNull(rng, () => randFloat(rng, 0, 500, 2), 0.85),
    drivingFuelEconomyLPerKm: maybeNull(rng, () => randFloat(rng, 0, 10, 3), 0.9),
  };

  const fuelRecord = {
    fuelLevelPercent: 54, //maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.2)
    fuelIntegratedLiters: maybeNull(rng, () => randFloat(rng, 0, 10000, 1), 0.5),
    totalFuelConsumedLiters: maybeNull(rng, () => randFloat(rng, 0, 500000, 1), 0.6),
    fuelRateLitersPerHours: maybeNull(rng, () => randFloat(rng, 0, 2000, 2), 0.7),
    idleFuelConsumedLiters: maybeNull(rng, () => randFloat(rng, 0, 10000, 2), 0.9),
    idleTimeHours: maybeNull(rng, () => randFloat(rng, 0, 10000, 2), 0.9),
    stateHighRPM: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
    stateUnsteady: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
    stateEnginePower: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
    stateAccel: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
    stateEco: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
    stateAnticipate: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
  };

  const transmissionParametersRecord = {
    outputShaftRpm: maybeNull(rng, () => randFloat(rng, 0, 10000, 1), 0.8),
    gearStatus: maybeNull(rng, () => randInt(rng, 0, 20), 0.7),
    requestGearStatus: maybeNull(rng, () => randInt(rng, 0, 20), 0.8),
    transmissionOilTempC: maybeNull(rng, () => randFloat(rng, -40, 200, 1), 0.85),
    torqueConverterLockupStatus: maybeNull(rng, () => randInt(rng, 0, 1), 0.9),
    torqueConverterOilOutletTempC: maybeNull(rng, () => randFloat(rng, -40, 200, 1), 0.9),
  };

  const driverBehaviorRecord = {
    cruiseSetSpeedKph: maybeNull(rng, () => randFloat(rng, 0, 140, 1), 0.9),
    cruiseStatus: maybeNull(rng, () => randInt(rng, 0, 3), 0.95),
    throttlePositionPct: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.7),
    acceleratorPositionPct: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.7),
    brakePositionPct: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.85),
    seatBeltStatus: maybeNull(rng, () => randInt(rng, 0, 1), 0.9),
    steeringWheelAngleDeg: maybeNull(rng, () => randFloat(rng, -180, 180, 1), 0.95),
    absStatus: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
    tractionStatus: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
    stabilityStatus: maybeNull(rng, () => randInt(rng, 0, 1), 0.95),
    brakeSystemPressureKpa: maybeNull(rng, () => randFloat(rng, 0, 5000, 1), 0.9),
  };

  const assistRecord = {
    turnSignalSwitchStatus: maybeNull(rng, () => randInt(rng, 0, 2), 0.95),
    advancedEmergencyBrakingSystemStatus: maybeNull(rng, () => randInt(rng, 0, 2), 0.98),
    collisionWarningStatus: maybeNull(rng, () => randInt(rng, 0, 2), 0.98),
    forwardCollisionWarningStatus: maybeNull(rng, () => randInt(rng, 0, 2), 0.98),
    relevantObjectDetectedStatus: maybeNull(rng, () => randInt(rng, 0, 2), 0.99),
    bendOffProbabilityStatus: maybeNull(rng, () => randInt(rng, 0, 2), 0.99),
    timeToCollisionS: maybeNull(rng, () => randFloat(rng, 0, 300, 2), 0.98),
    speedOfForwardVehicleKpf: maybeNull(rng, () => randFloat(rng, 0, 200, 1), 0.98),
    distanceToForwardVehicleM: maybeNull(rng, () => randFloat(rng, 0, 1000, 1), 0.98),
    accSetSpeedKph: maybeNull(rng, () => randFloat(rng, 0, 140, 1), 0.98),
    accModeStatus: maybeNull(rng, () => randInt(rng, 0, 2), 0.99),
    accSetDistanceStatus: maybeNull(rng, () => randInt(rng, 0, 2), 0.99),
    accTargetDetectedStatus: maybeNull(rng, () => randInt(rng, 0, 1), 0.99),
    accShutoffWarningStatus: maybeNull(rng, () => randInt(rng, 0, 1), 0.99),
    accDistanceAlertStatus: maybeNull(rng, () => randInt(rng, 0, 1), 0.99),
  };

  const rawDiagnosticRecord = {
    rawData: "rawDiagnosticRecord" //maybeNull(rng, () => `RAW_${randHexString(rng, 16)}`, 0.9),
  };

  const payload = {
    bus: "J1939-virtualdashboardtesting3",
    date: isoDate ?? null,
    createdAt: isoDate ?? null,
    updatedAt: isoDate ?? null,
    seatBelt: "nullmas",
    engineLoad: 55,
    totalEngineIdleTime: maybeNull(rng, () => randFloat(rng, 0, 100000, 1), 0.8),
    engineRPM: randInt(rng, 0, 6000),
    engineFuelEconomy: 66,
    vin: overrides.VIN ?? maybeNull(rng, () => `VIN${randHexString(rng, 8)}`, 0.6),
    oilTemperature: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.7),
    gear: maybeNull(rng, () => randInt(rng, 0, 18), 0.7),
    transmissionOilTemperature: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.8),
    intercoolerTemperature: maybeNull(rng, () => randFloat(rng, -40, 150, 1), 0.8),
    fuelTankTemperature: maybeNull(rng, () => randFloat(rng, -20, 120, 0), 0.2) ?? 80,
    engineSpeed: 9999,
    intakeTemperature: maybeNull(rng, () => randFloat(rng, -40, 120, 1), 0.6),
    engineFuelRate: randFloat(rng, 0, 5000, 1),
    turboOilTemperature: maybeNull(rng, () => randFloat(rng, -40, 200, 1), 0.85),
    fuelLevelPercent: 66,
    coolantTemperature: randFloat(rng, -40, 120, 0),
    totalPtoTime: maybeNull(rng, () => randFloat(rng, 0, 100000, 1), 0.85),
    coolantLevelPercent: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.7),
    defLevelPercent: maybeNull(rng, () => randFloat(rng, 0, 100, 1), 0.7),
    totalEngineHours: randFloat(rng, 0, 50000, 1),
    totalFuelUsed: maybeNull(rng, () => randFloat(rng, 0, 1000000, 1), 0.3),
    oilPressure: maybeNull(rng, () => randFloat(rng, 0, 700, 1), 0.6),
    oilLevelPercent: 55,
    totalEngineIdleFuel: maybeNull(rng, () => randFloat(rng, 0, 100000, 1), 0.85),
    engineOdometer: randFloat(rng, 0, 800000, 1),
    ambientPressure: maybeNull(rng, () => randFloat(rng, 50, 120, 1), 0.6),
    ambientTemperature: maybeNull(rng, () => randFloat(rng, -40, 50, 1), 0.6),
    fuelLevel2Percent: 77,
    dtcNo: randInt(rng, 0, 10),
    vehicleId: vehicleId,
    dtcStatus: 'success',
    dtcCount: randInt(rng, 0, 6),
    dtcVersion: randInt(rng, 0, 5),
    dtcMil: randBool(rng, 0.2),
    dtcBus: 'J1939',
    dtcError: ["520941-3"],
    dtcPTError: randBool(rng, 0.9) ? 'noError' : `err${randHexString(rng, 4)}`,
    emissionRecord,
    engineRecord,
    fuelRecord,
    transmissionParametersRecord,
    driverBehaviorRecord,
    assistRecord,
    rawDiagnosticRecord,
    vehicleId: overrides.vehicleId ?? vehicleId,
    date: isoDate ?? null,
    createdAt: isoDate ?? null,
    updatedAt: isoDate ?? null,
  };

  for (const k of Object.keys(overrides || {})) {
    if (k === 'vehicleId') { payload.vehicleId = overrides.vehicleId; continue; }
    const v = overrides[k];
    if (v && typeof v === 'object' && payload[k] && typeof payload[k] === 'object') {
      payload[k] = Object.assign({}, payload[k], v);
    } else {
      payload[k] = v;
    }
  }

  return payload;
}

// ----------------- End builders -----------------

// ---------- minute iterator with step ----------
function* minuteIterator(startIso, endIso, stepMinutes = 1) {
  let cur = new Date(startIso);
  const end = new Date(endIso);
  while (cur <= end) {
    yield new Date(cur).toISOString();
    cur = new Date(cur.getTime() + stepMinutes * 60_000);
  }
}

// ---------- load tokens ----------
// let tokenMap = {};
// if (fs.existsSync(TOKENS_FILE)) {
//   try { tokenMap = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); console.log('Loaded tokens file'); }
//   catch (e) { console.warn('Failed to parse tokens JSON — continuing without tokens'); tokenMap = {}; }
// }

// ---------- progress load/save ----------
let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch (e) { progress = {}; }
}
function saveProgress() {
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8'); } catch (e) { console.warn('Failed saving progress:', e.message); }
}

class Semaphore {
  constructor(max) { this.max = max; this.current = 0; this.queue = []; }
  acquire() {
    if (this.current < this.max) { this.current++; return Promise.resolve(); }
    return new Promise(res => this.queue.push(res));
  }
  release() {
    this.current--;
    if (this.queue.length > 0) { this.current++; const cb = this.queue.shift(); cb(); }
  }
}
const sem = new Semaphore(CONCURRENCY);

async function postWithRetries(url, body, headers = {}) {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const res = await axiosInstance.post(url, body, { headers });
      if (res.status >= 200 && res.status < 300){
        console.log(res.data.message)
        return res;
      }
      if (res.status >= 400 && res.status < 500) {
        console.warn(`HTTP ${res.status} (client error) — payload rejected`);
        // console.log(url, body, headers)
        return res;
      }
      console.warn(`HTTP ${res.status} (server) — retry ${attempt}/${MAX_RETRIES}`);
    } catch (err) {
      const code = err.code || err.message || 'ERR';
      console.warn(`Request error ${code} — attempt ${attempt}/${MAX_RETRIES}`);
    }
    await sleep(RETRY_BACKOFF_MS * attempt);
  }
  throw new Error('Max retries reached');
}

async function runPlanEntry(entry) {
  const { eldType, startIso, endIso, driverId, vehicleId, intervalMinutes = 1, accessTokenKey, overrides } = entry;
  if (!eldType || !startIso || !endIso || !driverId || !vehicleId) {
    console.warn('Invalid plan entry, skipping:', entry); return;
  }

//   const token = accessTokenKey ? tokenMap[accessTokenKey] : null;
  const token = accessTokenKey || null;;
  const norm = String(eldType).trim();
  let mapped;
  if (norm === 'PT') mapped = 'PT';
  else if (norm === 'protrux' || norm === 'PROTRUX') mapped = 'PROTRUX';
  else if (norm === 'iosix' || norm === 'IOSIX') mapped = 'IOSIX';
  else mapped = norm; // fallback to using as-is (but still lowercased)

  const query = token ? `?eldType=${encodeURIComponent(mapped)}&access_token=${encodeURIComponent(token)}`
                      : `?${ELD_QUERY_NAME}=${encodeURIComponent(mapped)}`;
  const urlBase = `${BASE}${ENDPOINT}${query}`;

  const progressKey = `${eldType}_${driverId}_${vehicleId}`;

  let startPoint = startIso;
  if (progress[progressKey]) {
    const last = new Date(progress[progressKey]);
    startPoint = new Date(last.getTime() + (intervalMinutes * 60_000)).toISOString();
    console.log(`Resuming ${progressKey} from ${startPoint}`);
  } else {
    console.log(`Starting ${progressKey} from ${startPoint}`);
  }

  const it = minuteIterator(startPoint, endIso, intervalMinutes);
  let sentCount = 0;
  let dryPrinted = 0;

  for (const iso of it) {
    let payload;
    const seedForThis = (GLOBAL_SEED !== null && GLOBAL_SEED !== undefined) ? (GLOBAL_SEED + driverId + sentCount) : null;
    if (eldType === 'PT') payload = buildPt30Payload(iso, vehicleId, overrides || {}, seedForThis);
    else if (eldType === 'PROTRUX') payload = buildProtruxPayload(iso, vehicleId, overrides || {}, seedForThis);
    else if (eldType === 'IOSIX') payload = buildIosixPayload(iso, vehicleId, overrides || {}, seedForThis);
    else { console.warn('Unknown eldType', eldType); break; }

    if (dryRun && dryPrinted < DRYRUN_PRINT_FIRST) {
      console.log(`DRY ${eldType} ${iso} payload:`, JSON.stringify(payload, null, 2));
      dryPrinted++;
      progress[progressKey] = iso;
      if (dryPrinted >= DRYRUN_PRINT_FIRST) saveProgress();
      continue;
    }

    await sem.acquire();
    (async () => {
      try {
        const headers = {
          'content-type': 'application/json; charset=UTF-8',
          'devicetype': 'tablet',
          'driverid': String(driverId),
          'platform': 'ANDROID',
          'service': 'zeelog',
          'versioncode': '728',
          'versionname': '4.12.3-DEBUG',
        };
        const res = await postWithRetries(urlBase, payload, headers);
        // optional log sampling:
        if (sentCount % 1000 === 0) {
          console.log(`[${eldType}] ${iso} => ${res ? res.status : 'no-res'}`);
        }
      } catch (err) {
        console.error(`[${eldType}] ${iso} => ERROR:`, err && err.message ? err.message : err);
      } finally {
        progress[progressKey] = iso;
        sentCount++;
        if (sentCount % 500 === 0) saveProgress();
        sem.release();
      }
    })();
  }

  while (sem.current > 0 || sem.queue.length > 0) { await sleep(2000); }
  saveProgress();
  console.log(`Finished ${eldType} for driver ${driverId}. Sent ~${sentCount} payloads.`);
}

(async function main() {
  if (!Array.isArray(runPlan) || runPlan.length === 0) {
    console.log('runPlan is empty — edit the script to add jobs to runPlan.');
    return;
  }

  const missingTokens = [];
  for (const job of runPlan) {
    if (!job.accessTokenKey) missingTokens.push(job.accessTokenKey);
  }
  if (missingTokens.length) {
    console.warn('Warning: the following accessTokenKey(s) were not found in tokens file:', Array.from(new Set(missingTokens)).slice(0,20));
  }

  for (const job of runPlan) {
    try {
      await runPlanEntry(job);
    } catch (err) {
      console.error('Job failed:', err && err.message ? err.message : err);
      saveProgress();
      // continue with next job
    }
  }

  console.log('All jobs done (or skipped).');
  process.exit(0);
})();