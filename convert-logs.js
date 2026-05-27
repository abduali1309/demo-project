
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);


// --- CONFIGURE THESE ---
const DRIVER_UID     = 'e7c762fd-13e8-4c92-90c8-ef38866cb053';
const COMPANY_UID    = '42b94f1a-a395-4f7f-8913-a3c88e343292';
const AUTH_TOKEN     = 'OK4ULC5UgEpyWKtBubMPvE61IvZ4tFzNnBAmL7FbgLPLDVhFzrc49BBS1GJvuvXQ';
const BASE_URL       = 'https://ftest.tteld.com/api/dashboards';
const START_DATE     = '2026-04-17'; // YYYY-MM-DD
const END_DATE       = '2026-04-18';   // YYYY-MM-DD
const DAY_ANCHOR_HOUR = 5; // change to 0 for midnight UTC


const COMPANY_NAME = 'Reliable Trucking Partner 2 Inc';
const COMPANY_ADDRESS = '799 North Court St Suite-7 Medina, OH 44256'
const USDOT = '3395902';
const SUGGESTION_REQUEST_ID = crypto.randomUUID();
const VEHICLE_ID = 43905;
const VEHICLE_ID_STRING = "7777"


const OUT_DIR = path.join(__dirname, 'output/');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: AUTH_TOKEN,
    Companyuid: COMPANY_UID,
    'Content-Type': 'application/json'
  },
  timeout: 20000
});

function parseDate(s) {

    if (!s) return null;
    if (s instanceof Date) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      return new Date(Date.parse(s));
    }
    return d;
}

  function mapEventType(log) {
    const status = (log.status || '').toString().toLowerCase();
  
    const map = {
      'sleep': 'DutySleeper',
      'driving': 'DutyDriving',
      'on': 'DutyOn',
      'off': 'DutyOff',
      // 'adverse': 'AdverseDrivingConditions'
      // 'shorthaul': 'ShortHaulExemption'
    };
  
    if (map[status]) return map[status];

    if (log.event_code === 2 && log.event_type === 1) return 'DutySleeper';
    else if (log.event_code === 3 && log.event_type === 1) return 'DutyDriving';
    else if (log.event_code === 1 && log.event_type === 1) return 'DutyOff';
    // else if (log.event_code === 0 && log.event_type === 11) return 'AdverseDrivingConditions';
    else if (log.event_code === 4 && log.event_type ===1 ) return 'DutyOn';
    else return 'Info'

    
  }

  function utcAnchorForDate(isoDateYYYYMMDD, anchorHour = DAY_ANCHOR_HOUR) {
    const parts = isoDateYYYYMMDD.split('-').map(Number);
    const [y, m, d] = parts;
    return new Date(Date.UTC(y, m - 1, d, anchorHour, 0, 0, 0));
  }

function convertDayLogsForTargetDate(rawLogs, targetIsoDate, opts = {}) {
    if (!Array.isArray(rawLogs) || rawLogs.length === 0) return null;
  
    const anchor = utcAnchorForDate(targetIsoDate, opts.anchorHour ?? DAY_ANCHOR_HOUR);
    const windowStartMs = anchor.getTime();
    const windowEndMs = windowStartMs + 24 * 3600 * 1000;
  
    const parsed = rawLogs
      .map(l => {
        const __start = parseDate(l.start_date);
        const __end = parseDate(l.end_date);
        return { ...l, __start, __end };
      })
      .filter(l => l.__start && l.__end && !Number.isNaN(l.__start.getTime()) && !Number.isNaN(l.__end.getTime()))
      .filter(l => (l.__end.getTime() > windowStartMs) && (l.__start.getTime() < windowEndMs))
      .sort((a, b) => {
        const t = a.__start - b.__start;
        if (t !== 0) return t;
        if (a.client_id && b.client_id) return a.client_id.localeCompare(b.client_id);
        return (a.id || 0) - (b.id || 0);
      });
  
    if (parsed.length === 0) return null;

    const events = [];
    let lastSeconds = -1;
    for (let i = 0; i < parsed.length; i++) {
      const l = parsed[i];
  
      const effectiveStartMs = Math.max(l.__start.getTime(), windowStartMs);
      if (effectiveStartMs >= windowEndMs) continue;
  
      let seconds = Math.floor((effectiveStartMs - windowStartMs) / 1000);
      if (seconds < 0) seconds = 0;
  
      if (i === 0) seconds = 0;
  
      if (seconds <= lastSeconds) seconds = lastSeconds + 1;
      lastSeconds = seconds;

      if (mapEventType(l) !== 'Info') {
  
        events.push({
          startTimeSeconds: seconds,
          eventType: mapEventType(l),
          uniqueId: null,
          vehicleId: VEHICLE_ID,
          treatedEventType: null,
          odometer: null,
          engineHours: null,
          textLocation: null,
          notes: "test"
      });
    }
    }
  
    if (events.length === 0) return null;
  
    const odomStart = 0;
    const odomEnd = 0;
  
    const canon = JSON.stringify(events);
    const dataHash = crypto.createHash('md5').update(canon).digest('hex');
  
    const out = {
      dataHash,
      events,
      form: {
        companyName: COMPANY_NAME,
        companyAddress: COMPANY_ADDRESS,
        homeTerminalAddress: "",
        fromAddress: "",
        toAddress: "",
        distance: null,
        usdot: USDOT,
        notes: "",
        coDriverId: null,
        vehicles: [
          {
            id: VEHICLE_ID,
            vehicleId: VEHICLE_ID_STRING,
            odometers: [{ start: odomStart, end: odomEnd }]
          }
        ],
        trailers: [],
        shippingDocuments: []
      },
      maxTimeOffset: -1,
      reassignEvents: [],
      suggestionRequestId: SUGGESTION_REQUEST_ID
    };
  
    return out;
}

async function fetchDailyLogs(driverUid, dateYYYYMMDD) {
  const day = dayjs(dateYYYYMMDD).format('DD-MM-YYYY');
  const url = `/get-daily-logs/${driverUid}/${day}?mode=inject_requested`;
  const resp = await api.get(url);
  return resp.data?.logs ?? [];
}


(async function main() {
  console.log('Starting fetch & convert...');
  let date = dayjs(START_DATE);
  const last = dayjs(END_DATE);

  while (date.isSameOrBefore(last, 'day')) {
    const isoDate = date.format('YYYY-MM-DD');
    try {
      console.log(`Fetching logs for ${isoDate} ...`);
      const rawLogs = await fetchDailyLogs(DRIVER_UID, isoDate);

      if (!rawLogs || rawLogs.length === 0) {
        console.log(`  No logs for ${isoDate} (skipping).`);
      } else {
        const converted = convertDayLogsForTargetDate(rawLogs, isoDate, {
            companyName: COMPANY_NAME,
            usdot: USDOT,
            suggestionRequestId: SUGGESTION_REQUEST_ID,
            anchorHour: DAY_ANCHOR_HOUR
          });

        if (!converted) {
          console.log(`  Conversion produced no output for ${isoDate}.`);
        } else {
          const outPath = path.join(OUT_DIR, `${isoDate}-converted.json`);
          fs.writeFileSync(outPath, JSON.stringify(converted, null, 2), 'utf8');
          console.log(`  Wrote converted file: ${outPath}  (events: ${converted.events.length})`);
        }
      }
    } catch (err) {
      console.error(`Error fetching/converting ${isoDate}:`, (err.response && err.response.data) ? err.response.data : err.message);
    }

    date = date.add(1, 'day');
  }

  console.log('All done.');
})();






// const fs = require('fs');
// const path = require('path');
// const crypto = require('crypto');
// const axios = require('axios');
// const dayjs = require('dayjs');
// const utc = require('dayjs/plugin/utc');
// const timezone = require('dayjs/plugin/timezone');
// const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
// dayjs.extend(utc);
// dayjs.extend(timezone);
// dayjs.extend(isSameOrBefore);


// // --- CONFIGURE THESE ---
// const DRIVER_UID     = 'e7c762fd-13e8-4c92-90c8-ef38866cb053';
// const COMPANY_UID    = '42b94f1a-a395-4f7f-8913-a3c88e343292';
// const AUTH_TOKEN     = 'kjf03byalVWFVCTwlWea21sjGhezL4B0HQbPBhi24WUwEKpEupAm6XDJlYcdHWUO';
// const BASE_URL       = 'https://jtest109.tteld.com/api/dashboards';
// const START_DATE     = '2025-11-20'; // YYYY-MM-DD
// const END_DATE       = '2025-11-21';   // YYYY-MM-DD
// const DAY_ANCHOR_HOUR = 4; // change to 0 for midnight UTC


// const COMPANY_NAME = 'Reliable Trucking Partner 2 Inc';
// const COMPANY_ADDRESS = '799 North Court St Suite-7 Medina, OH 44256'
// const USDOT = '3395902';
// const SUGGESTION_REQUEST_ID = crypto.randomUUID();
// const VEHICLE_ID = 43905;
// const VEHICLE_ID_STRING = "7777"


// const OUT_DIR = path.join(__dirname, 'output');
// if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// const api = axios.create({
//   baseURL: BASE_URL,
//   headers: {
//     Authorization: AUTH_TOKEN,
//     Companyuid: COMPANY_UID,
//     'Content-Type': 'application/json'
//   },
//   timeout: 20000
// });

// function parseDate(s) {

//     if (!s) return null;
//     if (s instanceof Date) return s;
//     const d = new Date(s);
//     if (Number.isNaN(d.getTime())) {
//       return new Date(Date.parse(s));
//     }
//     return d;
// }

//   function mapEventType(log) {
//     const status = (log.status || '').toString().toLowerCase();
  
//     const map = {
//       'sleep': 'DutySleeper',
//       'driving': 'DutyDriving',
//       'on': 'DutyOn',
//       'off': 'DutyOff',
//       'adverse': 'AdverseDrivingConditions'
//       // 'shorthaul': 'ShortHaulExemption'
//     };
  
//     if (map[status]) return map[status];

//     if (log.event_code === 2 && log.event_type === 1) return 'DutySleeper';
//     else if (log.event_code === 3 && log.event_type === 1) return 'DutyDriving';
//     else if (log.event_code === 1 && log.event_type === 1) return 'DutyOff';
//     else if (log.event_code === 0 && log.event_type === 11) return 'AdverseDrivingConditions';
//     else return 'DutyOn';

    
//   }

//   function utcAnchorForDate(isoDateYYYYMMDD, anchorHour = DAY_ANCHOR_HOUR) {
//     const parts = isoDateYYYYMMDD.split('-').map(Number);
//     const [y, m, d] = parts;
//     return new Date(Date.UTC(y, m - 1, d, anchorHour, 0, 0, 0));
//   }

// function convertDayLogsForTargetDate(rawLogs, targetIsoDate, opts = {}) {
//     if (!Array.isArray(rawLogs) || rawLogs.length === 0) return null;
  
//     const anchor = utcAnchorForDate(targetIsoDate, opts.anchorHour ?? DAY_ANCHOR_HOUR);
//     const windowStartMs = anchor.getTime();
//     const windowEndMs = windowStartMs + 24 * 3600 * 1000;
  
//     // We will allow 'info' / adverse logs (event_type=11,event_code=0) even if they lack an end_date
//     const parsed = rawLogs
//       .map(l => {
//         const __start = parseDate(l.start_date);
//         const __end = parseDate(l.end_date);
//         return { ...l, __start, __end };
//       })
//       .filter(l => {
//         // Keep logs that have both start and end and overlap the window
//         if (l.__start && l.__end) {
//           return (l.__end.getTime() > windowStartMs) && (l.__start.getTime() < windowEndMs);
//         }

//         // Special-case: adverse driving conditions info logs (event_type===11 && event_code===0)
//         // These may be "info" records without an end_date; keep them if they have a start_date
//         if ((l.event_type === 11 && l.event_code === 0) && l.__start) {
//           // check if the recordTime falls inside the window
//           const t = l.__start.getTime();
//           return (t >= windowStartMs) && (t < windowEndMs);
//         }

//         return false;
//       })
//       .sort((a, b) => {
//         const ta = a.__start ? a.__start.getTime() : 0;
//         const tb = b.__start ? b.__start.getTime() : 0;
//         const t = ta - tb;
//         if (t !== 0) return t;
//         if (a.client_id && b.client_id) return a.client_id.localeCompare(b.client_id);
//         return (a.id || 0) - (b.id || 0);
//       });
  
//     if (parsed.length === 0) return null;

//     const events = [];
//     let lastSeconds = -1;
//     for (let i = 0; i < parsed.length; i++) {
//       const l = parsed[i];
  
//       // Handle special adverse-driving "info" log (event_type=11 && event_code=0)
//       if (l.event_type === 11 && l.event_code === 0 && l.__start) {
//         // recordTime string in format YYYY-MM-DDTHH:mm:ss (no trailing Z) per user's request
//         const recordTimeStr = l.__start.toISOString().slice(0, 19);

//         const effectiveMs = Math.max(l.__start.getTime(), windowStartMs);
//         if (effectiveMs >= windowEndMs) continue;

//         let seconds = Math.floor((effectiveMs - windowStartMs) / 1000);
//         if (seconds < 0) seconds = 0;
//         if (i === 0) seconds = 0;
//         if (seconds <= lastSeconds) seconds = lastSeconds + 1;
//         lastSeconds = seconds;

//         events.push({
//           // keep the same basic shape as other events, but add recordTime and attributes
//           startTimeSeconds: seconds,
//           eventType: mapEventType(l), // should be 'AdverseDrivingConditions'
//           uniqueId: null,
//           vehicleId: VEHICLE_ID,
//           treatedEventType: null,
//           odometer: null,
//           engineHours: null,
//           textLocation: null,
//           notes: l.notes || "adverse-info",
//           // special fields for info adverse record
//           recordTime: recordTimeStr,
//           attributes: ["AdverseDrivingConditions"]
//         });

//         continue; // move to next log
//       }
  
//       const effectiveStartMs = Math.max(l.__start.getTime(), windowStartMs);
//       if (effectiveStartMs >= windowEndMs) continue;
  
//       let seconds = Math.floor((effectiveStartMs - windowStartMs) / 1000);
//       if (seconds < 0) seconds = 0;
  
//       if (i === 0) seconds = 0;
  
//       if (seconds <= lastSeconds) seconds = lastSeconds + 1;
//       lastSeconds = seconds;
  
//       events.push({
//         startTimeSeconds: seconds,
//         eventType: mapEventType(l),
//         uniqueId: null,
//         vehicleId: VEHICLE_ID,
//         treatedEventType: null,
//         odometer: null,
//         engineHours: null,
//         textLocation: null,
//         notes: l.notes || "test"
//       });
//     }
  
//     if (events.length === 0) return null;
  
//     const odomStart = 0;
//     const odomEnd = 0;
  
//     const canon = JSON.stringify(events);
//     const dataHash = crypto.createHash('md5').update(canon).digest('hex');
  
//     const out = {
//       dataHash,
//       events,
//       form: {
//         companyName: COMPANY_NAME,
//         companyAddress: COMPANY_ADDRESS,
//         homeTerminalAddress: "",
//         fromAddress: "",
//         toAddress: "",
//         distance: null,
//         usdot: USDOT,
//         notes: "",
//         coDriverId: null,
//         vehicles: [
//           {
//             id: VEHICLE_ID,
//             vehicleId: VEHICLE_ID_STRING,
//             odometers: [{ start: odomStart, end: odomEnd }]
//           }
//         ],
//         trailers: [],
//         shippingDocuments: []
//       },
//       maxTimeOffset: -1,
//       reassignEvents: [],
//       suggestionRequestId: SUGGESTION_REQUEST_ID
//     };
  
//     return out;
// }

// async function fetchDailyLogs(driverUid, dateYYYYMMDD) {
//   const day = dayjs(dateYYYYMMDD).format('DD-MM-YYYY');
//   const url = `/get-daily-logs/${driverUid}/${day}?mode=inject_requested`;
//   const resp = await api.get(url);
//   return resp.data?.logs ?? [];
// }


// (async function main() {
//   console.log('Starting fetch & convert...');
//   let date = dayjs(START_DATE);
//   const last = dayjs(END_DATE);

//   while (date.isSameOrBefore(last, 'day')) {
//     const isoDate = date.format('YYYY-MM-DD');
//     try {
//       console.log(`Fetching logs for ${isoDate} ...`);
//       const rawLogs = await fetchDailyLogs(DRIVER_UID, isoDate);

//       if (!rawLogs || rawLogs.length === 0) {
//         console.log(`  No logs for ${isoDate} (skipping).`);
//       } else {
//         const converted = convertDayLogsForTargetDate(rawLogs, isoDate, {
//             companyName: COMPANY_NAME,
//             usdot: USDOT,
//             suggestionRequestId: SUGGESTION_REQUEST_ID,
//             anchorHour: DAY_ANCHOR_HOUR
//           });

//         if (!converted) {
//           console.log(`  Conversion produced no output for ${isoDate}.`);
//         } else {
//           const outPath = path.join(OUT_DIR, `${isoDate}-converted.json`);
//           fs.writeFileSync(outPath, JSON.stringify(converted, null, 2), 'utf8');
//           console.log(`  Wrote converted file: ${outPath}  (events: ${converted.events.length})`);
//         }
//       }
//     } catch (err) {
//       console.error(`Error fetching/converting ${isoDate}:`, (err.response && err.response.data) ? err.response.data : err.message);
//     }

//     date = date.add(1, 'day');
//   }

//   console.log('All done.');
// })();
