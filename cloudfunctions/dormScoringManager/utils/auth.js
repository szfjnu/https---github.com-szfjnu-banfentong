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

async function getCallerInfo(event, classId, options = {}) {
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
    if (options.allowNoClass) {
      return {
        openid,
        role: 'new_user',
        classId: null,
        studentId: null,
        isOwner: false,
        realName: '匿名',
        allClasses: []
      }
    }
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
    if (allClasses.length > 1) {
      throw { code: AUTH_ERRORS.NO_ACCESS, message: '多班级用户必须指定classId' }
    }
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

async function hasModulePermission(caller, module, action) {
  // 家长角色绝对禁止：家长不可继承学生管理权限
  if (caller.role === 'parent') return false

  try {
    let res = await db.collection('student_authorizations')
      .where({
        student_id: caller.studentId,
        class_id: caller.classId
      })
      .limit(1)
      .get()

    if ((!res.data || res.data.length === 0) && caller.openid) {
      res = await db.collection('student_authorizations')
        .where({
          openid: caller.openid,
          class_id: caller.classId
        })
        .limit(1)
        .get()
    }

    if (!res.data || res.data.length === 0) return false

    const auth = res.data[0]
    const perms = auth.permissions || {}
    const modulePerms = perms[module] || []

    if (modulePerms.includes(action)) return true

    const WRITE_ACTIONS = ['add', 'edit', 'delete', 'manage', 'write', 'register', 'submit', 'check', 'score', 'approve', 'arrange']
    if (modulePerms.includes('write') && WRITE_ACTIONS.includes(action)) return true

    if (modulePerms.includes('read') && action === 'read') return true

    return false
  } catch (e) {
    console.error('hasModulePermission查询失败:', e)
    return false
  }
}

async function requireTeacherOrModule(caller, module, action = 'write') {
  if (['admin', 'head_teacher', 'subject_teacher'].includes(caller.role)) {
    return
  }

  // 家长角色绝对禁止：直接拒绝，不查询模块权限
  if (caller.role === 'parent') {
    throw { code: AUTH_ERRORS.ROLE_DENIED, message: '家长角色无管理权限' }
  }

  const permitted = await hasModulePermission(caller, module, action)
  if (!permitted) {
    throw { code: AUTH_ERRORS.ROLE_DENIED, message: '需要教师权限或相应模块操作权限' }
  }
}

/**
 * @deprecated 请使用 requireTeacherOrModule 替代
 */
async function hasDelegatedPermission(caller, module, action) {
  if (caller.role === 'admin' || caller.role === 'head_teacher' || caller.role === 'subject_teacher') {
    return true
  }

  // 家长角色绝对禁止
  if (caller.role === 'parent') return false

  return await hasModulePermission(caller, module, action)
}

async function requireTeacherOrDelegated(caller, module, action) {
  if (['admin', 'head_teacher', 'subject_teacher'].includes(caller.role)) {
    return
  }

  // 家长角色绝对禁止
  if (caller.role === 'parent') {
    throw { code: AUTH_ERRORS.ROLE_DENIED, message: '家长角色无委派权限' }
  }

  const delegated = await hasModulePermission(caller, module, action)
  if (!delegated) {
    throw { code: AUTH_ERRORS.ROLE_DENIED, message: '需要教师权限或相应委派权限' }
  }
}

module.exports = {
  getCallerInfo,
  requireRole,
  requireClassAccess,
  requireAdmin,
  requireTeacher,
  requireClassCadre,
  hasModulePermission,
  requireTeacherOrModule,
  hasDelegatedPermission,
  requireTeacherOrDelegated,
  AUTH_ERRORS
}
