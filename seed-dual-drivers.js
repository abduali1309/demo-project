// seed-dual-drivers.js
// Node 18+
// Usage:
//   UAT_AUTH="..." UAT_COMPANY_UID="..." FLEET_AUTH="..." FLEET_COMPANY_UID="..." node seed-dual-drivers.js

const crypto = require("crypto");


const TARGETS = {
  uat: {
    name: "uat",
    url: "https://uat.tteld.com/api/dashboards/v2/driveradd",
    auth: "1EMuPaKU1BnXcbrlTPadm4CcjpC1KYWCnE3AtowUChXJQFvVp3vta3SLMEmdEXNa",
    companyUid: "d350c824-f52f-4b71-a5e9-5569965a6cb6",
    origin: "https://extraordinary-fox-f7756f.netlify.app",
    referer: "https://extraordinary-fox-f7756f.netlify.app/",
    secFetchSite: "cross-site",
  },
  fleetvision: {
    name: "fleetvision",
    url: "https://front-api.gofleetvision.com/api/dashboards/v2/driveradd",
    auth: "vBDtf2jUkVl6I8s0gykbakAuMQ94WrrkqsDCNwEICFD0yR6cihFvfBNJr5YVkDCW",
    companyUid: "c292022b-71f6-4a27-8d25-83a04d37858b",
    origin: "https://dash.test.gofleetvision.com",
    referer: "https://dash.test.gofleetvision.com/",
    secFetchSite: "same-site",
  },
};

const MAX_RETRIES = 6;
const RUN_ID = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;

const CASES = [
  { id: 1,  focus: "username",         scenario: "both active, older activatedAt wins" },
  { id: 2,  focus: "username",         scenario: "one inactive, inactive record wins" },
  { id: 3,  focus: "username",         scenario: "both inactive, older createdAt wins" },
  { id: 4,  focus: "username",         scenario: "missing activatedAt, fall back to createdAt" },
  { id: 5,  focus: "username",         scenario: "equal timestamps, stable fallback" },

  { id: 6,  focus: "email",            scenario: "both active, older activatedAt wins" },
  { id: 7,  focus: "email",            scenario: "one inactive, inactive record wins" },
  { id: 8,  focus: "email",            scenario: "both inactive, older createdAt wins" },
  { id: 9,  focus: "email",            scenario: "missing activatedAt, fall back to createdAt" },
  { id: 10, focus: "email",            scenario: "equal timestamps, stable fallback" },

  { id: 11, focus: "license",          scenario: "both active, older activatedAt wins" },
  { id: 12, focus: "license",          scenario: "one inactive, inactive record wins" },
  { id: 13, focus: "license",          scenario: "both inactive, older createdAt wins" },
  { id: 14, focus: "license",          scenario: "missing activatedAt, fall back to createdAt" },
  { id: 15, focus: "license",          scenario: "equal timestamps, stable fallback" },

  { id: 16, focus: "username+email",   scenario: "both active, older activatedAt wins" },
  { id: 17, focus: "username+license", scenario: "one inactive, inactive record wins" },
  { id: 18, focus: "email+license",    scenario: "both inactive, older createdAt wins" },
  { id: 19, focus: "all-three",        scenario: "both active, older activatedAt wins" },
  { id: 20, focus: "all-three",        scenario: "missing activatedAt, fall back to createdAt" },
];

const NAME_PAIRS = [
  ["Quartz", "Lemon"],
  ["Harbor", "Juniper"],
  ["Velvet", "Orion"],
  ["Mosaic", "Cedar"],
  ["Nimbus", "Falcon"],
  ["Echo", "Bamboo"],
  ["Atlas", "Willow"],
  ["Cobalt", "Pine"],
  ["Matrix", "Raven"],
  ["Aster", "Drift"],
  ["Ruby", "Sage"],
  ["Delta", "Canyon"],
  ["Nova", "Petal"],
  ["Onyx", "Summit"],
  ["Pulse", "Amber"],
  ["Zenith", "Maple"],
  ["Arbor", "Comet"],
  ["Fable", "Brook"],
  ["Slate", "Iris"],
  ["Vertex", "Aurora"],
];

const STATES = [
  "Alabama",
  "Arizona",
  "Connecticut",
  "Florida",
  "Georgia",
  "Nevada",
  "New York",
  "Ohio",
  "Oregon",
  "Texas",
];

function requireEnv() {
  const missing = [];
  for (const [key, target] of Object.entries(TARGETS)) {
    if (!target.auth) missing.push(`${key}.auth`);
    if (!target.companyUid) missing.push(`${key}.companyUid`);
  }
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randHex(bytes = 6) {
  return crypto.randomBytes(bytes).toString("hex");
}

function makeIdentity(caseId, attempt) {
  const pair = NAME_PAIRS[(caseId - 1) % NAME_PAIRS.length];
  const salt = randHex(3).toUpperCase();

  const first_name = `${pair[0]}${salt.slice(0, 2)}`;
  const second_name = `${pair[1]}${salt.slice(2)}${caseId}`;

  const username = `u${caseId}_${attempt}_${randHex(2)}`.toLowerCase();
  const email = `case${caseId}.${attempt}.${randHex(2)}@mail.test`.toLowerCase();

  // Very different across cases and attempts
  const license_number = `${randHex(3).toUpperCase()}${randHex(3).toUpperCase()}${caseId}${attempt}`;

  return { first_name, second_name, username, email, license_number };
}

function buildPayload(testCase, attempt) {
  const identity = makeIdentity(testCase.id, attempt);

  return {
    state: "",
    first_name: identity.first_name,
    second_name: identity.second_name,
    username: identity.username,
    codriverUid: "",
    vehicleUid: "",
    email: identity.email,
    address: "test",
    license_number: identity.license_number,
    license_state: STATES[(testCase.id - 1) % STATES.length],
    phone: `(55${testCase.id}) ${String(attempt).padStart(3, "0")}-${randHex(2)}`,
    address1: "",
    address2: "",
    zip_code: "",
    city: "",
    notes: `RUN=${RUN_ID} CASE=${String(testCase.id).padStart(2, "0")} FOCUS=${testCase.focus} SCENARIO=${testCase.scenario}`,
    colors: "",
    password: "123456",
    settings: {
      disable_send_integration: false,
      adverse_driving_conditions: true,
      enable_personal_conveyance: true,
      enable_ssb: true,
      enable_yard_move: true,
      short_haul: true,
    },
    driverType: null,
    documents: null,
  };
}

async function postDriver(target, payload) {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Authorization: target.auth,
    companyuid: target.companyUid,
    Origin: target.origin,
    Referer: target.referer,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": target.secFetchSite,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8,ru;q=0.7",
  };

  const res = await fetch(target.url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: res.status, ok: res.ok, body };
}

async function createCase(testCase) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const payload = buildPayload(testCase, attempt);

    const uat = await postDriver(TARGETS.uat, payload);

    if (uat.status === 400 || uat.status === 422) {
      console.log(`CASE ${String(testCase.id).padStart(2, "0")} UAT rejected with ${uat.status}, regenerating...`);
      await sleep(250);
      continue;
    }

    if (uat.status >= 500) {
      console.log(`CASE ${String(testCase.id).padStart(2, "0")} UAT got ${uat.status}, retrying...`);
      await sleep(300);
      continue;
    }

    const fleet = await postDriver(TARGETS.fleetvision, payload);

    if (fleet.status === 400 || fleet.status === 422) {
      console.log(`CASE ${String(testCase.id).padStart(2, "0")} fleetvision rejected with ${fleet.status}, regenerating...`);
      await sleep(250);
      continue;
    }

    if (fleet.status >= 500) {
      console.log(`CASE ${String(testCase.id).padStart(2, "0")} fleetvision got ${fleet.status}, skipping as allowed.`);
    }

    return { caseId: testCase.id, payload, uat, fleet };
  }

  throw new Error(`CASE ${String(testCase.id).padStart(2, "0")} failed after ${MAX_RETRIES} attempts`);
}

async function main() {
  requireEnv();

  const results = [];
  for (const testCase of CASES) {
    console.log(`\n--- CASE ${String(testCase.id).padStart(2, "0")} | ${testCase.focus} | ${testCase.scenario} ---`);
    const result = await createCase(testCase);
    results.push(result);

    console.log(`UAT status: ${result.uat.status}`);
    console.log(`Fleetvision status: ${result.fleet.status}`);
    console.log(`username=${result.payload.username}`);
    console.log(`email=${result.payload.email}`);
    console.log(`license_number=${result.payload.license_number}`);
  }

  console.log("\n=== DONE ===");
  console.table(
    results.map((r) => ({
      case: String(r.caseId).padStart(2, "0"),
      username: r.payload.username,
      email: r.payload.email,
      license_number: r.payload.license_number,
      uat: r.uat.status,
      fleetvision: r.fleet.status,
    }))
  );
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
});