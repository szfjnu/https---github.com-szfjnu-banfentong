const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { generateWithFallback } = require('../ai/fallback-engine')
const aiCaller = require('../ai/ai-caller')
const sensitiveFilter = require('../ai/sensitive-filter')
const { loadAdaptersFromDB } = require('../dimensions/registry')

const ADVICE_CACHE_TTL = 24 * 60 * 60 * 1000

async function generateManagementAdvice(data, caller) {
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''
  const forceRefresh = data.force_refresh || false
  const now = Date.now()

  if (!forceRefresh) {
    try {
      const cacheRes = await db.collection('growth_management_advices')
        .where({ class_id: classId, semester_id: semesterId, expires_at: db.command.gt(now) })
        .orderBy('created_at', 'desc').limit(1).get()
      if (cacheRes.data && cacheRes.data.length > 0) {
        return { success: true, data: cacheRes.data[0], from_cache: true }
      }
    } catch (e) {}
  }

  const adapters = await loadAdaptersFromDB(db)
  const kpi = {}
  const dimensionTrends = {}
  for (const [key, adapter] of Object.entries(adapters)) {
    try {
      const classData = await adapter.fetchClassData(db, classId, semesterId)
      kpi[key] = adapter.computeKPI(classData)
      if (classData.length > 0) dimensionTrends[key] = adapter.computeTrend(classData)
    } catch (e) {}
  }

  let warnings = []
  try {
    const wRes = await db.collection('growth_warnings')
      .where({ class_id: classId, semester_id: semesterId, status: db.command.in(['pending', 'confirmed']) })
      .limit(20).get()
    warnings = wRes.data || []
  } catch (e) {}

  let studentSummary = []
  try {
    const sRes = await db.collection('students').where({ class_id: classId }).limit(20).get()
    studentSummary = sRes.data || []
  } catch (e) {}

  const dashboardKpi = {
    avg_score: kpi.grade ? kpi.grade.avg_score : (kpi.score ? kpi.score.total_score : 0),
    active_count: studentSummary.length,
    warning_count: warnings.length,
    excellent_rate: kpi.grade ? kpi.grade.pass_rate : 0
  }

  const adviceData = await generateWithFallback(cloud, 'management_advice', {
    kpi: dashboardKpi,
    warnings,
    studentSummary,
    dimensionTrends
  }, aiCaller)

  if (adviceData.content) {
    adviceData.content = sensitiveFilter.filter(adviceData.content)
  }

  const adviceRecord = {
    class_id: classId,
    semester_id: semesterId,
    content: adviceData.content || adviceData,
    generated_by_ai: adviceData.generated_by_ai !== false,
    model: adviceData.model || 'fallback',
    expires_at: now + ADVICE_CACHE_TTL,
    created_at: now,
    operator_openid: caller.openid
  }

  try {
    const addRes = await db.collection('growth_management_advices').add({ data: adviceRecord })
    adviceRecord._id = addRes._id
  } catch (e) {}

  return { success: true, data: adviceRecord }
}

async function getReviews(data, caller) {
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''
  const studentId = data.student_id || ''
  const page = data.page || 1
  const pageSize = data.page_size || 20

  const query = {}
  if (classId) query.class_id = classId
  if (semesterId) query.semester_id = semesterId

  if (caller.role === 'student' || caller.role === 'parent') {
    query.student_id = caller.studentId
    query.is_confirmed = true
  } else if (studentId) {
    query.student_id = studentId
  }

  const skip = (page - 1) * pageSize
  try {
    const res = await db.collection('growth_comments').where(query)
      .orderBy('created_at', 'desc').skip(skip).limit(pageSize).get()
    return { success: true, data: { reviews: res.data || [], page, page_size: pageSize } }
  } catch (e) {
    return { success: false, message: e.message || '获取评语失败' }
  }
}

async function confirmReview(data, caller) {
  const { review_id } = data
  if (!review_id) return { success: false, message: '缺少review_id' }

  const now = Date.now()
  try {
    await db.collection('growth_comments').doc(review_id).update({
      data: { is_confirmed: true, confirmed_by: caller.openid, confirmed_at: now }
    })
    return { success: true, message: '评语确认成功' }
  } catch (e) {
    return { success: false, message: e.message || '确认失败' }
  }
}

async function updateReview(data, caller) {
  const { review_id, content } = data
  if (!review_id || !content) return { success: false, message: '缺少必要参数' }

  try {
    const existing = await db.collection('growth_comments').doc(review_id).get()
    const updateData = {
      content,
      is_edited: true,
      edited_by: caller.openid,
      edited_at: Date.now()
    }
    if (existing.data && !existing.data.original_ai_content) {
      updateData.original_ai_content = existing.data.content
    }
    await db.collection('growth_comments').doc(review_id).update({ data: updateData })
    return { success: true, message: '评语更新成功' }
  } catch (e) {
    return { success: false, message: e.message || '更新失败' }
  }
}

async function batchGenerateReviews(data, caller) {
  const classId = data.class_id || data.classId || caller.classId
  const semesterId = data.semester_id || data.semesterId || ''
  const studentIds = data.student_ids || []
  const timeRange = data.time_range || ''

  if (!studentIds || studentIds.length === 0) {
    return { success: false, message: '未指定学生' }
  }

  const now = Date.now()
  const taskRecord = {
    class_id: classId,
    semester_id: semesterId,
    status: 'running',
    total: studentIds.length,
    completed: 0,
    failed: 0,
    created_at: now,
    operator_openid: caller.openid
  }

  try {
    const addRes = await db.collection('batch_review_tasks').add({ data: taskRecord })
    taskRecord._id = addRes._id
  } catch (e) {}

  const adapters = await loadAdaptersFromDB(db)
  const results = []

  for (const studentId of studentIds) {
    try {
      const dimensions = {}
      for (const [key, adapter] of Object.entries(adapters)) {
        try {
          const personalData = await adapter.fetchPersonalData(db, studentId, semesterId)
          dimensions[key] = { name: adapter.name, kpi: adapter.computeKPI(personalData) }
        } catch (e) {}
      }

      let studentName = ''
      try {
        const sRes = await db.collection('students').where({ student_id: studentId }).limit(1).get()
        if (sRes.data && sRes.data.length > 0) studentName = sRes.data[0].student_name || sRes.data[0].name || ''
      } catch (e) {}

      const reviewData = await generateWithFallback(cloud, 'student_review', {
        studentName,
        dimensions,
        timeRange
      }, aiCaller)

      if (reviewData.content) {
        reviewData.content = sensitiveFilter.filter(reviewData.content, { currentStudentName: studentName })
      }

      const reviewRecord = {
        student_id: studentId,
        student_name: studentName,
        class_id: classId,
        semester_id: semesterId,
        content: reviewData.content || JSON.stringify(reviewData),
        original_ai_content: reviewData.generated_by_ai ? reviewData.content : null,
        generated_by_ai: reviewData.generated_by_ai !== false,
        is_confirmed: false,
        is_edited: false,
        created_at: Date.now(),
        operator_openid: caller.openid
      }

      try {
        await db.collection('growth_comments').add({ data: reviewRecord })
      } catch (e) {}

      results.push({ student_id: studentId, student_name: studentName, success: true })

      if (taskRecord._id) {
        try {
          await db.collection('batch_review_tasks').doc(taskRecord._id).update({
            data: { completed: db.command.inc(1) }
          })
        } catch (e) {}
      }
    } catch (e) {
      results.push({ student_id: studentId, success: false, error: e.message })
      if (taskRecord._id) {
        try {
          await db.collection('batch_review_tasks').doc(taskRecord._id).update({
            data: { failed: db.command.inc(1) }
          })
        } catch (e2) {}
      }
    }
  }

  if (taskRecord._id) {
    try {
      await db.collection('batch_review_tasks').doc(taskRecord._id).update({
        data: { status: 'completed', completed_at: Date.now() }
      })
    } catch (e) {}
  }

  return {
    success: true,
    data: {
      task_id: taskRecord._id,
      total: studentIds.length,
      completed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  }
}

module.exports = { generateManagementAdvice, getReviews, confirmReview, updateReview, batchGenerateReviews }
