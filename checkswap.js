const url =
  'https://front-stable-aws.tteld.com/api/dashboards/v2/swap?accept=false&driverUid=20b51c7d-a04f-4461-83f8-1d7687e37280';

const headers = {
  'authorization': 'Kf1faiX3Pi14wbqWI2FaDT201c0DDdjElZcVCxNhvX3HVxGIeoa1nbLEsFvB3Q9b',
  'companyuid': '42b94f1a-a395-4f7f-8913-a3c88e343292',
  'content-type': 'application/json'
};

const baseBody = {
  fromLogId: 2527241073,
  toLogId: 2527242062
};

async function callApi(duration) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...baseBody, duration })
  });

  return {
    status: res.status,
    body: await res
  };
}

// start both calls immediately (no waiting)
const p1 = callApi(-1000);
// const p2 = callApi(0);

// handle results independently
p1.then(r => {
  console.log('response1 status:', r.status);
  console.log('response1 body:', r.body);
}).catch(console.error);

// p2.then(r => {
//   console.log('response2 status:', r.status);
//   console.log('response2 body:', r.body);
// }).catch(console.error);
