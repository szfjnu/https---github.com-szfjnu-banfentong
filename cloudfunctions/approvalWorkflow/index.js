// 云函数：通用审批工作流
// 支持：志愿服务、技能证书、技能比赛等多层审批
// 流程：学生/家长提交 → 班委初审 → 班主任终审
//       班委/班主任提交 → 班主任审核
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const { getCallerInfo, AUTH_ERRORS } = require('./utils/auth')

/**
 * 审批流程状态：
 * - pending_cadre: 待班委审核（学生/家长提交后）
 * - pending_teacher: 待班主任审核（班委通过后，或班委/班主任直接提交）
 * - approved: 已通过（班主任审核通过）
 * - rejected: 已驳回
 */

/**
 * 支持的操作：
 * 1. submitApproval - 提交审批（创建审批记录+更新业务记录状态）
 * 2. approveByCadre - 班委审核（通过/驳回）
 * 3. approveByTeacher - 班主任审核（通过/驳回）
 * 4. getPendingApprovals - 获取待审批列表
 * 5. getApprovalDetail - 获取审批详情
 * 6. getApprovalStats - 获取审批统计
 */
exports.main = async (event, context) => {
  const { action, data } = event
  const classId = data && data.classId

  try {
    const caller = await getCallerInfo(event, classId)

    switch (action) {
      case 'submitApproval':
        return await submitApproval(caller, data)
      case 'approveByCadre':
        return await approveByCadre(caller, data)
      case 'approveByTeacher':
        return await approveByTeacher(caller, data)
      case 'getPendingApprovals':
        return await getPendingApprovals(caller, data)
      case 'getApprovalDetail':
        return await getApprovalDetail(data)
      case 'getApprovalStats':
        return await getApprovalStats(caller, data)
      default:
        return { success: false, error: '未知操作' }
    }
  } catch (err) {
    console.error(`approvalWorkflow ${action} 失败:`, err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, error: err.message, code: err.code }
    }
    return { success: false, error: err.message || '操作失败' }
  }
}

// 获取用户在班级中的角色
async function getUserRole(openid, classId) {
  let res = await db.collection('user_class_relation')
    .where({
      user_openid: openid,
      class_id: classId,
      status: 'joined'
    })
    .limit(1)
    .get()

  if (res.data.length === 0) {
    res = await db.collection('user_class_relation')
      .where({
        _openid: openid,
        class_id: classId,
        status: 'joined'
      })
      .limit(1)
      .get()
  }

  if (res.data.length > 0) {
    return res.data[0].role
  }
  return null
}

// 业务类型与权限模块的映射
const BUSINESS_MODULE_MAP = {
  volunteer: 'volunteer',
  certificate: 'volunteer',
  competition: 'volunteer',
  score: 'score',
  attendance: 'attendance',
  duty: 'duty',
  dorm: 'dorm',
  discipline: 'discipline'
}

// 检查学生是否有某个模块的审批权限
async function hasApprovePermission(openid, classId, businessType) {
  // 1. 先查用户对应的 student_id
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get()

  if (!userRes.data || userRes.data.length === 0) return false

  const userId = userRes.data[0]._id
  const studentId = userRes.data[0].student_id

  if (!studentId) return false

  // 2. 查 student_authorizations
  const moduleKey = BUSINESS_MODULE_MAP[businessType]
  if (!moduleKey) return false

  try {
    const authRes = await db.collection('student_authorizations')
      .where({
        class_id: classId,
        student_id: studentId
      })
      .limit(1)
      .get()

    if (!authRes.data || authRes.data.length === 0) return false

    const permissions = authRes.data[0].permissions || {}
    const moduleActions = permissions[moduleKey] || []
    return moduleActions.includes('approve')
  } catch (err) {
    console.error('检查审批权限失败:', err)
    return false
  }
}

// 提交审批
async function submitApproval(caller, data) {
  const { businessType, businessId, classId, studentId, submitNote } = data

  if (!businessType || !businessId || !classId) {
    return { success: false, error: '缺少必要参数' }
  }

  const role = caller.role

  // 确定初始审批状态
  let initialStatus
  if (role === 'student' || role === 'parent') {
    // 学生/家长提交 → 先班委审核
    initialStatus = 'pending_cadre'
  } else if (role === 'class_cadre') {
    // 班委提交 → 直接班主任审核
    initialStatus = 'pending_teacher'
  } else if (role === 'head_teacher' || role === 'admin') {
    // 班主任/管理员提交 → 直接通过
    initialStatus = 'approved'
  } else {
    return { success: false, error: '无权提交审批' }
  }

  const userRes = await db.collection('users')
    .where({ _openid: caller.openid })
    .limit(1)
    .get()
  const submitterName = userRes.data.length > 0
    ? (userRes.data[0].nickname || userRes.data[0].name || '未知')
    : '未知'

  // 创建审批记录
  const approvalData = {
    business_type: businessType,     // volunteer, certificate, competition
    business_id: businessId,         // 业务记录ID
    class_id: classId,
    student_id: studentId || '',
    status: initialStatus,
    current_step: initialStatus === 'pending_cadre' ? 'cadre' : (initialStatus === 'pending_teacher' ? 'teacher' : 'done'),
    submitter_openid: caller.openid,
    submitter_name: submitterName,
    submitter_role: role,
    submit_note: submitNote || '',
    approval_history: [
      {
        step: 'submit',
        operator_openid: caller.openid,
        operator_name: submitterName,
        operator_role: role,
        action: 'submit',
        note: submitNote || '',
        time: db.serverDate()
      }
    ],
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }

  const approvalRes = await db.collection('approvals').add({ data: approvalData })

  // 如果是班主任/管理员直接提交，更新业务记录为已通过
  if (initialStatus === 'approved') {
    await updateBusinessStatus(businessType, businessId, 'approved', caller.openid, submitterName)
    // 同时更新审批记录
    await db.collection('approvals').doc(approvalRes._id).update({
      data: {
        approval_history: _.push({
          step: 'teacher',
          operator_openid: caller.openid,
          operator_name: submitterName,
          operator_role: role,
          action: 'approve',
          note: '管理员/班主任直接提交通过',
          time: db.serverDate()
        }),
        approved_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    })
  } else {
    // 更新业务记录为待审批
    await updateBusinessStatus(businessType, businessId, initialStatus, caller.openid, submitterName)
  }

  return {
    success: true,
    data: {
      approvalId: approvalRes._id,
      status: initialStatus
    }
  }
}

// 班委审核
async function approveByCadre(caller, data) {
  const { approvalId, approved, note } = data

  if (!approvalId) {
    return { success: false, error: '缺少审批ID' }
  }

  // 获取审批记录
  const approvalRes = await db.collection('approvals').doc(approvalId).get()
  const approval = approvalRes.data

  if (approval.status !== 'pending_cadre') {
    return { success: false, error: '当前状态不允许班委审核' }
  }

  const cadreRole = await getUserRole(caller.openid, approval.class_id)
  const hasPermission = cadreRole === 'class_cadre' || cadreRole === 'head_teacher' || cadreRole === 'admin'
    || await hasApprovePermission(caller.openid, approval.class_id, approval.business_type)

  if (!hasPermission) {
    return { success: false, error: '无权进行班委审核，请联系班主任授权' }
  }

  const userRes = await db.collection('users')
    .where({ _openid: caller.openid })
    .limit(1)
    .get()
  const cadreName = userRes.data.length > 0
    ? (userRes.data[0].nickname || userRes.data[0].name || '班委')
    : '班委'

  let newStatus
  if (approved) {
    // 班委通过 → 推送到班主任终审
    newStatus = 'pending_teacher'
  } else {
    // 班委驳回
    newStatus = 'rejected'
  }

  // 更新审批记录
  await db.collection('approvals').doc(approvalId).update({
    data: {
      status: newStatus,
      current_step: approved ? 'teacher' : 'done',
      cadre_approver_openid: caller.openid,
      cadre_approver_name: cadreName,
      cadre_approved: approved,
      cadre_note: note || '',
      cadre_approved_at: db.serverDate(),
      approval_history: _.push({
        step: 'cadre',
        operator_openid: caller.openid,
        operator_name: cadreName,
        operator_role: cadreRole,
        action: approved ? 'approve' : 'reject',
        note: note || '',
        time: db.serverDate()
      }),
      updated_at: db.serverDate()
    }
  })

  await updateBusinessStatus(approval.business_type, approval.business_id, newStatus, caller.openid, cadreName)

  return {
    success: true,
    data: {
      approvalId: approvalId,
      status: newStatus
    }
  }
}

// 班主任审核
async function approveByTeacher(caller, data) {
  const { approvalId, approved, note } = data

  if (!approvalId) {
    return { success: false, error: '缺少审批ID' }
  }

  // 获取审批记录
  const approvalRes = await db.collection('approvals').doc(approvalId).get()
  const approval = approvalRes.data

  if (approval.status !== 'pending_teacher') {
    return { success: false, error: '当前状态不允许班主任审核' }
  }

  const teacherRole = await getUserRole(caller.openid, approval.class_id)
  if (teacherRole !== 'head_teacher' && teacherRole !== 'admin') {
    return { success: false, error: '无权进行班主任审核' }
  }

  const userRes = await db.collection('users')
    .where({ _openid: caller.openid })
    .limit(1)
    .get()
  const teacherName = userRes.data.length > 0
    ? (userRes.data[0].nickname || userRes.data[0].name || '班主任')
    : '班主任'

  let newStatus = approved ? 'approved' : 'rejected'

  // 更新审批记录
  const updateData = {
    status: newStatus,
    current_step: 'done',
    teacher_approver_openid: caller.openid,
    teacher_approver_name: teacherName,
    teacher_approved: approved,
    teacher_note: note || '',
    teacher_approved_at: db.serverDate(),
    approval_history: _.push({
      step: 'teacher',
      operator_openid: caller.openid,
      operator_name: teacherName,
      operator_role: teacherRole,
      action: approved ? 'approve' : 'reject',
      note: note || '',
      time: db.serverDate()
    }),
    updated_at: db.serverDate()
  }

  if (approved) {
    updateData.approved_at = db.serverDate()
  }

  await db.collection('approvals').doc(approvalId).update({ data: updateData })

  await updateBusinessStatus(approval.business_type, approval.business_id, newStatus, caller.openid, teacherName)

  if (approved) {
    await onApprovalApproved(approval)
  }

  return {
    success: true,
    data: {
      approvalId: approvalId,
      status: newStatus
    }
  }
}

// 审批通过后的后续操作
async function onApprovalApproved(approval) {
  const { business_type, business_id, class_id, student_id } = approval

  if (business_type === 'volunteer') {
    // 志愿服务审批通过：发放积分
    try {
      const recordRes = await db.collection('volunteer_records').doc(business_id).get()
      const record = recordRes.data

      if (record && record.earned_score > 0 && student_id) {
        // 创建积分记录
        const scoreRecordData = {
          record_id: `SCR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          student_id: student_id,
          item_id: 'volunteer_service',
          item_name: `志愿服务: ${record.activity_name}`,
          rule_name: `志愿服务: ${record.activity_name}`,
          rule_category: '志愿服务',
          rule_code: 'VOLUNTEER_SERVICE',
          score_change: record.earned_score,
          score_value: record.earned_score,
          reason_detail: `参与${record.activity_name}，服务时长${record.duration}小时`,
          date: record.date || new Date(),
          recorder_name: record.recorder_name || '审批通过',
          recorder_openid: record.recorder_openid || '',
          semester_id: record.semester_id || '',
          class_id: class_id,
          source_type: '志愿服务',
          source_record_id: record.record_id || business_id,
          approval_status: '已通过',
          status: '已确认',
          created_at: db.serverDate()
        }

        await db.collection('score_records').add({ data: scoreRecordData })

        // 更新学生积分
        await db.collection('students')
          .where({ student_id: student_id, class_id: class_id })
          .update({
            data: {
              current_score: _.inc(record.earned_score),
              updated_at: db.serverDate()
            }
          })
      }
    } catch (err) {
      console.error('志愿服务审批通过后操作失败:', err)
    }
  }
  // 其他业务类型（certificate, competition）可在此扩展
}

// 更新业务记录的审批状态
async function updateBusinessStatus(businessType, businessId, status, operatorOpenid, operatorName) {
  const collectionMap = {
    volunteer: 'volunteer_records',
    certificate: 'certificates',
    competition: 'competition_records',
    score: 'score_records',
    attendance: 'attendance_records',
    duty: 'duty_records',
    dorm: 'dorm_score_records',
    discipline: 'discipline_records'
  }

  const collection = collectionMap[businessType]
  if (!collection) return

  const statusMap = {
    pending_cadre: '待班委审核',
    pending_teacher: '待班主任审核',
    approved: '已通过',
    rejected: '已驳回'
  }

  try {
    const updateData = {
      approval_status: statusMap[status] || status,
      updated_at: db.serverDate()
    }

    if (status === 'approved') {
      updateData.is_verified = true
      updateData.verified_at = db.serverDate()
      updateData.verifier_openid = operatorOpenid
      updateData.verifier_name = operatorName
    }

    await db.collection(collection).doc(businessId).update({ data: updateData })
  } catch (err) {
    console.error(`更新业务状态失败 [${businessType}]:`, err)
  }
}

// 获取待审批列表
async function getPendingApprovals(caller, data) {
  const { classId, businessType, status, page = 0, pageSize = 20 } = data

  if (!classId) {
    return { success: false, error: '缺少班级ID' }
  }

  const role = await getUserRole(caller.openid, classId)

  let query = { class_id: classId }
  if (businessType) {
    query.business_type = businessType
  }

  // 根据角色过滤状态
  if (role === 'class_cadre') {
    // 班委：看到待班委审核的
    query.status = status || 'pending_cadre'
  } else if (role === 'head_teacher' || role === 'admin') {
    // 班主任：看到待班主任审核的
    query.status = status || 'pending_teacher'
  } else {
    // 学生/家长：看到自己提交的
    query.submitter_openid = caller.openid
  }

  const res = await db.collection('approvals')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get()

  const totalRes = await db.collection('approvals')
    .where(query)
    .count()

  return {
    success: true,
    data: {
      list: res.data,
      total: totalRes.total,
      hasMore: res.data.length === pageSize
    }
  }
}

// 获取审批详情
async function getApprovalDetail(data) {
  const { approvalId } = data

  if (!approvalId) {
    return { success: false, error: '缺少审批ID' }
  }

  const res = await db.collection('approvals').doc(approvalId).get()

  return {
    success: true,
    data: res.data
  }
}

// 获取审批统计
async function getApprovalStats(caller, data) {
  const { classId, businessType } = data

  if (!classId) {
    return { success: false, error: '缺少班级ID' }
  }

  let baseQuery = { class_id: classId }
  if (businessType) {
    baseQuery.business_type = businessType
  }

  const [pendingCadre, pendingTeacher, approved, rejected] = await Promise.all([
    db.collection('approvals').where({ ...baseQuery, status: 'pending_cadre' }).count(),
    db.collection('approvals').where({ ...baseQuery, status: 'pending_teacher' }).count(),
    db.collection('approvals').where({ ...baseQuery, status: 'approved' }).count(),
    db.collection('approvals').where({ ...baseQuery, status: 'rejected' }).count()
  ])

  return {
    success: true,
    data: {
      pendingCadre: pendingCadre.total,
      pendingTeacher: pendingTeacher.total,
      approved: approved.total,
      rejected: rejected.total
    }
  }
}
