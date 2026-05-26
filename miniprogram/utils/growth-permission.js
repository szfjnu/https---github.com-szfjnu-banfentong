const rp = require('./role-permissions')

function checkGrowthPermission(permissionKey) {
  const app = getApp()
  const role = app.globalData.role
  if (!role) return false
  return rp.hasPermission(role, 'growth', permissionKey)
}

function canViewDashboard() {
  const role = getApp().globalData.role
  return ['admin', 'head_teacher', 'subject_teacher', 'class_cadre'].includes(role)
}

function canViewPersonal() {
  return true
}

function canHandleWarning() {
  const role = getApp().globalData.role
  return ['admin', 'head_teacher'].includes(role)
}

function canGenerateAdvice() {
  const role = getApp().globalData.role
  return ['admin', 'head_teacher'].includes(role)
}

function canManageReview() {
  const role = getApp().globalData.role
  return ['admin', 'head_teacher'].includes(role)
}

function canViewDeepAnalysis() {
  return true
}

function getRoleRoute() {
  const role = getApp().globalData.role
  if (['admin', 'head_teacher', 'subject_teacher'].includes(role)) {
    return '/subPkg5/growth/dashboard/dashboard'
  }
  if (role === 'class_cadre') {
    return '/subPkg5/growth/dashboard/dashboard'
  }
  return '/subPkg5/growth/personal/personal'
}

module.exports = {
  checkGrowthPermission,
  canViewDashboard,
  canViewPersonal,
  canHandleWarning,
  canGenerateAdvice,
  canManageReview,
  canViewDeepAnalysis,
  getRoleRoute
}
