// check_disable_send.js
// Node 18+ recommended (native fetch). If using older Node, install node-fetch or axios and adapt.

import fs from "fs";
import fetch from "node-fetch"; // if using Node 18+ you can replace with global fetch
// npm i node-fetch@2 if needed and use: import fetch from 'node-fetch';

const CONFIG = {
  SEARCH_URL: "https://addmin-api.tteld.com/api/users/searching-list?page=2&perPage=9999&searchUserName=&searchName=&searchEmail=&searchLicenseNumber=&uid=&companyUid=&companyId=&status=true&role=driver",
  USER_FIND_TEMPLATE: "https://addmin-api.tteld.com/api/users/find/{id}",
  VEHICLE_FIND_TEMPLATE: "https://addmin-api.tteld.com/api/vehicles/find/{id}",

  // Put the correct Authorization tokens here. If same token for both endpoints, set both equal.
  AUTH_USER: "0VVUWaBux1Dh41iXUpWCgUogGdu4rUehANSHYXYWHsDLFGf0c4vu3JXpL8uMBtks",
  AUTH_VEHICLE: "0VVUWaBux1Dh41iXUpWCgUogGdu4rUehANSHYXYWHsDLFGf0c4vu3JXpL8uMBtks",

  // concurrency limit for API calls (tweak as needed)
  MAX_CONCURRENCY: 8,
  // timeout ms for fetch
  FETCH_TIMEOUT: 30000,
  // optional: retry attempts for 429 or network errors
  RETRIES: 2,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, headers = {}, retries = CONFIG.RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(id);

      if (res.status === 204) return null;
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        throw new Error(`Invalid JSON from ${url}: ${err.message} - body: ${text.slice(0,200)}`);
      }

      if (res.ok) return data;
      // handle 429 or 5xx by retrying with backoff
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      // non-retryable error
      throw new Error(`HTTP ${res.status} from ${url} - ${JSON.stringify(data)}`);
    } catch (err) {
      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

function template(urlTemplate, id) {
  return urlTemplate.replace("{id}", encodeURIComponent(String(id)));
}

async function workerPool(items, workerFn, concurrency = CONFIG.MAX_CONCURRENCY) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const p = (async () => workerFn(item).catch((err) => ({ __error: err.message || String(err) })))();
    results.push(p);
    executing.add(p);
    p.finally(() => executing.delete(p));
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

function recordAdd(map, companyId, entry) {
  if (!map[companyId]) map[companyId] = { companyId, count: 0, items: [] };
  map[companyId].items.push(entry);
  map[companyId].count = map[companyId].items.length;
}

function safeGet(obj, path) {
  if (!obj) return undefined;
  return path.split(".").reduce((s, k) => (s && Object.prototype.hasOwnProperty.call(s, k) ? s[k] : undefined), obj);
}

(async () => {
  try {
    console.log("Fetching users list...");
    const searchRes = await fetchJson(CONFIG.SEARCH_URL, {
      Accept: "application/json, text/plain, */*",
      Authorization: CONFIG.AUTH_USER,
    });

    const users = (searchRes && searchRes.data) || [];
    console.log(`Found ${users.length} users from search endpoint.`);

    const summaryByCompany = {};

    // worker for each user from search
    async function processUser(userRow) {
      const userId = userRow.id;
      const companyIdFromList = userRow.companyId ?? userRow.companyId;
      const userFindUrl = template(CONFIG.USER_FIND_TEMPLATE, userId);
      const userData = await fetchJson(userFindUrl, {
        Accept: "application/json, text/plain, */*",
        Authorization: CONFIG.AUTH_USER,
      });

      // helper to add driver entry
      const addDriverEntry = (driver, vehicleId, reason) => {
        const companyId = safeGet(driver, "companyId") ?? companyIdFromList ?? (userData && userData.company && userData.company.id) ?? null;
        const driverName = `${safeGet(driver, "first_name") || ""} ${safeGet(driver, "second_name") || ""}`.trim() || driver.username || `id:${driver.id}`;
        const truckNumber = vehicleId ? `vehicle:${vehicleId}` : "";
        recordAdd(summaryByCompany, companyId ?? "unknown", {
          driverName,
          driverId: driver.id ?? null,
          vehicleId: vehicleId ?? null,
          truckNumber,
          reason,
        });
      };

      // Check user settings
      const userSettings = safeGet(userData, "settings");
      if (!userSettings) {
        addDriverEntry(userData, userData.vehicleId, "user.settings missing");
      } else if (userSettings && userSettings.disable_send_integration === undefined) {
        addDriverEntry(userData, userData.vehicleId, "user.disable_send_integration missing");
      }
      // If codriver exists, fetch and check similarly
      const codriverId = userData.codriverId;
      if (codriverId) {
        try {
          const codriverData = await fetchJson(template(CONFIG.USER_FIND_TEMPLATE, codriverId), {
            Accept: "application/json, text/plain, */*",
            Authorization: CONFIG.AUTH_USER,
          });
          const cdSettings = safeGet(codriverData, "settings");
          if (!cdSettings) {
            addDriverEntry(codriverData, codriverData.vehicleId ?? userData.vehicleId, "codriver.settings missing");
          } else if (cdSettings.disable_send_integration === undefined) {
            addDriverEntry(codriverData, codriverData.vehicleId ?? userData.vehicleId, "codriver.disable_send_integration missing");
          }
        } catch (err) {
          // non-fatal: record that codriver fetch failed
          recordAdd(summaryByCompany, companyIdFromList ?? "unknown", {
            driverName: `codriver id:${codriverId}`,
            driverId: codriverId,
            vehicleId: userData.vehicleId ?? null,
            truckNumber: "",
            reason: `codriver fetch error: ${err.message || String(err)}`,
          });
        }
      }

      // Now fetch vehicle if vehicleId exists
      const vehicleId = userData.vehicleId;
      if (vehicleId) {
        try {
          const vehicleData = await fetchJson(template(CONFIG.VEHICLE_FIND_TEMPLATE, vehicleId), {
            Accept: "application/json, text/plain, */*",
            Authorization: CONFIG.AUTH_VEHICLE,
          });

          // check vehicle.settings
          const vSettings = safeGet(vehicleData, "settings");
          if (!vSettings) {
            addDriverEntry(userData, vehicleId, "vehicle.settings missing");
          } else if (vSettings.disable_send_integration === undefined) {
            addDriverEntry(userData, vehicleId, "vehicle.disable_send_integration missing");
          }

          // check vehicle.driver.settings (if present)
          const vehDriver = safeGet(vehicleData, "driver");
          if (vehDriver) {
            const vehDriverSettings = safeGet(vehDriver, "settings");
            if (!vehDriverSettings) {
              addDriverEntry(vehDriver, vehicleId, "vehicle.driver.settings missing");
            } else if (vehDriverSettings.disable_send_integration === undefined) {
              addDriverEntry(vehDriver, vehicleId, "vehicle.driver.disable_send_integration missing");
            }
          }

        } catch (err) {
          // record vehicle fetch error
          recordAdd(summaryByCompany, companyIdFromList ?? "unknown", {
            driverName: `${userData.first_name || ""} ${userData.second_name || ""}`.trim() || userData.username || `id:${userData.id}`,
            driverId: userData.id,
            vehicleId: vehicleId,
            truckNumber: "",
            reason: `vehicle fetch error: ${err.message || String(err)}`,
          });
        }
      } else {
        // no vehicleId on user; possibly still include if user had missing user.settings (already added)
      }

      return { userId };
    }

    // run workers
    console.log("Processing users (this may take a while depending on count)...");
    await workerPool(users, processUser, CONFIG.MAX_CONCURRENCY);

    // Prepare output
    const grouped = Object.values(summaryByCompany).map((g) => ({
      companyId: g.companyId,
      count: g.count,
      items: g.items,
    }));

    // write JSON and CSV
    const outJson = { generatedAt: new Date().toISOString(), summary: grouped };
    fs.writeFileSync("missing_disable_send_summary_tteld2.json", JSON.stringify(outJson, null, 2), "utf8");

    const csvLines = ["companyId,driverName,driverId,vehicleId,truckNumber,reason"];
    for (const g of grouped) {
      for (const it of g.items) {
        const row = [
          `"${String(g.companyId ?? "")}"`,
          `"${String(it.driverName ?? "").replace(/"/g, '""')}"`,
          `"${String(it.driverId ?? "")}"`,
          `"${String(it.vehicleId ?? "")}"`,
          `"${String(it.truckNumber ?? "")}"`,
          `"${String(it.reason ?? "").replace(/"/g, '""')}"`,
        ].join(",");
        csvLines.push(row);
      }
    }
    fs.writeFileSync("missing_disable_send_tteld2.csv", csvLines.join("\n"), "utf8");

    console.log("Done.");
    console.log("Summary JSON written to missing_disable_send_summary_tteld2.json");
    console.log("CSV written to missing_disable_send_tteld2.csv");
    console.log("Quick summary (per-company counts):");
    grouped.forEach((g) => console.log(`  companyId=${g.companyId}  count=${g.count}`));
  } catch (err) {
    console.error("Fatal error:", err);
  }
})();
