const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const AUTH_ERRORS = {
  NO_OPENID: 'AUTH_NO_OPENID',
  NO_CLASS: 'AUTH_NO_CLASS',
  NO_ACCESS: 'AUTH_NO_ACCESS',
  ROLE_DENIED: 'AUTH_ROLE_DENIED',
  CLASS_DENIED: 'AUTH_CLASS_DENIED'
}

async function getCallerInfo(event, classId) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    const err = new Error('未获取到用户身份')
    err.code = AUTH_ERRORS.NO_OPENID
    throw err
  }

  const userRes = await db.collection('user_class_relation')
    .where({ user_openid: openid, status: 'joined' })
    .get()

  if (!userRes.data || userRes.data.length === 0) {
    const err = new Error('用户未加入任何班级')
    err.code = AUTH_ERRORS.NO_CLASS
    throw err
  }

  const allClasses = userRes.data.map(r => ({
    classId: r.class_id,
    role: r.role,
    studentId: r.student_id || null,
    isOwner: r.is_owner || false
  }))

  let targetRelation
  if (classId) {
    targetRelation = userRes.data.find(r => r.class_id === classId)
    if (!targetRelation) {
      const err = new Error('无权访问该班级')
      err.code = AUTH_ERRORS.NO_ACCESS
      throw err
    }
  } else {
    targetRelation = userRes.data[0]
  }

  return {
    openid,
    role: targetRelation.role,
    classId: targetRelation.class_id,
    studentId: targetRelation.student_id || null,
    isOwner: targetRelation.is_owner || false,
    realName: targetRelation.real_name || '匿名',
    allClasses
  }
}

function requireRole(caller, allowedRoles) {
  if (!allowedRoles.includes(caller.role)) {
    const err = new Error(`权限不足，需要角色: ${allowedRoles.join(', ')}`)
    err.code = AUTH_ERRORS.ROLE_DENIED
    throw err
  }
  return caller
}

function requireClassAccess(caller, targetClassId, allowedRoles) {
  requireRole(caller, allowedRoles)

  if (caller.role !== 'admin' && caller.classId !== targetClassId) {
    const err = new Error('无权访问该班级数据')
    err.code = AUTH_ERRORS.CLASS_DENIED
    throw err
  }

  return caller
}

function requireAdmin(caller) {
  return requireRole(caller, ['admin'])
}

function requireTeacher(caller) {
  return requireRole(caller, ['head_teacher', 'subject_teacher', 'admin'])
}

function requireClassCadre(caller) {
  return requireRole(caller, ['class_cadre', 'head_teacher', 'admin'])
}

module.exports = {
  getCallerInfo,
  requireRole,
  requireClassAccess,
  requireAdmin,
  requireTeacher,
  requireClassCadre,
  AUTH_ERRORS
}
