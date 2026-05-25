'use strict'

const moment = require('moment-timezone')
const CheckLog = require('@models/Logs2/Violation/CheckLog')
const { RECORD_STATUS_INACTIVE_CHANGED_DRIVER_FAKE } = require('@constants')

const FAKE_STATUS = RECORD_STATUS_INACTIVE_CHANGED_DRIVER_FAKE
const VIEW_STATUS = 2
const MIN_CLONE_DURATION_MS = 10 * 60 * 1000 // 10 minutes

module.exports = async function (logs, Model, company) {
  const { Log } = Model.app.models
  const tz = company?.tz?.value

  const clonedEvents = []
  const filteredLogs = []
  const otherLogs = []

  function toMs(v) {
    if (v == null) return null
    if (typeof v === 'number' && Number.isFinite(v)) return v
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : null
  }

  function tsStart(ev) {
    const t = toMs(ev?.start_date)
    if (t != null) return t
    return 0
  }

  function tsEnd(ev) {
    const t = toMs(ev?.end_date)
    if (t != null) return t
    return tsStart(ev)
  }

  function safeId(ev) {
    const v = ev?.id
    if (v == null) return ''
    return String(v)
  }

  function compareByStartThenFakeThenId(a, b) {
    const da = tsStart(a)
    const db = tsStart(b)
    if (da !== db) return da - db

    const aInactive = a?.record_status == VIEW_STATUS
    const bInactive = b?.record_status == VIEW_STATUS
    if (aInactive !== bInactive) return aInactive ? -1 : 1

    const ida = safeId(a)
    const idb = safeId(b)
    if (ida < idb) return -1
    if (ida > idb) return 1
    return 0
  }

  for (let e of logs) {
    if (e?.record_status === FAKE_STATUS) {
      e.record_status = VIEW_STATUS
      e._is_fake = true
    }

    const vehicle =
      (e && e.vehicle && typeof e.vehicle === 'object') ? e.vehicle
        : (e && e.__data && e.__data.vehicle && typeof e.__data.vehicle === 'object') ? e.__data.vehicle
          : null

    const hasVehicle = !!(vehicle?.id || e?.vehicleId)
    const disableSleep = !!(vehicle?.settings?.disable_sleep)

    if (hasVehicle && !disableSleep && CheckLog(e, 'rest')) {
      filteredLogs.push(e)
    } else {
      otherLogs.push(e)
    }
  }

  const personal = company?.personal
  if (
    !personal ||
    typeof personal !== 'object' ||
    Array.isArray(personal) ||
    Object.keys(personal).length === 0
  ) {
    return [...logs].sort(compareByStartThenFakeThenId)
  }

  const dayKeyOf = (date) => moment.tz(date, tz).format('DD-MM-YYYY')

  const eventsByDay = filteredLogs.reduce((acc, event) => {
    const day = dayKeyOf(event.start_date)
    if (!acc[day]) acc[day] = []
    acc[day].push(event)
    return acc
  }, {})

  const halfHoursMs = 1_800_000
  const ssbMinMs = 7_200_000
  const ssbMaxMs = 36_000_000
  const LINK_TOLERANCE_MS = 1

  function isBoundaryLinked(endEvent, startEvent) {
    if (!endEvent || !startEvent) return false
    const endMs = tsEnd(endEvent)
    const startMs = tsStart(startEvent)
    return Math.abs(startMs - endMs) <= LINK_TOLERANCE_MS
  }

  function isRestOffOrSleep(ev) {
    return ev && ev.event_type == 1 && (ev.event_code == 1 || ev.event_code == 2)
  }

  function isOppositeRest(a, b) {
    if (!isRestOffOrSleep(a) || !isRestOffOrSleep(b)) return false
    return (a.event_code == 1 && b.event_code == 2) || (a.event_code == 2 && b.event_code == 1)
  }

  function chooseNotePerDay(ev, usedNotesByDay, excludeNote) {
    const s = tsStart(ev)
    const e = tsEnd(ev)
    if (!s || !e || e <= s) return undefined

    const dayKey = dayKeyOf(ev.start_date)
    if (!usedNotesByDay.has(dayKey)) usedNotesByDay.set(dayKey, new Set())
    const usedNotes = usedNotesByDay.get(dayKey)

    const duration = e - s

    let pool
    if (ev.event_code == 1) {
      if (duration <= halfHoursMs) {
        pool = ['Coffee', 'Snack', 'Quick stop', 'Restroom', 'Phone call']
      } else if (duration <= ssbMinMs) {
        pool = ['Nap', 'Sleeper berth', 'Rest']
      } else {
        pool = ['Rest', 'Home time', 'Day off', 'Relax', 'Stop']
      }
    } else {
      if (duration <= halfHoursMs) {
        pool = ['Shower', 'Rest', 'Dinner', 'Breakfast', 'Lunch', 'Coffee', 'Snack', 'Restroom', 'Stretch', 'Stop']
      } else if (duration <= ssbMinMs) {
        pool = ['Rest', 'Waiting', 'Break', 'Personal time', 'Stop']
      } else if (duration < ssbMaxMs) {
        pool = ['Nap', 'Rest']
      } else {
        pool = ['Outside', 'Break', 'Off duty']
      }
    }

    const blocked = new Set(usedNotes)
    if (excludeNote) blocked.add(excludeNote)

    const available = pool.filter(n => !blocked.has(n))
    const candidates = available.length ? available : pool.filter(n => n !== excludeNote)
    const finalCandidates = candidates.length ? candidates : pool

    const chosen = finalCandidates[Math.floor(Math.random() * finalCandidates.length)]
    usedNotes.add(chosen)
    return chosen
  }

  const usedNotesByDay = new Map()

  const allDays = Object.keys(eventsByDay).sort((a, b) => {
    const ta = moment.tz(a, 'DD-MM-YYYY', tz).valueOf()
    const tb = moment.tz(b, 'DD-MM-YYYY', tz).valueOf()
    return ta - tb
  })

  for (let di = 0; di < allDays.length; di++) {
    const day = allDays[di]
    const dayEvents = eventsByDay[day] || []
    if (dayEvents.length < 2) continue

    const hasFakeAlready = dayEvents.some(e => e.record_status == VIEW_STATUS)
    if (hasFakeAlready) continue

    const dayEventsSorted = [...dayEvents].sort(compareByStartThenFakeThenId)

    if (!usedNotesByDay.has(day)) usedNotesByDay.set(day, new Set())
    const usedSet = usedNotesByDay.get(day)
    for (const ev of dayEventsSorted) {
      if (ev?.note) usedSet.add(ev.note)
    }

    const prevDay = di > 0 ? allDays[di - 1] : null
    const nextDay = di < allDays.length - 1 ? allDays[di + 1] : null

    const prevDaySorted = prevDay ? [...(eventsByDay[prevDay] || [])].sort(compareByStartThenFakeThenId) : null
    const nextDaySorted = nextDay ? [...(eventsByDay[nextDay] || [])].sort(compareByStartThenFakeThenId) : null

    const firstCur = dayEventsSorted[0] || null
    const lastCur = dayEventsSorted[dayEventsSorted.length - 1] || null

    const lastPrev = prevDaySorted ? prevDaySorted[prevDaySorted.length - 1] : null
    const firstNext = nextDaySorted ? nextDaySorted[0] : null

    const excludeIds = new Set()
    if (isBoundaryLinked(lastPrev, firstCur) && firstCur?.id != null) excludeIds.add(firstCur.id)
    if (isBoundaryLinked(lastCur, firstNext) && lastCur?.id != null) excludeIds.add(lastCur.id)

    function hasAdjacentOppositeAtIndex(idx) {
      const cur = dayEventsSorted[idx]
      if (!isRestOffOrSleep(cur)) return false

      const prev = idx > 0 ? dayEventsSorted[idx - 1] : null
      const next = idx < dayEventsSorted.length - 1 ? dayEventsSorted[idx + 1] : null

      if (prev && isOppositeRest(prev, cur)) return true
      if (next && isOppositeRest(cur, next)) return true

      return false
    }

    function hasConsecutiveOppositePairAtIndex(idx) {
      const cur = dayEventsSorted[idx]
      const prev = idx > 0 ? dayEventsSorted[idx - 1] : null
      const next = idx < dayEventsSorted.length - 1 ? dayEventsSorted[idx + 1] : null

      if (prev && isOppositeRest(prev, cur)) {
        const prevEnd = tsEnd(prev)
        const curStart = tsStart(cur)
        if (Math.abs(curStart - prevEnd) <= LINK_TOLERANCE_MS) return true
      }

      if (next && isOppositeRest(cur, next)) {
        const curEnd = tsEnd(cur)
        const nextStart = tsStart(next)
        if (Math.abs(nextStart - curEnd) <= LINK_TOLERANCE_MS) return true
      }

      return false
    }
    
    const eligible = dayEventsSorted.filter((e, idx) => {
      if (!isRestOffOrSleep(e)) return false
      if (e.id && excludeIds.has(e.id)) return false
      if (hasAdjacentOppositeAtIndex(idx)) return false
      if (hasConsecutiveOppositePairAtIndex(idx)) return false

      const s = tsStart(e)
      const en = tsEnd(e)
      if (!s || !en || en <= s) return false
      if ((en - s) <= MIN_CLONE_DURATION_MS) return false
      console.log(e.start_date, e.end_date, e.event_type, e.event_code,  'log info')
      console.log(en, 'end_date', s, 'start_date', en - s, en - s, 'duration')
      return true
    })

    if (!eligible.length) continue

    const count = Math.min(eligible.length, Math.floor(Math.random() * 2) + 1)
    const shuffled = [...eligible].sort(() => 0.5 - Math.random()).slice(0, count)

    const createdForDay = await Promise.all(
      shuffled.map(async ev => {
        const base = ev.__data ? ev.__data : ev

        const cloned = {
          ...base,
          id: null,
          record_status: FAKE_STATUS,
          origin_code: 2,
          event_code: base.event_code == 1 ? 2 : 1,
          status: base.event_code == 1 ? 'sleep' : 'off',
          note: chooseNotePerDay(ev, usedNotesByDay, ev.note),
        }

        delete cloned.vehicle
        delete cloned.removeDriverIds
        delete cloned._remove_driver_ids
        delete cloned._rec
        delete cloned.__data
        delete cloned.__cachedRelations
        delete cloned.createdAt
        delete cloned.updatedAt

        const log = await Log.create2(cloned)

        if (log) {
          log._is_fake = true
          log.record_status = VIEW_STATUS
        }

        return log
      })
    )

    clonedEvents.push(...createdForDay.filter(Boolean))
  }

  const finalList = [...logs, ...clonedEvents].sort(compareByStartThenFakeThenId)
  return finalList
}