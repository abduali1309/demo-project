const axios = require('axios');
const dayjs = require('dayjs');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
dayjs.extend(isSameOrBefore);


// Lenny - 8cbed93f-5d78-4089-87bd-11abdc14b18f
// Josiah - e7514a5e-bdfb-4504-9637-117adfee5af8
// Mary Beth - 6adc2174-b79c-42ac-bded-7bc5f1c5728f
// Mary Linton - 44141d2c-a62e-4969-9e78-c5c32e7af153
// Bill Williamson - 654a3988-8169-41f2-8690-61a38a38a9c4
// Javier Escuella - 37674434-4f40-4a62-90ad-9cb552902625



const DRIVER_UID     = '8cbed93f-5d78-4089-87bd-11abdc14b18f';
const COMPANY_UID    = '399519c7-902e-40e0-9be8-e6749cf76f76';
const AUTH_TOKEN     = 'oyjtBMO7GBDGPiviRbxoFduCCTlDDeFYjbCBdEDutDKHaIN9Ns9EIWLcFQCPljeH';
const BASE_URL       = 'https://j7.tteld.com/api/dashboards';
const START_DATE     = '2026-04-19'; // YYYY-MM-DD
const END_DATE       = '2026-04-21'; // YYYY-MM-DD
const DRIVER_ID = 1106


const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: AUTH_TOKEN,
    Companyuid: COMPANY_UID,
    'Content-Type': 'application/json'
  }
});

function formatDate(dateStr) {
  return dayjs(dateStr).format('DD-MM-YYYY');
}

async function fetchDailyLogs(driverUid, date) {
  const formatted = formatDate(date);
  const url = `/get-daily-logs/${driverUid}/${formatted}?mode=inject_requested`;
  const response = await api.get(url);
  return response.data.logs;
}

async function deleteInfoLogs(driverUid, logIds) {
  if (!logIds.length) return;
  const url = `/v2/bulkedit/${driverUid}`;
  const payload = { logIds, logsData: { record_status: 2 } };
  const response = await api.patch(url, payload);
  return response.data;
}

(async () => {
  let date = dayjs(START_DATE);
  const last = dayjs(END_DATE);

  while (date.isSameOrBefore(last)) {
    try {
      console.log(`\nProcessing date: ${date.format('YYYY-MM-DD')}`);
      const logs = await fetchDailyLogs(DRIVER_UID, date.format('YYYY-MM-DD'));

      // Filter out only info logs (event_type != 1) && l.driverId === DRIVER_ID && l.event_type !== 4
      const infoLogs = logs.filter(l => l.event_type === 5 && l.driverId === DRIVER_ID);
      const logIds   = infoLogs.map(l => l.id || l.logId);

      if (logIds.length) {
        console.log(`Deleting ${logIds.length} info logs...`);
        const result = await deleteInfoLogs(DRIVER_UID, logIds);
        console.log('Bulk-edit response:', result);
      } else {
        console.log('No info logs to delete on this date.');
      }
    } catch (err) {
      console.error(`Error on ${date.format('YYYY-MM-DD')}:`, err.response?.data || err.message);
    }

    date = date.add(1, 'day');
  }
  console.log('\nDone.');
})();