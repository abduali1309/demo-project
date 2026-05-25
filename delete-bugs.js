// simple-bulk-delete.js
'use strict'
const fs = require('fs')
const axios = require('axios')

const API_URL = process.env.BULK_API_URL || "https://addmin-api.tteld.com/api/logs/bulkedit-admin/139561/13-02-2026/3464"
const AUTH = process.env.BULK_AUTH_TOKEN || "KshGO1I0Yq7Jd26wzc1czjtkjFTdlDB8Qu9p2BUT6HxKjNHAaUmmHEB3sXeremYS"
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 20
const DELAY_MS = Number(process.env.DELAY_MS) || 50
const DRY_RUN = process.env.DRY_RUN === 'true' || false

// --- load & filter (your filter) ---
const data = JSON.parse(fs.readFileSync('./response2.json', 'utf8'))


const ids = data
  .filter(e => e.event_code == 1 && e.event_type == 5 && e.debug_info == 'ehf' && e.start_date == '2026-02-13T17:31:11.980Z')
  .map(x => x.id)



if (!ids.length) {
  console.log('No matching IDs found. Exiting.')
  process.exit(0)
}

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

async function sendPatch(batch) {
  if (DRY_RUN) {
    console.log('[DRY RUN] would send:', batch.length, 'ids, example:', batch.slice(0,5))
    return { ok: true }
  }
  const payload = { logIds: batch, logsData: { record_status: 2 } }
  const headers = { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' }
  try {
    const res = await axios.patch(API_URL, payload, { headers, timeout: 20000 })
    return { ok: true, data: res.data }
  } catch (err) {
    return { ok: false, err }
  }
}

async function main() {
  const batches = chunk(ids, BATCH_SIZE)
  console.log(`Found ${ids.length} ids -> ${batches.length} batches (size ${BATCH_SIZE}). DRY_RUN=${DRY_RUN}`)
  let succeeded = 0, failed = 0

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    process.stdout.write(`Batch ${i+1}/${batches.length} (${batch.length})... `)
    let resp = await sendPatch(batch)
    if (!resp.ok) {
      // one retry
      process.stdout.write('failed, retrying... ')
      await new Promise(r => setTimeout(r, 300))
      resp = await sendPatch(batch)
    }

    if (resp.ok) {
      console.log('ok')
      succeeded++
    } else {
      console.log('failed')
      failed++
      console.error(resp.err?.response?.status, resp.err?.message)
    }
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log(`Done. succeeded: ${succeeded}, failed: ${failed}`)
}
main().catch(e => console.error(e))