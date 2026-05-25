#!/usr/bin/env ts-node
/**
 * fix-errors.ts
 *
 * Usage:
 *   npx ts-node fix-errors.ts <DRIVER_UID> <startDate> <endDate>
 *
 * Example:
 *   npx ts-node fix-errors.ts b1efb72b-4eb8-41f0-9145-377c6d85f67e 2025-11-01 2025-11-03
 *
 * Notes:
 * - Date param appended as T11:00:00.000Z (exactly as requested).
 * - Replace AUTH_TOKEN and COMPANY_UID below with your real tokens/headers.
 * - The script repeats GET -> PATCH until the GET returns no items containing
 *   expectedOdometer OR expectedEngineHours, or until maxAttempts is reached.
 */

import axios, { AxiosInstance, AxiosError } from "axios";

// if (process.argv.length < 5) {
//   console.error("Usage: npx ts-node fix-errors.ts <DRIVER_UID> <startDate> <endDate>");
//   process.exit(1);
// }

// 2e12b5d3-3787-4704-b497-620093ed549c - john
// b1efb72b-4eb8-41f0-9145-377c6d85f67e - arthur
// 03677503-ac0e-4d19-af0d-13167138663d - charles
const DRIVER_UIDS = ["81929fe6-d053-477d-bb2e-ebf89df6330e"]; //   20b51c7d-a04f-4461-83f8-1d7687e37280
const START_DATE = "2025-12-01";
const END_DATE = "2025-12-07";

// === CONFIG ===
const BASE = "https://njtest.tteld.com";
const AUTH_TOKEN =
	"ydelVbGyhEZnlVkm54zqWVbf7vIrPKzjUm0Zbxh6a9xFMtvyTKFtpVWxLhryQ9gv"; // replace if needed
const COMPANY_UID = "399519c7-902e-40e0-9be8-e6749cf76f76"; // replace if needed
const MAX_ATTEMPTS_PER_DAY = 35;
const SLEEP_MS = 100;

// === Helpers ===
function isoAt11(date: Date) {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}T11:00:00.000Z`;
}
function parseDateStrict(s: string) {
	const d = new Date(s);
	if (Number.isNaN(d.getTime())) throw new Error("Invalid date: " + s);
	return d;
}
function addDays(d: Date, days: number) {
	const n = new Date(d);
	n.setUTCDate(n.getUTCDate() + days);
	return n;
}
function sleep(ms = 0) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
function unique<T>(arr: T[]) {
	return Array.from(new Set(arr));
}

// === Axios client ===
const client: AxiosInstance = axios.create({
	baseURL: BASE,
	headers: {
		Accept: "application/json, text/plain, */*",
		Authorization: AUTH_TOKEN,
		companyuid: COMPANY_UID,
		"Content-Type": "application/json",
	},
	//   timeout: 2000,
});

// === Types (partial) ===
type ErrorItem = {
	logId: number;
	expectedOdometer?: number | null;
	expectedEngineHours?: number | null;
	codriver?: { uid?: string };
	previous?: {
		driver?: { uid?: string };
		codriver?: { uid?: string };
	};
	// other fields omitted...
};

type DailyLog = {
	id: number;
	status?: string;
	address?: string | null;
	note?: string | null;
	event_code?: number | null;
	event_type?: number | null;
	inspection?: boolean | null;
	coordinates?: { lng?: number; lat?: number } | null;
	odometr?: number | null;
	engine_hours?: number | null;
	vehicleUid?: string | null;
	document?: string | null;
	trailer?: string | null;
	codriverUid?: string | null;
	driverUid?: string | null;
	// plus many other fields we will ignore
	[k: string]: any;
};

// === API calls ===
async function fetchErrors(
	driverUid: string,
	dateISO: string
): Promise<ErrorItem[]> {
	const url = `/api/logs/errors/${encodeURIComponent(
		driverUid
	)}?date=${encodeURIComponent(dateISO)}`;
	const res = await client.get<ErrorItem[]>(url);
	return res.data;
}

async function fetchDailyLogsFor(
	uid: string,
	dateISO: string
): Promise<DailyLog[]> {
	const url = `/api/dashboards/get-daily-logs/${encodeURIComponent(
		uid
	)}/${encodeURIComponent(dateISO)}`;
	const res = await client.get<{ logs: DailyLog[] }>(url);
	return res.data?.logs ?? [];
}
async function patchLog(
	driverUidForPatch: string,
	logId: number,
	dateISO: string,
	body: Record<string, any>
) {
	const url = `/api/dashboards/v3/logedit/${encodeURIComponent(
		driverUidForPatch
	)}/${encodeURIComponent(String(logId))}?date=${encodeURIComponent(dateISO)}`;
	return client.patch(url, body);
}

// Build patch body from full log but overwrite odometr / engine_hours with expected values if present.
// Keep minimal necessary keys commonly required by your backend.
function buildPatchBodyFromLog(
	fullLog: DailyLog,
	expectedOdometer?: number | null,
	expectedEngineHours?: number | null
) {
	const body: any = {
		id: String(fullLog.id),
		status: fullLog.status,
		address: fullLog.address ?? "",
		note: fullLog.note ?? "",
		document: fullLog.document ?? null,
		trailer: fullLog.trailer ?? null,
		vehicleUid: fullLog.vehicleUid ?? null,
		event_code: fullLog.event_code ?? fullLog.eventCode ?? null,
		event_type: fullLog.event_type ?? fullLog.eventType ?? null,
		inspection: fullLog.inspection ?? false,
		coordinates: fullLog.coordinates ?? fullLog.gps_coordinates ?? null,
		codriverUid: fullLog.codriverUid ?? null,
		driverUid: fullLog.driverUid ?? null,
		// keep original odometr/engine_hours but overwrite if expected values exist
		odometr:
			typeof expectedOdometer === "number"
				? expectedOdometer
				: fullLog.odometr ?? null,
		engine_hours:
			typeof expectedEngineHours === "number"
				? expectedEngineHours
				: fullLog.engine_hours ?? null,
	};

	// Remove undefined keys (but keep nulls)
	for (const k of Object.keys(body)) {
		if (body[k] === undefined) delete body[k];
	}

	return body;
}

// Try to find the full log object for a given error item by calling get-daily-logs for candidate UIDs.
async function findFullLogForError(
	item: ErrorItem,
	dateISO: string,
	initialDriverUid: string
): Promise<DailyLog | null> {
	const candidates = unique(
		[
			initialDriverUid,
			item.codriver?.uid,
			item.previous?.driver?.uid,
			item.previous?.codriver?.uid,
		].filter(Boolean) as string[]
	);

	for (const uid of candidates) {
		try {
			const logs = await fetchDailyLogsFor(uid, dateISO);
			if (!logs || logs.length === 0) continue;
			const found = logs.find((l) => Number(l.id) === Number(item.logId));
			if (found) return found;
		} catch (err) {
			console.warn(
				`  warning: failed to fetch daily logs for uid=${uid}:`,
				(err as any)?.message || err
			);
			// try next candidate
		}
		// polite pause
		// await sleep(120);
	}

	return null;
}

// Process a single date (YYYY-MM-DDT11:00:00.000Z)
async function processDate(dateISO: string, initialDriverUid: string) {
	console.log(`\n`);

	console.log(`Processing ${dateISO}`);
	let attempts = 0;
	const patchedLogIds = new Set<number>();

	while (attempts < MAX_ATTEMPTS_PER_DAY) {
		attempts++;
		// console.log(`  [attempt ${attempts}] GET errors...`);
		let errorItems: ErrorItem[] = [];
		try {
			errorItems = await fetchErrors(initialDriverUid, dateISO);
		} catch (err) {
			// console.error("  GET errors failed:", (err as any).message || err);
			// await sleep(SLEEP_MS);
			continue;
		}

		const toFix = errorItems.filter(
			(it) =>
				it &&
				((it.expectedOdometer !== undefined && it.expectedOdometer !== null) ||
					(it.expectedEngineHours !== undefined &&
						it.expectedEngineHours !== null))
		);

		if (toFix.length === 0) {
			// console.log(`  ✅ No items with expectedOdometer/expectedEngineHours found (done for ${dateISO})`);
			return { day: dateISO, attempts, patched: Array.from(patchedLogIds) };
		}
		// console.log(`  Found ${toFix.length} item(s) to patch.`);
		for (const item of toFix) {
			// console.log(`    - handling logId=${item.logId} (expectedOdometer=${item.expectedOdometer ?? "N/A"}, expectedEngineHours=${item.expectedEngineHours ?? "N/A"})`);

			// 1) find the full log object
			let fullLog: DailyLog | null = null;
			try {
				fullLog = await findFullLogForError(item, dateISO, initialDriverUid);
			} catch (err) {
				// console.warn(`      ! error while searching full log: ${(err as any).message || err}`);
			}

			if (!fullLog) {
				// console.error(`      !!! Could not find full log for logId=${item.logId}. Skipping.`);
				continue;
			}

			// 2) build patch body from full log but overwrite odometr / engine_hours
			const patchBody = buildPatchBodyFromLog(
				fullLog,
				item.expectedOdometer,
				item.expectedEngineHours
			);

			// 3) call PATCH
			try {
				const res = await patchLog(
					fullLog.driverUid ?? initialDriverUid,
					item.logId,
					dateISO,
					patchBody
				);
				// console.log(`      -> patched logId=${item.logId} (driverUid=${fullLog.driverUid})`);
				patchedLogIds.add(item.logId);
			} catch (err) {
				const ae = err as AxiosError;
				// console.error(`      !!! patch failed for logId=${item.logId}:`, ae.message);
				if (ae.response) {
					// console.error("         status:", ae.response.status, "body:", JSON.stringify(ae.response.data));
				}
			}

			// await sleep(SLEEP_MS);
		}

		// small pause, then re-check errors
		// await sleep(SLEEP_MS * 3);r
	}

	// console.warn(`  ⚠️ Reached max attempts (${MAX_ATTEMPTS_PER_DAY}) for ${dateISO}. Items may remain.`);
	return {
		day: dateISO,
		attempts,
		patched: Array.from(patchedLogIds),
		warning: "maxAttemptsReached",
	};
}

// iterate days
async function runAll(
	driverUid: string,
	startDateStr: string,
	endDateStr: string
) {
	const start = parseDateStrict(startDateStr);
	const end = parseDateStrict(endDateStr);
	if (start.getTime() > end.getTime())
		throw new Error("startDate must be <= endDate");

	const summary: any[] = [];
	for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
		const dateISO = isoAt11(d);
		try {
			const res = await processDate(dateISO, driverUid);
			summary.push(res);
		} catch (err) {
			console.error(
				`Error processing ${dateISO}:`,
				(err as any).message || err
			);
			summary.push({ day: dateISO, error: (err as any).message || err });
		}
	}

	return summary;
}

// === entrypoint ===
(async () => {
	try {
		for (let uid of DRIVER_UIDS) {
			const summary = await runAll(uid, START_DATE, END_DATE);
			console.log("\n=== Summary ===");
			console.log(JSON.stringify(summary, null, 2));
		}
		process.exit(0);
	} catch (err) {
		console.error("Fatal error:", (err as any).message || err);
		process.exit(2);
	}
})();
