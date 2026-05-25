'use strict'

const moment = require('moment-timezone')
const CheckLog = require('@models/Logs2/Violation/CheckLog')
const { RECORD_STATUS_INACTIVE_CHANGED_DRIVER_FAKE } = require('@constants')
const { EVENT_TYPE_CERTIFICATION, RECORD_STATUS_ACTIVE } = require('@models/Constants')
const FAKE_STATUS = RECORD_STATUS_INACTIVE_CHANGED_DRIVER_FAKE
const VIEW_STATUS = 2
const MIN_CLONE_DURATION_MS = 10 * 60 * 1000
const LINK_TOLERANCE_MS = 1

module.exports = async function (logs, Model, company, type, comment) {
  const { Log } = Model.app.models
  const tz = company?.tz?.value || 'UTC'
  const eldType = company?.config?.eldType
  const personal = company?.personal
  const isLegal = eldType == 'custom'
  const allowedTypes = ['output', 'outputfile', 'email']

  function toMs(v) {
    if (v == null) return null
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v
    }

    if (v instanceof Date) {
      const t = v.getTime()
      return Number.isFinite(t) ? t : null
    }
    if (typeof v === 'object' && typeof v.valueOf === 'function') {
      const t = v.valueOf()
      if (typeof t === 'number' && Number.isFinite(t)) {
        return t
      }
    }
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : null
  }

  function tsStart(ev) {
    const t = toMs(ev?.start_date)
    return t != null ? t : Number.POSITIVE_INFINITY
  }

  function tsEnd(ev) {
    const t = toMs(ev?.end_date)
    if (t != null) return t
    return tsStart(ev)
  }

  function safeIdNum(ev) {
    const n = Number(ev?.id)
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
  }

  function compareByStartThenFakeThenId(a, b) {
    const da = tsStart(a)
    const db = tsStart(b)
    if (da !== db) return da - db

    const aInactive = a?.record_status == VIEW_STATUS
    const bInactive = b?.record_status == VIEW_STATUS

    if (aInactive !== bInactive) {
      return aInactive ? -1 : 1
    }

    return safeIdNum(a) - safeIdNum(b)
  }

  function getVehicleObj(ev) {
    if (!ev) return null

    if (ev.vehicle && typeof ev.vehicle === 'object' && typeof ev.vehicle.get !== 'function') {
      return ev.vehicle.__data ? ev.vehicle.__data : ev.vehicle
    }

    const cached = ev.__cachedRelations?.vehicle
    if (cached) {
      return cached.__data ? cached.__data : cached
    }

    const dataVehicle = ev.__data?.vehicle
    if (dataVehicle) {
      return dataVehicle.__data ? dataVehicle.__data : dataVehicle
    }

    return null
  }

  function hasDisableSleep(ev) {
    const vehicle = getVehicleObj(ev)
    return vehicle?.settings?.disable_sleep === true
  }

  function dayKeyOf(date) {
    const ms = toMs(date)
    if (ms == null) return ''
    return moment.tz(ms, tz).format('DD-MM-YYYY')
  }

  function certifyDayKeyOf(ev) {
    const value = ev?.certify_date
    if (!value) return ''

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return moment.tz(value, 'YYYY-MM-DD', tz).format('DD-MM-YYYY')
    }

    const ms = toMs(value)
    if (ms == null) return ''

    return moment.tz(ms, tz).format('DD-MM-YYYY')
  }

  function isDuty(ev) {
    return CheckLog(ev, 'duty')
  }

  function isRestOffOrSleep(ev) {
    return CheckLog(ev, 'rest')
  }

  function isNextDuty(ev) {
    return isDuty(ev) && !isRestOffOrSleep(ev)
  }

  function isOppositeRest(a, b) {
    if (!isRestOffOrSleep(a) || !isRestOffOrSleep(b)) return false
    return (
      (a.event_code == 1 && b.event_code == 2) ||
      (a.event_code == 2 && b.event_code == 1)
    )
  }

  function isActiveCertify(ev) {
    return ev?.event_type == EVENT_TYPE_CERTIFICATION && ev?.certify_date && ev?.record_status == RECORD_STATUS_ACTIVE
  }

  function cleanPayload(base) {
    const cloned = { ...base }

    delete cloned.vehicle
    delete cloned.removeDriverIds
    delete cloned._remove_driver_ids
    delete cloned._rec
    delete cloned.__data
    delete cloned.__cachedRelations
    delete cloned.createdAt
    delete cloned.updatedAt

    return cloned
  }

  function isBoundaryLinked(endEvent, startEvent) {
    if (!endEvent || !startEvent) return false
    const endMs = tsEnd(endEvent)
    const startMs = tsStart(startEvent)
    if (!Number.isFinite(endMs) || !Number.isFinite(startMs)) return false
    return Math.abs(startMs - endMs) <= LINK_TOLERANCE_MS
  }

  function findNextDutyStartMs(dutySorted, curEv) {
    const curStart = tsStart(curEv)
    if (!Number.isFinite(curStart) || curStart === Number.POSITIVE_INFINITY) return null

    for (let i = 0; i < dutySorted.length; i++) {
      const ev = dutySorted[i]
      const s = tsStart(ev)
      if (!Number.isFinite(s) || s === Number.POSITIVE_INFINITY) continue
      if (s <= curStart) continue
      if (isNextDuty(ev)) return s
    }
    return null
  }

  if (
    comment == 'test' ||
    !allowedTypes.includes(type) ||
    isLegal ||
    !personal ||
    typeof personal !== 'object' ||
    Array.isArray(personal) ||
    Object.keys(personal).length === 0
  ) {
    return [...logs].sort(compareByStartThenFakeThenId)
  }

  const clonedEvents = []
  const filteredLogs = []

  for (const e of logs) {
    if (e?.record_status === FAKE_STATUS) {
      e.record_status = VIEW_STATUS
      e._is_fake = true
    }

    if (!isDuty(e)) continue
    if (isRestOffOrSleep(e)) filteredLogs.push(e)
  }

  const eventsByDay = filteredLogs.reduce((acc, event) => {
    const day = dayKeyOf(event.start_date)
    if (!day) return acc
    if (!acc[day]) acc[day] = []
    acc[day].push(event)
    return acc
  }, {})

  const certifyLogsByDay = new Map()

  for (const log of logs) {
    if (!isActiveCertify(log)) continue

    const day = certifyDayKeyOf(log)
    if (!day) continue

    if (!certifyLogsByDay.has(day)) certifyLogsByDay.set(day, [])
    certifyLogsByDay.get(day).push(log)
  }

  for (const arr of certifyLogsByDay.values()) {
    arr.sort(compareByStartThenFakeThenId)
  }

  function hasValidCertifyForSameDayAfterFakeStart(fakeStartMs) {
    const fakeDay = dayKeyOf(fakeStartMs)
    console.log(fakeDay, 'fakeDay')
    if (!fakeDay) return false
    console.log(certifyLogsByDay, 'certifyLogsByDay')
    const certifyLogs = certifyLogsByDay.get(fakeDay) || []
    console.log(certifyLogs, 'certifyLogs')
    if (!certifyLogs.length) return false

    return certifyLogs.some((certifyLog) => {
      const certifyStartMs = tsStart(certifyLog)
      if (!Number.isFinite(certifyStartMs)) return false
      if (certifyStartMs > fakeStartMs) {
        console.log(certifyStartMs, 'found certify')
      }
      return certifyStartMs > fakeStartMs
    })
  }

  const halfHoursMs = 1_800_000
  const ssbMinMs = 7_200_000
  const ssbMaxMs = 36_000_000

  function chooseNotePerDay(ev, usedNotesByDay, excludeNote) {
    const s = tsStart(ev)
    const e = tsEnd(ev)

    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      return undefined
    }

    const dayKey = dayKeyOf(ev.start_date)
    if (!dayKey) return undefined

    if (!usedNotesByDay.has(dayKey)) {
      usedNotesByDay.set(dayKey, new Set())
    }

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

    const available = pool.filter((n) => !blocked.has(n))
    const candidates = available.length ? available : pool.filter((n) => n !== excludeNote)
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

  const allDutySorted = [...logs].filter(isDuty).sort(compareByStartThenFakeThenId)

  for (let di = 0; di < allDays.length; di++) {
    const day = allDays[di]
    const dayEvents = eventsByDay[day] || []
    if (dayEvents.length < 2) continue

    const hasFakeAlready = dayEvents.some((e) => e.record_status == VIEW_STATUS || e.inspection == true)
    if (hasFakeAlready) continue

    const dayEventsSorted = [...dayEvents].sort(compareByStartThenFakeThenId)

    if (!usedNotesByDay.has(day)) {
      usedNotesByDay.set(day, new Set())
    }

    const usedSet = usedNotesByDay.get(day)
    for (const ev of dayEventsSorted) {
      if (ev?.note) usedSet.add(ev.note)
    }

    const prevDay = di > 0 ? allDays[di - 1] : null
    const nextDay = di < allDays.length - 1 ? allDays[di + 1] : null

    const prevDaySorted = prevDay
      ? [...(eventsByDay[prevDay] || [])].sort(compareByStartThenFakeThenId)
      : null

    const nextDaySorted = nextDay
      ? [...(eventsByDay[nextDay] || [])].sort(compareByStartThenFakeThenId)
      : null

    const firstCur = dayEventsSorted[0] || null
    const lastCur = dayEventsSorted[dayEventsSorted.length - 1] || null

    const lastPrev = prevDaySorted ? prevDaySorted[prevDaySorted.length - 1] : null
    const firstNext = nextDaySorted ? nextDaySorted[0] : null

    const excludeIds = new Set()

    if (isBoundaryLinked(lastPrev, firstCur) && firstCur?.id != null) {
      excludeIds.add(firstCur.id)
    }

    if (isBoundaryLinked(lastCur, firstNext) && lastCur?.id != null) {
      excludeIds.add(lastCur.id)
    }

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
        if (
          Number.isFinite(prevEnd) &&
          Number.isFinite(curStart) &&
          Math.abs(curStart - prevEnd) <= LINK_TOLERANCE_MS
        ) {
          return true
        }
      }

      if (next && isOppositeRest(cur, next)) {
        const curEnd = tsEnd(cur)
        const nextStart = tsStart(next)

        if (
          Number.isFinite(curEnd) &&
          Number.isFinite(nextStart) &&
          Math.abs(nextStart - curEnd) <= LINK_TOLERANCE_MS
        ) {
          return true
        }
      }

      return false
    }

    const eligible = dayEventsSorted.filter((e, idx) => {
      if (!isRestOffOrSleep(e)) return false
      if (hasDisableSleep(e)) return false

      const prev = idx > 0 ? dayEventsSorted[idx - 1] : null
      const next = idx < dayEventsSorted.length - 1 ? dayEventsSorted[idx + 1] : null
      if (hasDisableSleep(prev) || hasDisableSleep(next)) return false
      if (e.id && excludeIds.has(e.id)) return false
      if (hasAdjacentOppositeAtIndex(idx)) return false
      if (hasConsecutiveOppositePairAtIndex(idx)) return false

      const s = tsStart(e)
      const en = tsEnd(e)
      if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) return false
      if ((en - s) <= MIN_CLONE_DURATION_MS) return false

      return true
    })

    if (!eligible.length) continue

    const count = Math.min(eligible.length, Math.floor(Math.random() * 2) + 1)
    const shuffled = [...eligible].sort(() => 0.5 - Math.random()).slice(0, count)

    const createdForDay = await Promise.all(
      shuffled.map(async (ev) => {
        if (hasDisableSleep(ev)) return null

        const base = ev.__data ? ev.__data : ev
        const sMs = tsStart(ev)

        if (!Number.isFinite(sMs) || sMs === Number.POSITIVE_INFINITY) {
          return null
        }

        const nextDutyStartMs = findNextDutyStartMs(allDutySorted, ev)
        const rawEndMs = tsEnd(ev)
        const endMs = nextDutyStartMs != null ? nextDutyStartMs : rawEndMs

        if (!Number.isFinite(endMs) || endMs <= sMs) return null
        if ((endMs - sMs) < MIN_CLONE_DURATION_MS) return null

        const hasValidCertify = hasValidCertifyForSameDayAfterFakeStart(sMs)
        if (!hasValidCertify) return null

        const cloned = cleanPayload(base)
        cloned.id = null
        cloned.start_date = new Date(sMs).toISOString()
        cloned.end_date = new Date(endMs).toISOString()
        cloned.record_status = FAKE_STATUS
        cloned.origin_code = 2
        cloned.event_code = base.event_code == 1 ? 2 : 1
        cloned.status = base.event_code == 1 ? 'sleep' : 'off'
        cloned.note = chooseNotePerDay(ev, usedNotesByDay, ev.note)

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

  return [...logs, ...clonedEvents].sort(compareByStartThenFakeThenId)
}