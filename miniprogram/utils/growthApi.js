async function callGrowth(action, data) {
  const res = await wx.cloud.callFunction({
    name: 'growthManager',
    data: { action, data: data || {} }
  })
  if (res.result && res.result.success) return res.result.data
  throw new Error((res.result && res.result.message) || '操作失败')
}

function getProfile(data) { return callGrowth('getProfile', data) }
function generateReport(data) { return callGrowth('generateReport', data) }
function generateComment(data) { return callGrowth('generateComment', data) }
function saveComment(data) { return callGrowth('saveComment', data) }
function getWarnings(data) { return callGrowth('getWarnings', data) }
function saveWarningRules(data) { return callGrowth('saveWarningRules', data) }
function updateWarningStatus(data) { return callGrowth('updateWarningStatus', data) }
function detectWarnings(data) { return callGrowth('detectWarnings', data) }
function getRecommendations(data) { return callGrowth('getRecommendations', data) }
function submitFeedback(data) { return callGrowth('submitFeedback', data) }
function getClassSummary(data) { return callGrowth('getClassSummary', data) }
function ensureCollection() { return callGrowth('ensureCollection') }

module.exports = {
  callGrowth,
  getProfile,
  generateReport,
  generateComment,
  saveComment,
  getWarnings,
  saveWarningRules,
  updateWarningStatus,
  detectWarnings,
  getRecommendations,
  submitFeedback,
  getClassSummary,
  ensureCollection
}
