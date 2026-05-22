const { requireRole, requireTeacherOrModule, hasModulePermission, AUTH_ERRORS } = require('./auth')
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function requireScoringInputRole(caller) {
  if (['admin', 'head_teacher', 'dorm_leader'].includes(caller.role)) return
  const permitted = await hasModulePermission(caller, 'dorm_score', 'write')
  if (permitted) return
  throw { code: AUTH_ERRORS.ROLE_DENIED, message: '需要教师权限或相应模块操作权限' }
}

async function requireScoringDeleteRole(caller) {
  if (['admin', 'head_teacher'].includes(caller.role)) return
  const permitted = await hasModulePermission(caller, 'dorm_score', 'write')
  if (permitted) return
  throw { code: AUTH_ERRORS.ROLE_DENIED, message: '需要教师权限或相应模块操作权限' }
}

async function getVisibleRoomFilter(caller) {
  switch (caller.role) {
    case 'admin':
      return null
    case 'head_teacher':
    case 'subject_teacher':
      return { class_id: caller.classId }
    case 'dorm_leader':
    case 'student': {
      const hasPerm = await hasModulePermission(caller, 'dorm_score', 'read')
      if (hasPerm) return { class_id: caller.classId }
      if (!caller.studentId) return { _id: '__none__' }
      try {
        const studentRes = await db.collection('students').doc(caller.studentId).get()
        const dormRoomId = studentRes.data ? studentRes.data.dorm_room_id : ''
        return { _id: dormRoomId || '__none__' }
      } catch (e) {
        return { _id: '__none__' }
      }
    }
    case 'parent': {
      try {
        const childRes = await db.collection('students')
          .where({ parent_openid: caller.openid })
          .limit(1)
          .get()
        const dormRoomId = (childRes.data && childRes.data.length > 0) ? childRes.data[0].dorm_room_id : ''
        return { _id: dormRoomId || '__none__' }
      } catch (e) {
        return { _id: '__none__' }
      }
    }
    default:
      throw { code: AUTH_ERRORS.ROLE_DENIED, message: '无权查看' }
  }
}

module.exports = {
  requireScoringInputRole,
  requireScoringDeleteRole,
  getVisibleRoomFilter
}
