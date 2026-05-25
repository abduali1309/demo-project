// /**
//  * sync-trackings-to-location-save.js
//  *
//  * Node 18+ (uses global fetch).
//  *
//  * Usage:
//  *   1) Create a .env file or export environment variables (examples below).
//  *   2) node sync-trackings-to-location-save.js
//  *
//  * Environment variables (recommended):
//  *   GETTRACKINGS_BASE    e.g. https://front-api-aws.tteld.com/api/dashboards/v2/gettrackings
//  *   DRIVER_UUID          e.g. b92e1a05-7f56-4b66-8f32-92c855f43024
//  *   GETTRACKINGS_DATE    e.g. 2025-10-01T11:00:00.000Z
//  *   GETTRACKINGS_AUTH    Bearer token or raw Authorization header value
//  *   COMPANYUID           companyuid header value (optional)
//  *
//  *   LOCATION_SAVE_BASE   e.g. https://us.tteld.com/api/location/save
//  *   ACCESS_TOKEN         ?accessToken= value (required by location/save query)
//  *   REQUEST_ID           ?request_id= value (you can generate a UUID per run)
//  *
//  *   DRIVER_ID_HEADER     numeric driverid value to send in the header (e.g. 97631)
//  *   DEVICE_TYPE_HEADER   devicetype header (default "mobile")
//  *   PLATFORM_HEADER      platform header (default "ANDROID")
//  *   VERSIONCODE_HEADER   versioncode header (default "727")
//  *   VERSIONNAME_HEADER   versionname header (default "4.11.2-DEBUG")
//  *
//  *   CONCURRENCY          number of concurrent requests (default 5)
//  *   BATCH_SIZE           how many tracking items to include in each POST (default 1)
//  *   DRY_RUN              if "true" will not POST (default false)
//  */

// import fs from "fs";
// import { setTimeout as wait } from "timers/promises";
// import crypto from "crypto";

// const env = process.env;

// // Load .env if present (simple)
// try {
//   if (fs.existsSync(".env")) {
//     const dot = fs.readFileSync(".env", "utf8");
//     dot.split(/\r?\n/).forEach((line) => {
//       const m = line.match(/^\s*([^=#]+)\s*=\s*(.*)\s*$/);
//       if (m) {
//         const k = m[1];
//         let v = m[2];
//         if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
//         process.env[k] = v;
//       }
//     });
//   }
// } catch (e) {
//   console.warn("Could not read .env file:", e.message);
// }

// const CONFIG = {
//   GETTRACKINGS_BASE: process.env.GETTRACKINGS_BASE || "https://front-api-aws.tteld.com/api/dashboards/v2/gettrackings",
//   DRIVER_UUID: process.env.DRIVER_UUID,
//   GETTRACKINGS_AUTH: process.env.GETTRACKINGS_AUTH,
//   COMPANYUID: process.env.COMPANYUID,
//   LOCATION_SAVE_BASE: process.env.LOCATION_SAVE_BASE || "https://us.tteld.com/api/location/save",
//   ACCESS_TOKEN: process.env.ACCESS_TOKEN,
//   VEHICLE_ID: process.env.VEHICLE_ID,
//   VIN_NUMBER: process.env.VIN_NUMBER,
//   COMPANYID: process.env.COMPANYID,
//   START_DATE: process.env.START_DATE,
//   END_DATE: process.env.END_DATE,


//   //
//   REQUEST_ID: process.env.REQUEST_ID || crypto.randomUUID(),
//   DRIVER_ID_HEADER: process.env.DRIVER_ID_HEADER || "97631",
//   DEVICE_TYPE_HEADER: process.env.DEVICE_TYPE_HEADER || "mobile",
//   PLATFORM_HEADER: process.env.PLATFORM_HEADER || "ANDROID",
//   VERSIONCODE_HEADER: process.env.VERSIONCODE_HEADER || "727",
//   VERSIONNAME_HEADER: process.env.VERSIONNAME_HEADER || "4.11.2-DEBUG",
//   CONCURRENCY: parseInt(process.env.CONCURRENCY || "5", 10),
//   BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "1", 10),
//   DRY_RUN: (process.env.DRY_RUN || "false").toLowerCase() === "true",
//   MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "3", 10),
//   RETRY_BASE_MS: parseInt(process.env.RETRY_BASE_MS || "500", 10),
// };

// if (!CONFIG.DRIVER_UUID || !CONFIG.START_DATE || !CONFIG.END_DATE) {
//   console.error("ERROR: DRIVER_UUID and START_DATE and END_DATE are required. Set them in env or .env file.");
//   console.error("Example .env lines:");
//   console.error('GETTRACKINGS_DATE="2025-10-01T11:00:00.000Z"');
//   console.error('DRIVER_UUID="b92e1a05-7f56-4b66-8f32-92c855f43024"');
//   process.exit(1);
// }
// if (!CONFIG.ACCESS_TOKEN) {
//   console.error("ERROR: ACCESS_TOKEN is required for location/save query parameter.");
//   process.exit(1);
// }

// function buildGettrackingsUrl() {
//   // e.g. `${base}/${driverUuid}/${date}`
//   const base = CONFIG.GETTRACKINGS_BASE.replace(/\/$/, "");
//   const url = `${base}/${CONFIG.DRIVER_UUID}/${CONFIG.GETTRACKINGS_DATE}`;
//   return url;
// }


// function generateDateRange(start, end) {
//     const out = [];
//     let current = new Date(start + "T11:00:00.000Z"); // custom hour
//     const endDate = new Date(end + "T11:00:00.000Z");
  
//     while (current <= endDate) {
//       out.push(current.toISOString());
//       current.setUTCDate(current.getUTCDate() + 1);
//     }
//     return out;
//   }
  

// async function fetchGettrackings() {
//   const url = buildGettrackingsUrl();
//   console.log("Fetching gettrackings from:", url);
//   const headers = {
//     accept: "application/json, text/plain, */*",
//     "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,ru;q=0.7",
//     "cache-control": "no-cache, no-store, must-revalidate",
//     "sec-fetch-dest": "empty",
//     "sec-fetch-mode": "cors",
//     "sec-fetch-site": "same-site",
//   };
//   if (CONFIG.GETTRACKINGS_AUTH) headers.authorization = CONFIG.GETTRACKINGS_AUTH;
//   if (CONFIG.COMPANYUID) headers.companyuid = CONFIG.COMPANYUID;

//   const res = await fetch(url, { headers });
//   if (!res.ok) {
//     const txt = await res.text().catch(() => "");
//     throw new Error(`Failed to fetch gettrackings: ${res.status} ${res.statusText} - ${txt}`);
//   }
//   const json = await res.json();
//   if (!Array.isArray(json)) {
//     throw new Error("Expected array from gettrackings, got: " + JSON.stringify(typeof json));
//   }
//   return json;
// }

// function mapTrackingToLocationPayload(item) {
//   // Map fields from gettrackings item to the location/save payload shape.
//   // The location/save API sample used an array with one object; we build one object per tracking.
//   // Note: you can add extra static fields to the returned object below.
//   const coordinates =
//     item.gps_coordinates && typeof item.gps_coordinates === "object" && item.gps_coordinates.lat != null
//       ? item.gps_coordinates
//       : item.coordinates && typeof item.coordinates === "object" && item.coordinates.lat != null
//       ? item.coordinates
//       : null;

//   const payload = {
//     // Fields required by location/save:
//     address: item.address ?? "",
//     coordinates: coordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null,
//     date: item.date ?? item.createdAt ?? new Date().toISOString(),
//     rotation: item.rotation ?? 0,
//     speed: item.speed ?? item.gps_speed ?? item.eld_speed ?? 16,
//     gps_speed: item.gps_speed ?? null,
//     eld_speed: item.eld_speed ?? null,
//     delta_distance: item.delta_distance ?? 0,
//     engine_hours: item.engine_hours ?? item.engineHours ?? 0,
//     state: item.state ?? null,
//     vehicleId: CONFIG.VEHICLE_ID ?? null,
//     odometr: item.odometr ?? item.odometer ?? 0,
//     source: item.source ?? "gps",
//     eld_connection: !!item.eld_connection,
//     is_live: item.is_live ?? true,
//     vin_number: CONFIG.VIN_NUMBER ?? null,
//     companyId: CONFIG.COMPANYID ?? null,
//     // keep original id for traceability
//     // original_tracking_id: item.id ?? null,
//     // debug_info field: include a compact JSON with some diagnostic values
//     debug_info: JSON.stringify({
//       original_updatedAt: item.updatedAt ?? null,
//       original_createdAt: item.createdAt ?? null,
//       mappedAt: new Date().toISOString(),
//     }),
//     force: false,
//     // any other static fields you want to add can be appended here
//   };

//   return payload;
// }

// function chunkArray(arr, size) {
//   const out = [];
//   for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
//   return out;
// }

// async function postLocationBatch(batchPayloadArray) {
//   // Posts an array of payload objects (the API sample sends an array).
//   const query = `?accessToken=${encodeURIComponent(CONFIG.ACCESS_TOKEN)}&request_id=${encodeURIComponent(CONFIG.REQUEST_ID)}`;
//   const url = `${CONFIG.LOCATION_SAVE_BASE}${query}`;

//   const headers = {
//     "content-type": "application/json; charset=UTF-8",
//     devicetype: CONFIG.DEVICE_TYPE_HEADER,
//     driverid: CONFIG.DRIVER_ID_HEADER,
//     platform: CONFIG.PLATFORM_HEADER,
//     versioncode: CONFIG.VERSIONCODE_HEADER,
//     versionname: CONFIG.VERSIONNAME_HEADER,
//   };

//   if (CONFIG.DRY_RUN) {
//     console.log("[DRY RUN] Would POST to", url);
//     console.log("Headers:", headers);
//     console.log("Payload (first item):", JSON.stringify(batchPayloadArray[0], null, 2));
//     return { ok: true, status: 0, body: null };
//   }

//   const res = await fetch(url, {
//     method: "POST",
//     headers,
//     body: JSON.stringify(batchPayloadArray),
//   });

//   const text = await res.text().catch(() => "");
//   const body = (() => {
//     try {
//       return JSON.parse(text);
//     } catch {
//       return text;
//     }
//   })();

//   return { ok: res.ok, status: res.status, statusText: res.statusText, body };
// }

// async function withRetries(fn, maxRetries = 3, baseMs = 500) {
//   let attempt = 0;
//   while (true) {
//     try {
//       return await fn();
//     } catch (err) {
//       attempt++;
//       if (attempt > maxRetries) throw err;
//       const backoff = baseMs * 2 ** (attempt - 1);
//       console.warn(`Attempt ${attempt} failed: ${err.message}. Retrying after ${backoff}ms...`);
//       await wait(backoff);
//     }
//   }
// }

// async function main() {
//   try {
//     let allItems = [];

//     if (CONFIG.START_DATE && CONFIG.END_DATE) {
//       const dates = generateDateRange(CONFIG.START_DATE, CONFIG.END_DATE);
//       console.log(`Processing date range ${CONFIG.START_DATE} → ${CONFIG.END_DATE}`);
//       console.log(`Total days: ${dates.length}`);
    
//       for (const dateISO of dates) {
//         process.env.GETTRACKINGS_DATE = dateISO;
//         console.log(`\n--- Fetching date: ${dateISO.slice(0, 10)} ---`);
    
//         const dayItems = await fetchGettrackings();
//         console.log(`Fetched ${dayItems.length} items for that day.`);
    
//         allItems.push(...dayItems);
//       }
    
//     } else {
//       // Single-day fallback
//       const items = await fetchGettrackings();
//       allItems = items;
//     }
    
//     console.log(`\nTOTAL TRACKING ITEMS = ${allItems.length}`);

//     // map
//     const mapped = items.map(mapTrackingToLocationPayload);

//     // chunk into batches (BATCH_SIZE)
//     const batches = chunkArray(mapped, CONFIG.BATCH_SIZE);
//     console.log(`Sending ${batches.length} batches (batch size = ${CONFIG.BATCH_SIZE}). Concurrency = ${CONFIG.CONCURRENCY}`);

//     let running = 0;
//     let index = 0;
//     const results = [];
//     const errors = [];

//     async function runNext() {
//       if (index >= batches.length) return;
//       const batchIndex = index++;
//       const batch = batches[batchIndex];

//       running++;
//       try {
//         const attemptFn = async () => {
//           // wrap post with retries
//           const res = await postLocationBatch(batch);
//           if (!res.ok) {
//             const errTxt = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
//             throw new Error(`POST failed status=${res.status} body=${errTxt}`);
//           }
//           return res;
//         };
//         const r = await withRetries(attemptFn, CONFIG.MAX_RETRIES, CONFIG.RETRY_BASE_MS);
//         console.log(`Batch ${batchIndex + 1}/${batches.length} -> OK (items=${batch.length})`);
//         results.push({ batchIndex, ok: true, res: r });
//       } catch (err) {
//         console.error(`Batch ${batchIndex + 1}/${batches.length} -> FAILED: ${err.message}`);
//         errors.push({ batchIndex, error: err.message, batch });
//       } finally {
//         running--;
//         // start next in chain
//         await runNext();
//       }
//     }

//     // start initial concurrency
//     const starters = [];
//     for (let i = 0; i < Math.min(CONFIG.CONCURRENCY, batches.length); i++) starters.push(runNext());
//     await Promise.all(starters);

//     console.log("All batches processed.");
//     console.log(`Successes: ${results.length}, Failures: ${errors.length}`);
//     if (errors.length > 0) {
//       console.log("Sample failures:");
//       console.log(errors.slice(0, 5).map((e) => ({ batchIndex: e.batchIndex, error: e.error })));
//     }
//   } catch (err) {
//     console.error("Fatal error:", err);
//     process.exit(1);
//   }
// }

// main();






///////////////////////////////////////////// Ishlidi pastdagi kod  /////////////////////////////////////////////


// /**
//  * sync-trackings-to-location-save.js
//  *
//  * Node 18+ (uses global fetch).
//  *
//  * Saves per-day gettrackings -> location/save.
//  *
//  * Supports:
//  *   - START_DATE (YYYY-MM-DD) and END_DATE (YYYY-MM-DD) OR
//  *   - GETTRACKINGS_DATE (full ISO e.g. 2025-10-01T11:00:00.000Z)
//  *   - GETTRACKINGS_TIME (time part, e.g. 11:00:00.000Z or 11:00:00)
//  *
//  * See sample .env below the script.
//  */

// import fs from "fs";
// import { setTimeout as wait } from "timers/promises";
// import crypto from "crypto";

// const env = process.env;

// // Simple .env loader (supports full-line comments starting with #)
// try {
//   if (fs.existsSync(".env")) {
//     const dot = fs.readFileSync(".env", "utf8");
//     dot.split(/\r?\n/).forEach((line) => {
//       const trimmed = line.trim();
//       if (!trimmed || trimmed.startsWith("#")) return;
//       const m = line.match(/^\s*([^=#]+)\s*=\s*(.*)\s*$/);
//       if (m) {
//         const k = m[1].trim();
//         let v = m[2].trim();
//         // strip surrounding quotes if present
//         if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
//           v = v.slice(1, -1);
//         }
//         process.env[k] = v;
//       }
//     });
//   }
// } catch (e) {
//   console.warn("Could not read .env file:", e.message);
// }

// const CONFIG = {
//   GETTRACKINGS_BASE: process.env.GETTRACKINGS_BASE || "https://front-api-aws.tteld.com/api/dashboards/v2/gettrackings",
//   DRIVER_UUID: process.env.DRIVER_UUID,
//   // Single-date fallback (full ISO)
//   GETTRACKINGS_DATE: process.env.GETTRACKINGS_DATE,
//   // Date range (YYYY-MM-DD)
//   START_DATE: process.env.START_DATE,
//   END_DATE: process.env.END_DATE,
//   // Time-of-day to append to date when using range. Could be "11:00:00.000Z" or "11:00:00"
//   GETTRACKINGS_TIME: process.env.GETTRACKINGS_TIME || "11:00:00.000Z",

//   GETTRACKINGS_AUTH: process.env.GETTRACKINGS_AUTH,
//   COMPANYUID: process.env.COMPANYUID,

//   LOCATION_SAVE_BASE: process.env.LOCATION_SAVE_BASE || "https://us.tteld.com/api/location/save",
//   ACCESS_TOKEN: process.env.ACCESS_TOKEN,
//   VEHICLE_ID: process.env.VEHICLE_ID,
//   VIN_NUMBER: process.env.VIN_NUMBER,
//   COMPANYID: process.env.COMPANYID,

//   REQUEST_ID: process.env.REQUEST_ID || crypto.randomUUID(),
//   DRIVER_ID_HEADER: process.env.DRIVER_ID_HEADER || "97631",
//   DEVICE_TYPE_HEADER: process.env.DEVICE_TYPE_HEADER || "mobile",
//   PLATFORM_HEADER: process.env.PLATFORM_HEADER || "ANDROID",
//   VERSIONCODE_HEADER: process.env.VERSIONCODE_HEADER || "727",
//   VERSIONNAME_HEADER: process.env.VERSIONNAME_HEADER || "4.11.2-DEBUG",
//   CONCURRENCY: parseInt(process.env.CONCURRENCY || "5", 10),
//   BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "1", 10),
//   DRY_RUN: (process.env.DRY_RUN || "false").toLowerCase() === "true",
//   MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "3", 10),
//   RETRY_BASE_MS: parseInt(process.env.RETRY_BASE_MS || "500", 10),
// };

// if (!CONFIG.DRIVER_UUID) {
//   console.error("ERROR: DRIVER_UUID is required. Set it in env or .env file.");
//   process.exit(1);
// }
// if (!CONFIG.ACCESS_TOKEN) {
//   console.error("ERROR: ACCESS_TOKEN is required for location/save query parameter.");
//   process.exit(1);
// }

// /** Normalize time piece, returns something like "11:00:00.000Z" or "11:00:00" */
// function normalizeTimePiece(time) {
//   if (!time) return "11:00:00.000Z";
//   let t = time.trim();
//   if (t.startsWith("T")) t = t.slice(1);
//   // if already ends with Z or contains milliseconds, keep
//   if (/\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(t)) {
//     return t;
//   }
//   // fallback
//   return "11:00:00.000Z";
// }

// /** Generate list of date strings YYYY-MM-DD inclusive */
// function generateDateRange(startYYYYMMDD, endYYYYMMDD) {
//   const out = [];
//   const normalize = (d) => new Date(d + "T00:00:00Z");
//   let cur = normalize(startYYYYMMDD);
//   const end = normalize(endYYYYMMDD);
//   if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) {
//     throw new Error("Invalid START_DATE or END_DATE format. Expected YYYY-MM-DD");
//   }
//   while (cur <= end) {
//     const y = cur.getUTCFullYear();
//     const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
//     const day = String(cur.getUTCDate()).padStart(2, "0");
//     out.push(`${y}-${m}-${day}`);
//     cur.setUTCDate(cur.getUTCDate() + 1);
//   }
//   return out;
// }

// /** Build URL for a specific ISO datetime string (full ISO) */
// function buildGettrackingsUrl(dateIsoString) {
//   const base = CONFIG.GETTRACKINGS_BASE.replace(/\/$/, "");
//   // dateIsoString must be URL-safe; we will encode it
//   return `${base}/${CONFIG.DRIVER_UUID}/${encodeURIComponent(dateIsoString)}`;
// }

// async function fetchGettrackingsByIso(dateIsoString) {
//   const url = buildGettrackingsUrl(dateIsoString);
//   console.log("Fetching gettrackings from:", url);
//   const headers = {
//     // accept: "application/json, text/plain, */*",
//     // "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,ru;q=0.7",
//     // "cache-control": "no-cache, no-store, must-revalidate",
//     // "sec-fetch-dest": "empty",
//     // "sec-fetch-mode": "cors",
//     // "sec-fetch-site": "same-site",
//   };
//   if (CONFIG.GETTRACKINGS_AUTH) headers.authorization = CONFIG.GETTRACKINGS_AUTH;
//   if (CONFIG.COMPANYUID) headers.companyuid = CONFIG.COMPANYUID;

//   const res = await fetch(url, { headers });
  
//   if (!res.ok) {
//     const txt = await res.text().catch(() => "");
//     throw new Error(`Failed to fetch gettrackings: ${res.status} ${res.statusText} - ${txt}`);
//   }
//   const json = await res.json();
//   if (!Array.isArray(json)) {
//     throw new Error("Expected array from gettrackings, got: " + JSON.stringify(typeof json));
//   }
//   return json;
// }

// function mapTrackingToLocationPayload(item) {
//   const coordinates =
//     item.gps_coordinates && typeof item.gps_coordinates === "object" && item.gps_coordinates.lat != null
//       ? item.gps_coordinates
//       : item.coordinates && typeof item.coordinates === "object" && item.coordinates.lat != null
//       ? item.coordinates
//       : null;

//   const payload = {
//     address: item.address ?? "",
//     coordinates: coordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null,
//     date: item.date ?? item.createdAt ?? new Date().toISOString(),
//     rotation: item.rotation ?? 0,
//     speed: item.speed ?? item.gps_speed ?? item.eld_speed ?? 16,
//     gps_speed: item.gps_speed ?? null,
//     eld_speed: item.eld_speed ?? null,
//     delta_distance: item.delta_distance ?? 0,
//     engine_hours: item.engine_hours ?? item.engineHours ?? 0,
//     state: item.state ?? null,
//     vehicleId: CONFIG.VEHICLE_ID ?? null,
//     odometr: item.odometr ?? item.odometer ?? 0,
//     source: item.source ?? "gps",
//     eld_connection: !!item.eld_connection,
//     is_live: item.is_live ?? true,
//     vin_number: CONFIG.VIN_NUMBER ?? null,
//     companyId: CONFIG.COMPANYID ?? null,
//     debug_info: JSON.stringify({
//       original_debug_info: item.debug_info ?? null,
//       original_updatedAt: item.updatedAt ?? null,
//       original_createdAt: item.createdAt ?? null,
//       mappedAt: new Date().toISOString(),
//     }),
//     force: false,
//   };

//   return payload;
// }

// function chunkArray(arr, size) {
//   const out = [];
//   for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
//   return out;
// }

// async function postLocationBatch(batchPayloadArray) {
//   const query = `?accessToken=${encodeURIComponent(CONFIG.ACCESS_TOKEN)}&request_id=${encodeURIComponent(CONFIG.REQUEST_ID)}`;
//   const url = `${CONFIG.LOCATION_SAVE_BASE}${query}`;

//   const headers = {
//     "content-type": "application/json; charset=UTF-8",
//     devicetype: CONFIG.DEVICE_TYPE_HEADER,
//     driverid: CONFIG.DRIVER_ID_HEADER,
//     platform: CONFIG.PLATFORM_HEADER,
//     versioncode: CONFIG.VERSIONCODE_HEADER,
//     versionname: CONFIG.VERSIONNAME_HEADER,
//   };

//   if (CONFIG.DRY_RUN) {
//     console.log("[DRY RUN] Would POST to", url);
//     console.log("Headers:", headers);
//     console.log("Payload (first item):", JSON.stringify(batchPayloadArray[0], null, 2));
//     return { ok: true, status: 0, body: null };
//   }

//   const res = await fetch(url, {
//     method: "POST",
//     headers,
//     body: JSON.stringify(batchPayloadArray),
//   });

//   const text = await res.text().catch(() => "");
//   const body = (() => {
//     try {
//       return JSON.parse(text);
//     } catch {
//       return text;
//     }
//   })();

//   return { ok: res.ok, status: res.status, statusText: res.statusText, body };
// }

// async function withRetries(fn, maxRetries = 3, baseMs = 500) {
//   let attempt = 0;
//   while (true) {
//     try {
//       return await fn();
//     } catch (err) {
//       attempt++;
//       if (attempt > maxRetries) throw err;
//       const backoff = baseMs * 2 ** (attempt - 1);
//       console.warn(`Attempt ${attempt} failed: ${err.message}. Retrying after ${backoff}ms...`);
//       await wait(backoff);
//     }
//   }
// }

// async function processTrackings() {
//     try {
//       console.log("→ Building gettrackings URL...");
  
//       // Build URL
//       const base = CONFIG.GETTRACKINGS_BASE.replace(/\/$/, "");
//       const url = `${base}/${CONFIG.DRIVER_UUID}/${CONFIG.GETTRACKINGS_DATE}`;
  
//       console.log("→ Fetching trackings:", url);
  
//       // Fetch trackings
//       const response = await axios.get(url, {
//         headers: {
//           accept: "application/json, text/plain, */*",
//           authorization: CONFIG.GETTRACKINGS_AUTH,
//           companyuid: CONFIG.COMPANY_UID,
//           origin: "https://app.tteld.com",
//           referer: "https://app.tteld.com/"
//         }
//       });
  
//       const trackings = response.data;
  
//       if (!Array.isArray(trackings) || trackings.length === 0) {
//         console.log("⚠ No trackings found");
//         return;
//       }
  
//       console.log(`→ ${trackings.length} trackings received`);
  
//       // Send each tracking to location/save
//       for (const t of trackings) {
//         const payload = {
//           address: t.address ?? "",
//           coordinates: {
//             lat: t.coordinates?.lat ?? t.gps_coordinates?.lat ?? 0,
//             lng: t.coordinates?.lng ?? t.gps_coordinates?.lng ?? 0
//           },
//           date: t.date,               // MUST KEEP EXACT DATE
//           delta_distance: t.delta_distance ?? 0,
//           eld_connection: t.eld_connection ?? false,
//           engine_hours: t.engine_hours ?? 0,
//           odometr: t.odometr ?? 0,
//           rotation: t.rotation ?? 0,
//           speed: t.speed ?? 0,
//           source: t.source ?? "gps",
//           vehicleId: t.vehicleId,
//           vin_number: t.vin_number,
//           companyId: t.companyId,
  
//           // fields provided by you
//           gps_speed: t.speed ?? 0,
//           eld_speed: t.speed ?? 0,
//           is_live: true,
//           force: false
//         };
  
//         console.log("→ Sending location/save for date:", t.date);
  
//         await axios.post(
//           `${CONFIG.LOCATION_SAVE_BASE}?accessToken=${CONFIG.ACCESS_TOKEN}`,
//           [payload],
//           {
//             headers: {
//               "content-type": "application/json; charset=UTF-8",
//               devicetype: "mobile",
//               driverid: CONFIG.DRIVER_ID,
//               platform: "ANDROID",
//               versioncode: CONFIG.VERSION_CODE,
//               versionname: CONFIG.VERSION_NAME
//             }
//           }
//         );
//       }
  
//       console.log("✔ All entries sent successfully");
  
//     } catch (error) {
//       console.error("❌ Error in processTrackings:", error.message);
//     }
//   }

// async function main() {
//   try {
//     // prepare date list
//     const timePiece = normalizeTimePiece(CONFIG.GETTRACKINGS_TIME);
//     let dateIsos = [];

//     if (CONFIG.START_DATE && CONFIG.END_DATE) {
//       const days = generateDateRange(CONFIG.START_DATE, CONFIG.END_DATE);
//       console.log(`Processing START_DATE -> END_DATE: ${CONFIG.START_DATE} -> ${CONFIG.END_DATE} (${days.length} day(s))`);
//       for (const day of days) {
//         // combine day + timePiece into a full ISO by letting Date parse then toISOString
//         const parsed = new Date(`${day}T${timePiece}`);
//         if (isNaN(parsed.getTime())) {
//           console.warn("Warning: could not parse date+time:", `${day}T${timePiece}`);
//           continue;
//         }
//         dateIsos.push(parsed.toISOString());
//       }
//     } else if (CONFIG.GETTRACKINGS_DATE) {
//       // single date provided (use as-is)
//       dateIsos = [CONFIG.GETTRACKINGS_DATE];
//       console.log("Processing single GETTRACKINGS_DATE:", CONFIG.GETTRACKINGS_DATE);
//     } else {
//       console.error("ERROR: either START_DATE+END_DATE or GETTRACKINGS_DATE must be set in env.");
//       process.exit(1);
//     }

//     // fetch per date and aggregate
//     const allItems = [];
//     for (const iso of dateIsos) {
//       try {
//         console.log(`\n--- Fetching for ${iso} ---`);
//         const items = await fetchGettrackingsByIso(iso);
//         console.log(`Fetched ${items.length} items for ${iso}`);
//         allItems.push(...items);
//       } catch (err) {
//         console.error(`Failed fetching for ${iso}: ${err.message}`);
//         // continue to next date
//       }
//     }

//     console.log(`\nTOTAL TRACKING ITEMS AGGREGATED = ${allItems.length}`);

//     if (allItems.length === 0) {
//       console.log("No items to send. Exiting.");
//       return;
//     }

//     // map -> payloads
//     const mapped = allItems.map(mapTrackingToLocationPayload);

//     // chunk into batches
//     const batches = chunkArray(mapped, CONFIG.BATCH_SIZE);
//     console.log(`Sending ${batches.length} batches (batch size = ${CONFIG.BATCH_SIZE}). Concurrency = ${CONFIG.CONCURRENCY}`);

//     let index = 0;
//     const results = [];
//     const errors = [];

//     async function runNext() {
//       if (index >= batches.length) return;
//       const batchIndex = index++;
//       const batch = batches[batchIndex];
//       try {
//         const attemptFn = async () => {
//           const res = await postLocationBatch(batch);
//           if (!res.ok) {
//             const errTxt = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
//             throw new Error(`POST failed status=${res.status} body=${errTxt}`);
//           }
//           return res;
//         };
//         const r = await withRetries(attemptFn, CONFIG.MAX_RETRIES, CONFIG.RETRY_BASE_MS);
//         console.log(`Batch ${batchIndex + 1}/${batches.length} -> OK (items=${batch.length})`);
//         results.push({ batchIndex, ok: true, res: r });
//       } catch (err) {
//         console.error(`Batch ${batchIndex + 1}/${batches.length} -> FAILED: ${err.message}`);
//         errors.push({ batchIndex, error: err.message, batch });
//       } finally {
//         // schedule next
//         await runNext();
//       }
//     }

//     // start concurrency runners
//     const starters = [];
//     for (let i = 0; i < Math.min(CONFIG.CONCURRENCY, batches.length); i++) starters.push(runNext());
//     await Promise.all(starters);

//     console.log("All batches processed.");
//     console.log(`Successes: ${results.length}, Failures: ${errors.length}`);
//     if (errors.length > 0) {
//       console.log("Sample failures:", errors.slice(0, 5).map((e) => ({ batchIndex: e.batchIndex, error: e.error })));
//     }
//   } catch (err) {
//     console.error("Fatal error:", err);
//     process.exit(1);
//   }
// }

// main();





// /**
//  * sync-trackings-to-location-save.js
//  *
//  * Node 18+ (uses global fetch).
//  *
//  * Added: support for fetching tracking data from report-calculate API
//  * (single call that returns {"tracking": [...]}) and then sending those
//  * items to location/save exactly as before.
//  *
//  * New optional env vars:
//  *   REPORT_BASE            e.g. https://j7.tteld.com/test/report-calcuate/
//  *   REPORT_KEY             query key param (example I4LXkw...)
//  *   REPORT_VEHICLE_ID      vehicleId for report API (fallback to VEHICLE_ID)
//  *   REPORT_COMPANY_ID      companyId for report API (fallback to COMPANYID)
//  *   REPORT_AUTH            Authorization header value for report API (optional)
//  *
//  * If REPORT_BASE is set, the script will call the report-calculate API
//  * with from_date/to_date derived from START_DATE/END_DATE and use the returned
//  * tracking array. (It will not perform per-day gettrackings calls.)
//  */

// import fs from "fs";
// import { setTimeout as wait } from "timers/promises";
// import crypto from "crypto";

// const env = process.env;

// // load .env (simple)
// try {
//   if (fs.existsSync(".env")) {
//     const dot = fs.readFileSync(".env", "utf8");
//     dot.split(/\r?\n/).forEach((line) => {
//       const trimmed = line.trim();
//       if (!trimmed || trimmed.startsWith("#")) return;
//       const m = line.match(/^\s*([^=#]+)\s*=\s*(.*)\s*$/);
//       if (m) {
//         const k = m[1].trim();
//         let v = m[2].trim();
//         if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
//           v = v.slice(1, -1);
//         }
//         process.env[k] = v;
//       }
//     });
//   }
// } catch (e) {
//   console.warn("Could not read .env file:", e.message);
// }

// const CONFIG = {
//   // GETTRACKINGS_BASE: process.env.GETTRACKINGS_BASE || "https://front-api-aws.tteld.com/api/dashboards/v2/gettrackings",
//   // DRIVER_UUID: process.env.DRIVER_UUID,
//   // GETTRACKINGS_DATE: process.env.GETTRACKINGS_DATE,
//   START_DATE: process.env.START_DATE,
//   END_DATE: process.env.END_DATE,
//   // GETTRACKINGS_TIME: process.env.GETTRACKINGS_TIME || "11:00:00.000Z",
//   // GETTRACKINGS_AUTH: process.env.GETTRACKINGS_AUTH,
//   // COMPANYUID: process.env.COMPANYUID,

//   // location/save
//   LOCATION_SAVE_BASE: process.env.LOCATION_SAVE_BASE || "https://us.tteld.com/api/location/save",
//   ACCESS_TOKEN: process.env.ACCESS_TOKEN,
//   VEHICLE_ID: process.env.VEHICLE_ID,
//   VIN_NUMBER: process.env.VIN_NUMBER,
//   COMPANYID: process.env.COMPANYID,

//   REQUEST_ID: process.env.REQUEST_ID || crypto.randomUUID(),
//   DRIVER_ID_HEADER: process.env.DRIVER_ID_HEADER || "97631",
//   DEVICE_TYPE_HEADER: process.env.DEVICE_TYPE_HEADER || "mobile",
//   PLATFORM_HEADER: process.env.PLATFORM_HEADER || "ANDROID",
//   VERSIONCODE_HEADER: process.env.VERSIONCODE_HEADER || "727",
//   VERSIONNAME_HEADER: process.env.VERSIONNAME_HEADER || "4.11.2-DEBUG",
//   CONCURRENCY: parseInt(process.env.CONCURRENCY || "5", 10),
//   BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "1", 10),
//   DRY_RUN: (process.env.DRY_RUN || "false").toLowerCase() === "true",
//   MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "3", 10),
//   RETRY_BASE_MS: parseInt(process.env.RETRY_BASE_MS || "500", 10),

//   // report-calculate specific (new)
//   REPORT_BASE: process.env.REPORT_BASE || process.env.REPORT_CALC_BASE || "",
//   REPORT_KEY: process.env.REPORT_KEY || process.env.REPORT_CALC_KEY || "",
//   REPORT_VEHICLE_ID: process.env.REPORT_VEHICLE_ID || process.env.REPORT_VEHICLE || process.env.VEHICLE_ID || "",
//   REPORT_COMPANY_ID: process.env.REPORT_COMPANY_ID || process.env.REPORT_COMPANY || process.env.COMPANYID || "",
//   REPORT_AUTH: process.env.REPORT_AUTH || process.env.REPORT_CALC_AUTH || "",
// };

// // if (!CONFIG.DRIVER_UUID) {
// //   console.error("ERROR: DRIVER_UUID is required in env.");
// //   process.exit(1);
// // }
// if (!CONFIG.ACCESS_TOKEN) {
//   console.error("ERROR: ACCESS_TOKEN is required in env (for location/save).");
//   process.exit(1);
// }

// /* ---------- helpers ---------- */

// function normalizeTimePiece(time) {
//   if (!time) return "11:00:00.000Z";
//   let t = time.trim();
//   if (t.startsWith("T")) t = t.slice(1);
//   if (/\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(t)) return t;
//   return "11:00:00.000Z";
// }

// function generateDateRange(startYYYYMMDD, endYYYYMMDD) {
//   const out = [];
//   const normalize = (d) => new Date(d + "T00:00:00Z");
//   let cur = normalize(startYYYYMMDD);
//   const end = normalize(endYYYYMMDD);
//   if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()))
//     throw new Error("Invalid START_DATE or END_DATE format. Expected YYYY-MM-DD");
//   while (cur <= end) {
//     const y = cur.getUTCFullYear();
//     const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
//     const day = String(cur.getUTCDate()).padStart(2, "0");
//     out.push(`${y}-${m}-${day}`);
//     cur.setUTCDate(cur.getUTCDate() + 1);
//   }
//   return out;
// }

// async function logResponse(res) {
//   const status = res.status;
//   const text = await res.text().catch(() => "");
//   let parsed = text;
//   try { parsed = JSON.parse(text); } catch {}
//   return { status, bodyText: text, bodyParsed: parsed };
// }

// function buildGettrackingsUrl(dateIsoString) {
//   const base = CONFIG.GETTRACKINGS_BASE.replace(/\/$/, "");
//   return `${base}/${CONFIG.DRIVER_UUID}/${encodeURIComponent(dateIsoString)}`;
// }

// function pad2(n) { return String(n).padStart(2, "0"); }
// // convert YYYY-MM-DD => DD-MM-YYYY (report API expects dd-mm-yyyy)
// function toDDMMYYYY(yyyyMmDd) {
//   const [y,m,d] = yyyyMmDd.split("-");
//   if (!y || !m || !d) throw new Error("Invalid date for formatting to DD-MM-YYYY: " + yyyyMmDd);
//   return `${pad2(Number(d))}-${pad2(Number(m))}-${y}`;
// }

// function chunkArray(arr, size) {
//   const out = [];
//   for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
//   return out;
// }

// /* ---------- fetch helpers ---------- */

// async function fetchGettrackingsByIso(dateIsoString) {
//   const url = buildGettrackingsUrl(dateIsoString);
//   console.log("Fetching gettrackings from:", url);
//   const headers = {};
//   if (CONFIG.GETTRACKINGS_AUTH) headers.authorization = CONFIG.GETTRACKINGS_AUTH;
//   if (CONFIG.COMPANYUID) headers.companyuid = CONFIG.COMPANYUID;

//   const res = await fetch(url, { headers });
//   if (!res.ok) {
//     const txt = await res.text().catch(()=>"");
//     throw new Error(`Failed to fetch gettrackings: ${res.status} ${res.statusText} - ${txt}`);
//   }
//   const json = await res.json();
//   if (!Array.isArray(json)) throw new Error("Expected array from gettrackings");
//   return json;
// }

// /* ---------- new: fetch from report-calculate ---------- */

// function buildReportCalculateUrl({ fromDDMMYYYY, toDDMMYYYY, vehicleId, companyId, key }) {
//   // Example:
//   // https://j7.tteld.com/test/report-calcuate/?key=I4L...&to_date=05-02-2026&vehicleId=5907&companyId=107&from_date=01-02-2026&all_fields=true&tracking=true
//   const base = CONFIG.REPORT_BASE.replace(/\?+$/, "").replace(/\/$/, "");
//   const params = new URLSearchParams({
//     key: key || CONFIG.REPORT_KEY,
//     to_date: toDDMMYYYY,
//     vehicleId: String(vehicleId || CONFIG.REPORT_VEHICLE_ID || ""),
//     companyId: String(companyId || CONFIG.REPORT_COMPANY_ID || ""),
//     from_date: fromDDMMYYYY,
//     all_fields: "true",
//     tracking: "true",
//   });
//   return `${base}/?${params.toString()}`;
// }

// async function fetchReportCalculate(fromYYYYMMDD, toYYYYMMDD) {
//   if (!CONFIG.REPORT_BASE) throw new Error("REPORT_BASE not set");
//   const from = toDDMMYYYY(fromYYYYMMDD);
//   const to = toDDMMYYYY(toYYYYMMDD);
//   const url = buildReportCalculateUrl({ fromDDMMYYYY: from, toDDMMYYYY: to });
//   console.log("Fetching report-calculate:", url);

//   const headers = {};
//   if (CONFIG.REPORT_AUTH) headers.Authorization = CONFIG.REPORT_AUTH;
//   // some examples provided key in query param and also Authorization header, handled above

//   const res = await fetch(url, { headers });
//   if (!res.ok) {
//     const txt = await res.text().catch(()=>"");
//     throw new Error(`Failed to fetch report-calculate: ${res.status} ${res.statusText} - ${txt}`);
//   }
//   const json = await res.json();
//   // example response: { "tracking": [ {...}, ... ], ... }
//   const arr = Array.isArray(json.tracking) ? json.tracking : [];
//   if (!Array.isArray(arr)) throw new Error("report-calculate response missing `tracking` array");
//   return arr;
// }

// /* ---------- mapping & posting ---------- */

// function mapTrackingToLocationPayload(item) {
//   const coordinates =
//     item.gps_coordinates && typeof item.gps_coordinates === "object" && item.gps_coordinates.lat != null
//       ? item.gps_coordinates
//       : item.coordinates && typeof item.coordinates === "object" && item.coordinates.lat != null
//       ? item.coordinates
//       : null;

//   return {
//     // include original id so we can track exact records later
//     original_tracking_id: item.id ?? item._id ?? null,
//     address: item.address ?? "",
//     coordinates: coordinates ? { lat: coordinates.lat, lng: coordinates.lng } : null,
//     date: item.date ?? item.createdAt ?? new Date().toISOString(),
//     rotation: item.rotation ?? 0,
//     speed: item.speed ?? item.gps_speed ?? item.eld_speed ?? 0,
//     gps_speed: item.gps_speed ?? null,
//     eld_speed: item.eld_speed ?? null,
//     delta_distance: item.delta_distance ?? 0,
//     engine_hours: item.engine_hours ?? item.engineHours ?? 0,
//     state: item.state ?? null,
//     vehicleId: item.vehicleId ?? CONFIG.VEHICLE_ID ?? null,
//     odometr: item.odometr ?? item.odometer ?? 0,
//     source: item.source ?? "gps",
//     eld_connection: !!item.eld_connection,
//     is_live: item.is_live ?? true,
//     vin_number: item.vin_number ?? CONFIG.VIN_NUMBER ?? null,
//     companyId: item.companyId ?? CONFIG.COMPANYID ?? null,
//     debug_info: JSON.stringify({
//       original_debug_info: item.debug_info ?? null,
//       original_updatedAt: item.updatedAt ?? null,
//       original_createdAt: item.createdAt ?? null,
//       mappedAt: new Date().toISOString(),
//     }),
//     force: false,
//   };
// }

// async function postLocationBatch(batchPayloadArray) {
//   const query = `?accessToken=${encodeURIComponent(CONFIG.ACCESS_TOKEN)}&request_id=${encodeURIComponent(CONFIG.REQUEST_ID)}`;
//   const url = `${CONFIG.LOCATION_SAVE_BASE}${query}`;

//   const headers = {
//     "content-type": "application/json; charset=UTF-8",
//     devicetype: CONFIG.DEVICE_TYPE_HEADER,
//     driverid: CONFIG.DRIVER_ID_HEADER,
//     platform: CONFIG.PLATFORM_HEADER,
//     versioncode: CONFIG.VERSIONCODE_HEADER,
//     versionname: CONFIG.VERSIONNAME_HEADER,
//   };

//   // show what we are about to send (first item) — useful when debugging
//   console.log(`[POST] -> ${url}  (items=${batchPayloadArray.length})`);
//   if (batchPayloadArray.length) console.log("   sample payload:", JSON.stringify(batchPayloadArray[0]));

//   if (CONFIG.DRY_RUN) {
//     console.log("[DRY RUN] Would POST to", url);
//     return { ok: true, status: 0, statusText: "DRY_RUN", body: null };
//   }

//   const res = await fetch(url, {
//     method: "POST",
//     headers,
//     body: JSON.stringify(batchPayloadArray),
//   });

//   // log full response for debugging
//   const logged = await logResponse(res);
//   console.log(`[POST] response status=${logged.status}`);
//   if (typeof logged.bodyParsed === "object") {
//     console.log("[POST] response body (parsed):", logged.bodyParsed);
//   } else {
//     console.log("[POST] response body:", logged.bodyText);
//   }

//   // return structured object like before
//   let body;
//   try { body = typeof logged.bodyParsed === "object" ? logged.bodyParsed : logged.bodyText; } catch { body = logged.bodyText; }
//   return { ok: res.ok, status: res.status, statusText: res.statusText, body };
// }

// async function withRetries(fn, maxRetries = 3, baseMs = 500) {
//   let attempt = 0;
//   while (true) {
//     try {
//       return await fn();
//     } catch (err) {
//       attempt++;
//       if (attempt > maxRetries) throw err;
//       const backoff = baseMs * 2 ** (attempt - 1);
//       console.warn(`Attempt ${attempt} failed: ${err.message}. Retrying after ${backoff}ms...`);
//       await wait(backoff);
//     }
//   }
// }

// /* reliable concurrent batches */
// async function processBatchesConcurrently(batches, concurrency, onSuccessBatch) {
//   let i = 0;
//   const errors = [];
//   const workers = new Array(Math.min(concurrency, batches.length)).fill(0).map(async () => {
//     while (true) {
//       const idx = i++;
//       if (idx >= batches.length) return;
//       const batch = batches[idx];
//       try {
//         const res = await withRetries(() => postLocationBatch(batch), CONFIG.MAX_RETRIES, CONFIG.RETRY_BASE_MS);
//         if (!res.ok) throw new Error(`POST failed status=${res.status} body=${JSON.stringify(res.body)}`);
//         await onSuccessBatch(batch, res);
//       } catch (err) {
//         console.error(`Batch ${idx + 1}/${batches.length} -> FAILED: ${err.message}`);
//         errors.push({ idx, error: err.message, batch });
//       }
//     }
//   });
//   await Promise.all(workers);
//   return errors;
// }

// /* ---------- main ---------- */

// async function main() {
//   try {
//     let sourceItems = []; // array of raw tracking objects from whichever API we used

//     if (CONFIG.REPORT_BASE) {
//       // Use report-calculate API (single call with from/to)
//       if (!CONFIG.START_DATE || !CONFIG.END_DATE) {
//         console.error("When using REPORT_BASE you must set START_DATE and END_DATE (YYYY-MM-DD).");
//         process.exit(1);
//       }
//       try {
//         sourceItems = await withRetries(() => fetchReportCalculate(CONFIG.START_DATE, CONFIG.END_DATE), CONFIG.MAX_RETRIES, CONFIG.RETRY_BASE_MS);
//         console.log(`Report-calculate returned ${sourceItems.length} tracking items.`);
//       } catch (err) {
//         console.error("Failed to fetch report-calculate:", err.message);
//         process.exit(1);
//       }
//     } else {
//       // Fall back to per-day GETTRACKINGS calls (existing behavior)
//       const timePiece = normalizeTimePiece(CONFIG.GETTRACKINGS_TIME);
//       let dateIsos = [];

//       if (CONFIG.START_DATE && CONFIG.END_DATE) {
//         const days = generateDateRange(CONFIG.START_DATE, CONFIG.END_DATE);
//         for (const day of days) {
//           const parsed = new Date(`${day}T${timePiece}`);
//           if (isNaN(parsed.getTime())) {
//             console.warn("Warning: could not parse date+time:", `${day}T${timePiece}`);
//             continue;
//           }
//           dateIsos.push(parsed.toISOString());
//         }
//       } else if (CONFIG.GETTRACKINGS_DATE) {
//         dateIsos = [CONFIG.GETTRACKINGS_DATE];
//       } else {
//         console.error("ERROR: either START_DATE+END_DATE or GETTRACKINGS_DATE must be set in env.");
//         process.exit(1);
//       }

//       const allItems = [];
//       for (const iso of dateIsos) {
//         try {
//           const items = await withRetries(() => fetchGettrackingsByIso(iso), CONFIG.MAX_RETRIES, CONFIG.RETRY_BASE_MS);
//           console.log(`Fetched ${items.length} items for ${iso}`);
//           allItems.push(...items);
//         } catch (err) {
//           console.error(`Failed fetching for ${iso}: ${err.message}`);
//         }
//       }
//       sourceItems = allItems;
//       console.log(`Total aggregated items from gettrackings: ${sourceItems.length}`);
//     }

//     if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
//       console.log("No tracking items found. Exiting.");
//       return;
//     }

//     // map to payloads and keep id map
//     const mapped = sourceItems.map(mapTrackingToLocationPayload);
//     const idToPayload = new Map();
//     const allIds = [];
//     mapped.forEach((p) => {
//       const id = p.original_tracking_id != null ? String(p.original_tracking_id) : null;
//       if (id) {
//         if (!idToPayload.has(id)) idToPayload.set(id, p);
//         allIds.push(id);
//       } else {
//         // create synthetic id for items with no id (rare)
//         const synthetic = crypto.randomUUID();
//         idToPayload.set(synthetic, p);
//         allIds.push(synthetic);
//       }
//     });

//     // chunk & post
//     const batches = chunkArray(mapped, CONFIG.BATCH_SIZE);
//     console.log(`Sending ${batches.length} batches (batch size = ${CONFIG.BATCH_SIZE}). Concurrency = ${CONFIG.CONCURRENCY}`);

//     const sentIds = new Set();
//     async function onSuccessBatch(batch, res) {
//       for (const item of batch) {
//         if (item.original_tracking_id != null) sentIds.add(String(item.original_tracking_id));
//         else {
//           // for synthetic items we can't mark original id; keep optimistic
//         }
//       }
//     }

//     const errors = await processBatchesConcurrently(batches, CONFIG.CONCURRENCY, onSuccessBatch);

//     // compute missing
//     const uniqueIds = Array.from(new Set(allIds));
//     const missingIds = uniqueIds.filter(id => !sentIds.has(id));
//     if (missingIds.length > 0) {
//       console.warn(`MISSING ${missingIds.length} tracking ids that were not confirmed as sent. Writing failed-unposted.json`);
//       const missingObjects = missingIds.map(id => idToPayload.get(id) ?? { original_tracking_id: id });
//       fs.writeFileSync("failed-unposted.json", JSON.stringify({ missingIds, missingObjects }, null, 2), "utf8");
//     } else {
//       console.log("All items appear posted (optimistic confirmation).");
//     }

//     if (errors.length > 0) {
//       fs.writeFileSync("failed-batches.json", JSON.stringify(errors, null, 2), "utf8");
//       console.warn("Wrote failed-batches.json for inspection");
//     }

//     console.log("Done.");
//   } catch (err) {
//     console.error("Fatal error:", err);
//     process.exit(1);
//   }
// }

// main();





/**
 * sync-admin-trackings-to-location-save.js
 *
 * Node 18+ (uses global fetch).
 *
 * Fetches trackings from admin get-trackings endpoint:
 *   GET {ADMIN_GETTRACKINGS_BASE}/<driverId>?from=<iso>&to=<iso>
 *
 * Maps each tracking item into the same location/save payload shape (BUT
 * excludes id, createdAt, updatedAt). VEHICLE_ID, DRIVER_ID and VIN_NUMBER
 * come from .env and override API values.
 *
 * Features: batching, concurrency, retries, dry-run, failure persistence.
 */

import fs from "fs";
import { setTimeout as wait } from "timers/promises";
import crypto from "crypto";

try {
  if (fs.existsSync(".env")) {
    const dot = fs.readFileSync(".env", "utf8");
    dot.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const m = line.match(/^\s*([^=#]+)\s*=\s*(.*)\s*$/);
      if (m) {
        const k = m[1].trim();
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[k] = v;
      }
    });
  }
} catch (e) {
  console.warn("Could not read .env file:", e.message);
}

const CONFIG = {
  // admin get-trackings endpoint
  ADMIN_GETTRACKINGS_BASE: process.env.ADMIN_GETTRACKINGS_BASE || "https://addmin-api.tteld.com/api/admins/get-trackings",
  ADMIN_AUTH: process.env.ADMIN_AUTH || "", // Authorization header for admin endpoint
  ADMIN_DRIVER_ID: process.env.ADMIN_DRIVER_ID || process.env.DRIVER_ID || "",

  // date range for admin endpoint (YYYY-MM-DD)
  START_DATE: process.env.START_DATE,
  END_DATE: process.env.END_DATE,
  // times to append for 'from' and 'to' if using date-range (default from 04:00 to 23:59)
  ADMIN_FROM_TIME: process.env.ADMIN_FROM_TIME || "04:00:00.000Z",
  ADMIN_TO_TIME: process.env.ADMIN_TO_TIME || "23:59:00.000Z",

  // location/save
  LOCATION_SAVE_BASE: process.env.LOCATION_SAVE_BASE || "https://us.tteld.com/api/location/save",
  ACCESS_TOKEN: process.env.ACCESS_TOKEN,
  VEHICLE_ID: process.env.VEHICLE_ID || "",      // override vehicleId in payload
  DRIVER_ID: process.env.DRIVER_ID || "",        // override driverId in payload
  VIN_NUMBER: process.env.VIN_NUMBER || "",      // override vin_number in payload
  COMPANYID: process.env.COMPANYID || "",

  REQUEST_ID: process.env.REQUEST_ID || crypto.randomUUID(),
  DRIVER_ID_HEADER: process.env.DRIVER_ID_HEADER || "97631",
  DEVICE_TYPE_HEADER: process.env.DEVICE_TYPE_HEADER || "mobile",
  PLATFORM_HEADER: process.env.PLATFORM_HEADER || "ANDROID",
  VERSIONCODE_HEADER: process.env.VERSIONCODE_HEADER || "727",
  VERSIONNAME_HEADER: process.env.VERSIONNAME_HEADER || "4.11.2-DEBUG",
  CONCURRENCY: parseInt(process.env.CONCURRENCY || "5", 10),
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "1", 10),
  DRY_RUN: (process.env.DRY_RUN || "false").toLowerCase() === "true",
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || "3", 10),
  RETRY_BASE_MS: parseInt(process.env.RETRY_BASE_MS || "500", 10),
};

if (!CONFIG.ADMIN_GETTRACKINGS_BASE) {
  console.error("ERROR: ADMIN_GETTRACKINGS_BASE is required in env.");
  process.exit(1);
}
if (!CONFIG.ADMIN_DRIVER_ID) {
  console.error("ERROR: ADMIN_DRIVER_ID (driver id path param) is required in env.");
  process.exit(1);
}
if (!CONFIG.ACCESS_TOKEN) {
  console.error("ERROR: ACCESS_TOKEN is required (for location/save).");
  process.exit(1);
}

/* ---------- helpers ---------- */

function pad2(n) { return String(n).padStart(2, "0"); }

// convert YYYY-MM-DD => ISO with time (e.g. "2026-03-02" + "04:00:00.000Z")
function combineDateWithTimeIso(yyyyMmDd, timePiece) {
  // try to form an ISO string in UTC
  const iso = `${yyyyMmDd}T${timePiece}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date/time combination: " + iso);
  return d.toISOString();
}

/* convert YYYY-MM-DD => DD-MM-YYYY (not used for admin, kept for compatibility) */
function toDDMMYYYY(yyyyMmDd) {
  const [y,m,d] = yyyyMmDd.split("-");
  return `${pad2(Number(d))}-${pad2(Number(m))}-${y}`;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ---------- admin endpoint helpers ---------- */

/** Build ADMIN get-trackings URL:
 *  e.g. {ADMIN_GETTRACKINGS_BASE}/{driverId}?from=<iso>&to=<iso>
 */
function buildAdminGetTrackingsUrl(driverId, fromIso, toIso) {
  const base = CONFIG.ADMIN_GETTRACKINGS_BASE.replace(/\/$/, "");
  const url = `${base}/${encodeURIComponent(driverId)}?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  return url;
}

async function fetchAdminTrackings(fromIso, toIso) {
  const url = buildAdminGetTrackingsUrl(CONFIG.ADMIN_DRIVER_ID, fromIso, toIso);
  console.log("Fetching admin get-trackings:", url);
  const headers = {
    Accept: "application/json, text/plain, */*",
  };
  if (CONFIG.ADMIN_AUTH) headers.Authorization = CONFIG.ADMIN_AUTH;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Failed to fetch admin trackings: ${res.status} ${res.statusText} - ${txt}`);
  }
  const json = await res.json();
  if (!Array.isArray(json)) {
    // Some admin endpoints sometimes return object with 'tracking' property — handle both
    if (Array.isArray(json.tracking)) return json.tracking;
    throw new Error("Expected array from admin get-trackings, got: " + JSON.stringify(typeof json));
  }
  return json;
}

/* ---------- mapping & posting ---------- */

/**
 * Map an admin get-trackings item -> location/save payload
 *
 * NOTE: We DO NOT include id, createdAt, updatedAt fields in the payload.
 * VEHICLE_ID, DRIVER_ID and VIN_NUMBER are taken from CONFIG overrides.
 */
function mapAdminTrackingToLocationPayload(item) {
  const coords = (item.coordinates && typeof item.coordinates === "object" && item.coordinates.lat != null)
    ? item.coordinates
    : (item.gps_coordinates && typeof item.gps_coordinates === "object" && item.gps_coordinates.lat != null)
      ? item.gps_coordinates
      : null;

  return {
    address: item.address ?? "",
    coordinates: coords ? { lat: coords.lat, lng: coords.lng } : null,
    date: item.date ?? item.createdAt ?? new Date().toISOString(),
    rotation: item.rotation ?? 0,
    speed: item.speed ?? 0,
    gps_speed: item.gps_speed ?? null,
    eld_speed: item.eld_speed ?? null,
    delta_distance: item.delta_distance ?? 0,
    engine_hours: item.engine_hours ?? 0,
    state: item.state ?? null,
    vehicleId: CONFIG.VEHICLE_ID ?? null,
    odometr: item.odometr ?? item.odometer ?? 0,
    source: item.source ?? "gps",
    eld_connection: !!item.eld_connection,
    is_live: item.is_live ?? true,
    vin_number: CONFIG.VIN_NUMBER ?? null,
    companyId: CONFIG.COMPANYID ?? item.companyId ?? null,
    driverId: CONFIG.DRIVER_ID ?? null,
    debug_info: JSON.stringify({
      original_debug_info: item.debug_info ?? null
    }),
    force: false,
  };
}

/* Post helper with verbose logging */
async function postLocationBatch(batchPayloadArray) {
  const query = `?accessToken=${encodeURIComponent(CONFIG.ACCESS_TOKEN)}&request_id=${encodeURIComponent(CONFIG.REQUEST_ID)}`;
  const url = `${CONFIG.LOCATION_SAVE_BASE}${query}`;

  const headers = {
    "content-type": "application/json; charset=UTF-8",
    devicetype: CONFIG.DEVICE_TYPE_HEADER,
    driverid: CONFIG.DRIVER_ID_HEADER,
    platform: CONFIG.PLATFORM_HEADER,
    versioncode: CONFIG.VERSIONCODE_HEADER,
    versionname: CONFIG.VERSIONNAME_HEADER,
  };

  console.log(`[POST] -> ${url}  (items=${batchPayloadArray.length})`);
  if (batchPayloadArray.length) console.log("   sample payload:", JSON.stringify(batchPayloadArray[0]));

  if (CONFIG.DRY_RUN) {
    console.log("[DRY RUN] skipping POST");
    return { ok: true, status: 0, statusText: "DRY_RUN", body: null };
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(batchPayloadArray),
  });

  const text = await res.text().catch(() => "");
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }

  console.log(`[POST] response status=${res.status}`);
  if (typeof parsed === "object") console.log("[POST] response body(parsed):", parsed);
  else console.log("[POST] response body:", parsed);

  return { ok: res.ok, status: res.status, statusText: res.statusText, body: parsed };
}

async function withRetries(fn, maxRetries = 3, baseMs = 500) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err;
      const backoff = baseMs * 2 ** (attempt - 1);
      console.warn(`Attempt ${attempt} failed: ${err.message}. Retrying after ${backoff}ms...`);
      await wait(backoff);
    }
  }
}

/* concurrent batch runner */
async function processBatchesConcurrently(batches, concurrency, onSuccessBatch) {
  let i = 0;
  const errors = [];
  const workers = new Array(Math.min(concurrency, batches.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= batches.length) return;
      const batch = batches[idx];
      try {
        const res = await withRetries(() => postLocationBatch(batch), CONFIG.MAX_RETRIES, CONFIG.RETRY_BASE_MS);
        if (!res.ok) throw new Error(`POST failed status=${res.status} body=${JSON.stringify(res.body)}`);
        await onSuccessBatch(batch, res);
      } catch (err) {
        console.error(`Batch ${idx + 1}/${batches.length} -> FAILED: ${err.message}`);
        errors.push({ idx, error: err.message, batch });
      }
    }
  });
  await Promise.all(workers);
  return errors;
}

/* ---------- main ---------- */

async function main() {
  try {
    // build from/to ISO strings using START_DATE/END_DATE + ADMIN_FROM_TIME/ADMIN_TO_TIME
    if (!CONFIG.START_DATE || !CONFIG.END_DATE) {
      console.error("SET START_DATE and END_DATE in env (YYYY-MM-DD). Exiting.");
      process.exit(1);
    }

    const fromIso = combineDateWithTimeIso(CONFIG.START_DATE, CONFIG.ADMIN_FROM_TIME);
    const toIso = combineDateWithTimeIso(CONFIG.END_DATE, CONFIG.ADMIN_TO_TIME);
    console.log(`Will fetch admin trackings for driver=${CONFIG.ADMIN_DRIVER_ID} from=${fromIso} to=${toIso}`);

    const sourceItems = await withRetries(() => fetchAdminTrackings(fromIso, toIso), CONFIG.MAX_RETRIES, CONFIG.RETRY_BASE_MS);
    console.log(`Admin endpoint returned ${sourceItems.length} items.`);

    if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
      console.log("No tracking items to send. Exiting.");
      return;
    }

    // Map -> payload (overrides applied)
    const mapped = sourceItems.map(mapAdminTrackingToLocationPayload);

    // chunk & post
    const batches = chunkArray(mapped, CONFIG.BATCH_SIZE);
    console.log(`Sending ${batches.length} batches (batch size = ${CONFIG.BATCH_SIZE}). Concurrency = ${CONFIG.CONCURRENCY}`);

    const sentCount = { ok: 0 };
    async function onSuccessBatch(batch, res) {
      sentCount.ok += batch.length;
    }

    const errors = await processBatchesConcurrently(batches, CONFIG.CONCURRENCY, onSuccessBatch);

    console.log(`Posting complete. Sent items (optimistic): ${sentCount.ok}. Failed batches: ${errors.length}`);

    if (errors.length > 0) {
      fs.writeFileSync("failed-batches.json", JSON.stringify(errors, null, 2), "utf8");
      console.warn("Wrote failed-batches.json for inspection.");
    }

    console.log("Done.");
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();