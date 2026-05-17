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

function requireScoringInputRole(caller) {
  return requireRole(caller, ['dorm_leader', 'head_teacher', 'admin'])
}

function requireScoringDeleteRole(caller) {
  return requireRole(caller, ['head_teacher', 'admin'])
}

async function getVisibleRoomFilter(caller) {
  switch (caller.role) {
    case 'admin':
      return null
    case 'head_teacher':
      return { class_id: caller.classId }
    case 'dorm_leader':
    case 'student': {
      if (!caller.studentId) return { _id: '__none__' }
      const studentRes = await db.collection('students').doc(caller.studentId).get()
      const dormRoomId = studentRes.data ? studentRes.data.dorm_room_id : ''
      return { _id: dormRoomId || '__none__' }
    }
    case 'parent': {
      const childRes = await db.collection('students')
        .where({ parent_openid: caller.openid })
        .limit(1)
        .get()
      const dormRoomId = (childRes.data && childRes.data.length > 0) ? childRes.data[0].dorm_room_id : ''
      return { _id: dormRoomId || '__none__' }
    }
    default:
      throw { code: AUTH_ERRORS.ROLE_DENIED, message: '无权查看' }
  }
}

module.exports = {
  getCallerInfo,
  requireRole,
  requireScoringInputRole,
  requireScoringDeleteRole,
  getVisibleRoomFilter,
  AUTH_ERRORS
}
