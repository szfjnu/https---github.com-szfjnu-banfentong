// 云函数：聚光点 - 校园活动管理
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { getCallerInfo } = require('./utils/auth')

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    const caller = await getCallerInfo(event, data?.class_id || data?.classId)

  switch (action) {
    case 'create': return await createActivity(event, caller.openid)
    case 'list': return await listActivities(event, caller.openid)
    case 'detail': return await getActivity(event)
    case 'join': return await joinActivity(event, caller.openid)
    case 'leave': return await leaveActivity(event, caller.openid)
    case 'cancel': return await cancelActivity(event, caller.openid)
    case 'auditList': return await getAuditList(event)
    case 'audit': return await auditActivity(event, caller.openid)
    case 'myActivities': return await getMyActivities(event, caller.openid)
    case 'finish': return await finishActivity(event, caller.openid)
    default: return { success: false, message: '未知操作' }
  }
  } catch (err) {
    return { success: false, message: err.message }
  }
}

// 发布活动
async function createActivity(event, openid) {
  const {
    title, category, cover_image, start_time, location,
    max_people, organizer_id, organizer_name, class_id, is_class_committee
  } = event

  if (!title || !category || !start_time || !location) {
    return { success: false, message: '缺少必填字段' }
  }

  try {
    const now = Date.now()
    let resolvedName = organizer_name || ''
    if (!resolvedName) {
      const targetOpenid = organizer_id || openid
      let userRes = await db.collection('user_class_relation')
        .where({ user_openid: targetOpenid, class_id: class_id || '' })
        .limit(1).get()
      if (!userRes.data || userRes.data.length === 0) {
        userRes = await db.collection('user_class_relation')
          .where({ _openid: targetOpenid, class_id: class_id || '' })
          .limit(1).get()
      }
      if (userRes.data && userRes.data.length > 0) {
        resolvedName = userRes.data[0].real_name || userRes.data[0].name || ''
      }
    }

    const activity = {
      organizer: {
        id: organizer_id || openid,
        name: resolvedName,
        class_id: class_id || '',
        is_class_committee: is_class_committee || false
      },
      title,
      category,
      cover_image: cover_image || '',
      start_time: Number(start_time),
      location,
      max_people: Number(max_people) || 0,
      status: 0,
      audit: {
        status: is_class_committee ? 1 : 0,
        auditor_id: '',
        audit_time: is_class_committee ? now : 0,
        reject_reason: ''
      },
      joined_list: [{
        user_id: organizer_id || openid,
        name: resolvedName,
        joined_time: now
      }],
      current_count: 1,
      create_time: now
    }

    const res = await db.collection('campus_activities').add({ data: activity })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('创建活动失败:', err)
    return { success: false, message: '创建失败' }
  }
}

// 活动列表
async function listActivities(event, openid) {
  const { category, status, page = 0, pageSize = 10, class_id, role } = event

  try {
    let query = { 'audit.status': 1 } // 默认只显示已通过的活动

    // 管理员可看所有状态
    if (role === 'admin' || role === 'head_teacher') {
      delete query['audit.status']
      // 班主任只看本班
      if (role === 'head_teacher' && class_id) {
        query['organizer.class_id'] = class_id
      }
    }

    if (category) query.category = category
    if (status !== undefined && status !== '') query.status = Number(status)

    const total = await db.collection('campus_activities').where(query).count()
    const res = await db.collection('campus_activities')
      .where(query)
      .orderBy('create_time', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get()

    return {
      success: true,
      data: { list: res.data, total: total.total }
    }
  } catch (err) {
    console.error('查询活动列表失败:', err)
    return { success: false, message: '查询失败' }
  }
}

// 活动详情
async function getActivity(event) {
  const { activityId } = event
  if (!activityId) return { success: false, message: '缺少活动ID' }

  try {
    const res = await db.collection('campus_activities').doc(activityId).get()
    return { success: true, data: res.data }
  } catch (err) {
    console.error('获取活动详情失败:', err)
    return { success: false, message: '活动不存在' }
  }
}

// 报名
async function joinActivity(event, openid) {
  const { activityId, user_id, user_name } = event
  if (!activityId) return { success: false, message: '缺少活动ID' }

  try {
    // 先查询活动
    const actRes = await db.collection('campus_activities').doc(activityId).get()
    const activity = actRes.data

    // 检查状态
    if (activity.status !== 0) {
      return { success: false, message: '活动不在招募中' }
    }
    if (activity.audit.status !== 1) {
      return { success: false, message: '活动未审核通过' }
    }

    // 检查是否已报名
    const joined = activity.joined_list || []
    const userId = user_id || openid
    if (joined.some(j => j.user_id === userId)) {
      return { success: false, message: '您已报名' }
    }

    // 检查是否满员
    if (activity.max_people > 0 && activity.current_count >= activity.max_people) {
      return { success: false, message: '活动已满员' }
    }

    const now = Date.now()
    let resolvedUserName = user_name || ''
    if (!resolvedUserName) {
      let userRes = await db.collection('user_class_relation')
        .where({ user_openid: userId })
        .limit(1).get()
      if (!userRes.data || userRes.data.length === 0) {
        userRes = await db.collection('user_class_relation')
          .where({ _openid: userId })
          .limit(1).get()
      }
      if (userRes.data && userRes.data.length > 0) {
        resolvedUserName = userRes.data[0].real_name || userRes.data[0].name || ''
      }
    }
    const newMember = { user_id: userId, name: resolvedUserName, joined_time: now }

    // 构建更新对象
    let updateData = {
      joined_list: _.push(newMember),
      current_count: _.inc(1)
    }

    // 如果满员，更新状态
    if (activity.max_people > 0 && activity.current_count + 1 >= activity.max_people) {
      updateData.status = 1
    }

    await db.collection('campus_activities').doc(activityId).update({ data: updateData })
    return { success: true, message: '报名成功' }
  } catch (err) {
    console.error('报名失败:', err)
    return { success: false, message: '报名失败' }
  }
}

// 取消报名
async function leaveActivity(event, openid) {
  const { activityId, user_id } = event
  if (!activityId) return { success: false, message: '缺少活动ID' }

  try {
    const actRes = await db.collection('campus_activities').doc(activityId).get()
    const activity = actRes.data
    const userId = user_id || openid

    const joined = activity.joined_list || []
    if (!joined.some(j => j.user_id === userId)) {
      return { success: false, message: '您未报名此活动' }
    }

    let updateData = {
      joined_list: _.pull({ user_id: userId }),
      current_count: _.inc(-1)
    }

    // 如果从满员变为不满，恢复招募中
    if (activity.status === 1) {
      updateData.status = 0
    }

    await db.collection('campus_activities').doc(activityId).update({ data: updateData })
    return { success: true, message: '取消报名成功' }
  } catch (err) {
    console.error('取消报名失败:', err)
    return { success: false, message: '取消报名失败' }
  }
}

// 取消活动
async function cancelActivity(event, openid) {
  const { activityId, user_id, role } = event
  if (!activityId) return { success: false, message: '缺少活动ID' }

  try {
    const actRes = await db.collection('campus_activities').doc(activityId).get()
    const activity = actRes.data

    // 权限：只有发起人或管理员可取消
    const userId = user_id || openid
    if (activity.organizer.id !== userId && role !== 'admin' && role !== 'head_teacher') {
      return { success: false, message: '无权取消' }
    }

    await db.collection('campus_activities').doc(activityId).update({
      data: { status: 3 }
    })
    return { success: true, message: '活动已取消' }
  } catch (err) {
    console.error('取消活动失败:', err)
    return { success: false, message: '取消失败' }
  }
}

// 待审核列表
async function getAuditList(event) {
  const { class_id, role, page = 0, pageSize = 20 } = event

  if (role !== 'admin' && role !== 'head_teacher') {
    return { success: false, message: '无权限' }
  }

  try {
    let query = { 'audit.status': 0 }
    if (role === 'head_teacher' && class_id) {
      query['organizer.class_id'] = class_id
    }

    const total = await db.collection('campus_activities').where(query).count()
    const res = await db.collection('campus_activities')
      .where(query)
      .orderBy('create_time', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get()

    return { success: true, data: { list: res.data, total: total.total } }
  } catch (err) {
    console.error('获取审核列表失败:', err)
    return { success: false, message: '查询失败' }
  }
}

// 审核
async function auditActivity(event, openid) {
  const { activityId, audit_status, reject_reason, auditor_id } = event
  if (!activityId || audit_status === undefined) {
    return { success: false, message: '参数不完整' }
  }

  try {
    const now = Date.now()
    let updateData = {
      'audit.status': Number(audit_status), // 1-通过, 2-驳回
      'audit.auditor_id': auditor_id || openid,
      'audit.audit_time': now,
      'audit.reject_reason': reject_reason || ''
    }

    // 驳回时活动状态也更新
    if (Number(audit_status) === 2) {
      updateData.status = 3 // 已取消
    }

    await db.collection('campus_activities').doc(activityId).update({ data: updateData })
    return { success: true, message: Number(audit_status) === 1 ? '已通过' : '已驳回' }
  } catch (err) {
    console.error('审核失败:', err)
    return { success: false, message: '审核失败' }
  }
}

// 我参与/发起的活动
async function getMyActivities(event, openid) {
  const { user_id, type = 'joined', page = 0, pageSize = 10 } = event
  const userId = user_id || openid

  try {
    let query = {}
    if (type === 'joined') {
      query = { 'joined_list.user_id': userId, 'audit.status': 1 }
    } else {
      query = { 'organizer.id': userId }
    }

    const total = await db.collection('campus_activities').where(query).count()
    const res = await db.collection('campus_activities')
      .where(query)
      .orderBy('create_time', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get()

    return { success: true, data: { list: res.data, total: total.total } }
  } catch (err) {
    console.error('查询我的活动失败:', err)
    return { success: false, message: '查询失败' }
  }
}

// 结束活动
async function finishActivity(event, openid) {
  const { activityId, user_id, role } = event
  if (!activityId) return { success: false, message: '缺少活动ID' }

  try {
    const actRes = await db.collection('campus_activities').doc(activityId).get()
    const activity = actRes.data
    const userId = user_id || openid

    if (activity.organizer.id !== userId && role !== 'admin' && role !== 'head_teacher') {
      return { success: false, message: '无权操作' }
    }

    await db.collection('campus_activities').doc(activityId).update({
      data: { status: 2 }
    })
    return { success: true, message: '活动已结束' }
  } catch (err) {
    console.error('结束活动失败:', err)
    return { success: false, message: '操作失败' }
  }
}
