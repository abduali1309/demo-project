// rate-limit-checker.ts
// Run with: ts-node rate-limit-checker.ts
// Or compile with tsc and run with node.
//
// Requires Node.js 18+ (for built-in fetch).

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RateLimitTestConfig {
  url: string;
  method: Method;
  headers?: Record<string, string>;
  body?: string;
  requestsPerSecond: number;
  durationSeconds: number;
  timeoutMs?: number;
  maxInFlight?: number;
  logEverySecond?: boolean;
}

const config: RateLimitTestConfig = {
  url: "https://btest.tteld.com/api/v2/units-by-usdot/12345",
  method: "GET",
  headers: {
    "x-api-key": "9xf8vob1oeufotyaq0ud3gf4h1c849a1b2c3d4e5f6g",
    "provider-token": "2ufkwccftfxhukiyapwi1qj23txsm5a1b2c3d4e5f6g",
    "accept": "application/json",
  },
  requestsPerSecond: 100,
  durationSeconds: 10,
  timeoutMs: 10_000,
  maxInFlight: 2000,
  logEverySecond: true,
};

type Stats = {
  sent: number;
  completed: number;
  ok2xx: number;
  rateLimited429: number;
  other4xx: number;
  other5xx: number;
  networkError: number;
  timeoutError: number;
  statusCounts: Record<number, number>;
};

const stats: Stats = {
  sent: 0,
  completed: 0,
  ok2xx: 0,
  rateLimited429: 0,
  other4xx: 0,
  other5xx: 0,
  networkError: 0,
  timeoutError: 0,
  statusCounts: {},
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOneRequest(id: number): Promise<void> {
  stats.sent++;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.body,
      signal: controller.signal,
    });

    const status = response.status;
    stats.statusCounts[status] = (stats.statusCounts[status] || 0) + 1;
    stats.completed++;

    if (status >= 200 && status < 300) {
      stats.ok2xx++;
    } else if (status === 429) {
      stats.rateLimited429++;
    } else if (status >= 400 && status < 500) {
      stats.other4xx++;
    } else if (status >= 500) {
      stats.other5xx++;
    }

    // Optional: print a few sample responses if needed
    if (id < 5) {
      console.log(`[${id}] status=${status}`);
    }
    console.log(`Message = ${response.statusText}`);
  } catch (err: any) {
    stats.completed++;

    if (err?.name === "AbortError") {
      stats.timeoutError++;
    } else {
      stats.networkError++;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  const start = Date.now();
  const durationMs = config.durationSeconds * 1000;
  const intervalMs = 1000;

  let running = true;
  let second = 0;
  let inFlight = 0;
  let nextRequestId = 1;

  console.log("Starting rate limit test");
  console.log(JSON.stringify(config, null, 2));
  console.log("");

  const ticker = setInterval(() => {
    const elapsed = Date.now() - start;
    if (elapsed >= durationMs) {
      running = false;
      clearInterval(ticker);
      return;
    }

    const batchSize = config.requestsPerSecond;
    const remainingInFlightLimit = Math.max(0, (config.maxInFlight ?? Infinity) - inFlight);
    const toSendNow = Math.min(batchSize, remainingInFlightLimit);

    for (let i = 0; i < toSendNow; i++) {
      const id = nextRequestId++;
      inFlight++;

      sendOneRequest(id)
        .catch(() => {
          // Already counted inside sendOneRequest, so nothing else needed.
        })
        .finally(() => {
          inFlight--;
        });
    }

    second++;
    if (config.logEverySecond) {
      console.log(
        `[t+${second}s] sent=${stats.sent} completed=${stats.completed} inFlight=${inFlight} 429=${stats.rateLimited429}`
      );
    }
  }, intervalMs);

  // Wait until test duration ends and in-flight requests finish
  while (running || inFlight > 0) {
    await sleep(200);
  }

  const elapsedSec = (Date.now() - start) / 1000;
  const rps = stats.sent / elapsedSec;
  console.log("\n===== SUMMARY =====");
  console.log(`Target RPS:      ${config.requestsPerSecond}`);
  console.log(`Duration:        ${config.durationSeconds}s`);
  console.log(`Sent:            ${stats.sent}`);
  console.log(`Completed:       ${stats.completed}`);
  console.log(`Actual RPS:      ${rps.toFixed(2)}`);
  console.log(`2xx:             ${stats.ok2xx}`);
  console.log(`429:             ${stats.rateLimited429}`);
  console.log(`Other 4xx:       ${stats.other4xx}`);
  console.log(`Other 5xx:       ${stats.other5xx}`);
  console.log(`Timeouts:        ${stats.timeoutError}`);
  console.log(`Network errors:  ${stats.networkError}`);

  console.log("\nStatus code breakdown:");
  for (const [status, count] of Object.entries(stats.statusCounts).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  )) {
    console.log(`  ${status}: ${count}`);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});