// check_disable_send_mismatch.js
// Node 18+ recommended. If using Node <18, uncomment the node-fetch import and install node-fetch.
// import fetch from "node-fetch";

import fs from "fs";

const CONFIG = {
  SEARCH_URL:
    "https://addmin-api.ontime-logs.com/api/users/searching-list?page=1&perPage=9999&searchUserName=&searchName=&searchEmail=&searchLicenseNumber=&uid=&companyUid=&companyId=&status=true&role=driver",
  USER_FIND_TEMPLATE: "https://addmin-api.ontime-logs.com/api/users/find/{id}",
  VEHICLE_FIND_TEMPLATE: "https://addmin-api.ontime-logs.com/api/vehicles/find/{id}",
  AUTH_USER: "57Dw2e7JhADr1DVywPMTBqFCOQSCNvgEBjNLPJypaTCj875zuCWSTlh5m5NqXyoL",
  AUTH_VEHICLE: "57Dw2e7JhADr1DVywPMTBqFCOQSCNvgEBjNLPJypaTCj875zuCWSTlh5m5NqXyoL",
  MAX_CONCURRENCY: 8,
  FETCH_TIMEOUT: 30000,
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
      const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
      clearTimeout(id);
      const text = await res.text();
      let data = text ? JSON.parse(text) : null;
      if (res.ok) return data;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status} from ${url} - ${text?.slice?.(0, 400) || ""}`);
    } catch (err) {
      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

function template(t, id) {
  return t.replace("{id}", encodeURIComponent(String(id)));
}

function workerPool(items, workerFn, concurrency = CONFIG.MAX_CONCURRENCY) {
  const results = [];
  const executing = new Set();
  return (async () => {
    for (const item of items) {
      const p = (async () => workerFn(item).catch((err) => ({ __error: err.message || String(err) })))();
      results.push(p);
      executing.add(p);
      p.finally(() => executing.delete(p));
      if (executing.size >= concurrency) await Promise.race(executing);
    }
    return Promise.all(results);
  })();
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
    console.log(`Found ${users.length} users.`);

    const mismatchesByCompany = {}; // { companyId: { companyId, items: [] } }

    function addMismatch(companyId, entry) {
      const key = companyId ?? "unknown";
      if (!mismatchesByCompany[key]) mismatchesByCompany[key] = { companyId: companyId ?? null, items: [] };
      mismatchesByCompany[key].items.push(entry);
    }

    async function processUser(userRow) {
      const userId = userRow.id;
      const userFindUrl = template(CONFIG.USER_FIND_TEMPLATE, userId);
      const userData = await fetchJson(userFindUrl, {
        Accept: "application/json, text/plain, */*",
        Authorization: CONFIG.AUTH_USER,
      });

      const companyId = userData.companyId ?? safeGet(userData, "company.id") ?? userRow.companyId ?? null;
      const driverName = `${userData.first_name || ""} ${userData.second_name || ""}`.trim() || userData.username || `id:${userId}`;
      const vehicleId = userData.vehicleId ?? null;
      const userDisable = safeGet(userData, "settings.disable_send_integration");

      // If vehicleId exists, fetch vehicle and compare
      if (vehicleId) {
        try {
          const vehicleData = await fetchJson(template(CONFIG.VEHICLE_FIND_TEMPLATE, vehicleId), {
            Accept: "application/json, text/plain, */*",
            Authorization: CONFIG.AUTH_VEHICLE,
          });

          const vehicleDisable = safeGet(vehicleData, "settings.disable_send_integration");
          // compare user.settings.disable_send_integration vs vehicle.settings.disable_send_integration
          const differs =
            (userDisable !== vehicleDisable) && // different values (also catches undefined vs defined)
            // only record if at least one is defined OR you want undefined vs undefined considered equal (they are equal)
            (userDisable !== undefined || vehicleDisable !== undefined);

          if (differs) {
            addMismatch(companyId, {
              driverName,
              driverId: userId,
              vehicleId,
              userDisable: userDisable === undefined ? null : userDisable,
              vehicleDisable: vehicleDisable === undefined ? null : vehicleDisable,
              truckNumber: safeGet(vehicleData, "truck_number") ?? safeGet(vehicleData, "truck_number") ?? "",
              reason: "mismatch user.settings.disable_send_integration vs vehicle.settings.disable_send_integration",
            });
          }

          // Extra check: if vehicle.driver exists and has settings, compare with user as well (optional)
          const vehDriver = safeGet(vehicleData, "driver");
          if (vehDriver && vehDriver.id) {
            const vehDriverDisable = safeGet(vehDriver, "settings.disable_send_integration");
            // If the vehicle.driver is the same person as userData (ids match), compare that too
            if (vehDriver.id === userId) {
              const differs2 = (userDisable !== vehDriverDisable) && (userDisable !== undefined || vehDriverDisable !== undefined);
              if (differs2) {
                addMismatch(companyId, {
                  driverName,
                  driverId: userId,
                  vehicleId,
                  userDisable: userDisable === undefined ? null : userDisable,
                  vehicleDriverDisable: vehDriverDisable === undefined ? null : vehDriverDisable,
                  truckNumber: safeGet(vehicleData, "truck_number") ?? "",
                  reason: "mismatch user.settings.disable_send_integration vs vehicle.driver.settings.disable_send_integration",
                });
              }
            } else {
              // If vehicle.driver is someone else, you might still want to compare — optional. We'll record only if mismatch with user exists AND IDs match or you can enable this block.
            }
          }
        } catch (err) {
          // vehicle fetch failed — record as a reason
          addMismatch(companyId, {
            driverName,
            driverId: userId,
            vehicleId,
            userDisable: userDisable === undefined ? null : userDisable,
            vehicleDisable: null,
            truckNumber: "",
            reason: `vehicle fetch error: ${err.message || String(err)}`,
          });
        }
      } else {
        // no vehicleId — optionally record that vehicle missing (not considered mismatch by default)
      }

      return { userId };
    }

    console.log("Processing users...");
    await workerPool(users, processUser, CONFIG.MAX_CONCURRENCY);

    // prepare outputs
    const grouped = Object.values(mismatchesByCompany).map((g) => ({
      companyId: g.companyId,
      count: g.items.length,
      items: g.items,
    }));

    const outJson = { generatedAt: new Date().toISOString(), summary: grouped };
    fs.writeFileSync("mismatch_disable_send.json", JSON.stringify(outJson, null, 2), "utf8");

    // CSV: companyId,driverName,driverId,vehicleId,userDisable,vehicleDisable,truckNumber,reason
    const csvLines = [
      "companyId,driverName,driverId,vehicleId,userDisable,vehicleDisable,truckNumber,reason",
    ];
    for (const g of grouped) {
      for (const it of g.items) {
        const row = [
          `"${String(g.companyId ?? "")}"`,
          `"${String(it.driverName ?? "").replace(/"/g, '""')}"`,
          `"${String(it.driverId ?? "")}"`,
          `"${String(it.vehicleId ?? "")}"`,
          `"${String(it.userDisable === null ? "" : it.userDisable)}"`,
          `"${String(it.vehicleDisable === undefined ? (it.vehicleDriverDisable ?? "") : it.vehicleDisable)}"`,
          `"${String(it.truckNumber ?? "").replace(/"/g, '""')}"`,
          `"${String(it.reason ?? "").replace(/"/g, '""')}"`,
        ].join(",");
        csvLines.push(row);
      }
    }
    fs.writeFileSync("mismatch_disable_send.csv", csvLines.join("\n"), "utf8");

    console.log("Done.");
    console.log(`Mismatches saved: mismatch_disable_send.json (${grouped.length} companies), mismatch_disable_send.csv`);
    grouped.forEach((g) => console.log(` companyId=${g.companyId}  count=${g.count}`));
  } catch (err) {
    console.error("Fatal error:", err);
  }
})();
