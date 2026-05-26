const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { getCallerInfo, requireTeacherOrModule } = require('./utils/auth')
const { loadAdaptersFromDB } = require('./dimensions/registry')
const TrendAnalyzer = require('./analyzers/trend-analyzer')
const ClusterAnalyzer = require('./analyzers/cluster-analyzer')
const CorrelationAnalyzer = require('./analyzers/correlation-analyzer')
const { generateWithFallback } = require('./ai/fallback-engine')
const aiCaller = require('./ai/ai-caller')
const sensitiveFilter = require('./ai/sensitive-filter')

const ANALYTICS_CACHE_TTL = 12 * 60 * 60 * 1000

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    const caller = await getCallerInfo(event, data?.class_id || data?.classId)

    switch (action) {
      case 'getDeepAnalysis': return await getDeepAnalysis(data, caller)
      case 'generateDevAdvice': return await generateDevAdvice(data, caller)
      case 'getClassClusterAnalysis': return await getClassClusterAnalysis(data, caller)
      default: return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error(`growthAnalysis action=${action} 错误:`, err)
    return { success: false, message: err.message || '操作失败' }
  }
}

async function getDeepAnalysis(data, caller) {
  const studentId = data.student_id || caller.studentId || ''
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''
  const forceRefresh = data.force_refresh || false
  const now = Date.now()

  if (caller.role === 'student' || caller.role === 'parent') {
    if (!caller.studentId) return { success: false, message: '无法获取学生身份' }
  }

  if (!forceRefresh) {
    try {
      const cacheRes = await db.collection('growth_analytics')
        .where({ student_id: studentId, semester_id: semesterId, expires_at: _.gt(now) })
        .limit(1).get()
      if (cacheRes.data && cacheRes.data.length > 0) {
        return { success: true, data: cacheRes.data[0], from_cache: true }
      }
    } catch (e) {}
  }

  const adapters = await loadAdaptersFromDB(db)
  const dimensionKeys = Object.keys(adapters)
  const personalData = {}
  const trendResults = {}
  const timeSeriesForCorrelation = {}

  for (const [key, adapter] of Object.entries(adapters)) {
    try {
      const records = await adapter.fetchPersonalData(db, studentId, semesterId)
      personalData[key] = records
      const kpi = adapter.computeKPI(records)

      const tsData = records
        .filter(r => r.created_at || r.createdAt)
        .sort((a, b) => (a.created_at || a.createdAt) - (b.created_at || b.createdAt))
        .map(r => ({ value: r.score_value || r.score || r.count || 0, timestamp: r.created_at || r.createdAt }))

      trendResults[key] = {
        ...adapter.computeTrend(records),
        formal_analysis: TrendAnalyzer.analyze(tsData)
      }

      timeSeriesForCorrelation[key] = tsData.map(p => p.value)
    } catch (e) {
      console.error(`维度${key}分析失败:`, e)
    }
  }

  const correlationResult = CorrelationAnalyzer.analyze(timeSeriesForCorrelation)

  let clusterResult = { clusters: [], can_analyze: false }
  try {
    const students = await getAllStudents(db, classId)
    if (students.length >= 10) {
      const studentScores = []
      for (const s of students) {
        const scores = {}
        for (const [key, adapter] of Object.entries(adapters)) {
          try {
            const records = await adapter.fetchPersonalData(db, s.student_id, semesterId)
            const kpi = adapter.computeKPI(records)
            const val = kpi.avg_score || kpi.total_score || kpi.attendance_rate || kpi.overall_score || kpi.duty_score || 0
            scores[key] = adapter.normalizeScore(val, 0, 100)
          } catch (e) {}
        }
        studentScores.push({ student_id: s.student_id, student_name: s.student_name || s.name || '', scores })
      }
      clusterResult = ClusterAnalyzer.analyze(studentScores, dimensionKeys)
    }
  } catch (e) {
    console.error('聚类分析失败:', e)
  }

  const analyticsRecord = {
    student_id: studentId,
    class_id: classId,
    semester_id: semesterId,
    trend: trendResults,
    correlation: correlationResult,
    cluster: clusterResult.clusters && clusterResult.clusters.length > 0
      ? clusterResult.clusters.find(c => c.member_count > 0) || clusterResult.clusters[0]
      : null,
    expires_at: now + ANALYTICS_CACHE_TTL,
    created_at: now,
    updated_at: now
  }

  try {
    const existRes = await db.collection('growth_analytics')
      .where({ student_id: studentId, semester_id: semesterId }).limit(1).get()
    if (existRes.data && existRes.data.length > 0) {
      await db.collection('growth_analytics').doc(existRes.data[0]._id).update({
        data: { ...analyticsRecord, updated_at: now }
      })
      analyticsRecord._id = existRes.data[0]._id
    } else {
      const addRes = await db.collection('growth_analytics').add({ data: analyticsRecord })
      analyticsRecord._id = addRes._id
    }
  } catch (e) {}

  return { success: true, data: analyticsRecord }
}

async function generateDevAdvice(data, caller) {
  const studentId = data.student_id || caller.studentId || ''
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''

  if (caller.role === 'student' || caller.role === 'parent') {
    if (!caller.studentId) return { success: false, message: '无法获取学生身份' }
  }

  let analytics = data.analytics
  if (!analytics) {
    const analysisRes = await getDeepAnalysis({ student_id: studentId, class_id: classId, semester_id: semesterId }, caller)
    if (analysisRes.success) analytics = analysisRes.data
  }

  let studentName = ''
  try {
    const sRes = await db.collection('students').where({ student_id: studentId }).limit(1).get()
    if (sRes.data && sRes.data.length > 0) studentName = sRes.data[0].student_name || sRes.data[0].name || ''
  } catch (e) {}

  const adapters = await loadAdaptersFromDB(db)
  const dimensions = {}
  for (const [key, adapter] of Object.entries(adapters)) {
    try {
      const records = await adapter.fetchPersonalData(db, studentId, semesterId)
      const kpi = adapter.computeKPI(records)
      const val = kpi.avg_score || kpi.total_score || kpi.attendance_rate || kpi.overall_score || kpi.duty_score || 0
      dimensions[key] = { name: adapter.name, normalized_score: adapter.normalizeScore(val, 0, 100), kpi }
    } catch (e) {}
  }

  const adviceData = await generateWithFallback(cloud, 'dev_advice', {
    studentName,
    analysis: { trend: analytics?.trend, correlation: analytics?.correlation, cluster: analytics?.cluster },
    dimensions
  }, aiCaller)

  if (adviceData.content) {
    adviceData.content = sensitiveFilter.filter(adviceData.content, { currentStudentName: studentName })
  }

  const suggestionRecord = {
    student_id: studentId,
    class_id: classId,
    semester_id: semesterId,
    content: adviceData.content || adviceData,
    generated_by_ai: adviceData.generated_by_ai !== false,
    model: adviceData.model || 'fallback',
    created_at: Date.now(),
    operator_openid: caller.openid
  }

  try {
    await db.collection('growth_suggestions').add({ data: suggestionRecord })
  } catch (e) {}

  return { success: true, data: suggestionRecord }
}

async function getClassClusterAnalysis(data, caller) {
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''

  const adapters = await loadAdaptersFromDB(db)
  const dimensionKeys = Object.keys(adapters)

  const students = await getAllStudents(db, classId)
  if (students.length < 10) {
    return { success: false, message: '班级人数不足10人，聚类分析不可靠' }
  }

  const studentScores = []
  for (const s of students) {
    const scores = {}
    for (const [key, adapter] of Object.entries(adapters)) {
      try {
        const records = await adapter.fetchPersonalData(db, s.student_id, semesterId)
        const kpi = adapter.computeKPI(records)
        const val = kpi.avg_score || kpi.total_score || kpi.attendance_rate || kpi.overall_score || kpi.duty_score || 0
        scores[key] = adapter.normalizeScore(val, 0, 100)
      } catch (e) {}
    }
    studentScores.push({ student_id: s.student_id, student_name: s.student_name || s.name || '', scores })
  }

  const result = ClusterAnalyzer.analyze(studentScores, dimensionKeys)
  return { success: true, data: result }
}

async function getAllStudents(db, classId) {
  let allData = [], skip = 0
  while (true) {
    const res = await db.collection('students').where({ class_id: classId }).skip(skip).limit(100).get()
    allData = allData.concat(res.data)
    if (res.data.length < 100) break
    skip += 100
  }
  return allData
}
