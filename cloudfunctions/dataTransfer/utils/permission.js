const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function checkPermission(openid, allowedRoles) {
  console.log('[permission] checkPermission called, openid:', openid)

  if (!openid) {
    throw new Error('未获取到用户身份，请重新进入小程序')
  }

  let user = null

  let userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
  console.log('[permission] query by _openid, found:', userRes.data ? userRes.data.length : 0)
  if (userRes.data && userRes.data.length > 0) {
    user = userRes.data[0]
  }

  if (!user) {
    userRes = await db.collection('users').where({ user_openid: openid }).limit(1).get()
    console.log('[permission] query by user_openid, found:', userRes.data ? userRes.data.length : 0)
    if (userRes.data && userRes.data.length > 0) {
      user = userRes.data[0]
    }
  }

  if (!user) {
    userRes = await db.collection('users').where({ openid: openid }).limit(1).get()
    console.log('[permission] query by openid, found:', userRes.data ? userRes.data.length : 0)
    if (userRes.data && userRes.data.length > 0) {
      user = userRes.data[0]
    }
  }

  if (!user) {
    const relRes = await db.collection('user_class_relation').where({ user_openid: openid, status: 'joined' }).limit(1).get()
    console.log('[permission] query user_class_relation, found:', relRes.data ? relRes.data.length : 0)
    if (relRes.data && relRes.data.length > 0 && relRes.data[0].role) {
      user = { role: relRes.data[0].role, _openid: openid, class_id: relRes.data[0].class_id || '', student_id: relRes.data[0].student_id || '' }
    }
  }

  if (!user) {
    const relRes2 = await db.collection('user_class_relation').where({ _openid: openid, status: 'joined' }).limit(1).get()
    console.log('[permission] query user_class_relation by _openid, found:', relRes2.data ? relRes2.data.length : 0)
    if (relRes2.data && relRes2.data.length > 0 && relRes2.data[0].role) {
      user = { role: relRes2.data[0].role, _openid: openid, class_id: relRes2.data[0].class_id || '', student_id: relRes2.data[0].student_id || '' }
    }
  }

  if (!user) {
    throw new Error('用户不存在，请确认已登录并加入班级')
  }

  console.log('[permission] user found, role:', user.role)

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new Error('无操作权限')
  }

  return user
}

module.exports = { checkPermission }
