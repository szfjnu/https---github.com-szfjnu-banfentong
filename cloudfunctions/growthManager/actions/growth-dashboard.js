const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { loadAdaptersFromDB } = require('../dimensions/registry')
const TrendAnalyzer = require('../analyzers/trend-analyzer')

const CACHE_TTL = 5 * 60 * 1000

async function getClassDashboard(data, caller) {
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''
  const dimension = data.dimension || 'score'

  const now = Date.now()
  try {
    const cacheRes = await db.collection('growth_dashboard_cache')
      .where({ class_id: classId, semester_id: semesterId, expires_at: db.command.gt(now) })
      .limit(1).get()
    if (cacheRes.data && cacheRes.data.length > 0) {
      return { success: true, data: cacheRes.data[0].data, from_cache: true }
    }
  } catch (e) {}

  const adapters = await loadAdaptersFromDB(db)

  const kpi = {}
  const dimensionTrends = {}
  for (const [key, adapter] of Object.entries(adapters)) {
    try {
      const classData = await adapter.fetchClassData(db, classId, semesterId)
      kpi[key] = adapter.computeKPI(classData)
      if (classData.length > 0) {
        dimensionTrends[key] = adapter.computeTrend(classData)
      }
    } catch (e) {
      console.error(`维度${key}数据获取失败:`, e)
      kpi[key] = null
    }
  }

  let warningSummary = { total: 0, red: 0, yellow: 0, green: 0 }
  try {
    const warningsRes = await db.collection('growth_warnings')
      .where({ class_id: classId, semester_id: semesterId, status: db.command.in(['pending', 'confirmed']) })
      .get()
    const warnings = warningsRes.data || []
    warningSummary = {
      total: warnings.length,
      red: warnings.filter(w => w.warning_level === 'red').length,
      yellow: warnings.filter(w => w.warning_level === 'yellow').length,
      green: warnings.filter(w => w.warning_level === 'green').length
    }
  } catch (e) {}

  let hasAIAdvice = false
  try {
    const adviceRes = await db.collection('growth_management_advices')
      .where({ class_id: classId, semester_id: semesterId, expires_at: db.command.gt(now) })
      .limit(1).get()
    hasAIAdvice = adviceRes.data && adviceRes.data.length > 0
  } catch (e) {}

  const dashboardData = {
    class_id: classId,
    semester_id: semesterId,
    kpi,
    dimension_trends: dimensionTrends,
    warning_summary: warningSummary,
    has_ai_advice: hasAIAdvice,
    updated_at: now
  }

  try {
    await db.collection('growth_dashboard_cache').add({
      data: {
        class_id: classId,
        semester_id: semesterId,
        dimension: 'all',
        data: dashboardData,
        expires_at: now + CACHE_TTL,
        created_at: now
      }
    })
  } catch (e) {}

  return { success: true, data: dashboardData }
}

async function getDimensionTrend(data, caller) {
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''
  const dimension = data.dimension || 'score'

  const adapters = await loadAdaptersFromDB(db)
  const adapter = adapters[dimension]
  if (!adapter) return { success: false, message: `维度${dimension}不存在` }

  const classData = await adapter.fetchClassData(db, classId, semesterId)
  const kpi = adapter.computeKPI(classData)

  const timeSeriesData = classData
    .filter(r => r.created_at || r.createdAt)
    .sort((a, b) => (a.created_at || a.createdAt) - (b.created_at || b.createdAt))
    .map(r => ({
      value: r.score_value || r.score || r.count || 0,
      timestamp: r.created_at || r.createdAt
    }))

  const trend = TrendAnalyzer.analyze(timeSeriesData)

  return {
    success: true,
    data: {
      dimension,
      dimension_name: adapter.name,
      kpi,
      trend,
      data_points: timeSeriesData.slice(-30)
    }
  }
}

async function getPersonalGrowth(data, caller) {
  const studentId = data.student_id || caller.studentId || ''
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''

  if (caller.role === 'student' || caller.role === 'parent') {
    if (!caller.studentId) {
      return { success: false, message: '无法获取学生身份' }
    }
  }

  const adapters = await loadAdaptersFromDB(db)
  const dimensionData = {}
  const radarData = []

  for (const [key, adapter] of Object.entries(adapters)) {
    try {
      const personalData = await adapter.fetchPersonalData(db, studentId, semesterId)
      const kpi = adapter.computeKPI(personalData)
      dimensionData[key] = {
        name: adapter.name,
        icon: adapter.icon,
        color: adapter.color,
        kpi,
        trend: adapter.computeTrend(personalData),
        record_count: personalData.length
      }

      const scoreValue = kpi.avg_score || kpi.total_score || kpi.attendance_rate || kpi.overall_score || kpi.duty_score || 0
      const normalizedScore = adapter.normalizeScore(scoreValue, 0, 100)
      radarData.push({
        dimension: key,
        name: adapter.name,
        value: normalizedScore,
        max: 100
      })
    } catch (e) {
      console.error(`维度${key}个人数据获取失败:`, e)
      dimensionData[key] = { name: adapters[key].name, kpi: null, record_count: 0 }
    }
  }

  return {
    success: true,
    data: {
      student_id: studentId,
      class_id: classId,
      semester_id: semesterId,
      dimensions: dimensionData,
      radar: radarData
    }
  }
}

module.exports = { getClassDashboard, getDimensionTrend, getPersonalGrowth }
