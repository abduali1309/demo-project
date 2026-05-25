// // filename: migrate-logs.js
// const axios = require('axios');
// const { randomUUID } = require('crypto');

// // --- CONFIGURE THESE ---

// // 1️⃣ Source (get-daily-logs)
// const SOURCE_BASE = "https://front-api-uz.tteld.com/api/dashboards/get-daily-logs";
// const SOURCE_HEADERS = {
//   // use the Authorization token from your example curl
//   "Authorization": "T0rXBCrdoTrFDTQ1QBHXi6HfuoGWnJfG1jcwv1w41lhZ26jeoX3FXSCX0RVJz99s",
//   // companyuid header (note lowercase key as in your curl)
//   "companyuid": "fb5c41da-9e46-4bd6-b9db-b0a196eb4637",
//   "Accept": "application/json, text/plain, */*"
// };

// // 2️⃣ Target (insertlog, accept, setinfolog)
// const INSERT_ACTIVE_URL = "https://njtest.tteld.com/api/dashboards/v2/insertlog";
// const ACCEPT_ACTIVE_URL = "https://njtest.tteld.com/api/dashboards/accept-requested-logs";
// const SET_INFO_URL = "https://njtest.tteld.com/api/dashboards/v2/setinfolog";
// const TARGET_HEADERS = {
//   "Authorization": "eQ0I4G4rbmYbc5AdDyyQONqAkZ6cbmCdUDNzL4glMy7PW8UuTLxhIxTEQdaPdru5",
//   "Companyuid": "399519c7-902e-40e0-9be8-e6749cf76f76"
// };

// // 3️⃣ Settings
// const SOURCE_DRIVER_UID = "64758cdb-d61e-4953-a778-d4a80b8e0abf"; // from your curl example
// const TARGET_DRIVER_UID = "81929fe6-d053-477d-bb2e-ebf89df6330e";
// const START_DATE = "2025-10-14";
// const END_DATE = "2025-10-16";
// const VEHICLE_ID = 274;
// const VEHICLE_UID = '3f88cbb2-2e42-4861-b141-8c2fdbf9c78a'

// // concurrency for info logs
// const INFO_CONCURRENCY = 8; // tune this (5-20) depending on API limits

// // Utility sleep
// const sleep = (ms = 1000) => new Promise(r => setTimeout(r, ms));

// // --- Helper: iterate daily ---
// function* dateRange(start, end) {
//   let d = new Date(start);
//   const endDate = new Date(end);
//   while (d <= endDate) {
//     yield new Date(d);
//     d.setDate(d.getDate() + 1);
//   }
// }

// // --- Helper: format timestamp for insertlog (always 11:00Z) ---
// function makeTimestamp(date) {
//   const iso = date.toISOString().split("T")[0];
//   return `${iso}T11:00:00.000Z`;
// }

// // --- 1️⃣ Fetch logs from source API ---
// // Note: new API returns { logs: [...] } — we gracefully fall back to older shapes (data/data.data)
// async function fetchLogsForDate(date) {
//   const timestamp = makeTimestamp(date);
//   const url = `${SOURCE_BASE}/${SOURCE_DRIVER_UID}/${timestamp}`;
//   try {
//     const res = await axios.get(url, { headers: SOURCE_HEADERS });
//     if (res.status !== 200) throw new Error(`GET failed ${res.status}`);
//     // New API uses res.data.logs; older used res.data.data — try both and fall back to res.data
//     const list = (res.data && (Array.isArray(res.data.logs) ? res.data.logs
//       : Array.isArray(res.data.data) ? res.data.data
//       : Array.isArray(res.data) ? res.data
//       : []));
//     return list;
//   } catch (err) {
//     console.error(`❌ Fetch failed for ${timestamp}:`, err.response ? err.response.data || err.response.statusText : err.message);
//     return [];
//   }
// }

// // --- helpers to transform logs ---

// function normalizeCoords(coords, row) {
//   if (!coords || typeof coords.lat === 'undefined' || typeof coords.lng === 'undefined') {
//     return { lat: 1, lng: 1 };
//   }
//   const lat = Number(coords.lat);
//   const lng = Number(coords.lng);
//   if (lat === -1 && lng === -1) {
//     // preserve your special-case behavior
//     row.address = '4645.39 mi E of Culebra, PR';
//     return { lat: 1, lng: 1 };
//   }
//   return { lat, lng };
// }

// function mapStatus(eventType, eventCode) {
//   // eventType & eventCode are numbers
//   const duty = {
//     1: "off",
//     2: "sleep",
//     3: "driving",
//     4: "on"
//   };
//   const cmv = {
//     1: "yard",
//     2: "personal"
//   };
//   const power = {
//     1: "poweron",
//     2: "poweron",
//     3: "poweroff",
//     4: "poweroff"
//   };
//   const auth = {
//     1: "login",
//     2: "logout"
//   };

//   if (eventType === 1) return duty[eventCode] || "unknown";
//   if (eventType === 2) return "intermediate";
//   if (eventType === 3) return cmv[eventCode] || "unknown";
//   if (eventType === 4) return "certify";
//   if (eventType === 5) return auth[eventCode] || "unknown";
//   if (eventType === 6) return power[eventCode] || "unknown";
//   return "unknown";
// }

// // transform active logs (for insertlog)
// function transformActiveLogs(originalLogs) {
//   return originalLogs.map(row => {
//     const coords = normalizeCoords(row.coordinates, row);
//     return {
//       note: row.note || "",
//       record_status: 3,
//       coordinates: { lng: coords.lng, lat: coords.lat }, // preserve source shape
//       sequenceId: row.sequenceId || row.sequenceId === 0 ? row.sequenceId : (row.sequenceId || row.sequence || 0),
//       address: row.address || "Unknown",
//       odometr: row.odometr || row.odometer || 0,
//       engine_hours: row.engine_hours || row.engineHours || 0,
//       document: row.document || "1",
//       trailer: row.trailer || null,
//       client_id: row.client_id || randomUUID(),
//       status: row.status || mapStatus(Number(row.event_type), Number(row.event_code)),
//       event_type: Number(row.event_type),
//       event_code: Number(row.event_code),
//       start_date: row.start_date,
//       end_date: row.end_date,
//       codriverUid: row.codriverUid || row.codriverId || null,
//       vehicleId: VEHICLE_ID
//     };
//   });
// }

// // transform info logs (for setinfolog)
// function transformInfoLogs(originalLogs) {
//   return originalLogs.map(row => {
//     const coords = normalizeCoords(row.coordinates, row);
//     return {
//       record_status: Number(row.record_status) || 1,
//       status: row.status || mapStatus(Number(row.event_type), Number(row.event_code)),
//       event_type: Number(row.event_type),
//       event_code: Number(row.event_code),
//       start_date: row.start_date,
//       end_date: row.end_date,
//       address: row.address || "Unknown",
//       odometr: row.odometr || row.odometer || 0,
//       engine_hours: row.engine_hours || row.engineHours || 0,
//       vehicleUid: VEHICLE_UID, // fallback
//       document: row.document || "1",
//       trailer: row.trailer || null,
//       codriverUid: null,
//       coordinates: { lat: coords.lat, lng: coords.lng }
//     };
//   });
// }

// // --- 3️⃣ Insert + accept logs into target (active) ---
// // (kept unchanged from your original)
// async function insertAndAcceptActive(date, activeBodies) {
//   if (!activeBodies.length) {
//     console.log(`⚠️ No active logs for ${date.toISOString().split("T")[0]}`);
//     return;
//   }

//   const timestamp = makeTimestamp(date);
//   const insertUrl = `${INSERT_ACTIVE_URL}/${TARGET_DRIVER_UID}/${timestamp}`;
//   const uid3 = randomUUID();
//   const acceptUrl = `${ACCEPT_ACTIVE_URL}/${TARGET_DRIVER_UID}/${timestamp}?uid3=${uid3}`;

//   let insertResp = null;

//   // 1) Insert
//   try {
//     console.log(`POST ${insertUrl}  (sending ${activeBodies.length} logs)`);
//     insertResp = await axios.post(insertUrl, activeBodies, { headers: TARGET_HEADERS });
//     console.log(`→ Insert status: ${insertResp.status}`);
//     console.log('→ Insert response keys:', insertResp.data && Object.keys(insertResp.data || {}).slice(0,10));
//   } catch (err) {
//     console.error(`❌ Insert failed for ${timestamp}:`, err.response ? err.response.data || err.response.statusText : err.message);
//     return; // don't attempt accept if insert failed
//   }

//   // 2) Accept (try a few strategies + retries)
//   const maxAttempts = 4;
//   const baseDelay = 800; // ms

//   const acceptPayloadCandidates = [
//     null,
//     {},
//     { uid3 },
//     insertResp && insertResp.data ? insertResp.data : null
//   ];

//   for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//     const candidate = acceptPayloadCandidates[(attempt - 1) % acceptPayloadCandidates.length];

//     try {
//       console.log(`Attempt ${attempt}: POST ${acceptUrl} with payload=${candidate === null ? 'null' : JSON.stringify(candidate).slice(0,200)}`);
//       const res = await axios.post(acceptUrl, candidate, { headers: TARGET_HEADERS });
//       console.log(`→ Accept succeeded (attempt ${attempt}) status=${res.status}`);
//       return;
//     } catch (err) {
//       const status = err.response ? err.response.status : null;
//       const respBody = err.response ? (err.response.data || err.response.statusText) : err.message;
//       console.warn(`→ Accept attempt ${attempt} failed: status=${status} body=${typeof respBody === 'string' ? respBody : JSON.stringify(respBody).slice(0,300)}`);
//       if (status && status >= 400 && status < 500 && status !== 429 && attempt >= acceptPayloadCandidates.length) {
//         console.error(`❌ Accept appears to be a client error (status ${status}). Stop retrying.`);
//         break;
//       }
//       const wait = baseDelay * Math.pow(2, attempt - 1);
//       await sleep(wait);
//     }
//   }

//   console.error(`❌ All accept attempts failed for ${timestamp}. Check insert response and API docs.`);
// }


// // --- 4️⃣ Insert info logs (concurrent batches) ---
// async function insertInfoLogsConcurrently(infoBodies) {
//   if (!infoBodies.length) return;

//   const batches = [];
//   for (let i = 0; i < infoBodies.length; i += INFO_CONCURRENCY) {
//     batches.push(infoBodies.slice(i, i + INFO_CONCURRENCY));
//   }

//   for (let b = 0; b < batches.length; b++) {
//     const batch = batches[b];
//     const promises = batch.map((body, idx) =>
//       axios.post(`${SET_INFO_URL}/${TARGET_DRIVER_UID}`, body, { headers: TARGET_HEADERS })
//         .then(res => {
//           if (res.status >= 200 && res.status < 300) {
//             console.log(`  ✅ Info inserted (batch ${b+1}, item ${idx+1})`);
//           } else {
//             console.error(`  ❌ Info insert returned ${res.status}`);
//           }
//         })
//         .catch(err => {
//           console.error(`  ❌ Info insert error (batch ${b+1}, item ${idx+1}):`, err.response ? err.response.data || err.response.statusText : err.message);
//         })
//     );

//     await Promise.allSettled(promises);
//     // small pause between batches
//     await sleep(300);
//   }
// }

// // --- MAIN EXECUTION ---
// (async () => {
//   console.log(`🚀 Starting migration from ${START_DATE} to ${END_DATE}`);

//   for (const day of dateRange(START_DATE, END_DATE)) {
//     const dayStr = day.toISOString().split("T")[0];
//     console.log(`\n📅 Processing ${dayStr}...`);

//     const original = await fetchLogsForDate(day);
//     if (!original.length) {
//       console.log(` → no source logs for ${dayStr}`);
//       await sleep(500);
//       continue;
//     }

//     // split into active (event_type === 1) and info (others)
//     const activeOriginal = original.filter(r => Number(r.event_type) === 1);
//     const infoOriginal = original.filter(r => Number(r.event_type) !== 1);

//     console.log(` → source: ${original.length} logs (active ${activeOriginal.length}, info ${infoOriginal.length})`);

//     // transform
//     const activeBodies = transformActiveLogs(activeOriginal);
//     const infoBodies = transformInfoLogs(infoOriginal);

//     // Insert active logs and accept once
//     await insertAndAcceptActive(day, activeBodies);

//     // Then insert info logs (concurrent batches)
//     if (infoBodies.length) {
//       console.log(` → inserting ${infoBodies.length} info logs (concurrency ${INFO_CONCURRENCY})`);
//       await insertInfoLogsConcurrently(infoBodies);
//     }

//     // small pause before next day
//     await sleep(1500);
//   }

//   console.log("\n🎉 Migration complete!");
// })();





// filename: migrate-logs.js
const axios = require('axios');
const { randomUUID } = require('crypto');
const moment = require('moment-timezone');

// --- CONFIGURE THESE ---

// 1️⃣ Source (get-daily-logs)
const SOURCE_BASE = "https://front-api.tteld.com/api/dashboards/get-daily-logs";
const SOURCE_HEADERS = {
  // use the Authorization token from your example curl
  "Authorization": "6Z7lCaJZuCRxaCopk114xdcGmbQl0aczhVKaiDMxM8dg9nTTXDp6vDB17yWUFqzN",
  // companyuid header (note lowercase key as in your curl)
  "companyuid": "fb5c41da-9e46-4bd6-b9db-b0a196eb4637",
  "Accept": "application/json, text/plain, */*"
};

// 2️⃣ Target (insertlog, accept, setinfolog)
const INSERT_ACTIVE_URL = "https://uat.tteld.com/api/dashboards/v2/insertlog";
const ACCEPT_ACTIVE_URL = "https://uat.tteld.com/api/dashboards/accept-requested-logs";
const SET_INFO_URL = "https://uat.tteld.com/api/dashboards/v2/setinfolog";
const TARGET_HEADERS = {
  "Authorization": "vdWfnaqQozg49TOJHljoGIS5R0EqUeO8ymdCVaanDmHTE7EdtO28QfsNBHWrhyXO",
  "Companyuid": "399519c7-902e-40e0-9be8-e6749cf76f76"
};

// 3️⃣ Settings
const SOURCE_DRIVER_UID = "64758cdb-d61e-4953-a778-d4a80b8e0abf"; // from your curl example
const SOURCE_DRIVER_ID = 65612

const TARGET_DRIVER_UID = "babe0670-ab44-4dc1-ba04-1ee348c1db34"; // your target driver or test driver 4febf3fd-66ed-41e7-95d9-f4a767911b64
const START_DATE = "2026-04-01";
const END_DATE = "2026-05-12";
const VEHICLE_ID = 467;
const VEHICLE_UID = '59cac538-ae55-489e-b55b-4911e7a1c930'
const CODRIVER_UID = null //'7a603df9-95c6-4859-a1e5-a40650b84580'


// company timezone (used only for date comparisons). Set to your company tz identifier (IANA), e.g. "America/Los_Angeles" or "Asia/Tashkent"
const COMPANY_TZ = process.env.COMPANY_TZ || 'UTC';

// concurrency for info logs
const INFO_CONCURRENCY = 8; // tune this (5-20) depending on API limits

// Utility sleep
const sleep = (ms = 1000) => new Promise(r => setTimeout(r, ms));

// --- Helper: iterate daily ---
function* dateRange(start, end) {
  let d = new Date(start);
  const endDate = new Date(end);
  while (d <= endDate) {
    yield new Date(d);
    d.setDate(d.getDate() + 1);
  }
}

// --- Helper: format timestamp for insertlog (always 11:00Z) ---
function makeTimestamp(date) {
  const iso = date.toISOString().split("T")[0];
  return `${iso}T11:00:00.000Z`;
}

// --- 1️⃣ Fetch logs from source API ---
// Note: new API returns { logs: [...] } — we gracefully fall back to older shapes (data/data.data)
async function fetchLogsForDate(date) {
  const timestamp = makeTimestamp(date);
  const url = `${SOURCE_BASE}/${SOURCE_DRIVER_UID}/${timestamp}`;
  try {
    const res = await axios.get(url, { headers: SOURCE_HEADERS });
    if (res.status !== 200) throw new Error(`GET failed ${res.status}`);
    // New API uses res.data.logs; older used res.data.data — try both and fall back to res.data
    const list = (res.data && (Array.isArray(res.data.logs) ? res.data.logs
      : Array.isArray(res.data.data) ? res.data.data
      : Array.isArray(res.data) ? res.data
      : []));
    return list;
  } catch (err) {
    console.error(`❌ Fetch failed for ${timestamp}:`, err.response ? err.response.data || err.response.statusText : err.message);
    return [];
  }
}

// --- helpers to transform logs ---

function normalizeCoords(coords, row) {
  if (!coords || typeof coords.lat === 'undefined' || typeof coords.lng === 'undefined') {
    return { lat: 1, lng: 1 };
  }
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  if (lat === -1 && lng === -1) {
    // preserve your special-case behavior
    row.address = '4645.39 mi E of Culebra, PR';
    return { lat: 1, lng: 1 };
  }
  return { lat, lng };
}

function mapStatus(eventType, eventCode) {
  // eventType & eventCode are numbers
  const duty = {
    1: "off",
    2: "sleep",
    3: "driving",
    4: "on"
  };
  const cmv = {
    1: "yard",
    2: "personal"
  };
  const power = {
    1: "poweron",
    2: "poweron",
    3: "poweroff",
    4: "poweroff"
  };
  const auth = {
    1: "login",
    2: "logout"
  };

  if (eventType === 1) return duty[eventCode] || "unknown";
  if (eventType === 2) return "intermediate";
  if (eventType === 3) return cmv[eventCode] || "unknown";
  if (eventType === 4) return "certify";
  if (eventType === 5) return auth[eventCode] || "unknown";
  if (eventType === 6) return power[eventCode] || "unknown";
  return "unknown";
}

// transform active logs (for insertlog)
function transformActiveLogs(originalLogs) {
  return originalLogs.map(row => {
    const coords = normalizeCoords(row.coordinates, row);
    return {
      note: row.note || "",
      record_status: 3,
      coordinates: { lng: coords.lng, lat: coords.lat }, // preserve source shape
      sequenceId: row.sequenceId || row.sequenceId === 0 ? row.sequenceId : (row.sequenceId || row.sequence || 0),
      address: row.address || "Unknown",
      odometr: row.odometr || row.odometer || 0,
      engine_hours: row.engine_hours || row.engineHours || 0,
      document: row.document || "1",
      trailer: row.trailer || null,
      client_id: row.client_id || randomUUID(),
      status: row.status || mapStatus(Number(row.event_type), Number(row.event_code)),
      event_type: Number(row.event_type),
      event_code: Number(row.event_code),
      start_date: row.start_date,
      end_date: row.end_date,
      codriverUid: CODRIVER_UID,
      vehicleId: VEHICLE_ID
    };
  });
}

function setZeroMilliseconds(date){
    let mms = new Date(date).setMilliseconds(0)
    return new Date(mms).toISOString()
}

// transform info logs (for setinfolog)
function transformInfoLogs(originalLogs) {
  return originalLogs.map(row => {
    const coords = normalizeCoords(row.coordinates, row);
    return {
      record_status: Number(row.record_status) || 1,
      status: row.status || mapStatus(Number(row.event_type), Number(row.event_code)),
      event_type: Number(row.event_type),
      event_code: Number(row.event_code),
      start_date: setZeroMilliseconds(row.start_date),
      end_date: setZeroMilliseconds(row.end_date),
      address: row.address,
      odometr: row.odometr || row.odometer || 0,
      engine_hours: row.engine_hours || row.engineHours || 0,
      vehicleUid: VEHICLE_UID, // fallback
      document: row.document || "1",
      trailer: row.trailer || null,
      codriverUid: CODRIVER_UID,
      coordinates: { lat: coords.lat, lng: coords.lng },
    //   driver_signature: row.status == 'certify' ? 'uploads/file/ccbfc311-4ded-4758-b1ef-6374f75c0314' : null,
    //   certify_date: row.status == 'certify' ? row.certify_date : null
    };
  });
}

// --- 3️⃣ Insert + accept logs into target (active) ---
// (kept unchanged from your original)
async function insertAndAcceptActive(date, activeBodies) {
  if (!activeBodies.length) {
    console.log(`⚠️ No active logs for ${date.toISOString().split("T")[0]}`);
    return;
  }

  const timestamp = makeTimestamp(date);
  const insertUrl = `${INSERT_ACTIVE_URL}/${TARGET_DRIVER_UID}/${timestamp}`;
  const uid3 = randomUUID();
  const acceptUrl = `${ACCEPT_ACTIVE_URL}/${TARGET_DRIVER_UID}/${timestamp}?uid3=${uid3}`;

  let insertResp = null;

  // 1) Insert
  try {
    console.log(`POST ${insertUrl}  (sending ${activeBodies.length} logs)`);
    insertResp = await axios.post(insertUrl, activeBodies, { headers: TARGET_HEADERS });
    console.log(`→ Insert status: ${insertResp.status}`);
    console.log('→ Insert response keys:', insertResp.data && Object.keys(insertResp.data || {}).slice(0,10));
  } catch (err) {
    console.error(`❌ Insert failed for ${timestamp}:`, err.response ? err.response.data || err.response.statusText : err.message);
    return; // don't attempt accept if insert failed
  }

  // 2) Accept (try a few strategies + retries)
  const maxAttempts = 4;
  const baseDelay = 800; // ms

  const acceptPayloadCandidates = [
    null,
    {},
    { uid3 },
    insertResp && insertResp.data ? insertResp.data : null
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = acceptPayloadCandidates[(attempt - 1) % acceptPayloadCandidates.length];

    try {
      console.log(`Attempt ${attempt}: POST ${acceptUrl} with payload=${candidate === null ? 'null' : JSON.stringify(candidate).slice(0,200)}`);
      const res = await axios.post(acceptUrl, candidate, { headers: TARGET_HEADERS });
      console.log(`→ Accept succeeded (attempt ${attempt}) status=${res.status}`);
      return;
    } catch (err) {
      const status = err.response ? err.response.status : null;
      const respBody = err.response ? (err.response.data || err.response.statusText) : err.message;
      console.warn(`→ Accept attempt ${attempt} failed: status=${status} body=${typeof respBody === 'string' ? respBody : JSON.stringify(respBody).slice(0,300)}`);
      if (status && status >= 400 && status < 500 && status !== 429 && attempt >= acceptPayloadCandidates.length) {
        console.error(`❌ Accept appears to be a client error (status ${status}). Stop retrying.`);
        break;
      }
      const wait = baseDelay * Math.pow(2, attempt - 1);
      await sleep(wait);
    }
  }

  console.error(`❌ All accept attempts failed for ${timestamp}. Check insert response and API docs.`);
}


// --- 4️⃣ Insert info logs (concurrent batches) ---
async function insertInfoLogsConcurrently(infoBodies) {
  if (!infoBodies.length) return;

  const batches = [];
  for (let i = 0; i < infoBodies.length; i += INFO_CONCURRENCY) {
    batches.push(infoBodies.slice(i, i + INFO_CONCURRENCY));
  }
  let errors= []

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const promises = batch.map((body, idx) =>
      axios.post(`${SET_INFO_URL}/${TARGET_DRIVER_UID}`, body, { headers: TARGET_HEADERS })
        .then(res => {
          if (res.status >= 200 && res.status < 300) {
            console.log(`  ✅ Info inserted (batch ${b+1}, item ${idx+1})`);
          } else {
            console.error(`  ❌ Info insert returned ${res.status}`);
          }
        })
        .catch(err => {
          console.error(`  ❌ Info insert error (batch ${b+1}, item ${idx+1}):`, err.response ? err.response.data || err.response.statusText : err.message);
            errors.push(batches[b], idx)
        })
    );

    await Promise.allSettled(promises);
    // small pause between batches
    await sleep(300);
  }
  console.log(errors)
}

// --- MAIN EXECUTION ---
(async () => {
  console.log(`🚀 Starting migration from ${START_DATE} to ${END_DATE}`);
  console.log(`Using company timezone: ${COMPANY_TZ}`);

  for (const day of dateRange(START_DATE, END_DATE)) {
    const dayStrUtc = day.toISOString().split("T")[0];
    // Local day strings (in company timezone)
    const localDayStr = moment.tz(day, COMPANY_TZ).format('YYYY-MM-DD');
    const nextLocalDayStr = moment.tz(day, COMPANY_TZ).add(1, 'day').format('YYYY-MM-DD');

    // target timestamps (UTC) for day boundaries you specified
    const targetStart = `${localDayStr}T04:00:00.000Z`;
    const targetEnd = `${nextLocalDayStr}T03:59:59.999Z`;

    console.log(`\n📅 Processing ${dayStrUtc} (local day ${localDayStr})...`);

    const original = await fetchLogsForDate(day);
    if (!original.length) {
      console.log(` → no source logs for ${dayStrUtc}`);
      await sleep(500);
      continue;
    }

    // split into active (event_type === 1) and info (others)
    let activeOriginal = original.filter(r => (Number(r.event_type) === 1 || Number(r.event_type) === 3) && r.driverId===SOURCE_DRIVER_ID);
    const infoOriginal = original.filter(r => Number(r.event_type) !== 1 && r.driverId===SOURCE_DRIVER_ID);

    console.log(` → source: ${original.length} logs (active ${activeOriginal.length}, info ${infoOriginal.length})`);

    // --- NEW: adjust first & last active logs according to company day boundaries ---
    if (activeOriginal.length) {
      // sort by start_date ascending (fallback to createdAt)
      activeOriginal.sort((a, b) => {
        const ta = a.start_date ? new Date(a.start_date).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const tb = b.start_date ? new Date(b.start_date).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return ta - tb;
      });

      const first = activeOriginal[0];
      const last = activeOriginal[activeOriginal.length - 1];

      // check first.start_date local day
      const firstLocalDate = first.start_date ? moment.tz(first.start_date, COMPANY_TZ).format('YYYY-MM-DD') : null;
      if (firstLocalDate !== localDayStr) {
        console.log(` → Adjusting first active log start_date from ${first.start_date} -> ${targetStart}`);
        first.start_date = targetStart;
      }

      // check last.end_date local day (note: end_date can be null)
      const lastLocalEndDate = last.end_date ? moment.tz(last.end_date, COMPANY_TZ).format('YYYY-MM-DD') : null;
      // we want last.end_date to fall into nextLocalDayStr (end of that company day)
      if (!last.end_date || lastLocalEndDate !== nextLocalDayStr) {
        console.log(` → Adjusting last active log end_date from ${last.end_date} -> ${targetEnd}`);
        last.end_date = targetEnd;
      }
    }

    // transform
    const activeBodies = transformActiveLogs(activeOriginal);
    const infoBodies = transformInfoLogs(infoOriginal);

    // Insert active logs and accept once
    await insertAndAcceptActive(day, activeBodies);

    // Then insert info logs (concurrent batches)
    if (infoBodies.length) {
      console.log(` → inserting ${infoBodies.length} info logs (concurrency ${INFO_CONCURRENCY})`);
      await insertInfoLogsConcurrently(infoBodies);
    }

    // small pause before next day
    await sleep(1500);
  }

  console.log("\n🎉 Migration complete!");
})();