// post_json_inline.js
// Node 12+
// npm install axios

const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * ===== CONFIGURE THESE =====
 * Edit the POST_URL and JSON_FILE constants below before running.
 */
const POST_URL = 'https://app.gpstab.com/api/client/editlog/Save?driverId=105863&date=2026-05-13T00:00:00';

// Provide path to the JSON file you want to POST (absolute or relative to this script)
const JSON_FILE = path.join(__dirname, 'output', '2026-05-13-converted.json');

const COOKIE_HEADER = '_ga=GA1.1.1424358310.1773145516; __stripe_mid=82e21bef-f53e-4e50-92bf-6b3442b870e16e61db; intercom-id-gy7zu15a=ff339544-5e7a-44bc-83a7-86ec6eef1f35; intercom-device-id-gy7zu15a=140e39b1-a8fb-4b7d-944f-9899290efaf8; login=teamsters_inc%40yahoo.com; _clck=1fhgx57%5E2%5Eg60%5E0%5E2260; gpstab_x=CfDJ8JMeqlX5woVBt80cK6_cNnW7or0Ywtb85bjvi_tFbXTs08dRLwxQjHCmAsVG7FlZw-4oJO1a9okH3ITrfONt3zWi6N_GdDM_O9iNRLGL-SVExr7eHseXfYuzOQoJgAxKeYT5IufjFywNg4DPGfzTXgqi-c_zNehzyqxsDrVRzf54rF83Mt2rWeq3Fz9gyn06zfb1rM3zoyH8GyXnbFLexB9JOiKAw8hBzK5k2o7Bm_OMp1GcVH3zdr9e1nL7yBRbTpK8fBZ-5mKpZpym_1e-SBMF7XQR7wOKgf92Y9EQlNqQrN_3LuRK0QBTYU8PG-Db8JJlHR7mw_Vns7F8CH41JoMPdkhJ_ucRuRmYHlAsXDchkUhjRe383KUuwR9-3NtP1CfHa098dySyxekSqGn5kzE_ifKbqHd4jX8kc8KKPJJOPHnD4lQ_lW66-B3mhCgLHYsfX_A6mxcSO_1CdIE_K0z-CoQL8-hWgcGBWkHdC-W8-VYhLmG8fGqwDf5Q6PKz6AGNuv1iKAi0rBjmbtk8sKKWNdETIrUE93n91bGT2rN7zI6S8_nZveAdbJkVY_OC3TcRQjglHa7NB-M-KMQhOWQoCwcxPEzga2lBpnvZKLPNFcuTFA_PYyJw9Elxi2uDBmCdYyKpyS7TbzecYHh7Kvt7IgD9y4gMPAya5B3AzD7-hy9w0wYwDVpnk-1cHFRgU8Ve9OGITKOs_brdiXHZMt4cbujBd9jfN0JdICXYmdMsgkjbrwFjxMd8az8_ZAoInsAsbuGIZAnuyxUUGDwZck9QCPQInRLGPUIdEdjzt0Fe6PFqxgU7_QD01AYrl_EOQg; login_t=2026-05-13T10%3A13%3A03.784Z; .AspNetCore.Antiforgery.VyLW6ORzMgk=CfDJ8JMeqlX5woVBt80cK6_cNnV7ervzwft2ZhSbdGb2oufUJDxyflm_hYrF5_z1CpcxdXRyYfAeHwNHqhKf6cplh2kwiQ4fny-jlCAI9XYIM584cXcgSoNIapuOf7gQtC69ULBa3tOFC49sZHqaHLijvtc; XSRF-TOKEN=CfDJ8JMeqlX5woVBt80cK6_cNnW2ug2zuvZoxpEds3oCS1AqHvLkJjmhEimJB82-JaeLsfPLRE_l436uOT_I_ETB6rl_jPN6mhMle39DkaVc4mDbb2mADEHlHbmSaLVnL15Qq-gdZ7nDq53v0HgbKCbt_q4; intercom-session-gy7zu15a=OXNINXpkOWUvM2xuZUh5NWFzYTdjeUVDWmFKRisrZ2t5WHMrKzJFNUc2Z0N3UmI4RERYN0ZmdEphSllBdGdxVzk5WlBhS3hsWFVORHovTCtHZVZudnhUcGQrVUN4TWhsN1pQdkdlVTNSUXBreFRMUlJ1MFJxOWNTWi9NWXFmend0QUZNOXBLcWppbGt1TTE5aW1rQ3psaEpLSUFXbGtVbGcrcU8yUUlvNS9RZVBCSGE0T1MveVV0ZVlwKzVFbUhJMjgrTThoQ21FcUhaZThoeitpZC8wUT09LS1mcWlBMjFLd0p0dERkVEhGVTJtOFd3PT0=--503e6675cfb79d7e1c0280b5d51f643f0f7ad43f; _clsk=5bt8gm%5E1778667560670%5E10%5E1%5Eo.clarity.ms%2Fcollect; _ga_EG81099C60=GS2.1.s1778666215$o22$g1$t1778667568$j47$l0$h0'
const XSRF_TOKEN = 'CfDJ8JMeqlX5woVBt80cK6_cNnW2ug2zuvZoxpEds3oCS1AqHvLkJjmhEimJB82-JaeLsfPLRE_l436uOT_I_ETB6rl_jPN6mhMle39DkaVc4mDbb2mADEHlHbmSaLVnL15Qq-gdZ7nDq53v0HgbKCbt_q4'; // the token value
const ORIGIN = 'https://app.gpstab.com';
const COMPANY_UID_HEADER = '42b94f1a-a395-4f7f-8913-a3c88e343292'; // set to null if not needed


// Optional: adjust timeout (ms)
const TIMEOUT = 60000;

async function main() {
  // validate file exists
  if (!fs.existsSync(JSON_FILE)) {
    console.error('JSON file not found:', JSON_FILE);
    process.exit(1);
  }

  // read and validate JSON
  let raw;
  try {
    raw = fs.readFileSync(JSON_FILE, 'utf8');
  } catch (err) {
    console.error('Failed to read file:', err.message);
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error('Invalid JSON in file:', err.message);
    process.exit(3);
  }

  // build headers

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': COOKIE_HEADER,
    'X-XSRF-TOKEN': XSRF_TOKEN,
    'Companyuid': COMPANY_UID_HEADER,
    'Origin': ORIGIN,
    'Accept': 'application/json, text/plain, */*',
    // Optionally copy user-agent from the browser
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...'
  };
  if (COOKIE_HEADER) headers['Cookie'] = COOKIE_HEADER;
  if (XSRF_TOKEN) headers['X-XSRF-TOKEN'] = XSRF_TOKEN;

  console.log('Posting JSON file:', JSON_FILE);
  console.log('POST URL:', POST_URL);
  try {
    const resp = await axios.post(POST_URL, payload, {
      headers,
      timeout: TIMEOUT,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: (s) => s >= 200 && s < 300
    });

    console.log('POST succeeded. Status:', resp.status);
    if (resp.data) {
      console.log('Response body:', typeof resp.data === 'object' ? JSON.stringify(resp.data, null, 2) : resp.data);
    }
  } catch (err) {
    if (err.response) {
      console.error('Request failed. Status:', err.response.status);
      console.error('Response body:', err.response.data);
    } else {
      console.error('Request error:', err.message);
    }
    process.exit(4);
  }
}

main();
