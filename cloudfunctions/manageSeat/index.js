const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { getCallerInfo, requireTeacher, requireClassAccess } = require('./utils/auth')

const MAX_LIMIT = 100
const LOCK_TIMEOUT = 5 * 60 * 1000

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    const caller = await getCallerInfo(event, data?.class_id || data?.classId)
    switch (action) {
      case 'ensureCollection': return await ensureCollection()
      case 'getLayout': return await getLayout(data)
      case 'saveLayout': requireTeacher(caller); return await saveLayout(data, caller)
      case 'getArrangement': return await getArrangement(data)
      case 'getStudentsForArrange': return await getStudentsForArrange(data)
      case 'randomArrange': requireTeacher(caller); return await randomArrange(data, caller)
      case 'groupArrange': requireTeacher(caller); return await groupArrange(data, caller)
      case 'manualArrange': requireTeacher(caller); return await manualArrange(data, caller)
      case 'getRotateConfig': return await getRotateConfig(data)
      case 'saveRotateConfig': requireTeacher(caller); return await saveRotateConfig(data, caller)
      case 'executeRotate': requireTeacher(caller); return await executeRotate(data, caller)
      case 'lockSeat': requireTeacher(caller); return await lockSeat(data, caller)
      case 'unlockSeat': requireTeacher(caller); return await unlockSeat(data, caller)
      case 'acquireLock': requireTeacher(caller); return await acquireLock(data, caller)
      case 'releaseLock': requireTeacher(caller); return await releaseLock(data, caller)
      case 'getHistoryList': return await getHistoryList(data)
      case 'getHistoryDetail': return await getHistoryDetail(data)
      case 'swapSeats': requireTeacher(caller); return await swapSeats(data, caller)
      case 'clearLayout': requireTeacher(caller); return await clearLayout(data, caller)
      default: return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error(`action=${action} 错误:`, err)
    return { success: false, message: err.message || '操作失败' }
  }
}

async function getAllRecords(collection, query, orderBy) {
  let allData = []
  let skip = 0
  while (true) {
    let q = db.collection(collection).where(query).skip(skip).limit(MAX_LIMIT)
    if (orderBy) {
      q = db.collection(collection).where(query).orderBy(orderBy.field, orderBy.order).skip(skip).limit(MAX_LIMIT)
    }
    const res = await q.get()
    allData = allData.concat(res.data)
    if (res.data.length < MAX_LIMIT) break
    skip += MAX_LIMIT
  }
  return allData
}

async function recordHistory(classId, operationType, operatorOpenid, operatorName, snapshotBefore, snapshotAfter, remark) {
  const now = Date.now()
  await db.collection('seats_history').add({
    data: {
      class_id: classId,
      operation_type: operationType,
      operator_openid: operatorOpenid,
      operator_name: operatorName,
      snapshot_before: snapshotBefore || null,
      snapshot_after: snapshotAfter || null,
      remark: remark || '',
      operated_at: now,
      createdAt: now
    }
  })
}

async function ensureCollections() {
  const collections = ['seats', 'seats_history', 'seat_lock']
  for (const name of collections) {
    try {
      await db.collection(name).limit(1).get()
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        try {
          await db.createCollection(name)
          console.log(`集合${name}创建成功`)
        } catch (createErr) {
          console.error(`集合${name}创建失败:`, createErr)
        }
      }
    }
  }
}

async function ensureCollection() {
  await ensureCollections()
  return { success: true, message: '集合就绪' }
}

async function getLayout(data) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  await ensureCollections()
  const res = await db.collection('seats').where({ class_id }).limit(1).get()
  if (!res.data || res.data.length === 0) {
    return { success: true, data: null }
  }
  const doc = res.data[0]
  return {
    success: true,
    data: {
      rows: doc.rows || 6,
      cols: doc.cols || 8,
      special_positions: doc.special_positions || []
    }
  }
}

async function saveLayout(data, caller) {
  const { class_id, rows, cols, special_positions, force } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  const openid = caller.openid
  const userName = caller.realName || ''

  if (!rows || rows < 2 || rows > 12) return { success: false, message: '行数需在2-12之间' }
  if (!cols || cols < 2 || cols > 12) return { success: false, message: '列数需在2-12之间' }

  const positions = special_positions || []
  const typeSet = new Set()
  for (const pos of positions) {
    if (typeSet.has(pos.type)) {
      return { success: false, message: `${pos.type}标识已设置` }
    }
    typeSet.add(pos.type)
  }

  await ensureCollections()

  const existRes = await db.collection('seats').where({ class_id }).limit(1).get()
  const now = Date.now()

  if (existRes.data && existRes.data.length > 0) {
    const doc = existRes.data[0]
    const hasArrangement = doc.seat_map && Object.keys(doc.seat_map).length > 0

    if (hasArrangement && !force) {
      return { success: true, needConfirm: true, message: '已有座位安排，修改布局将清除现有安排' }
    }

    const snapshotBefore = { rows: doc.rows, cols: doc.cols, special_positions: doc.special_positions || [], seat_map: doc.seat_map || {} }

    await db.collection('seats').doc(doc._id).update({
      data: {
        rows, cols, special_positions: positions,
        seat_map: {}, locked_seats: [],
        updatedAt: now
      }
    })

    const snapshotAfter = { rows, cols, special_positions: positions, seat_map: {} }
    await recordHistory(class_id, 'layout_change', openid, userName, snapshotBefore, snapshotAfter, `布局修改为${rows}行${cols}列`)

    return { success: true, message: '布局保存成功' }
  }

  await db.collection('seats').add({
    data: {
      class_id, rows, cols, special_positions: positions,
      seat_map: {}, locked_seats: [],
      rotate_config: { direction: 'left_right', period: 'weekly', step: 1 },
      createdAt: now, updatedAt: now
    }
  })

  await recordHistory(class_id, 'layout_change', openid, userName, null, { rows, cols, special_positions: positions }, `创建布局${rows}行${cols}列`)

  return { success: true, message: '布局保存成功' }
}

async function getArrangement(data) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  await ensureCollections()
  const res = await db.collection('seats').where({ class_id }).limit(1).get()
  if (!res.data || res.data.length === 0) {
    return { success: true, data: null }
  }

  const doc = res.data[0]
  return {
    success: true,
    data: {
      rows: doc.rows || 6,
      cols: doc.cols || 8,
      special_positions: doc.special_positions || [],
      seat_map: doc.seat_map || {},
      locked_seats: doc.locked_seats || [],
      rotate_config: doc.rotate_config || { direction: 'left_right', period: 'weekly', step: 1 }
    }
  }
}

async function getStudentsForArrange(data) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  await ensureCollections()

  const students = await getAllRecords('students', { class_id })
  let groups = []
  try {
    groups = await getAllRecords('student_groups', { class_id, is_deleted: _.neq(true) })
  } catch (err) {
    console.error('查询分组失败:', err)
  }

  return {
    success: true,
    data: {
      students: students.map(s => ({
        student_id: s.student_id || s._id,
        student_name: s.student_name || s.name || '',
        gender: s.gender || '',
        height: s.height || '',
        group_name: s.group_name || ''
      })),
      groups: groups.map(g => ({
        group_id: g._id,
        group_name: g.group_name || g.name || '',
        group_type: g.group_type || '',
        members: (g.members || []).map(m => ({
          student_id: m.student_id || m._id || m,
          student_name: m.student_name || m.name || ''
        }))
      }))
    }
  }
}

function fisherYatesShuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function randomArrange(data, caller) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  const openid = caller.openid
  const userName = caller.realName || ''

  const lockResult = await doAcquireLock(class_id, openid)
  if (!lockResult.acquired) {
    return { success: false, message: '当前有人正在操作座位，请稍后再试' }
  }

  try {
    await ensureCollections()

    const seatDoc = await db.collection('seats').where({ class_id }).limit(1).get()
    if (!seatDoc.data || seatDoc.data.length === 0) {
      return { success: false, message: '请先设置座位布局' }
    }
    const doc = seatDoc.data[0]
    const { rows, cols } = doc

    const availableSeats = []
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        availableSeats.push({ row: r, col: c })
      }
    }

    const students = await getAllRecords('students', { class_id })
    if (students.length === 0) return { success: false, message: '班级暂无学生' }
    if (students.length > availableSeats.length) {
      return { success: false, message: `学生数(${students.length})超过可用座位数(${availableSeats.length})` }
    }

    const shuffledStudents = fisherYatesShuffle(students)
    const seatMap = {}
    const lockedSeats = []

    for (let i = 0; i < shuffledStudents.length; i++) {
      const s = shuffledStudents[i]
      const seat = availableSeats[i]
      const key = `${seat.row}_${seat.col}`
      seatMap[key] = {
        student_id: s.student_id || s._id,
        student_name: s.student_name || s.name || '',
        gender: s.gender || '',
        height: s.height || '',
        row: seat.row,
        col: seat.col
      }
    }

    const snapshotBefore = { seat_map: doc.seat_map || {} }
    const now = Date.now()
    await db.collection('seats').doc(doc._id).update({
      data: { seat_map: seatMap, locked_seats: lockedSeats, updatedAt: now }
    })
    const snapshotAfter = { seat_map: seatMap }
    await recordHistory(class_id, 'arrange', openid, userName, snapshotBefore, snapshotAfter, '一键随机安排')

    return { success: true, data: { seat_map: seatMap, locked_seats: lockedSeats } }
  } finally {
    await doReleaseLock(class_id, openid)
  }
}

async function groupArrange(data, caller) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  const openid = caller.openid
  const userName = caller.realName || ''

  const lockResult = await doAcquireLock(class_id, openid)
  if (!lockResult.acquired) {
    return { success: false, message: '当前有人正在操作座位，请稍后再试' }
  }

  try {
    await ensureCollections()

    const seatDoc = await db.collection('seats').where({ class_id }).limit(1).get()
    if (!seatDoc.data || seatDoc.data.length === 0) {
      return { success: false, message: '请先设置座位布局' }
    }
    const doc = seatDoc.data[0]
    const { rows, cols } = doc

    const availableSeats = []
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        availableSeats.push({ row: r, col: c })
      }
    }

    const students = await getAllRecords('students', { class_id })
    if (students.length === 0) return { success: false, message: '班级暂无学生' }
    if (students.length > availableSeats.length) {
      return { success: false, message: `学生数(${students.length})超过可用座位数(${availableSeats.length})` }
    }

    let groups = []
    try {
      groups = await getAllRecords('student_groups', { class_id, is_deleted: _.neq(true) })
    } catch (err) {
      console.error('查询分组失败:', err)
    }

    const studentGroupMap = {}
    const groupStudentLists = {}
    for (const g of groups) {
      const gName = g.group_name || g.name || ''
      groupStudentLists[gName] = []
      const members = g.members || []
      for (const m of members) {
        const mId = m.student_id || m._id || m
        studentGroupMap[mId] = gName
      }
    }

    const ungrouped = []
    for (const s of students) {
      const sId = s.student_id || s._id
      const gName = studentGroupMap[sId]
      if (gName && groupStudentLists[gName]) {
        groupStudentLists[gName].push({ student_id: sId, student_name: s.student_name || s.name || '', gender: s.gender || '', height: s.height || '' })
      } else {
        ungrouped.push({ student_id: sId, student_name: s.student_name || s.name || '', gender: s.gender || '', height: s.height || '' })
      }
    }

    const sortedGroups = Object.entries(groupStudentLists)
      .filter(([_, list]) => list.length > 0)
      .sort((a, b) => b[1].length - a[1].length)

    const seatMap = {}
    const lockedSeats = doc.locked_seats || []
    let seatIdx = 0

    for (const [gName, list] of sortedGroups) {
      const shuffled = fisherYatesShuffle(list)
      for (const s of shuffled) {
        if (seatIdx >= availableSeats.length) break
        const seat = availableSeats[seatIdx]
        const key = `${seat.row}_${seat.col}`
        seatMap[key] = { ...s, row: seat.row, col: seat.col }
        seatIdx++
      }
    }

    for (const s of ungrouped) {
      if (seatIdx >= availableSeats.length) break
      const seat = availableSeats[seatIdx]
      const key = `${seat.row}_${seat.col}`
      seatMap[key] = { ...s, row: seat.row, col: seat.col }
      seatIdx++
    }

    const snapshotBefore = { seat_map: doc.seat_map || {} }
    const now = Date.now()
    await db.collection('seats').doc(doc._id).update({
      data: { seat_map: seatMap, updatedAt: now }
    })
    const snapshotAfter = { seat_map: seatMap }
    await recordHistory(class_id, 'arrange', openid, userName, snapshotBefore, snapshotAfter, '按组区块安排')

    return { success: true, data: { seat_map: seatMap, locked_seats: lockedSeats } }
  } finally {
    await doReleaseLock(class_id, openid)
  }
}

async function manualArrange(data, caller) {
  const { class_id, assignments } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return { success: false, message: '缺少座位安排数据' }
  }

  const openid = caller.openid
  const userName = caller.realName || ''

  const lockResult = await doAcquireLock(class_id, openid)
  if (!lockResult.acquired) {
    return { success: false, message: '当前有人正在操作座位，请稍后再试' }
  }

  try {
    await ensureCollections()

    const seatDoc = await db.collection('seats').where({ class_id }).limit(1).get()
    if (!seatDoc.data || seatDoc.data.length === 0) {
      return { success: false, message: '请先设置座位布局' }
    }
    const doc = seatDoc.data[0]
    const { rows, cols } = doc

    const studentIds = new Set()
    const seatKeys = new Set()

    for (const a of assignments) {
      if (a.row < 1 || a.row > rows || a.col < 1 || a.col > cols) {
        return { success: false, message: `座位(${a.row},${a.col})超出布局范围` }
      }
      if (studentIds.has(a.student_id)) {
        return { success: false, message: `学生${a.student_name || a.student_id}重复安排` }
      }
      const key = `${a.row}_${a.col}`
      if (seatKeys.has(key)) {
        return { success: false, message: `座位(${a.row},${a.col})重复安排` }
      }
      studentIds.add(a.student_id)
      seatKeys.add(key)
    }

    const seatMap = { ...(doc.seat_map || {}) }
    for (const a of assignments) {
      const key = `${a.row}_${a.col}`
      seatMap[key] = { student_id: a.student_id, student_name: a.student_name || '', gender: a.gender || '', height: a.height || '', row: a.row, col: a.col }
    }

    const snapshotBefore = { seat_map: doc.seat_map || {} }
    const now = Date.now()
    await db.collection('seats').doc(doc._id).update({
      data: { seat_map: seatMap, updatedAt: now }
    })
    const snapshotAfter = { seat_map: seatMap }
    await recordHistory(class_id, 'manual_adjust', openid, userName, snapshotBefore, snapshotAfter, `手动调整${assignments.length}个座位`)

    return { success: true, data: { seat_map: seatMap } }
  } finally {
    await doReleaseLock(class_id, openid)
  }
}

async function getRotateConfig(data) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  await ensureCollections()
  const res = await db.collection('seats').where({ class_id }).limit(1).get()
  if (!res.data || res.data.length === 0) {
    return { success: true, data: null }
  }
  return { success: true, data: res.data[0].rotate_config || null }
}

async function saveRotateConfig(data, caller) {
  const { class_id, direction, period, step } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  const openid = caller.openid

  const validDirections = ['left_right', 'front_back', 'clockwise']
  const validPeriods = ['weekly', 'biweekly', 'monthly']
  if (direction && !validDirections.includes(direction)) return { success: false, message: '无效的轮换方向' }
  if (period && !validPeriods.includes(period)) return { success: false, message: '无效的轮换周期' }

  await ensureCollections()
  const res = await db.collection('seats').where({ class_id }).limit(1).get()
  if (!res.data || res.data.length === 0) return { success: false, message: '请先设置座位布局' }

  const doc = res.data[0]
  const currentConfig = doc.rotate_config || { direction: 'left_right', period: 'weekly', step: 1 }
  const newConfig = {
    direction: direction || currentConfig.direction,
    period: period || currentConfig.period,
    step: (step !== undefined && step > 0) ? step : currentConfig.step
  }

  const now = Date.now()
  await db.collection('seats').doc(doc._id).update({
    data: { rotate_config: newConfig, updatedAt: now }
  })

  return { success: true, data: newConfig }
}

function rotateLeftRight(seatMap, rows, cols, lockedKeys, step) {
  if (cols <= 1) return seatMap
  const newMap = {}
  for (let r = 1; r <= rows; r++) {
    const rowSeats = {}
    for (let c = 1; c <= cols; c++) {
      const key = `${r}_${c}`
      if (seatMap[key]) rowSeats[c] = seatMap[key]
    }
    for (let c = 1; c <= cols; c++) {
      const key = `${r}_${c}`
      if (lockedKeys.has(key)) {
        if (seatMap[key]) newMap[key] = { ...seatMap[key] }
        continue
      }
      const srcCol = ((c - step - 1) % cols + cols) % cols + 1
      const srcKey = `${r}_${srcCol}`
      if (rowSeats[srcCol] && !lockedKeys.has(srcKey)) {
        newMap[key] = { ...rowSeats[srcCol], row: r, col: c }
      }
    }
  }
  return newMap
}

function rotateFrontBack(seatMap, rows, cols, lockedKeys, step) {
  if (rows <= 1) return seatMap
  const newMap = {}
  for (let c = 1; c <= cols; c++) {
    const colSeats = {}
    for (let r = 1; r <= rows; r++) {
      const key = `${r}_${c}`
      if (seatMap[key]) colSeats[r] = seatMap[key]
    }
    for (let r = 1; r <= rows; r++) {
      const key = `${r}_${c}`
      if (lockedKeys.has(key)) {
        if (seatMap[key]) newMap[key] = { ...seatMap[key] }
        continue
      }
      const srcRow = ((r - step - 1) % rows + rows) % rows + 1
      const srcKey = `${srcRow}_${c}`
      if (colSeats[srcRow] && !lockedKeys.has(srcKey)) {
        newMap[key] = { ...colSeats[srcRow], row: r, col: c }
      }
    }
  }
  return newMap
}

function rotateClockwise(seatMap, rows, cols, lockedKeys, step) {
  const allSeats = []
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const key = `${r}_${c}`
      if (seatMap[key] && !lockedKeys.has(key)) {
        allSeats.push({ ...seatMap[key], origKey: key })
      }
    }
  }

  const positions = []
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const key = `${r}_${c}`
      if (!lockedKeys.has(key)) {
        positions.push({ row: r, col: c, key })
      }
    }
  }

  const newMap = {}
  for (const lk of lockedKeys) {
    if (seatMap[lk]) newMap[lk] = { ...seatMap[lk] }
  }

  if (positions.length === 0) return newMap

  const seatByPos = {}
  for (const s of allSeats) {
    seatByPos[s.origKey] = s
  }

  for (let i = 0; i < positions.length; i++) {
    const srcIdx = ((i - step) % positions.length + positions.length) % positions.length
    const srcPos = positions[srcIdx]
    const srcSeat = seatByPos[srcPos.key]
    if (srcSeat) {
      const destPos = positions[i]
      newMap[destPos.key] = { ...srcSeat, row: destPos.row, col: destPos.col }
    }
  }

  return newMap
}

async function executeRotate(data, caller) {
  const { class_id, direction, step } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  const openid = caller.openid
  const userName = caller.realName || ''

  const lockResult = await doAcquireLock(class_id, openid)
  if (!lockResult.acquired) {
    return { success: false, message: '当前有人正在操作座位，请稍后再试' }
  }

  try {
    await ensureCollections()

    const seatDoc = await db.collection('seats').where({ class_id }).limit(1).get()
    if (!seatDoc.data || seatDoc.data.length === 0) {
      return { success: false, message: '请先设置座位布局' }
    }
    const doc = seatDoc.data[0]
    const seatMap = doc.seat_map || {}
    if (Object.keys(seatMap).length === 0) {
      return { success: false, message: '请先安排座位' }
    }

    const lockedSeats = doc.locked_seats || []
    const lockedKeys = new Set(lockedSeats.map(l => `${l.row}_${l.col}`))
    const rotateConfig = doc.rotate_config || { direction: 'left_right', period: 'weekly', step: 1 }
    const rotDirection = direction || rotateConfig.direction
    const rotStep = (step !== undefined && step > 0) ? step : rotateConfig.step

    const unlockedCount = Object.keys(seatMap).filter(k => !lockedKeys.has(k)).length
    if (unlockedCount === 0) {
      return { success: false, message: '所有座位均已锁定，无需轮换' }
    }

    let newMap
    const { rows, cols } = doc
    if (rotDirection === 'left_right') {
      newMap = rotateLeftRight(seatMap, rows, cols, lockedKeys, rotStep)
    } else if (rotDirection === 'front_back') {
      newMap = rotateFrontBack(seatMap, rows, cols, lockedKeys, rotStep)
    } else if (rotDirection === 'clockwise') {
      newMap = rotateClockwise(seatMap, rows, cols, lockedKeys, rotStep)
    } else {
      return { success: false, message: '无效的轮换方向' }
    }

    const snapshotBefore = { seat_map: seatMap }
    const now = Date.now()
    await db.collection('seats').doc(doc._id).update({
      data: { seat_map: newMap, updatedAt: now }
    })
    const snapshotAfter = { seat_map: newMap }

    const dirNames = { left_right: '左右平移', front_back: '前后平移', clockwise: '整体旋转' }
    const remark = `${dirNames[rotDirection] || rotDirection}轮换${rotStep}步`
    await recordHistory(class_id, 'rotate', openid, userName, snapshotBefore, snapshotAfter, remark)

    try {
      const className = doc.class_name || ''
      const message = `座位已轮换（${remark}），请查看新座位安排`
      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: 'seat_rotate_notify',
        page: `subPages/seat/seat/seat?class_id=${class_id}`,
        data: { thing1: { value: '座位轮换通知' }, thing2: { value: message } }
      })
    } catch (notifyErr) {
      console.error('发送轮换通知失败:', notifyErr)
    }

    return { success: true, data: { seat_map: newMap, locked_seats: lockedSeats } }
  } finally {
    await doReleaseLock(class_id, openid)
  }
}

async function lockSeat(data, caller) {
  const { class_id, row, col, student_id, student_name } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }
  if (!row || !col) return { success: false, message: '缺少座位坐标' }

  const openid = caller.openid

  await ensureCollections()
  const res = await db.collection('seats').where({ class_id }).limit(1).get()
  if (!res.data || res.data.length === 0) return { success: false, message: '请先设置座位布局' }

  const doc = res.data[0]
  const lockedSeats = [...(doc.locked_seats || [])]
  const exists = lockedSeats.find(l => l.row === row && l.col === col)
  if (exists) return { success: true, message: '该座位已锁定' }

  lockedSeats.push({ row, col, student_id: student_id || '', student_name: student_name || '' })
  const now = Date.now()
  await db.collection('seats').doc(doc._id).update({
    data: { locked_seats: lockedSeats, updatedAt: now }
  })

  return { success: true, data: { locked_seats: lockedSeats } }
}

async function unlockSeat(data, caller) {
  const { class_id, row, col } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }
  if (!row || !col) return { success: false, message: '缺少座位坐标' }

  const openid = caller.openid

  await ensureCollections()
  const res = await db.collection('seats').where({ class_id }).limit(1).get()
  if (!res.data || res.data.length === 0) return { success: false, message: '请先设置座位布局' }

  const doc = res.data[0]
  const lockedSeats = (doc.locked_seats || []).filter(l => !(l.row === row && l.col === col))
  const now = Date.now()
  await db.collection('seats').doc(doc._id).update({
    data: { locked_seats: lockedSeats, updatedAt: now }
  })

  return { success: true, data: { locked_seats: lockedSeats } }
}

async function doAcquireLock(classId, openid) {
  const now = Date.now()
  const lockRes = await db.collection('seat_lock').where({ class_id: classId }).limit(1).get()

  if (lockRes.data && lockRes.data.length > 0) {
    const lock = lockRes.data[0]
    if (lock.holder_openid === openid) {
      await db.collection('seat_lock').doc(lock._id).update({
        data: { acquired_at: now, updatedAt: now }
      })
      return { acquired: true }
    }
    if (now - lock.acquired_at > LOCK_TIMEOUT) {
      await db.collection('seat_lock').doc(lock._id).update({
        data: { holder_openid: openid, acquired_at: now, updatedAt: now }
      })
      return { acquired: true }
    }
    const userRes = await db.collection('users').where({ _openid: lock.holder_openid }).limit(1).get()
    const holderName = (userRes.data && userRes.data.length > 0) ? (userRes.data[0].realName || userRes.data[0].nickName || '') : '其他人'
    return { acquired: false, holder: holderName }
  }

  await db.collection('seat_lock').add({
    data: {
      class_id: classId,
      holder_openid: openid,
      acquired_at: now,
      createdAt: now,
      updatedAt: now
    }
  })
  return { acquired: true }
}

async function doReleaseLock(classId, openid) {
  try {
    const lockRes = await db.collection('seat_lock').where({ class_id: classId }).limit(1).get()
    if (lockRes.data && lockRes.data.length > 0) {
      const lock = lockRes.data[0]
      if (lock.holder_openid === openid) {
        await db.collection('seat_lock').doc(lock._id).remove()
      }
    }
  } catch (err) {
    console.error('释放锁失败:', err)
  }
}

async function acquireLock(data, caller) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }
  await ensureCollections()
  const result = await doAcquireLock(class_id, caller.openid)
  return { success: true, data: result }
}

async function releaseLock(data, caller) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }
  await doReleaseLock(class_id, caller.openid)
  return { success: true }
}

async function getHistoryList(data) {
  const { class_id, page, page_size } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  await ensureCollections()
  const p = page || 1
  const ps = page_size || 20
  const skip = (p - 1) * ps

  const countRes = await db.collection('seats_history').where({ class_id }).count()
  const total = countRes.total

  const records = await db.collection('seats_history')
    .where({ class_id })
    .orderBy('operated_at', 'desc')
    .skip(skip)
    .limit(ps)
    .get()

  return {
    success: true,
    data: {
      list: (records.data || []).map(r => ({
        _id: r._id,
        operation_type: r.operation_type,
        operator_name: r.operator_name,
        operated_at: r.operated_at,
        remark: r.remark
      })),
      total,
      page: p,
      page_size: ps,
      has_more: skip + (records.data || []).length < total
    }
  }
}

async function getHistoryDetail(data) {
  const { history_id } = data || {}
  if (!history_id) return { success: false, message: '缺少history_id' }

  await ensureCollections()
  const res = await db.collection('seats_history').doc(history_id).get()
  if (!res.data) return { success: false, message: '记录不存在' }

  return {
    success: true,
    data: {
      _id: res.data._id,
      operation_type: res.data.operation_type,
      operator_name: res.data.operator_name,
      operated_at: res.data.operated_at,
      remark: res.data.remark,
      snapshot_before: res.data.snapshot_before,
      snapshot_after: res.data.snapshot_after
    }
  }
}

async function swapSeats(data, caller) {
  const { class_id, source_key, target_key } = data || {}
  if (!class_id || !source_key || !target_key) {
    return { success: false, message: '缺少必要参数' }
  }
  if (source_key === target_key) {
    return { success: false, message: '源座位和目标座位不能相同' }
  }

  const openid = caller.openid
  const userName = caller.realName || ''

  const lockResult = await doAcquireLock(class_id, openid)
  if (!lockResult.acquired) {
    return { success: false, message: '当前有人正在操作座位，请稍后再试' }
  }

  try {
    await ensureCollections()
    const seatDoc = await db.collection('seats').where({ class_id }).limit(1).get()
    if (!seatDoc.data || seatDoc.data.length === 0) {
      return { success: false, message: '当前无座位数据' }
    }
    const doc = seatDoc.data[0]
    const seatMap = { ...(doc.seat_map || {}) }

    const sourceStudent = seatMap[source_key] || null
    const targetStudent = seatMap[target_key] || null

    if (!sourceStudent) {
      return { success: false, message: '源座位无学生，无法交换' }
    }

    const sourceParts = source_key.split('_')
    const targetParts = target_key.split('_')
    const sourceRow = parseInt(sourceParts[0])
    const sourceCol = parseInt(sourceParts[1])
    const targetRow = parseInt(targetParts[0])
    const targetCol = parseInt(targetParts[1])

    if (targetStudent) {
      seatMap[source_key] = { ...targetStudent, row: sourceRow, col: sourceCol }
    } else {
      delete seatMap[source_key]
    }

    seatMap[target_key] = { ...sourceStudent, row: targetRow, col: targetCol }

    const now = Date.now()
    const snapshotBefore = {
      rows: doc.rows, cols: doc.cols,
      special_positions: doc.special_positions || [],
      seat_map: doc.seat_map || {}
    }

    await db.collection('seats').doc(doc._id).update({
      data: { seat_map: seatMap, updatedAt: now }
    })

    const snapshotAfter = {
      rows: doc.rows, cols: doc.cols,
      special_positions: doc.special_positions || [],
      seat_map: seatMap
    }

    try {
      await recordHistory(class_id, 'seat_swap', openid, userName, snapshotBefore, snapshotAfter, '拖拽交换座位: ' + source_key + ' ↔ ' + target_key)
    } catch (historyErr) {
      console.error('历史记录保存失败:', historyErr)
    }

    return { success: true, data: { seat_map: seatMap } }
  } finally {
    await doReleaseLock(class_id, openid)
  }
}

async function clearLayout(data, caller) {
  const { class_id } = data || {}
  if (!class_id) return { success: false, message: '缺少class_id' }

  const openid = caller.openid
  const userName = caller.realName || ''

  const lockResult = await doAcquireLock(class_id, openid)
  if (!lockResult.acquired) {
    return { success: false, message: '当前有人正在操作座位，请稍后再试' }
  }

  try {
    await ensureCollections()
    const seatDoc = await db.collection('seats').where({ class_id }).limit(1).get()
    if (!seatDoc.data || seatDoc.data.length === 0) {
      return { success: false, message: '当前无座位布局' }
    }
    const doc = seatDoc.data[0]

    const snapshotBefore = {
      rows: doc.rows, cols: doc.cols,
      special_positions: doc.special_positions || [],
      seat_map: doc.seat_map || {},
      locked_seats: doc.locked_seats || [],
      rotate_config: doc.rotate_config || {}
    }

    const now = Date.now()
    await db.collection('seats').doc(doc._id).update({
      data: {
        rows: 0, cols: 0,
        special_positions: [],
        seat_map: {},
        locked_seats: [],
        updatedAt: now
      }
    })

    const snapshotAfter = { rows: 0, cols: 0, special_positions: [], seat_map: {}, locked_seats: [] }
    try {
      await recordHistory(class_id, 'layout_clear', openid, userName, snapshotBefore, snapshotAfter, '一键清除布局')
    } catch (historyErr) {
      console.error('历史记录保存失败:', historyErr)
    }

    return { success: true, data: { cleared: true } }
  } finally {
    await doReleaseLock(class_id, openid)
  }
}
