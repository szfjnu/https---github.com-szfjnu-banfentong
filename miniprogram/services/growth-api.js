const app = getApp()
const growthCache = require('../utils/growth-cache')
const growthPermission = require('../utils/growth-permission')

const CACHE_TTL = {
  dashboard: 5 * 60 * 1000,
  personal: 3 * 60 * 1000,
  advice: 24 * 60 * 60 * 1000,
  analysis: 12 * 60 * 60 * 1000,
  warnings: 2 * 60 * 1000
}

function getClassId() {
  return app.globalData.class_id || app.globalData.classId || ''
}

function getSemesterId() {
  return app.globalData.currentSemesterId || app.globalData.semester_id || ''
}

async function callGrowthManager(action, data = {}, useCache = false, cacheKey = '', cacheTTL = 0) {
  if (useCache && cacheKey) {
    const cached = growthCache.getCache(cacheKey, cacheTTL)
    if (cached) return cached
  }

  const params = {
    action,
    data: {
      ...data,
      class_id: data.class_id || getClassId(),
      classId: data.classId || data.class_id || getClassId(),
      semester_id: data.semester_id || getSemesterId()
    }
  }

  try {
    const res = await wx.cloud.callFunction({ name: 'growthManager', data: params })
    if (res.result && res.result.success) {
      if (useCache && cacheKey) {
        growthCache.setCache(cacheKey, res.result.data)
      }
      return res.result.data
    }
    throw new Error(res.result?.message || '操作失败')
  } catch (err) {
    console.error(`growthManager.${action} 失败:`, err)
    throw err
  }
}

async function callGrowthAnalysis(action, data = {}, useCache = false, cacheKey = '', cacheTTL = 0) {
  if (useCache && cacheKey) {
    const cached = growthCache.getCache(cacheKey, cacheTTL)
    if (cached) return cached
  }

  const params = {
    action,
    data: {
      ...data,
      class_id: data.class_id || getClassId(),
      classId: data.classId || data.class_id || getClassId(),
      semester_id: data.semester_id || getSemesterId()
    }
  }

  try {
    const res = await wx.cloud.callFunction({ name: 'growthAnalysis', data: params })
    if (res.result && res.result.success) {
      if (useCache && cacheKey) {
        growthCache.setCache(cacheKey, res.result.data)
      }
      return res.result.data
    }
    throw new Error(res.result?.message || '操作失败')
  } catch (err) {
    console.error(`growthAnalysis.${action} 失败:`, err)
    throw err
  }
}

async function getClassDashboard(options = {}) {
  const cacheKey = `dashboard_${getClassId()}_${getSemesterId()}`
  return callGrowthManager('getClassDashboard', options, !options.force_refresh, cacheKey, CACHE_TTL.dashboard)
}

async function getDimensionTrend(dimension) {
  return callGrowthManager('getDimensionTrend', { dimension })
}

async function getPersonalGrowth(studentId) {
  const sid = studentId || app.globalData.student_id || ''
  const cacheKey = `personal_${sid}_${getSemesterId()}`
  return callGrowthManager('getPersonalGrowth', { student_id: sid }, true, cacheKey, CACHE_TTL.personal)
}

async function getGrowthWarnings(options = {}) {
  const cacheKey = `warnings_${getClassId()}_${getSemesterId()}`
  return callGrowthManager('getGrowthWarnings', options, true, cacheKey, CACHE_TTL.warnings)
}

async function updateGrowthWarningStatus(warningId, status) {
  growthCache.removeCache(`warnings_${getClassId()}_${getSemesterId()}`)
  return callGrowthManager('updateGrowthWarningStatus', { warning_id: warningId, status })
}

async function detectGrowthWarnings() {
  growthCache.removeCache(`warnings_${getClassId()}_${getSemesterId()}`)
  return callGrowthManager('detectGrowthWarnings')
}

async function getGrowthWarningRules() {
  return callGrowthManager('getGrowthWarningRules')
}

async function generateManagementAdvice(forceRefresh = false) {
  const cacheKey = `advice_${getClassId()}_${getSemesterId()}`
  if (!forceRefresh) {
    const cached = growthCache.getCache(cacheKey, CACHE_TTL.advice)
    if (cached) return cached
  }
  const result = await callGrowthManager('generateManagementAdvice', { force_refresh: forceRefresh })
  growthCache.setCache(cacheKey, result)
  return result
}

async function getGrowthReviews(options = {}) {
  return callGrowthManager('getGrowthReviews', options)
}

async function confirmGrowthReview(reviewId) {
  return callGrowthManager('confirmGrowthReview', { review_id: reviewId })
}

async function updateGrowthReview(reviewId, content) {
  return callGrowthManager('updateGrowthReview', { review_id: reviewId, content })
}

async function batchGenerateReviews(studentIds, timeRange) {
  return callGrowthManager('batchGenerateReviews', { student_ids: studentIds, time_range: timeRange })
}

async function getDeepAnalysis(options = {}) {
  const sid = options.student_id || app.globalData.student_id || ''
  const cacheKey = `analysis_${sid}_${getSemesterId()}`
  return callGrowthAnalysis('getDeepAnalysis', options, !options.force_refresh, cacheKey, CACHE_TTL.analysis)
}

async function generateDevAdvice(options = {}) {
  return callGrowthAnalysis('generateDevAdvice', options)
}

async function getClassClusterAnalysis() {
  return callGrowthAnalysis('getClassClusterAnalysis')
}

async function initGrowthCollections() {
  return callGrowthManager('initGrowthCollections')
}

module.exports = {
  getClassDashboard,
  getDimensionTrend,
  getPersonalGrowth,
  getGrowthWarnings,
  updateGrowthWarningStatus,
  detectGrowthWarnings,
  getGrowthWarningRules,
  generateManagementAdvice,
  getGrowthReviews,
  confirmGrowthReview,
  updateGrowthReview,
  batchGenerateReviews,
  getDeepAnalysis,
  generateDevAdvice,
  getClassClusterAnalysis,
  initGrowthCollections
}
