
import axios from 'axios';

// ----------------- CONFIG -----------------
const DEVICES_API_BASE = 'https://addmin-api.tteld.com';
const DEVICES_PATH = '/api/devices/list';
const DEVICES_QUERY = {
  page: 1,
  perPage: 1000, // adjust if you want fewer per page
  userId: '',
  searchModel: '',
  isActive: false,
  searchDeviceType: 'Android',
  searchAppVersion: '',
  searchVersionCode: 754,
  searchEldType: ''
};
const DEVICES_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,ru;q=0.7',
  Authorization: 'OV3bRgNSYnolb8zPv9QBfmvA2MVaetVnWnGELvApqpftvetztZ9zFfxxSetTI307',
  Origin: 'https://addmin.tteld.com',
  Referer: 'https://addmin.tteld.com/'
};

// Report-calculate endpoint config
const REPORT_BASE = 'https://j7.tteld.net';
const REPORT_PATH = '/test/report-calcuate/';
const REPORT_KEY = 'I4LXkwGLXOkNOUODcyBu07FxRGMG2Jmk';
const REPORT_AUTH = 'Ezf2JFGuTSFVqBOvVKxOL1YjBI8XjtmY9gbNTRj9WqjlbhARqJCVG1qsDCND7D2J';
const FROM_DATE = '01-12-2025';
const TO_DATE = '31-12-2025';

// Optional throttling: milliseconds to wait between calls to report endpoint
const REPORT_DELAY_MS = 200; // increase if you hit rate limits

// ------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDevicesPage(page) {
  const params = { ...DEVICES_QUERY, page };
  const url = `${DEVICES_API_BASE}${DEVICES_PATH}`;
  try {
    const res = await axios.get(url, { params, headers: DEVICES_HEADERS });
    return res.data?.data || [];
  } catch (err) {
    console.error(`Error fetching devices page ${page}:`, err?.response?.status, err?.message);
    throw err;
  }
}

async function callReportCalculate(companyId, vehicleId) {
  const url = `${REPORT_BASE}${REPORT_PATH}`;
  const params = new URLSearchParams({
    from_date: FROM_DATE,
    key: REPORT_KEY,
    to_date: TO_DATE,
    companyId: String(companyId),
    vehicleId: String(vehicleId)
  }).toString();

  try {
    const res = await axios.get(`${url}?${params}`, {
      headers: {
        Authorization: REPORT_AUTH,
        Accept: 'application/json'
      },
      timeout: 120000
    });
    return res.data;
  } catch (err) {
    console.error(`Error calling report for companyId=${companyId} vehicleId=${vehicleId}:`, err?.response?.status, err?.message);
    // return null so caller can skip
    return null;
  }
}

function computeMetrics(data) {
  // safe guards
  const activity = Array.isArray(data?.activity) ? data.activity : [];
  const ifta = Array.isArray(data?.ifta) ? data.ifta : [];
  const iftaByLog = Array.isArray(data?.iftaByLog) ? data.iftaByLog : [];
  const bothArr = Array.isArray(data?.both) ? data.both : [];

  let totalActivityJump = 0;
  let totalIftaJump = 0;

  const totalactivity = activity.reduce((sum, item) => {
    totalActivityJump += item?.jump || 0;
    return sum + (item?.miles || 0);
  }, 0);

  const totalifta = ifta.reduce((sum, item) => {
    totalIftaJump += item?.jump || 0;
    return sum + (item?.miles || 0);
  }, 0);

  const totalIftaByLog = iftaByLog.reduce((sum, item) => {
    return sum + (item?.miles || 0);
  }, 0);

  const both = bothArr.reduce((sum, item) => {
    return sum + (item?.miles || 0);
  }, 0);

  return {
    totalactivity,
    totalActivityJump,
    totalifta,
    totalIftaJump,
    totalIftaByLog,
    both,
    diff_with_ifta: both - (totalifta + totalIftaJump),
    diff_with_ifta_by_log: both - totalIftaByLog
  };
}

async function main() {
  console.log('Starting batch report-calculate...');
  const results = [];

  let page = 1;
  while (true) {
    console.log(`Fetching devices page ${page}...`);
    const devices = await fetchDevicesPage(page);
    if (!devices || devices.length === 0) {
      console.log('No more devices, finishing.');
      break;
    }

    for (const d of devices) {
      // Extract companyId and vehicleId from nested user object
      const user = d?.user || {};
      const companyId = user?.companyId ?? d?.companyId ?? null;
      const vehicleId = user?.vehicleId ?? user?.vehicle?.id ?? d?.vehicleId ?? null;

      if (!companyId || !vehicleId) {
        console.warn('Skipping device without companyId or vehicleId:', d?.id);
        continue;
      }

      console.log(`Calling report for companyId=${companyId} vehicleId=${vehicleId} (deviceId=${d?.id})`);
      const data = await callReportCalculate(companyId, vehicleId);
      if (!data) {
        console.warn(`No data for companyId=${companyId} vehicleId=${vehicleId}`);
        continue;
      }

      const metrics = computeMetrics(data);

      results.push({
        companyId,
        vehicleId,
        deviceId: d?.id,
        both: metrics.both,
        diff_with_ifta: metrics.diff_with_ifta,
        diff_with_ifta_by_log: metrics.diff_with_ifta_by_log,
        totalactivity: metrics.totalactivity,
        totalActivityJump: metrics.totalActivityJump,
        totalifta: metrics.totalifta,
        totalIftaJump: metrics.totalIftaJump,
        totalIftaByLog: metrics.totalIftaByLog
      });

      // throttle
      if (REPORT_DELAY_MS > 0) await sleep(REPORT_DELAY_MS);
    }

    page += 1;
  }

  console.log('\nResults:');
  console.table(results);
  console.log(`Processed ${results.length} report requests.`);
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
