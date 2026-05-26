const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function checkPermission(openid, classIdOrRoles) {
  console.log('[permission] checkPermission called, openid:', openid, 'classIdOrRoles:', classIdOrRoles)

  if (!openid) {
    throw new Error('未获取到用户身份，请重新进入小程序')
  }

  if (Array.isArray(classIdOrRoles)) {
    const allowedRoles = classIdOrRoles
    const userRes = await db.collection('users')
      .where(_.or([
        { _openid: openid },
        { user_openid: openid },
        { openid: openid }
      ]))
      .limit(1)
      .get()

    if (!userRes.data || userRes.data.length === 0) {
      throw new Error('用户信息不存在')
    }

    const user = userRes.data[0]
    const role = user.role || ''
    if (!allowedRoles.includes(role)) {
      throw new Error('该操作需要高级会员权限')
    }

    return {
      hasPermission: true,
      role,
      _openid: openid
    }
  }

  const classId = classIdOrRoles
  if (!classId) {
    throw new Error('缺少班级ID，请指定classId')
  }

  const relRes = await db.collection('user_class_relation')
    .where({ user_openid: openid, class_id: classId, status: 'joined' })
    .limit(1)
    .get()

  if (!relRes.data || relRes.data.length === 0) {
    const relRes2 = await db.collection('user_class_relation')
      .where({ _openid: openid, class_id: classId, status: 'joined' })
      .limit(1)
      .get()

    if (!relRes2.data || relRes2.data.length === 0) {
      return { hasPermission: false, role: null, reason: 'not_in_class' }
    }

    return await evaluateRole(relRes2.data[0], openid)
  }

  return await evaluateRole(relRes.data[0], openid)
}

async function evaluateRole(relation, openid) {
  const role = relation.role

  if (!role) {
    return { hasPermission: false, role: null, reason: 'insufficient_role' }
  }

  const teacherRoles = ['admin', 'head_teacher', 'subject_teacher']

  if (!teacherRoles.includes(role)) {
    return { hasPermission: false, role, reason: 'insufficient_role' }
  }

  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()

  let user = null
  if (userRes.data && userRes.data.length > 0) {
    user = userRes.data[0]
  }

  if (!user) {
    const userRes2 = await db.collection('users')
      .where({ user_openid: openid })
      .limit(1)
      .get()
    if (userRes2.data && userRes2.data.length > 0) {
      user = userRes2.data[0]
    }
  }

  if (!user) {
    const userRes3 = await db.collection('users')
      .where({ openid: openid })
      .limit(1)
      .get()
    if (userRes3.data && userRes3.data.length > 0) {
      user = userRes3.data[0]
    }
  }

  const membership = (user && user.membership) || {}
  const isAdvancedMember = membership.is_advanced === true ||
    (typeof membership.level === 'number' && membership.level >= 2)

  if (!isAdvancedMember) {
    return { hasPermission: false, role, reason: 'not_advanced_member' }
  }

  return {
    hasPermission: true,
    role,
    isAdvancedMember: true,
    _openid: openid,
    class_id: relation.class_id || '',
    student_id: relation.student_id || ''
  }
}

module.exports = { checkPermission }
