const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const { getCallerInfo, requireClassAccess, requireTeacherOrModule, AUTH_ERRORS } = require('./utils/auth')

exports.main = async (event, context) => {
  const { action, data } = event
  const effectiveAction = action || 'importRules'

  try {
    const caller = await getCallerInfo(event, data?.class_id || event.class_id)

    switch (effectiveAction) {
      case 'importRules':
        requireClassAccess(caller, data?.class_id || event.class_id, ['head_teacher', 'admin'])
        return await importRules(data || event, caller)
      case 'toggleRuleStatus':
        await requireTeacherOrModule(caller, 'dorm')
        return await toggleRuleStatus(data || {}, caller)
      case 'updateRule':
        await requireTeacherOrModule(caller, 'dorm')
        return await updateRule(data || {}, caller)
      case 'addRule':
        await requireTeacherOrModule(caller, 'dorm')
        return await addRule(data || {}, caller)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('importDormRules失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return { success: false, message: err.message || '操作失败' }
  }
}

async function importRules(data, caller) {
  const { class_id } = data
  console.log('开始导入宿舍规则...')

  let semesterQuery = { is_current: true }
  if (class_id) {
    semesterQuery = { class_id: class_id, is_current: true }
  }
  const semesterRes = await db.collection('semesters')
    .where(semesterQuery)
    .limit(1)
    .get()

  let currentSemesterId = ''
  if (semesterRes.data && semesterRes.data.length > 0) {
    currentSemesterId = semesterRes.data[0]._id
  } else if (class_id) {
    const fallbackRes = await db.collection('semesters')
      .where({ is_current: true })
      .limit(1)
      .get()
    if (fallbackRes.data && fallbackRes.data.length > 0) {
      currentSemesterId = fallbackRes.data[0]._id
    }
  }

  const rules = [
    { rule_name: '迟离宿舍', category: '作息', score_value: -3, severity: '轻微', standard: '在规定时间前离开宿舍', description: '迟离宿舍一次扣3分', requires_proof: false },
    { rule_name: '迟归宿舍', category: '作息', score_value: -3, severity: '轻微', standard: '在规定时间后返回宿舍', description: '迟归宿舍一次扣3分', requires_proof: false },
    { rule_name: '没按规定提前回校', category: '作息', score_value: -3, severity: '轻微', standard: '未按规定时间提前返回学校', description: '没按规定提前回校一次扣3分', requires_proof: false },
    { rule_name: '缺宿', category: '作息', score_value: -10, severity: '重大', standard: '晚上未在宿舍住宿', description: '缺宿一次扣10分', requires_proof: true },
    { rule_name: '窜宿舍', category: '作息', score_value: -5, severity: '一般', standard: '未经允许到其他宿舍', description: '窜宿舍一次扣5分', requires_proof: false },
    { rule_name: '异常留校', category: '作息', score_value: -3, severity: '轻微', standard: '非正常时间留在学校', description: '异常留校一次扣3分', requires_proof: false },
    { rule_name: '顶替违纪', category: '纪律', score_value: -10, severity: '一般', standard: '顶替他人进行违纪行为', description: '顶替违纪一次扣10分', requires_proof: true },

    { rule_name: '个人内务卫生差', category: '卫生', score_value: -3, severity: '轻微', standard: '个人内务整理不合格', description: '个人内务卫生差一次扣3分', requires_proof: false },
    { rule_name: '值日差', category: '卫生', score_value: -3, severity: '轻微', standard: '值日工作不到位', description: '值日差一次扣3分', requires_proof: false },
    { rule_name: '个人宿舍物品问题', category: '卫生', score_value: -3, severity: '轻微', standard: '上课离开没拔充电器、晚修离开没关灯、故意遮挡门窗等', description: '个人宿舍物品问题一次扣3分', requires_proof: false },
    { rule_name: '不按要求贴宿舍门牌照片', category: '卫生', score_value: -3, severity: '轻微', standard: '未按学校要求张贴宿舍门牌照片', description: '不按要求贴宿舍门牌照片扣3分', requires_proof: false },

    { rule_name: '不穿校服', category: '卫生', score_value: -3, severity: '轻微', standard: '未按规定穿着校服', description: '不穿校服一次扣3分', requires_proof: false },
    { rule_name: '不按要求穿校服', category: '卫生', score_value: -3, severity: '轻微', standard: '校服穿着不规范', description: '不按要求穿校服一次扣3分', requires_proof: false },
    { rule_name: '穿拖鞋', category: '卫生', score_value: -3, severity: '轻微', standard: '在宿舍区域穿着拖鞋', description: '穿拖鞋一次扣3分', requires_proof: false },

    { rule_name: '打牌', category: '纪律', score_value: -30, severity: '严重', standard: '在宿舍内打牌', description: '打牌一次扣30分', requires_proof: true },
    { rule_name: '为首或提供打牌', category: '纪律', score_value: -40, severity: '重大', standard: '组织或提供打牌场所', description: '为首或提供打牌一次扣40分', requires_proof: true },
    { rule_name: '抽烟', category: '纪律', score_value: -20, severity: '严重', standard: '在宿舍内吸烟', description: '抽烟一次扣20分', requires_proof: true },
    { rule_name: '妨碍他人休息', category: '纪律', score_value: -5, severity: '一般', standard: '影响他人正常休息', description: '妨碍他人休息一次扣5分，严重者扣10分', requires_proof: false },
    { rule_name: '私带或使用宿舍管理违禁品', category: '纪律', score_value: -20, severity: '严重', standard: '携带或使用宿舍管理规定的违禁物品', description: '私带或使用宿舍管理违禁品扣20分', requires_proof: true },
    { rule_name: '破坏宿舍公物', category: '公物', score_value: -20, severity: '严重', standard: '故意损坏宿舍公共财物', description: '破坏宿舍公物及私拆公共设施封条扣20分', requires_proof: true },
    { rule_name: '私拆公共设施封条', category: '公物', score_value: -20, severity: '严重', standard: '私自拆除公共设施上的封条', description: '私拆公共设施封条扣20分', requires_proof: true },
    { rule_name: '宿舍内发现烟、烟头、烟盅、打火机', category: '纪律', score_value: -10, severity: '一般', standard: '在宿舍内发现吸烟相关物品', description: '宿舍内发现烟、烟头、烟盅、打火机扣10分', requires_proof: true },
    { rule_name: '私自调换宿舍', category: '纪律', score_value: -10, severity: '一般', standard: '未经允许私自调换宿舍', description: '私自调换宿舍一次扣10分', requires_proof: false },
    { rule_name: '主动认错私自调换宿舍', category: '纪律', score_value: -5, severity: '轻微', standard: '主动承认私自调换宿舍的错误', description: '主动认错私自调换宿舍一次扣5分', requires_proof: false },
    { rule_name: '以粗言秽语辱骂、攻击他人', category: '纪律', score_value: -20, severity: '严重', standard: '使用粗俗语言辱骂或攻击他人', description: '以粗言秽语辱骂、攻击他人扣20分', requires_proof: true },
    { rule_name: '不服从或顶撞管理人员', category: '纪律', score_value: -20, severity: '严重', standard: '不服从宿舍管理人员管理或顶撞管理人员', description: '不服从或顶撞管理人员扣20分', requires_proof: true },
    { rule_name: '晚上不交手机', category: '纪律', score_value: -10, severity: '一般', standard: '晚上未按规定上交手机', description: '晚上不交手机、交模型机、迟交手机第一次扣10分、第二、三次扣20分', requires_proof: false },
    { rule_name: '晚上交模型机', category: '纪律', score_value: -10, severity: '一般', standard: '上交模型手机代替真实手机', description: '晚上交模型机扣10分', requires_proof: true },
    { rule_name: '晚上迟交手机', category: '纪律', score_value: -10, severity: '一般', standard: '晚上未按时上交手机', description: '晚上迟交手机第一次扣10分、第二、三次扣20分', requires_proof: false },

    { rule_name: '在宿舍贩卖烟酒食品', category: '安全', score_value: -50, severity: '重大', standard: '在宿舍内非法贩卖烟酒食品', description: '在宿舍贩卖烟酒食品扣50分', requires_proof: true },
    { rule_name: '私自派发传单', category: '安全', score_value: -50, severity: '重大', standard: '未经允许私自派发传单', description: '私自派发传单扣50分', requires_proof: true },
    { rule_name: '留非住宿人员过夜', category: '安全', score_value: -20, severity: '严重', standard: '允许非住宿人员在宿舍过夜', description: '留非住宿人员过夜扣20分', requires_proof: true },
    { rule_name: '带走读生回宿舍', category: '安全', score_value: -10, severity: '一般', standard: '将走读生带回宿舍', description: '带走读生回宿舍扣10分', requires_proof: false },
    { rule_name: '喝酒', category: '安全', score_value: -20, severity: '严重', standard: '在宿舍内饮酒', description: '喝酒一次扣20分', requires_proof: true },
    { rule_name: '提供酒类', category: '安全', score_value: -30, severity: '严重', standard: '为他人提供酒类', description: '提供酒类扣30分', requires_proof: true },
    { rule_name: '为首者喝酒', category: '安全', score_value: -30, severity: '严重', standard: '组织或带头喝酒', description: '为首者、喝酒造成恶劣影响扣30分', requires_proof: true },
    { rule_name: '在宿舍打架或参与打架', category: '安全', score_value: -30, severity: '严重', standard: '在宿舍内参与打架斗殴', description: '在宿舍打架或参与打架一次扣30分', requires_proof: true },
    { rule_name: '策划或为首打架', category: '安全', score_value: -40, severity: '重大', standard: '策划或带头参与打架斗殴', description: '策划或为首打架扣40分', requires_proof: true },
    { rule_name: '持械打架', category: '安全', score_value: -50, severity: '重大', standard: '使用器械参与打架斗殴', description: '持械打架扣50分', requires_proof: true },

    { rule_name: '文明宿舍奖', category: '卫生', score_value: 1, severity: '一般', standard: '宿舍获评校级周/月"文明宿舍"，全体成员加1分；获学期文明宿舍加5分', description: '文明宿舍奖：周/月文明宿舍每人加1分，学期文明宿舍每人加5分', requires_proof: true },
    { rule_name: '内务进步奖', category: '卫生', score_value: 1, severity: '轻微', standard: '个人内务或宿舍整体卫生较上周有明显进步，获宿管老师点名表扬，或单周宿舍评分平均分大于92分', description: '内务进步奖每人加1分', requires_proof: false },
    { rule_name: '标识不规范罚', category: '卫生', score_value: -3, severity: '轻微', standard: '未按学校要求张贴宿舍门牌照片，或床位标签缺失', description: '标识不规范罚每次扣3分', requires_proof: false },
    { rule_name: '仪容仪表罚(宿舍)', category: '纪律', score_value: -3, severity: '轻微', standard: '不穿校服、不按要求穿校服、穿拖鞋进入教学区/宿舍公共区', description: '仪容仪表罚(宿舍)每次扣3分', requires_proof: false },
    { rule_name: '言语冲突罚(宿舍)', category: '纪律', score_value: -20, severity: '严重', standard: '使用粗言秽语辱骂攻击他人，引发矛盾，或顶撞管理人员/老师', description: '言语冲突罚(宿舍)每次扣20分', requires_proof: true },

    { rule_name: '连续日劳动', category: '其他', score_value: 2, severity: '轻微', standard: '通过连续日劳动获得加分', description: '连续日劳动每次加回2分', requires_proof: true },
    { rule_name: '其他加分', category: '其他', score_value: 5, severity: '轻微', standard: '其他类型的加分奖励', description: '其他加分等', requires_proof: false }
  ]

  let ruleCount = 0

  for (const rule of rules) {
    const existing = await db.collection('dorm_rules')
      .where({
        rule_name: rule.rule_name,
        category: rule.category,
        class_id: class_id || ''
      })
      .get()

    if (existing.data.length === 0) {
      await db.collection('dorm_rules').add({
        data: {
          ...rule,
          class_id: class_id || '',
          semester_id: currentSemesterId,
          is_enabled: true,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      })
      ruleCount++
      console.log('导入规则:', rule.rule_name, '-', rule.category)
    } else {
      console.log('规则已存在，跳过:', rule.rule_name)
    }
  }

  console.log('导入完成')
  return {
    success: true,
    message: '导入成功',
    data: {
      importedRules: ruleCount,
      totalRules: rules.length,
      currentSemesterId: currentSemesterId,
      categories: ['卫生', '纪律', '安全', '作息', '公物', '其他']
    }
  }
}

async function toggleRuleStatus(data, caller) {
  const { ruleId, is_enabled } = data || {}
  if (!ruleId) return { success: false, message: '缺少必要参数: ruleId' }
  if (is_enabled === undefined || is_enabled === null) {
    return { success: false, message: '缺少必要参数: is_enabled' }
  }
  try {
    const now = db.serverDate()
    await db.collection('dorm_rules').doc(ruleId).update({
      data: { is_enabled, updated_at: now }
    })
    return { success: true }
  } catch (err) {
    console.error('toggleRuleStatus失败:', err)
    return { success: false, message: err.message }
  }
}

async function updateRule(data, caller) {
  const { ruleId, _id, ...updateFields } = data || {}
  const effectiveId = ruleId || _id
  if (!effectiveId) return { success: false, message: '缺少必要参数: ruleId' }
  try {
    const now = db.serverDate()
    await db.collection('dorm_rules').doc(effectiveId).update({ data: { ...updateFields, updated_at: now } })
    return { success: true }
  } catch (err) {
    console.error('updateRule失败:', err)
    return { success: false, message: err.message }
  }
}

async function addRule(data, caller) {
  try {
    const now = db.serverDate()
    const res = await db.collection('dorm_rules').add({
      data: { ...data, created_at: now, updated_at: now }
    })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addRule失败:', err)
    return { success: false, message: err.message }
  }
}
