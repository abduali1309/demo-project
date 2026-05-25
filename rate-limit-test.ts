// rate-limit-test.ts
import { writeFileSync } from "node:fs";

type HttpMethod = "GET" | "POST";

type EndpointConfig = {
  name: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
};

type AttemptResult = {
  requestNumber: number;
  ok: boolean;
  status?: number;
  durationMs: number;
  errorType?: "http_error" | "fetch_error" | "timeout";
  errorMessage?: string;
  responseSnippet?: string;
  interestingHeaders?: Record<string, string>;
};

type EndpointReport = {
  name: string;
  url: string;
  method: HttpMethod;
  startedAt: string;
  finishedAt: string;
  totalScheduled: number;
  totalSent: number;
  successCount: number;
  failedAtRequestNumber?: number;
  failedStatus?: number;
  failedReason?: string;
  attempts: AttemptResult[];
  statusCounts: Record<string, number>;
};

const COMPANY_UID = "399519c7-902e-40e0-9be8-e6749cf76f76";
const AUTH_1 = "i2tYxBja1kwSiHytCxBrhbx2rwUTz46LR9JeR5xnPDMPG928StufWZpiiU8FE3Ez";
const AUTH_2 = "AII8MVNpz1UTDDwL2vRToBL6SNqpu2j3eCXWPeC0BMd7OVN9YOjgDx69VzWI3L1R";

const TOTAL_REQUESTS = 1000;
const DURATION_MS = 60_000;
const TIMEOUT_MS = 30_000;
const STOP_ON_FIRST_ERROR = false;
const OUTPUT_FILE = "rate-limit-report.json";

function msSince(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(base: Record<string, string>, body?: unknown): Record<string, string> {
  const headers: Record<string, string> = { ...base };
  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function interestingHeaders(headers: Headers): Record<string, string> {
  const keys = [
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
    "content-type",
  ];

  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = headers.get(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

async function readSnippet(response: Response, limit = 1500): Promise<string> {
  try {
    const text = await response.text();
    return text.length > limit ? `${text.slice(0, limit)}…[truncated]` : text;
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendOne(
  endpoint: EndpointConfig,
  requestNumber: number,
  timeoutMs: number
): Promise<AttemptResult> {
  const started = process.hrtime.bigint();

  try {
    const response = await fetchWithTimeout(
      endpoint.url,
      {
        method: endpoint.method,
        headers: buildHeaders(endpoint.headers, endpoint.body),
        body:
          endpoint.method === "POST" && endpoint.body !== undefined
            ? JSON.stringify(endpoint.body)
            : undefined,
      },
      timeoutMs
    );

    const durationMs = msSince(started);

    if (!response.ok) {
      return {
        requestNumber,
        ok: false,
        status: response.status,
        durationMs,
        errorType: "http_error",
        responseSnippet: await readSnippet(response),
        interestingHeaders: interestingHeaders(response.headers),
      };
    }

    return {
      requestNumber,
      ok: true,
      status: response.status,
      durationMs,
    };
  } catch (err) {
    const durationMs = msSince(started);
    const message = err instanceof Error ? err.message : String(err);

    return {
      requestNumber,
      ok: false,
      durationMs,
      errorType: message.toLowerCase().includes("aborted") ? "timeout" : "fetch_error",
      errorMessage: message,
    };
  }
}

async function testEndpointAtRate(
  endpoint: EndpointConfig,
  totalRequests: number,
  durationMs: number
): Promise<EndpointReport> {
  const startedAt = new Date().toISOString();
  const attempts: AttemptResult[] = [];
  const statusCounts: Record<string, number> = {};

  const spacingMs = durationMs / totalRequests; // 60ms for 1000 requests in 60 seconds
  let stopped = false;
  let sent = 0;
  let successCount = 0;
  let failedAtRequestNumber: number | undefined;
  let failedStatus: number | undefined;
  let failedReason: string | undefined;

  const tasks: Promise<void>[] = [];

  for (let i = 0; i < totalRequests; i++) {
    const requestNumber = i + 1;
    const launchDelay = Math.floor(i * spacingMs);

    tasks.push(
      (async () => {
        await sleep(launchDelay);

        if (stopped) return;

        sent++;
        const result = await sendOne(endpoint, requestNumber, TIMEOUT_MS);
        attempts.push(result);

        if (result.status !== undefined) {
          statusCounts[String(result.status)] = (statusCounts[String(result.status)] ?? 0) + 1;
        }

        if (result.ok) {
          successCount++;
          return;
        }

        failedAtRequestNumber = requestNumber;
        failedStatus = result.status;
        failedReason =
          result.errorType === "http_error"
            ? `HTTP ${result.status}`
            : result.errorType === "timeout"
              ? "timeout"
              : result.errorMessage ?? "request failed";

        if (STOP_ON_FIRST_ERROR) {
          stopped = true;
        }
      })()
    );
  }

  await Promise.all(tasks);

  const finishedAt = new Date().toISOString();

  return {
    name: endpoint.name,
    url: endpoint.url,
    method: endpoint.method,
    startedAt,
    finishedAt,
    totalScheduled: totalRequests,
    totalSent: sent,
    successCount,
    failedAtRequestNumber,
    failedStatus,
    failedReason,
    attempts: attempts.sort((a, b) => a.requestNumber - b.requestNumber),
    statusCounts,
  };
}

async function main(): Promise<void> {
  const endpoints: EndpointConfig[] = [
    {
      name: "movement-report-vehicle",
      method: "GET",
      url:
        "https://j7.tteld.com/api/movement-report/vehicle/909c9120-b715-46fa-944d-19dbafb10e43/2026-04-15T11:00:00.000Z/2026-04-22T11:00:00.000Z",
      headers: {
        Accept: "application/json",
        companyUid: COMPANY_UID,
        Authorization: AUTH_1,
      },
    },
    {
      name: "movement-report-vehicles",
      method: "GET",
      url:
        "https://j7.tteld.com/api/movement-report/vehicles/2026-01-15T11:00:00.000Z/2026-04-22T11:00:00.000Z",
      headers: {
        Accept: "application/json",
        companyUid: COMPANY_UID,
        Authorization: AUTH_1,
      },
    },
    // {
    //   name: "movement-report-regenerate",
    //   method: "POST",
    //   url: "https://j7.tteld.com/api/movement-report/regenerate",
    //   headers: {
    //     Accept: "application/json",
    //     "Content-Type": "application/json",
    //     Authorization: AUTH_2,
    //   },
    //   body: {
    //     companyId: 206,
    //     from_date: "01-02-2026",
    //     to_date: "23-04-2026",
    //     vehicleIds: [292, 107, 293],
    //   },
    // },
    {
      name: "movement-report-file",
      method: "POST",
      url: "https://j7.tteld.com/api/movement-report/file",
      headers: {
        Accept: "application/pdf",
        companyUid: COMPANY_UID,
        "Content-Type": "application/json",
        Authorization: AUTH_1,
      },
      body: {
        from_date: "2026-04-15T09:06:18.132Z",
        to_date: "2026-04-23T09:06:18.132Z",
        type: "pdf",
        vehicleUids: [
          "909c9120-b715-46fa-944d-19dbafb10e43",
          "b405e403-230d-492e-86bd-91ce68adbb69",
          "d0c75c93-8356-4ea4-b53f-5c7ebd58137c",
        ],
      },
    },
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    totalRequestsPerEndpoint: TOTAL_REQUESTS,
    durationMsPerEndpoint: DURATION_MS,
    results: [] as EndpointReport[],
  };

  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint.name} at 1000 requests/min...`);
    const result = await testEndpointAtRate(endpoint, TOTAL_REQUESTS, DURATION_MS);
    report.results.push(result);

    console.log(
      `${endpoint.name}: sent=${result.totalSent}, success=${result.successCount}, ` +
        `failedAt=${result.failedAtRequestNumber ?? "none"}, status=${result.failedStatus ?? "none"}`
    );
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2), "utf8");
  console.log(`Saved report to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});