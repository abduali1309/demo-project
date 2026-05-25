const URL =
  "https://uat.tteld.com/api/tracking-by-range?accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkcml2ZXJJZCI6MTUzNiwidmVoaWNsZUlkIjoyOTIsImlhdCI6MTc3MDAwMzI2MCwiZXhwIjoxNzcwMDg5NjYwfQ.CCmgexcd3wYEsAxjEI8wiTnVWQEqAMC1JdbdN7NRVGE&date=2026-01-13T11%3A00%3A00.000Z";

const DURATION_MS = 2 * 60 * 1000; // 2 minutes
const REQUEST_TIMEOUT_MS = 10_000; // safety timeout

let attempt = 0;
let failures = [];

const startTime = Date.now();

async function callApi() {
  attempt++;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const started = Date.now();

  try {
    const res = await fetch(URL, { signal: controller.signal });
    const elapsed = Date.now() - started;

    if (!res.ok) {
      failures.push({
        attempt,
        status: res.status,
        timeMs: elapsed,
      });

      console.error(
        `❌ Attempt #${attempt} FAILED | status=${res.status} | ${elapsed}ms`
      );
    } else {
      console.log(
        `✅ Attempt #${attempt} OK | status=${res.status} | ${elapsed}ms`
      );
    }
  } catch (err) {
    const elapsed = Date.now() - started;

    failures.push({
      attempt,
      status: "NETWORK_ERROR",
      error: err.name,
      timeMs: elapsed,
    });

    console.error(
      `❌ Attempt #${attempt} ERROR | ${err.name} | ${elapsed}ms`
    );
  } finally {
    clearTimeout(timeout);
  }
}

(async () => {
  console.log("🚀 Starting 2-minute nonstop API test...\n");

  while (Date.now() - startTime < DURATION_MS) {
    await callApi(); // NO delay → nonstop
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`Total attempts: ${attempt}`);
  console.log(`Failed attempts: ${failures.length}`);

  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach(f =>
      console.log(
        `#${f.attempt} → ${f.status} (${f.timeMs}ms)`
      )
    );
  }
})();
