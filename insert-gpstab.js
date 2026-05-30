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
const POST_URL = 'https://app.gpstab.com/api/client/editlog/Save?driverId=106973&date=2026-05-26T00:00:00';

// Provide path to the JSON file you want to POST (absolute or relative to this script)
const JSON_FILE = path.join(__dirname, 'output', '2026-03-10-converted.json');

const COOKIE_HEADER = '_ga=GA1.1.565401863.1779645867; intercom-id-gy7zu15a=0802255c-1e65-4e03-b8e2-e2c89a3edc00; intercom-device-id-gy7zu15a=dfec2cbb-e290-4d0d-838a-e9758c676123; login=teamsters_inc%40yahoo.com; .AspNetCore.Antiforgery.VyLW6ORzMgk=CfDJ8JMeqlX5woVBt80cK6_cNnXk3NGaGhmXZFjLD50lswi0ZRdH1RLY3KgGAVAMVkguSSNhizgStORHXa-sPkXNYpDFQRrrJtNeH6zkAnzvIi6HLiXov7Y1ttT1u_0Nz-lMhMdRBnJO8e0pEkI1tg4oA68; gpstab_x=CfDJ8JMeqlX5woVBt80cK6_cNnW2x4YEbBA875GXTzjbxqPKvYNU69c2v-FH2e1WmgXX6RlooomIBEDhat--Az3Q3aB-ONCmj-WCbbLIBlL02JQBZvZgrT8GqNDW_Eqo3ItXZK5NIzS_4uLdoI1GtCfo_a8oqs10soWIqSdTKv7l63QjNY_QoY1IEgVXpSAprzJki1z-GXK_DA4V2EJWLUh4jebKbKVR3ZCHnIxi20MQi6VoPcIDjMWVSQBbNJtLA9VOYMiM7ddj5eKOSuiaYu7KrJZAkZLhDxHBU8DoRjAOnE9Zix9p5yWj7BRqpmW2_h2KieRqORWYOxYgVGat7tIZQ98_CgrCZqQuScQ7SZJl3afRvQGP_oqh59BYPEYqghdMcOnOgbfa3P3NfD3rbPEJxYof9ZiTsfGQ0RL3QU6rQ07kWwe015LMjVq9CxHGzbeuTncKUx67D5z5ciH6oPcqkeW9UanfXFMEGZfL8mpjFyATtrFe3VsClQeCKNlE_AvT799XVjvRzTBNjvPju119tWZLmDJg53TJHMsaLjHLsB-gp2nALGA2eFamtlzFtfoIiEJ2ETAwUauNpwQsDrEn0lX1hYU378kRYTJwxFhRWRP9pQt1LuOGcQh3G2NvFyY3sJueTmOff4XkiSwYt1iNJYbhZ0XrBRGTKYOxyP51qkrUelMpPG3Z8thSvg8By-YD11Kp4dxyNhGEj-gnYe8t60qqX1t4bk5rpONXovZ2bYkXZ8oIb5seUjWnOoaIZkpUqKszVhZDnVMFStQ_sB4fxFM12XLdukh04-c-zkkJWvsHH3Kv8AWPV03Wl4PeKJoJ0P1xnaCvVKbq7PAgtHk99CM; login_t=2026-05-24T18%3A09%3A32.052Z; XSRF-TOKEN=CfDJ8JMeqlX5woVBt80cK6_cNnXfzWbgeDeu_2CQSI-b8_kJK2nyhNLtNzKwGKmBW0myfZRUbtluEvw0x5eFxWvNkcjk2TY4_lHuCCdJxVCoe-XHCbhDGIiqCkFaGoZnG7z6b98BnQdBj8EWVY3xAnhq07rPmyI2ziR1IoLleytEkY7X2wrg_lT5ZxdxJHSdnmdc-A; intercom-session-gy7zu15a=ekhkWGZYZGoxcHp0UzZiRTRxdHRWNXFwSzhkZ2pTVmt3QjAxdlRuTEhwdmQyR3ErS1JDeW9YMHlhTllEbjRNWXR5cGVzTnE0V1d3a21jOS9wUGs3ektKRjFsNDU1YWU0Z3d0cU5ZakUyN0FLRDJvSUdUcm5oMEdQOVdCZk9kWjRxNVBVa0tnSmxTdVFJazg0QkJkbWFsTmpjaUptR2dCODlHV1piSEJLeFhVNHd1VFVoVFIvQjNSYy9paHVxYU5oVUpSRHFoN0NiOVpZcnNXT0czSnh3Zz09LS1TdEtIaHR4b3JkRU1obFBGa2N3cFBnPT0=--7dd3b71d14c45214f6a068221040452822436620; _clck=jvypzt%5E2%5Eg6c%5E0%5E2335; _clsk=1jp2nmm%5E1779705255717%5E8%5E1%5El.clarity.ms%2Fcollect; _ga_EG81099C60=GS2.1.s1779705106$o3$g1$t1779705263$j39$l0$h0'
const XSRF_TOKEN = 'CfDJ8JMeqlX5woVBt80cK6_cNnXfzWbgeDeu_2CQSI-b8_kJK2nyhNLtNzKwGKmBW0myfZRUbtluEvw0x5eFxWvNkcjk2TY4_lHuCCdJxVCoe-XHCbhDGIiqCkFaGoZnG7z6b98BnQdBj8EWVY3xAnhq07rPmyI2ziR1IoLleytEkY7X2wrg_lT5ZxdxJHSdnmdc-A'; // the token value
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
