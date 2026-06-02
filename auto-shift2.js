// // Node.js 18+
// // Run with:
// // DRIVER_API_AUTH="..." LOG_API_AUTH="..." COMPANY_UID="..." node script.js

// const DRIVER_API_BASE = "https://addmin-api.ontime-logs.com";
// const LOG_API_BASE = "https://rj-test.tteld.com";

// const DRIVER_API_AUTH = "A6bkddBfNHLTuEDE1XcWhHDCOCSsELAnjUASgMUHPosH3IKCg4DXY6BIKk3Or4uL";
// const LOG_API_AUTH = "2DA4vqPl1nh1fDxD2eq0FNcSfjHbEXTsFgbNkbpVEtCFJbeo3jAWqko6owhiYrwz";
// const COMPANY_UID = "f41f6463-d81b-4caf-93b5-d1eae1fbaed0";

// if (!DRIVER_API_AUTH || !LOG_API_AUTH || !COMPANY_UID) {
//   throw new Error(
//     "Missing env vars. Please set DRIVER_API_AUTH, LOG_API_AUTH, and COMPANY_UID."
//   );
// }

// const DRIVER_ROLE = "driver";
// const DRIVER_STATUS = "true";
// const COMPANY_ID = 25;

// // Change these as needed
// const START_DATE = "2026-05-10";
// const END_DATE = "2026-05-19";

// // The API you showed uses 11:00:00.000Z in the date part
// const DAILY_TIME_UTC = "11:00:00.000Z";

// const ALLOWED_COMBOS = new Set(["1:1", "1:2", "3:1"]);

// async function fetchJson(url, options = {}) {
//   const res = await fetch(url, options);
//   if (!res.ok) {
//     const text = await res.text().catch(() => "");
//     throw new Error(`HTTP ${res.status} for ${url}\n${text}`);
//   }
//   return res.json();
// }

// function buildDateRange(startDate, endDate) {
//   const result = [];
//   const start = new Date(`${startDate}T00:00:00.000Z`);
//   const end = new Date(`${endDate}T00:00:00.000Z`);

//   for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
//     const y = d.getUTCFullYear();
//     const m = String(d.getUTCMonth() + 1).padStart(2, "0");
//     const day = String(d.getUTCDate()).padStart(2, "0");
//     result.push(`${y}-${m}-${day}T${DAILY_TIME_UTC}`);
//   }

//   return result;
// }

// async function getAllDrivers() {
//   const drivers = [];
//   let page = 1;
//   const perPage = 1000;

//   while (true) {
//     const params = new URLSearchParams({
//       page: String(page),
//       perPage: String(perPage),
//       searchUserName: "",
//       searchName: "",
//       searchEmail: "",
//       searchLicenseNumber: "",
//       uid: "",
//       companyUid: "",
//       companyId: String(COMPANY_ID),
//       publicId: "",
//       status: DRIVER_STATUS,
//       role: DRIVER_ROLE,
//     });

//     const url = `${DRIVER_API_BASE}/api/users/searching-list?${params.toString()}`;

//     const json = await fetchJson(url, {
//       headers: {
//         Accept: "application/json, text/plain, */*",
//         Authorization: DRIVER_API_AUTH,
//       },
//     });

//     const rows = Array.isArray(json?.data) ? json.data : [];
//     drivers.push(...rows);

//     if (rows.length < perPage) break;
//     page += 1;
//   }

//   return drivers
//     .filter((d) => d && d.uid)
//     .map((d) => ({
//       id: d.id,
//       uid: d.uid,
//       companyId: d.companyId,
//       publicId: d.publicId,
//       username: d.username,
//       first_name: d.first_name,
//       second_name: d.second_name,
//     }));
// }

// async function getDailyLogs(driverUid, dayIso) {
//   const url = `${LOG_API_BASE}/api/dashboards/get-daily-logs/${driverUid}/${encodeURIComponent(
//     dayIso
//   )}`;

//   const json = await fetchJson(url, {
//     headers: {
//       Accept: "application/json, text/plain, */*",
//       Authorization: LOG_API_AUTH,
//       companyuid: COMPANY_UID,
//       "Cache-Control": "no-cache, no-store, must-revalidate",
//     },
//   });

//   return Array.isArray(json?.logs) ? json.logs : [];
// }

// function isBadInspectionLog(log) {
//   return log?.inspection === true && log?.vehicleId == null;
// }

// function isTargetLog(log) {
//   const combo = `${log?.event_type}:${log?.event_code}`;
//   return (
//     ALLOWED_COMBOS.has(combo) &&
//     log?.inspection !== true &&
//     log?.vehicleId != null
//   );
// }

// async function processDriver(driver, days) {
//   const matchedIds = [];
//   let shouldSkipDriver = false;

//   for (const dayIso of days) {
//     const logs = await getDailyLogs(driver.uid, dayIso);

//     if (logs.some(isBadInspectionLog)) {
//       shouldSkipDriver = true;
//       break;
//     }

//     for (const log of logs) {
//       if (isTargetLog(log) && log.id != null) {
//         matchedIds.push(log.id);
//       }
//     }
//   }

//   if (shouldSkipDriver) {
//     return null;
//   }

//   return {
//     driverId: driver.id,
//     driverUid: driver.uid,
//     username: driver.username,
//     matchedLogIds: [...new Set(matchedIds)],
//   };
// }

// async function main() {
//   const days = buildDateRange(START_DATE, END_DATE);
//   const drivers = await getAllDrivers();

//   const results = [];
//   for (const driver of drivers) {
//     try {
//       const out = await processDriver(driver, days);
//       if (out && out.matchedLogIds.length > 0) {
//         results.push(out);
//       }
//     } catch (err) {
//       console.error(`Failed for driver ${driver.uid}:`, err.message);
//     }
//   }

//   console.log(JSON.stringify(results, null, 2));
// }

// main().catch((err) => {
//   console.error(err);
//   process.exit(1);
// });

// node >= 18
// Usage:
// DRIVER_API_AUTH="..." \
// LOG_API_AUTH="..." \
// DRIVER_API_COMPANY_ID="25" \
// LOG_API_COMPANY_UID="..." \
// AUTO_SHIFT_COMPANY_UID="..." \
// node script.js 2026-05-10 2026-05-19 auto-shift-errors.json

const fs = require("fs/promises");

const DRIVER_API_BASE = "https://addmin-api.ontime-logs.com";
const LOG_API_BASE = "https://rj-test.tteld.com";

const DRIVER_API_AUTH =
	"cZVsRmQvV57mnwmxvTD6mmqAIudg6INOmUVcY4sMFvtjRzZrk0ypWHLf5c6CCaJf"; // addmin
const LOG_API_AUTH =
	"MEwUgADZf62Bdc6EboJQPYAgXkkJEp3nTnvll0i4LDgThP2dDDpDjqQ6ew1KlejT"; // dash
const DRIVER_API_COMPANY_ID = 182;
const LOG_API_COMPANY_UID = "ecb83623-4179-4799-9341-560ed205bd25";
const AUTO_SHIFT_COMPANY_UID = LOG_API_COMPANY_UID;

if (!DRIVER_API_AUTH || !LOG_API_AUTH) {
	throw new Error(
		"Missing DRIVER_API_AUTH or LOG_API_AUTH environment variable.",
	);
}
if (!LOG_API_COMPANY_UID) {
	throw new Error("Missing LOG_API_COMPANY_UID environment variable.");
}
if (!AUTO_SHIFT_COMPANY_UID) {
	throw new Error("Missing AUTO_SHIFT_COMPANY_UID environment variable.");
}

const START_DATE = "2026-05-13";
const END_DATE = "2026-06-01";
const OUTPUT_FILE = `output/auto-shift-errors-${DRIVER_API_COMPANY_ID}.json`;

const SHIFT_OPEN_THRESHOLD_MS = 10 * 60 * 60 * 1000; // 10 hours
const BREAK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const MAX_DRIVING_BEFORE_BREAK_MS = 8 * 60 * 60 * 1000; // 8 hours

const ALLOWED_LOG_KEYS = new Set(["1:1", "1:2", "3:1"]);

function hasValue(value) {
	return value !== null && value !== undefined && value !== "";
}

function toTimestamp(value, label) {
	const ts = new Date(value).getTime();
	if (Number.isNaN(ts)) {
		throw new Error(label + " must be a valid date");
	}
	return ts;
}

function resolveStart(log) {
	return log.start_date || log.old_start_date || null;
}

function resolveEnd(log) {
	return log.end_date || log.temp_end_date || log.old_end_date || null;
}

function isNeutralLog(log) {
	const eventType = Number(log?.event_type);
	return eventType === 2 || eventType === 6;
}

function isDriving(log) {
	return Number(log?.event_type) === 1 && Number(log?.event_code) === 3;
}

function isShiftOpenEligible(log) {
	const eventType = Number(log?.event_type);
	const eventCode = Number(log?.event_code);

	return (
		(eventType === 1 && (eventCode === 1 || eventCode === 2)) ||
		(eventType === 3 && eventCode === 1)
	);
}

function isBreakEligible(log) {
	const eventType = Number(log?.event_type);
	const eventCode = Number(log?.event_code);

	return (
		(eventType === 1 &&
			(eventCode === 1 || eventCode === 2 || eventCode === 4)) ||
		(eventType === 3 && (eventCode === 1 || eventCode === 2))
	);
}
function isInfoLog(log) {
	// Adjust this if your API marks info logs differently.
	// Keep whichever condition matches your payload.
	const status = String(log?.status || "").toLowerCase();
	return Number(log?.event_type) === 6 || Number(log?.event_type) === 2 || Number(log?.event_type) === 4 || Number(log?.event_type) === 5 || Number(log?.event_type) === 7;
}

function briefLog(log) {
	if (!log) return "null";

	return [
		"id=" + (log.id ?? "null"),
		"event_type=" + (log.event_type ?? "null"),
		"event_code=" + (log.event_code ?? "null"),
		"status=" + (log.status ?? "null"),
		"start=" + (log.start_date ?? "null"),
		"end=" + (log.end_date ?? log.temp_end_date ?? log.old_end_date ?? "null"),
	].join(" | ");
}

function normalizeLogs(inputLogs) {
	return inputLogs
		.map((log, index) => {
			const start = resolveStart(log);
			const end = resolveEnd(log);

			return { log, index, start, end };
		})
		.filter((item) => hasValue(item.start) && hasValue(item.end))
		.sort((a, b) => {
			const startDiff =
				toTimestamp(a.start, "start") - toTimestamp(b.start, "start");
			if (startDiff !== 0) return startDiff;

			const endDiff = toTimestamp(a.end, "end") - toTimestamp(b.end, "end");
			if (endDiff !== 0) return endDiff;

			return a.index - b.index;
		});
}

function checkBreakViolations(inputLogs, label) {

	const violations = [];

	if (!Array.isArray(inputLogs)) {
		violations.push("[" + label + "] is not an array");
		return violations;
	}

	const logs = normalizeLogs(inputLogs);

	let inShift = false;
	let shiftOpenedAt = null;
	let shiftOpenSourceLog = null;

	let shiftRestAccumulator = 0;
	let breakAccumulator = 0;
	let drivingSinceBreak = 0;

	for (let i = 0; i < logs.length; i++) {
		const item = logs[i];
		const log = item.log;

		const info = isInfoLog(log);
		if (info) {
			continue;
		}

		const startTs = toTimestamp(item.start, label + "[" + i + "].start");
		const endTs = toTimestamp(item.end, label + "[" + i + "].end");
		const duration = endTs - startTs;

		if (duration < 0) continue;

		const neutral = isNeutralLog(log);
		const shiftEligible = isShiftOpenEligible(log);
		const breakEligible = isBreakEligible(log);
		const driving = isDriving(log);

		if (shiftEligible) {
			shiftRestAccumulator += duration;

			if (shiftRestAccumulator >= SHIFT_OPEN_THRESHOLD_MS) {
				inShift = true;
				shiftOpenedAt = item.end;
				shiftOpenSourceLog = log;

				drivingSinceBreak = 0;
				breakAccumulator = 0;
			}
		} else if (!neutral) {
			shiftRestAccumulator = 0;
		}

		if (!inShift) continue;

		if (breakEligible) {
			breakAccumulator += duration;

			if (breakAccumulator >= BREAK_THRESHOLD_MS) {
				drivingSinceBreak = 0;
				breakAccumulator = 0;
			}
		} else if (!neutral) {
			breakAccumulator = 0;
		}

		if (driving) {
			drivingSinceBreak += duration;

			if (drivingSinceBreak > MAX_DRIVING_BEFORE_BREAK_MS) {
				violations.push(
					"[" + label + "] break violation detected\n" +
					"shiftOpenedAt=" + shiftOpenedAt + "\n" +
					"shiftOpenSource=" + briefLog(shiftOpenSourceLog) + "\n" +
					"violatingLog=" + briefLog(log) + "\n" +
					"drivingSinceLastValidBreakHours=" +
					(drivingSinceBreak / 3600000).toFixed(2)
				);
			}
		}
	}

	return violations;
}

function buildDateRange(startDate, endDate) {
	const result = [];
	const start = new Date(`${startDate}T00:00:00.000Z`);
	const end = new Date(`${endDate}T00:00:00.000Z`);

	for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
		const y = d.getUTCFullYear();
		const m = String(d.getUTCMonth() + 1).padStart(2, "0");
		const day = String(d.getUTCDate()).padStart(2, "0");
		result.push(`${y}-${m}-${day}T11:00:00.000Z`);
	}

	return result;
}

function extractMessage(payload) {
	if (!payload) return null;
	if (typeof payload === "string") return payload;

	if (typeof payload.message === "string") return payload.message;
	if (Array.isArray(payload.message)) return payload.message.join(" | ");

	if (typeof payload.error === "string") return payload.error;
	if (Array.isArray(payload.error)) return payload.error.join(" | ");

	if (Array.isArray(payload.errors)) {
		return payload.errors
			.map((x) => {
				if (typeof x === "string") return x;
				if (x && typeof x.message === "string") return x.message;
				return JSON.stringify(x);
			})
			.join(" | ");
	}

	return null;
}

async function fetchJson(url, options = {}) {
	const res = await fetch(url, options);
	const text = await res.text();

	let data = null;
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = { rawText: text };
		}
	} else {
		data = {};
	}

	if (!res.ok) {
		const message = extractMessage(data) || `HTTP ${res.status}`;
		const err = new Error(message);
		err.status = res.status;
		err.payload = data;
		throw err;
	}

	return data;
}

async function getAllDrivers() {
	const drivers = [];
	let page = 1;
	const perPage = 100;

	while (true) {
		const params = new URLSearchParams({
			page: String(page),
			perPage: String(perPage),
			searchUserName: "",
			searchName: "",
			searchEmail: "",
			searchLicenseNumber: "",
			uid: "",
			companyUid: "",
			companyId: String(DRIVER_API_COMPANY_ID),
			publicId: "",
			status: "true",
			role: "driver",
		});

		const url = `${DRIVER_API_BASE}/api/users/searching-list?${params.toString()}`;

		const json = await fetchJson(url, {
			headers: {
				Accept: "application/json, text/plain, */*",
				Authorization: DRIVER_API_AUTH,
			},
		});

		const rows = Array.isArray(json?.data) ? json.data : [];
		drivers.push(...rows);

		if (rows.length < perPage) break;
		page += 1;
	}

	return drivers
		.filter((d) => d && d.uid)
		.map((d) => ({
			id: d.id,
			uid: d.uid,
			username: d.username || null,
			first_name: d.first_name || null,
			second_name: d.second_name || null,
			companyId: d.companyId || null,
			publicId: d.publicId || null,
		}));
}

async function getDailyLogs(driverUid, dayIso) {
	const url = `${LOG_API_BASE}/api/dashboards/get-daily-logs/${driverUid}/${encodeURIComponent(dayIso)}`;

	const json = await fetchJson(url, {
		headers: {
			Accept: "application/json, text/plain, */*",
			Authorization: LOG_API_AUTH,
			companyuid: LOG_API_COMPANY_UID,
			"Cache-Control": "no-cache, no-store, must-revalidate",
		},
	});

	return Array.isArray(json?.logs) ? json.logs : [];
}

function isCandidateLog(log) {
	const key = `${Number(log?.event_type)}:${Number(log?.event_code)}`;
	return (
		ALLOWED_LOG_KEYS.has(key) &&
		log?.inspection !== true &&
		log?.vehicleId != null
	);
}

function isDriverSkipped(logs) {
	return logs.some((log) => log?.inspection === true && log?.vehicleId == null);
}

async function callAutoShift(driverUid, log, isCycle) {
	const params = new URLSearchParams({
		driverUid: String(driverUid),
		logId: String(log.id),
		isCycle: String(isCycle),
		isVerified: "false",
		checkOregon: "true",
	});

	const url = `${LOG_API_BASE}/api/logs/auto-shift?${params.toString()}`;

	try {
		const body = await fetchJson(url, {
			method: "POST",
			headers: {
				Accept: "application/json, text/plain, */*",
				Authorization: LOG_API_AUTH,
				companyuid: AUTO_SHIFT_COMPANY_UID,
				"Content-Length": "0",
				"Cache-Control": "no-cache, no-store, must-revalidate",
			},
			body: "",
		});

		const violations = [];
		violations.push(...checkBreakViolations(body?.logs, "logs"));
		violations.push(
			...checkBreakViolations(body?.originalLogs, "originalLogs"),
		);

		if (violations.length > 0) {
			return {
				ok: false,
				kind: "break_violation",
				message: violations.join("\n\n"),
				response: body,
			};
		}

		return {
			ok: true,
			response: body,
		};
	} catch (err) {
		return {
			ok: false,
			kind: "api_error",
			message: err.message || "Unknown auto-shift error",
			status: err.status ?? null,
			response: err.payload ?? null,
		};
	}
}

async function main() {
	const days = buildDateRange(START_DATE, END_DATE);
	const drivers = await getAllDrivers();

	const output = {
		generatedAt: new Date().toISOString(),
		range: {
			startDate: START_DATE,
			endDate: END_DATE,
		},
		skippedDrivers: [],
		errors: [],
	};

	for (const driver of drivers) {
		let allLogs = [];

		try {
			for (const dayIso of days) {
				const dayLogs = await getDailyLogs(driver.uid, dayIso);
				allLogs.push(...dayLogs);
			}
		} catch (err) {
			output.errors.push({
				driverId: driver.id,
				driverUid: driver.uid,
				errorType: "daily_logs_fetch_error",
				message: err.message || "Failed to fetch daily logs",
			});
			continue;
		}

		const uniqueLogsMap = new Map();
		for (const log of allLogs) {
			if (log && log.id != null && !uniqueLogsMap.has(log.id)) {
				uniqueLogsMap.set(log.id, log);
			}
		}

		const uniqueLogs = [...uniqueLogsMap.values()];

		if (isDriverSkipped(uniqueLogs)) {
			output.skippedDrivers.push({
				driverId: driver.id,
				driverUid: driver.uid,
				reason: "inspection_true_and_vehicleId_null_found",
			});
			continue;
		}

		const candidateLogs = uniqueLogs.filter(isCandidateLog);

		for (const log of candidateLogs) {
			for (const isCycle of [false, true]) {
				const result = await callAutoShift(driver.uid, log, isCycle);

				if (!result.ok && result.kind === "break_violation") {
					output.errors.push({
						driverId: driver.id,
						driverUid: driver.uid,
						logIds: [log.id],
						logId: log.id,
						start_date: log.start_date || null,
						end_date: log.end_date || null,
						isCycle,
						errorType: result.kind,
						message: result.message,
						status: result.status ?? null,
					});
				}
			}
		}
	}

	await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
	console.log(
		`Done. Wrote ${output.errors.length} error records to ${OUTPUT_FILE}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
