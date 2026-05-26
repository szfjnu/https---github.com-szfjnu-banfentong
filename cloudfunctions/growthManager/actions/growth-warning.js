const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const WarningDetector = require('../analyzers/warning-detector')
const { loadAdaptersFromDB } = require('../dimensions/registry')

async function getWarnings(data, caller) {
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''
  const status = data.status || ''
  const warningType = data.warning_type || ''
  const page = data.page || 1
  const pageSize = data.page_size || 20

  const query = {}
  if (classId) query.class_id = classId
  if (semesterId) query.semester_id = semesterId
  if (status) query.status = status
  if (warningType) query.warning_type = warningType

  if (caller.role === 'student' || caller.role === 'parent') {
    query.student_id = caller.studentId
  }

  const skip = (page - 1) * pageSize
  let warnings = []
  try {
    const res = await db.collection('growth_warnings').where(query)
      .orderBy('created_at', 'desc').skip(skip).limit(pageSize).get()
    warnings = res.data || []
  } catch (e) {
    console.error('查询预警失败:', e)
  }

  let stats = { total: 0, red: 0, yellow: 0, green: 0 }
  try {
    const countRes = await db.collection('growth_warnings').where(query).count()
    stats.total = countRes.total || 0
  } catch (e) {}

  return { success: true, data: { warnings, stats, page, page_size: pageSize } }
}

async function updateWarningStatus(data, caller) {
  const { warning_id, status: newStatus } = data
  if (!warning_id) return { success: false, message: '缺少warning_id' }
  if (!['pending', 'confirmed', 'handled', 'ignored'].includes(newStatus)) {
    return { success: false, message: '无效的status值' }
  }

  const now = Date.now()
  const updateData = {
    status: newStatus,
    updated_at: now
  }
  if (newStatus === 'handled' || newStatus === 'confirmed') {
    updateData.handled_by = caller.openid
    updateData.handled_at = now
  }

  try {
    await db.collection('growth_warnings').doc(warning_id).update({ data: updateData })
    return { success: true, message: '状态更新成功' }
  } catch (e) {
    return { success: false, message: e.message || '更新失败' }
  }
}

async function detectWarnings(data, caller) {
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''

  const adapters = await loadAdaptersFromDB(db)
  const studentKpiMap = {}

  try {
    let students = [], skip = 0
    while (true) {
      const res = await db.collection('students').where({ class_id: classId }).skip(skip).limit(100).get()
      students = students.concat(res.data)
      if (res.data.length < 100) break
      skip += 100
    }

    for (const student of students) {
      const kpiData = { student_name: student.student_name || student.name || '' }
      for (const [key, adapter] of Object.entries(adapters)) {
        try {
          const personalData = await adapter.fetchPersonalData(db, student.student_id, semesterId)
          const kpi = adapter.computeKPI(personalData)
          Object.assign(kpiData, kpi)
        } catch (e) {}
      }
      studentKpiMap[student.student_id] = kpiData
    }
  } catch (e) {
    console.error('获取学生列表失败:', e)
  }

  const result = await WarningDetector.detect(db, classId, semesterId, studentKpiMap)
  return { success: true, data: result }
}

async function getWarningRules(data, caller) {
  const classId = data.class_id || data.classId || caller.classId

  try {
    let rules = [], skip = 0
    const query = {}
    if (classId) query.class_id = classId
    while (true) {
      const res = await db.collection('growth_warning_rules').where(query).skip(skip).limit(100).get()
      rules = rules.concat(res.data)
      if (res.data.length < 100) break
      skip += 100
    }
    return { success: true, data: rules }
  } catch (e) {
    return { success: false, message: e.message || '获取规则失败' }
  }
}

module.exports = { getWarnings, updateWarningStatus, detectWarnings, getWarningRules }
