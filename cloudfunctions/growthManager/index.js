const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_LIMIT = 100

const DEFAULT_COMPETITION_SCORES = {
  school: 5,
  city: 10,
  province: 15,
  national: 20
}

const DEFAULT_CERTIFICATE_SCORES = {
  vocational: 10,
  skill_level: 8,
  specialty: 6,
  other: 3
}

const COMPETITION_LEVELS = ['school', 'city', 'province', 'national']
const COMPETITION_LEVEL_LABELS = { school: '校级', city: '市级', province: '省级', national: '国家级' }

const CERTIFICATE_CATEGORIES = ['vocational', 'skill_level', 'specialty', 'other']
const CERTIFICATE_CATEGORY_LABELS = { vocational: '职业资格类', skill_level: '技能等级类', specialty: '专项能力类', other: '其他类' }

let aiInstance = null
function getAI() {
  if (!aiInstance) {
    try {
      aiInstance = cloud.ai()
    } catch (e) {
      console.error('cloud.ai()初始化失败:', e.message)
    }
  }
  return aiInstance
}

exports.main = async (event, context) => {
  const { action, data } = event
  const OPENID = cloud.getWXContext().OPENID

  try {
    switch (action) {
      case 'getProfile': return await getProfile(data, OPENID)
      case 'generateReport': return await generateReport(data, OPENID)
      case 'generateComment': return await generateComment(data, OPENID)
      case 'saveComment': return await saveComment(data, OPENID)
      case 'getWarnings': return await getWarnings(data, OPENID)
      case 'saveWarningRules': return await saveWarningRules(data, OPENID)
      case 'updateWarningStatus': return await updateWarningStatus(data, OPENID)
      case 'detectWarnings': return await detectWarnings(data, OPENID)
      case 'getRecommendations': return await getRecommendations(data, OPENID)
      case 'submitFeedback': return await submitFeedback(data, OPENID)
      case 'getClassSummary': return await getClassSummary(data, OPENID)
      case 'ensureCollection': return await ensureCollection()
      case 'addSkillCertRecord': return await addSkillCertRecord(data, OPENID)
      case 'getSkillCertRecords': return await getSkillCertRecords(data, OPENID)
      case 'getSkillCertRecordDetail': return await getSkillCertRecordDetail(data, OPENID)
      case 'approveSkillCertRecord': return await approveSkillCertRecord(data, OPENID)
      case 'deleteSkillCertRecord': return await deleteSkillCertRecord(data, OPENID)
      case 'getSkillCertScoreRules': return await getSkillCertScoreRules(data, OPENID)
      case 'saveSkillCertScoreRules': return await saveSkillCertScoreRules(data, OPENID)
      default: return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error(`action=${action} 错误:`, err)
    return { success: false, message: err.message || '操作失败' }
  }
}

async function getAllRecords(collection, query) {
  let allData = []
  let skip = 0
  while (true) {
    const res = await db.collection(collection).where(query).skip(skip).limit(MAX_LIMIT).get()
    allData = allData.concat(res.data)
    if (res.data.length < MAX_LIMIT) break
    skip += MAX_LIMIT
  }
  return allData
}

async function ensureCollectionFn() {
  const collections = ['growth_profiles', 'growth_warnings', 'growth_recommendations', 'growth_comments', 'growth_warning_rules']
  for (const name of collections) {
    try {
      await db.collection(name).limit(1).get()
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        try { await db.createCollection(name) } catch (e) { console.error(`创建${name}失败:`, e) }
      }
    }
  }
}

async function ensureCollection() {
  await ensureCollectionFn()
  return { success: true, message: '集合就绪' }
}

async function verifyClassRelation(openid) {
  let relRes = await db.collection('user_class_relation').where({ user_openid: openid }).limit(20).get()
  if (!relRes.data || relRes.data.length === 0) {
    relRes = await db.collection('user_class_relation').where({ _openid: openid }).limit(20).get()
  }
  if (!relRes.data || relRes.data.length === 0) return []

  const classList = []
  for (const rel of relRes.data) {
    const classId = rel.class_id || ''
    if (!classId) continue
    let className = rel.class_name || ''
    if (!className) {
      try {
        const classRes = await db.collection('classes').where({ _id: classId }).limit(1).get()
        if (classRes.data && classRes.data.length > 0) {
          className = classRes.data[0].class_name || classRes.data[0].name || ''
        }
      } catch (e) { console.error('查询班级名称失败:', e) }
    }
    if (!className) className = '班级ID: ' + classId
    classList.push({
      class_id: classId,
      class_name: className,
      role: rel.role || ''
    })
  }
  return classList
}

async function verifyIdentity(openid) {
  const classList = await verifyClassRelation(openid)
  if (classList.length > 0) {
    const primary = classList[0]
    const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const user = (userRes.data && userRes.data.length > 0) ? userRes.data[0] : {}
    let studentId = user.student_id || ''

    if (!studentId && (primary.role === 'student' || primary.role === 'parent')) {
      try {
        const studentRes = await db.collection('students').where({
          class_id: primary.class_id,
          _openid: openid
        }).limit(1).get()
        if (studentRes.data && studentRes.data.length > 0) {
          studentId = studentRes.data[0].student_id || studentRes.data[0]._id || ''
        }
      } catch (e) { console.error('从students查找student_id失败:', e) }

      if (!studentId) {
        try {
          const relRes = await db.collection('user_class_relation').where({
            class_id: primary.class_id,
            user_openid: openid
          }).limit(1).get()
          if (!relRes.data || relRes.data.length === 0) {
            const relRes2 = await db.collection('user_class_relation').where({
              class_id: primary.class_id,
              _openid: openid
            }).limit(1).get()
            if (relRes2.data && relRes2.data.length > 0 && relRes2.data[0].student_id) {
              studentId = relRes2.data[0].student_id
            }
          } else if (relRes.data[0].student_id) {
            studentId = relRes.data[0].student_id
          }
        } catch (e) { console.error('从user_class_relation查找student_id失败:', e) }
      }
    }

    const userName = user.realName || user.name || user.nickName || ''
    return {
      role: primary.role,
      classId: primary.class_id,
      className: primary.class_name,
      studentId,
      userName,
      canWrite: ['admin', 'head_teacher', 'subject_teacher'].includes(primary.role),
      classList
    }
  }

  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) {
    return { role: '', classId: '', className: '', studentId: '', userName: '', canWrite: false, classList: [] }
  }
  const user = userRes.data[0]
  const role = user.role || ''
  const classId = user.class_id || ''
  const studentId = user.student_id || ''
  const userName = user.realName || user.name || user.nickName || ''
  return {
    role,
    classId,
    className: '',
    studentId,
    userName,
    canWrite: ['admin', 'head_teacher', 'subject_teacher'].includes(role),
    classList: classId ? [{ class_id: classId, class_name: '', role }] : []
  }
}

async function aggregateStudentData(classId, studentId) {
  const gradeQuery = { class_id: classId }
  if (studentId) gradeQuery.student_id = studentId

  const disciplineQuery = { class_id: classId }
  if (studentId) disciplineQuery.student_id = studentId

  const volunteerQuery = { class_id: classId }
  if (studentId) volunteerQuery.student_id = studentId

  const scoreQuery = { class_id: classId }
  if (studentId) scoreQuery.student_id = studentId

  const attendanceQuery = { class_id: classId }
  if (studentId) attendanceQuery.student_id = studentId

  const certQuery = { class_id: classId }
  if (studentId) certQuery.student_id = studentId

  const activityQuery = { class_id: classId }
  if (studentId) activityQuery.student_id = studentId

  let grades = [], disciplines = [], volunteers = [], scores = [], attendance = [], certificates = [], activities = []

  try { grades = await getAllRecords('grades', gradeQuery) } catch (e) { console.error('查询grades失败:', e) }
  try { disciplines = await getAllRecords('discipline_records', disciplineQuery) } catch (e) { console.error('查询discipline_records失败:', e) }
  try { volunteers = await getAllRecords('volunteer_records', volunteerQuery) } catch (e) { console.error('查询volunteer_records失败:', e) }
  try { scores = await getAllRecords('score_records', scoreQuery) } catch (e) { console.error('查询score_records失败:', e) }
  try { attendance = await getAllRecords('attendance_records', attendanceQuery) } catch (e) { console.error('查询attendance_records失败:', e) }
  try { certificates = await getAllRecords('certificate', certQuery) } catch (e) { console.error('查询certificate失败:', e) }
  try { activities = await getAllRecords('campus_activities', activityQuery) } catch (e) { console.error('查询campus_activities失败:', e) }

  const volunteerHours = volunteers.reduce((sum, v) => sum + (v.hours || 0), 0)

  return {
    grades: grades.map(g => ({
      subject: g.subject || g.course_name || '',
      score: g.score || g.total_score || 0,
      term: g.semester_name || g.term || '',
      exam_type: g.exam_type || ''
    })),
    scores: scores.map(s => ({
      score: s.score || s.score_value || 0,
      category: s.category || s.score_type || '',
      created_at: s.created_at || s.date || s._createTime || 0
    })),
    disciplines: disciplines.filter(d => d.status !== 'revoked').map(d => ({
      level: d.level || d.discipline_level || '',
      type: d.type || d.discipline_type || '',
      reason: d.reason || '',
      status: d.status || '',
      date: d.created_at || d.date || ''
    })),
    volunteer_hours: volunteerHours,
    volunteer_count: volunteers.length,
    certificates: certificates.map(c => ({
      name: c.name || c.certificate_name || '',
      level: c.level || '',
      date: c.date || c.created_at || ''
    })),
    score_summary: {
      total: scores.reduce((sum, s) => sum + (s.score || s.score_value || 0), 0),
      count: scores.length,
      categories: [...new Set(scores.map(s => s.category || s.score_type || '其他'))]
    },
    attendance_summary: {
      total: attendance.length,
      absent: attendance.filter(a => a.status === 'absent' || a.status === '缺勤').length,
      late: attendance.filter(a => a.status === 'late' || a.status === '迟到').length,
      leave: attendance.filter(a => a.status === 'leave' || a.status === '请假').length
    },
    activity_participation: activities.length,
    activities: activities.map(a => ({
      name: a.name || a.activity_name || '',
      type: a.type || a.activity_type || '',
      date: a.date || a.start_time || ''
    }))
  }
}

async function callAI(prompt, systemPrompt) {
  const ai = getAI()
  if (!ai) {
    throw new Error('云开发AI服务未开通或wx-server-sdk版本不支持')
  }
  try {
    const model = ai.createModel('deepseek')
    const result = await model.generateText({
      model: 'deepseek-r1-0528',
      messages: [
        { role: 'system', content: systemPrompt || '你是一名专业的教育数据分析师，请基于数据生成客观、准确、有建设性的分析。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
    if (result && result.choices && result.choices.length > 0 && result.choices[0].message) {
      return result.choices[0].message.content
    }
    throw new Error('AI返回格式异常')
  } catch (err) {
    throw new Error(`AI调用失败: ${err.message}`)
  }
}

async function callAIWithFallback(prompt, systemPrompt) {
  try {
    return await callAI(prompt, systemPrompt)
  } catch (err) {
    console.error('AI调用失败，使用fallback:', err.message)
    return null
  }
}

async function msgSecCheck(content) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      version: 2,
      scene: 1,
      content: content.substring(0, 500)
    })
    return result.errcode === 0
  } catch (err) {
    console.error('内容安全检查失败:', err)
    return true
  }
}

async function getProfile(data, openid) {
  const { student_id, force_refresh, fetch_class_only, class_id } = data || {}

  if (fetch_class_only) {
    const classList = await verifyClassRelation(openid)
    return { success: true, data: { class_list: classList } }
  }

  const identity = await verifyIdentity(openid)
  if (!identity.role) return { success: false, message: '用户信息不存在' }

  if (class_id) {
    identity.classId = class_id
    const matchCls = (identity.classList || []).find(c => c.class_id === class_id)
    if (matchCls) {
      identity.className = matchCls.class_name
      identity.role = matchCls.role || identity.role
      identity.canWrite = ['admin', 'head_teacher', 'subject_teacher'].includes(identity.role)
    }
  }

  if (!identity.classId) return { success: false, message: '未加入班级' }

  await ensureCollectionFn()

  let targetStudentId = student_id
  if (identity.role === 'student' || identity.role === 'parent') {
    targetStudentId = targetStudentId || identity.studentId
    if (!targetStudentId) return { success: false, message: '未关联学生，请先完善个人信息' }
  }

  if (!targetStudentId) {
    const students = await getAllRecords('students', { class_id: identity.classId })
    return {
      success: true,
      data: {
        role: identity.role,
        canWrite: identity.canWrite,
        class_id: identity.classId,
        class_name: identity.className,
        is_class_overview: true,
        student_count: students.length,
        students: students.slice(0, 50).map(s => ({
          student_id: s.student_id || s._id,
          student_name: s.student_name || s.name || ''
        }))
      }
    }
  }

  if (!force_refresh) {
    const existing = await db.collection('growth_profiles')
      .where({ student_id: targetStudentId, class_id: identity.classId })
      .limit(1).get()
    if (existing.data && existing.data.length > 0) {
      const profile = existing.data[0]
      const lastUpdated = profile.last_updated || 0
      const oneHourAgo = Date.now() - 3600000
      if (lastUpdated > oneHourAgo) {
        return {
          success: true,
          data: {
            student_id: targetStudentId,
            data: profile.data,
            ai_summary: profile.ai_summary || '',
            ai_analysis: profile.ai_analysis || '',
            last_updated: profile.last_updated,
            role: identity.role,
            canWrite: identity.canWrite
          }
        }
      }
    }
  }

  const aggregatedData = await aggregateStudentData(identity.classId, targetStudentId)

  const dataStr = JSON.stringify(aggregatedData, null, 2)
  const cleanPrompt = `以下是一名学生的原始成长数据，请进行数据标准化清洗并生成结构化摘要。
要求：
1. 识别并标注异常数据（如成绩为0或超过100、缺失字段等）
2. 按学业表现、德育表现、实践能力三个维度归类
3. 计算各维度关键指标（如平均分、排名估计）

学生数据：
${dataStr}

请以JSON格式返回清洗结果，包含dimensions（各维度指标）、anomalies（异常数据列表）、summary（一句话概述）。`

  const summaryPrompt = `基于以下学生成长数据，生成一段200字以内的成长摘要，包含：
1. 学业表现评价（成绩趋势、优势/弱势科目）
2. 德育表现评价（积分情况、处分记录）
3. 实践能力评价（志愿服务、活动参与、证书）
4. 改进建议（针对弱项给出具体建议）

数据：
${dataStr}

请用客观、积极的语气，给出有针对性的分析和建议。`

  const [cleanResult, summaryResult] = await Promise.all([
    callAIWithFallback(cleanPrompt, '你是一名专业的教育数据分析师，擅长数据清洗和标准化。请严格按要求返回JSON格式。'),
    callAIWithFallback(summaryPrompt, '你是一名专业的教育数据分析师，请基于数据生成客观、准确、有建设性的分析。语气应积极鼓励，同时指出需改进之处。')
  ])

  let cleanData = null
  if (cleanResult) {
    try {
      const jsonMatch = cleanResult.match(/\{[\s\S]*\}/)
      if (jsonMatch) cleanData = JSON.parse(jsonMatch[0])
    } catch (e) { console.error('清洗结果解析失败:', e) }
  }

  let aiSummary = summaryResult || '暂无AI分析摘要'
  const isSafe = await msgSecCheck(aiSummary)
  if (!isSafe) aiSummary = 'AI生成内容未通过安全审核，请稍后重试'

  const now = Date.now()
  const existingProfile = await db.collection('growth_profiles')
    .where({ student_id: targetStudentId, class_id: identity.classId })
    .limit(1).get()

  if (existingProfile.data && existingProfile.data.length > 0) {
    await db.collection('growth_profiles').doc(existingProfile.data[0]._id).update({
      data: {
        data: aggregatedData,
        ai_summary: aiSummary,
        ai_analysis: cleanData,
        last_updated: now
      }
    })
  } else {
    await db.collection('growth_profiles').add({
      data: {
        student_id: targetStudentId,
        class_id: identity.classId,
        data: aggregatedData,
        ai_summary: aiSummary,
        ai_analysis: cleanData,
        last_updated: now,
        created_at: now
      }
    })
  }

  return {
    success: true,
    data: {
      student_id: targetStudentId,
      data: aggregatedData,
      ai_summary: aiSummary,
      ai_analysis: cleanData,
      last_updated: now,
      role: identity.role,
      canWrite: identity.canWrite
    }
  }
}

async function generateReport(data, openid) {
  const { student_id, report_type, force_refresh } = data || {}
  const identity = await verifyIdentity(openid)
  if (!identity.canWrite && identity.role !== 'student' && identity.role !== 'parent') {
    return { success: false, message: '无操作权限' }
  }
  if (!identity.classId) return { success: false, message: '未加入班级' }

  await ensureCollectionFn()

  let targetStudentId = student_id
  if (identity.role === 'student' || identity.role === 'parent') {
    targetStudentId = identity.studentId
  }
  if (!targetStudentId) {
    console.error('generateReport: student_id缺失', { student_id, role: identity.role, openid })
    return { success: false, message: '缺少学生ID' }
  }

  if (!force_refresh) {
    try {
      const cached = await db.collection('growth_profiles')
        .where({ student_id: targetStudentId, class_id: identity.classId, type: 'report' })
        .limit(1).get()
      if (cached.data && cached.data.length > 0) {
        const report = cached.data[0]
        const oneHourAgo = Date.now() - 3600000
        if ((report.generated_at || 0) > oneHourAgo) {
          return { success: true, data: { student_id: targetStudentId, student_name: report.student_name || '', report_content: report.content, generated_at: report.generated_at, from_cache: true } }
        }
      }
    } catch (e) { }
  }

  const aggregatedData = await aggregateStudentData(identity.classId, targetStudentId)

  const studentRes = await db.collection('students').where({ student_id: targetStudentId, class_id: identity.classId }).limit(1).get()
  const studentName = (studentRes.data && studentRes.data.length > 0) ? (studentRes.data[0].student_name || studentRes.data[0].name || '') : ''

  if (isDataInsufficient(aggregatedData)) {
    const fallbackReport = buildFallbackReport(aggregatedData, studentName)
    return { success: true, data: { student_id: targetStudentId, student_name: studentName, report_content: fallbackReport, generated_at: Date.now(), from_fallback: true } }
  }

  const trendData = buildTrendData(aggregatedData.grades)
  const dataStr = JSON.stringify(aggregatedData, null, 2)
  const reportPrompt = `请为"${studentName}"生成一份详细的成长分析报告。

报告结构要求：
一、学业表现
- 各科成绩趋势分析（进步/退步）
- 优势科目与薄弱科目
- 成绩排名估计

二、德育表现
- 积分情况与处分记录
- 出勤率与纪律表现

三、实践能力
- 志愿服务时长与次数
- 活动参与情况
- 获得证书

四、改进建议
- 针对薄弱环节的具体建议
- 推荐可参与的活动或资源

趋势数据：${trendData.trend_text}

数据：
${dataStr}

请生成约500字的详细报告，语气客观积极，建议具体可行。
在报告末尾可用以下占位符插入图表：[CHART:bar:grade_compare]（各科成绩对比图）、[CHART:radar:dimension]（多维能力雷达图）`

  const reportContent = await callAIWithFallback(reportPrompt, '你是一名专业的教育数据分析师，擅长生成结构化的学生成长报告。语气应客观、专业、有建设性。')

  let safeReport = reportContent || buildFallbackReport(aggregatedData, studentName)
  const isSafe = await msgSecCheck(safeReport)
  if (!isSafe) safeReport = '报告内容未通过安全审核，请稍后重试'

  const now = Date.now()
  try {
    await db.collection('growth_profiles').add({
      data: {
        student_id: targetStudentId, class_id: identity.classId,
        type: 'report', content: safeReport, student_name: studentName,
        generated_at: now, operator_openid: openid
      }
    })
  } catch (e) { console.error('缓存报告失败:', e) }

  return {
    success: true,
    data: {
      student_id: targetStudentId,
      student_name: studentName,
      report_type: report_type || 'full',
      report_content: safeReport,
      generated_at: now
    }
  }
}

async function generateComment(data, openid) {
  const { student_id, style, comment_type } = data || {}
  const identity = await verifyIdentity(openid)
  if (!identity.canWrite) return { success: false, message: '无操作权限，仅教师可生成评语' }
  if (!identity.classId) return { success: false, message: '未加入班级' }
  if (!student_id) return { success: false, message: '缺少学生ID' }

  await ensureCollectionFn()

  const aggregatedData = await aggregateStudentData(identity.classId, student_id)
  const studentRes = await db.collection('students').where({ student_id, class_id: identity.classId }).limit(1).get()
  const studentName = (studentRes.data && studentRes.data.length > 0) ? (studentRes.data[0].student_name || studentRes.data[0].name || '') : ''

  const styleMap = {
    encouraging: '鼓励型，多肯定优点，建议用温和语气',
    objective: '客观型，实事求是，优缺点并重',
    strict: '严谨型，高标准要求，指出不足并提出严格改进要求'
  }
  const styleDesc = styleMap[style] || styleMap.objective
  const isActivity = comment_type === 'activity'

  const dataStr = JSON.stringify(aggregatedData, null, 2)
  let commentPrompt
  if (isActivity) {
    const activityName = data.activity_name || '活动'
    commentPrompt = `请为"${studentName}"在"${activityName}"中的表现生成活动评语，约80字。

表现数据：
${dataStr}

风格要求：${styleDesc}`
  } else {
    commentPrompt = `请为"${studentName}"生成期末评语。

风格要求：${styleDesc}

评语结构：优点→不足→建议（各约50字）

数据：
${dataStr}

请生成约150字的评语。`
  }

  const commentContent = await callAIWithFallback(commentPrompt, `你是一名经验丰富的班主任，擅长撰写学生评语。风格：${styleDesc}`)

  let safeComment = commentContent || buildFallbackComment(aggregatedData, studentName, style, isActivity ? 'activity' : 'term')
  const isSafe = await msgSecCheck(safeComment)
  if (!isSafe) safeComment = '评语内容未通过安全审核，请稍后重试'

  const now = Date.now()
  let commentId = ''
  try {
    const addRes = await db.collection('growth_comments').add({
      data: {
        student_id, class_id: identity.classId,
        style: style || 'objective', comment_type: isActivity ? 'activity' : 'term',
        content: safeComment, ai_content: safeComment,
        is_modified: false, generated_at: now,
        operator_openid: openid, student_name: studentName
      }
    })
    commentId = addRes._id
  } catch (e) { console.error('存储评语失败:', e) }

  return {
    success: true,
    data: {
      comment_id: commentId,
      student_id,
      student_name: studentName,
      style: style || 'objective',
      comment: safeComment,
      generated_at: now
    }
  }
}

async function getWarnings(data, openid) {
  const { class_id } = data || {}
  const identity = await verifyIdentity(openid)
  if (!identity.role) return { success: false, message: '用户信息不存在' }

  const targetClassId = class_id || identity.classId
  if (!targetClassId) return { success: false, message: '缺少班级ID' }

  await ensureCollectionFn()

  let warningRules = []
  try {
    warningRules = await getAllRecords('growth_warning_rules', { class_id: targetClassId })
  } catch (e) { console.error('查询预警规则失败:', e) }

  const students = await getAllRecords('students', { class_id: targetClassId })
  const warnings = []

  for (const student of students) {
    const sid = student.student_id || student._id
    const sname = student.student_name || student.name || ''

    try {
      const grades = await getAllRecords('grades', { class_id: targetClassId, student_id: sid })
      const subjects = {}
      for (const g of grades) {
        const subj = g.subject || g.course_name || ''
        if (!subj) continue
        if (!subjects[subj]) subjects[subj] = []
        subjects[subj].push({ score: g.score || g.total_score || 0, term: g.semester_name || g.term || '' })
      }

      for (const [subj, records] of Object.entries(subjects)) {
        if (records.length < 2) continue
        const sorted = records.sort((a, b) => (a.term > b.term ? 1 : -1))
        const latest = sorted[sorted.length - 1].score
        if (latest < 60) {
          warnings.push({
            student_id: sid, student_name: sname,
            type: 'score_low', level: 'high',
            message: `${subj}成绩${latest}分，低于60分及格线`,
            subject: subj, value: latest
          })
        }
        if (sorted.length >= 3) {
          const last3 = sorted.slice(-3).map(r => r.score)
          if (last3[0] > last3[1] && last3[1] > last3[2]) {
            const decline = last3[0] - last3[2]
            warnings.push({
              student_id: sid, student_name: sname,
              type: 'score_decline', level: 'medium',
              message: `${subj}成绩连续3次下滑，累计下降${decline}分`,
              subject: subj, decline: decline
            })
          }
        }
      }
    } catch (e) { console.error(`查询${sid}成绩预警失败:`, e) }

    try {
      const disciplines = await getAllRecords('discipline_records', {
        class_id: targetClassId, student_id: sid, status: _.neq('revoked')
      })
      if (disciplines.length >= 2) {
        warnings.push({
          student_id: sid, student_name: sname,
          type: 'discipline_repeat', level: 'high',
          message: `累计${disciplines.length}次处分记录`,
          count: disciplines.length
        })
      }
    } catch (e) { console.error(`查询${sid}处分预警失败:`, e) }
  }

  if (warnings.length > 0) {
    const now = Date.now()
    try {
      await db.collection('growth_warnings').add({
        data: {
          class_id: targetClassId,
          warnings: warnings,
          generated_at: now,
          operator_openid: openid
        }
      })
    } catch (e) { console.error('保存预警失败:', e) }
  }

  return { success: true, data: { warnings, total: warnings.length, warning_rules: warningRules } }
}

async function getRecommendations(data, openid) {
  const { student_id, force_refresh } = data || {}
  const identity = await verifyIdentity(openid)
  if (!identity.role) return { success: false, message: '用户信息不存在' }
  if (!identity.classId) return { success: false, message: '未加入班级' }

  let targetStudentId = student_id || identity.studentId
  if (!targetStudentId) return { success: false, message: '缺少学生ID' }

  await ensureCollectionFn()

  if (!force_refresh) {
    try {
      const cached = await db.collection('growth_recommendations')
        .where({ student_id: targetStudentId, class_id: identity.classId })
        .orderBy('generated_at', 'desc').limit(1).get()
      if (cached.data && cached.data.length > 0) {
        const rec = cached.data[0]
        const twoHoursAgo = Date.now() - 7200000
        if ((rec.generated_at || 0) > twoHoursAgo && (rec.expires_at || 0) > Date.now()) {
          return { success: true, data: { student_id: targetStudentId, student_name: rec.student_name || '', recommendations: rec.recommendations, from_cache: true } }
        }
      }
    } catch (e) { }
  }

  const aggregatedData = await aggregateStudentData(identity.classId, targetStudentId)
  const studentRes = await db.collection('students').where({ student_id: targetStudentId, class_id: identity.classId }).limit(1).get()
  const studentName = (studentRes.data && studentRes.data.length > 0) ? (studentRes.data[0].student_name || '') : ''

  const portrait = await buildStudentPortrait(identity.classId, targetStudentId, aggregatedData)

  let activities = []
  try {
    activities = await getAllRecords('campus_activities', { class_id: identity.classId })
  } catch (e) { console.error('查询活动失败:', e) }

  let cfResult = { similar_count: 0, activities: [], cf_score: 0 }
  try {
    cfResult = await collaborativeFilter(identity.classId, targetStudentId, portrait)
  } catch (e) { console.error('协同过滤失败:', e) }

  const dataStr = JSON.stringify(aggregatedData, null, 2)
  const activitiesStr = JSON.stringify(activities.map(a => ({ name: a.name || a.activity_name || '', type: a.type || '', description: a.description || '' })), null, 2)
  const portraitStr = JSON.stringify(portrait, null, 2)
  const cfStr = JSON.stringify(cfResult, null, 2)

  const recPrompt = `基于以下学生数据，推荐适合该学生的活动和资源。

学生画像：${portraitStr}

学生数据：
${dataStr}

可选活动：
${activitiesStr}

协同过滤推荐：${cfStr}

要求：
1. 根据学生弱项推荐可提升能力的活动
2. 根据学生兴趣和特长推荐匹配的志愿活动
3. 每个推荐说明推荐理由和匹配度（0-100）
4. 不推荐已过期的活动
5. 返回JSON格式：{ "activity_recs": [{ "name": "", "reason": "", "match_score": 0 }], "resource_recs": [{ "name": "", "reason": "", "type": "" }], "volunteer_recs": [{ "name": "", "reason": "", "match_score": 0 }] }`

  const recResult = await callAIWithFallback(recPrompt, '你是一名教育规划顾问，擅长根据学生数据推荐个性化活动和学习资源。请返回JSON格式。')

  let recommendations
  if (recResult) {
    try {
      const jsonMatch = recResult.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        recommendations = JSON.parse(jsonMatch[0])
      }
    } catch (e) { console.error('推荐结果解析失败:', e) }
  }

  if (!recommendations || (!recommendations.activity_recs && !recommendations.resource_recs)) {
    recommendations = buildFallbackRecommendations(portrait, activities)
  }

  if (!recommendations.volunteer_recs) recommendations.volunteer_recs = []

  for (const key of ['activity_recs', 'resource_recs', 'volunteer_recs']) {
    const arr = recommendations[key] || []
    for (const item of arr) {
      if (item.reason) {
        const isSafe = await msgSecCheck(item.reason)
        if (!isSafe) item.reason = '推荐理由未通过安全审核'
      }
    }
  }

  const now = Date.now()
  try {
    await db.collection('growth_recommendations').add({
      data: {
        student_id: targetStudentId, class_id: identity.classId,
        student_name: studentName, recommendations,
        generated_at: now, expires_at: now + 7200000
      }
    })
  } catch (e) { console.error('缓存推荐失败:', e) }

  return {
    success: true,
    data: {
      student_id: targetStudentId,
      student_name: studentName,
      recommendations
    }
  }
}

async function getClassSummary(data, openid) {
  const { class_id } = data || {}
  const identity = await verifyIdentity(openid)
  if (!identity.canWrite) return { success: false, message: '无操作权限，仅教师可查看班级汇总' }

  const targetClassId = class_id || identity.classId
  if (!targetClassId) return { success: false, message: '缺少班级ID' }

  await ensureCollectionFn()

  const students = await getAllRecords('students', { class_id: targetClassId })
  const summaryList = []

  for (const student of students.slice(0, 50)) {
    const sid = student.student_id || student._id
    const sname = student.student_name || student.name || ''
    try {
      const profileRes = await db.collection('growth_profiles')
        .where({ student_id: sid, class_id: targetClassId })
        .limit(1).get()
      if (profileRes.data && profileRes.data.length > 0) {
        summaryList.push({
          student_id: sid,
          student_name: sname,
          data: profileRes.data[0].data,
          ai_summary: profileRes.data[0].ai_summary || '',
          last_updated: profileRes.data[0].last_updated
        })
      }
    } catch (e) { console.error(`查询${sid}档案失败:`, e) }
  }

  return { success: true, data: { students: summaryList, total: students.length } }
}

const DEFAULT_WARNING_RULES = [
  { rule_id: 'WR-default-score', indicator: 'score', operator: 'lt', threshold: 60, notify_roles: ['teacher', 'parent'], enabled: true, is_default: true, description: '成绩低于60分' },
  { rule_id: 'WR-default-discipline', indicator: 'discipline_count', operator: 'gte', threshold: 2, notify_roles: ['teacher'], enabled: true, is_default: true, description: '处分次数≥2次' },
  { rule_id: 'WR-default-moral', indicator: 'moral_score', operator: 'lt', threshold: 80, notify_roles: ['teacher'], enabled: true, is_default: true, description: '德育积分低于80分' }
]

function isDataInsufficient(aggregatedData) {
  if (!aggregatedData) return true
  const hasGrades = aggregatedData.grades && aggregatedData.grades.length > 0
  const hasScores = aggregatedData.score_summary && aggregatedData.score_summary.total > 0
  const hasDisciplines = aggregatedData.disciplines && aggregatedData.disciplines.length > 0
  const hasVolunteer = aggregatedData.volunteer_count > 0
  const hasActivities = aggregatedData.activity_participation > 0
  return !hasGrades && !hasScores && !hasDisciplines && !hasVolunteer && !hasActivities
}

function buildTrendData(grades) {
  const termMap = {}
  for (const g of grades) {
    const term = g.term || g.semester_name || ''
    if (!term) continue
    if (!termMap[term]) termMap[term] = {}
    const subj = g.subject || g.course_name || ''
    if (subj) termMap[term][subj] = g.score || g.total_score || 0
  }
  const terms = Object.keys(termMap).sort()
  if (terms.length < 2) return { trend_text: '仅有一个学期数据，无法进行趋势对比', terms, termMap }

  const prev = termMap[terms[terms.length - 2]]
  const curr = termMap[terms[terms.length - 1]]
  const trends = []
  for (const subj of Object.keys(curr)) {
    if (prev[subj] !== undefined) {
      const diff = curr[subj] - prev[subj]
      const desc = diff > 0 ? `进步${diff}分` : diff < 0 ? `下降${Math.abs(diff)}分` : '持平'
      trends.push(`${subj}: ${prev[subj]}→${curr[subj]}(${desc})`)
    }
  }
  return { trend_text: trends.join('；') || '无明显趋势变化', terms, termMap }
}

function buildFallbackReport(aggregatedData, studentName) {
  const parts = []
  parts.push('【学业表现】')
  if (aggregatedData.grades && aggregatedData.grades.length > 0) {
    const avg = (aggregatedData.grades.reduce((s, g) => s + g.score, 0) / aggregatedData.grades.length).toFixed(1)
    parts.push(`${studentName || '该生'}平均成绩${avg}分。`)
  } else {
    parts.push('暂无成绩数据。')
  }

  parts.push('\n【德育表现】')
  if (aggregatedData.score_summary && aggregatedData.score_summary.total > 0) {
    parts.push(`总积分${aggregatedData.score_summary.total}分，共${aggregatedData.score_summary.count}条记录。`)
  } else {
    parts.push('暂无积分数据。')
  }
  if (aggregatedData.disciplines && aggregatedData.disciplines.length > 0) {
    parts.push(`有${aggregatedData.disciplines.length}条处分记录。`)
  }

  parts.push('\n【实践能力】')
  if (aggregatedData.volunteer_count > 0) {
    parts.push(`志愿服务${aggregatedData.volunteer_hours}小时，参与${aggregatedData.volunteer_count}次。`)
  }
  if (aggregatedData.activity_participation > 0) {
    parts.push(`参与活动${aggregatedData.activity_participation}次。`)
  }

  parts.push('\n【改进建议】')
  parts.push('AI分析暂时不可用，请稍后重试获取个性化建议。')

  return parts.join('')
}

async function saveComment(data, openid) {
  const { comment_id, content } = data || {}
  if (!comment_id) return { success: false, message: '缺少评语ID' }
  if (!content) return { success: false, message: '缺少评语内容' }

  const identity = await verifyIdentity(openid)
  if (!identity.canWrite) return { success: false, message: '无操作权限，仅教师可修改评语' }

  const isSafe = await msgSecCheck(content)
  if (!isSafe) return { success: false, message: '修改后内容未通过安全审核' }

  try {
    await db.collection('growth_comments').doc(comment_id).update({
      data: {
        content,
        is_modified: true,
        modified_by: openid,
        modified_at: Date.now()
      }
    })
    return { success: true, data: { comment_id } }
  } catch (err) {
    return { success: false, message: '保存评语失败: ' + err.message }
  }
}

function buildFallbackComment(aggregatedData, studentName, style, commentType) {
  const styleNote = style === 'encouraging' ? '（鼓励型）' : style === 'strict' ? '（严谨型）' : '（客观型）'
  if (commentType === 'activity') {
    return `${studentName || '该生'}积极参与活动，表现良好。AI评语暂时不可用${styleNote}。`
  }

  const parts = []
  parts.push(`【优点】${studentName || '该生'}在各方面均有参与。`)
  if (aggregatedData.score_summary && aggregatedData.score_summary.total > 0) {
    parts.push(`【不足】部分维度数据较少，建议加强记录。`)
  } else {
    parts.push(`【不足】数据记录不足，难以全面评估。`)
  }
  parts.push(`【建议】建议多参与各类活动，全面发展。AI评语暂时不可用${styleNote}。`)
  return parts.join('')
}

async function saveWarningRules(data, openid) {
  const { rules } = data || {}
  const identity = await verifyIdentity(openid)
  if (!['admin', 'head_teacher'].includes(identity.role)) {
    return { success: false, message: '仅管理员和班主任可配置预警规则' }
  }
  if (!identity.classId) return { success: false, message: '未加入班级' }

  await ensureCollectionFn()

  const validIndicators = ['score', 'discipline_count', 'attendance_rate', 'moral_score']
  const validOperators = ['lt', 'lte', 'gt', 'gte', 'eq']

  const savedRules = []
  for (const rule of (rules || [])) {
    if (!validIndicators.includes(rule.indicator)) continue
    if (!validOperators.includes(rule.operator)) continue
    if (typeof rule.threshold !== 'number') continue

    const ruleData = {
      indicator: rule.indicator,
      operator: rule.operator,
      threshold: rule.threshold,
      notify_roles: rule.notify_roles || ['teacher'],
      enabled: rule.enabled !== false,
      description: rule.description || '',
      class_id: identity.classId
    }

    if (rule.rule_id) {
      try {
        const existing = await db.collection('growth_warning_rules').doc(rule.rule_id).get()
        if (existing.data) {
          await db.collection('growth_warning_rules').doc(rule.rule_id).update({ data: ruleData })
          savedRules.push({ ...ruleData, rule_id: rule.rule_id })
          continue
        }
      } catch (e) { }
    }

    const newRuleId = 'WR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)
    ruleData.rule_id = newRuleId
    ruleData.created_by = openid
    ruleData.created_at = Date.now()
    try {
      await db.collection('growth_warning_rules').add({ data: ruleData })
      savedRules.push(ruleData)
    } catch (e) { console.error('保存预警规则失败:', e) }
  }

  return { success: true, data: { rules: savedRules } }
}

async function updateWarningStatus(data, openid) {
  const { warning_id, status } = data || {}
  if (!warning_id) return { success: false, message: '缺少预警ID' }
  if (!['confirmed', 'resolved'].includes(status)) return { success: false, message: '无效状态' }

  const identity = await verifyIdentity(openid)
  if (!['admin', 'head_teacher'].includes(identity.role)) {
    return { success: false, message: '仅管理员和班主任可操作预警状态' }
  }

  const updateData = { status }
  if (status === 'resolved') {
    updateData.resolved_by = openid
    updateData.resolved_at = Date.now()
  }

  try {
    await db.collection('growth_warnings').doc(warning_id).update({ data: updateData })
    return { success: true, data: { warning_id, status } }
  } catch (err) {
    return { success: false, message: '更新预警状态失败: ' + err.message }
  }
}

async function getIndicatorValue(classId, studentId, indicator) {
  switch (indicator) {
    case 'score': {
      const grades = await getAllRecords('grades', { class_id: classId, student_id: studentId })
      if (grades.length === 0) return null
      return grades.reduce((s, g) => s + (g.score || g.total_score || 0), 0) / grades.length
    }
    case 'discipline_count': {
      const disciplines = await getAllRecords('discipline_records', { class_id: classId, student_id: studentId, status: _.neq('revoked') })
      return disciplines.length
    }
    case 'attendance_rate': {
      const attendance = await getAllRecords('attendance_records', { class_id: classId, student_id: studentId })
      if (attendance.length === 0) return null
      const absent = attendance.filter(a => a.status === 'absent' || a.status === '缺勤').length
      return ((attendance.length - absent) / attendance.length) * 100
    }
    case 'moral_score': {
      const scores = await getAllRecords('score_records', { class_id: classId, student_id: studentId })
      return scores.reduce((s, r) => s + (r.score || r.score_value || 0), 0)
    }
    default: return null
  }
}

function evaluateCondition(value, operator, threshold) {
  if (value === null || value === undefined) return false
  switch (operator) {
    case 'lt': return value < threshold
    case 'lte': return value <= threshold
    case 'gt': return value > threshold
    case 'gte': return value >= threshold
    case 'eq': return value === threshold
    default: return false
  }
}

function buildWarningDescription(rule, value, studentName) {
  const opMap = { lt: '低于', lte: '不高于', gt: '高于', gte: '不低于', eq: '等于' }
  const indMap = { score: '平均成绩', discipline_count: '处分次数', attendance_rate: '出勤率', moral_score: '德育积分' }
  const indName = indMap[rule.indicator] || rule.indicator
  const opName = opMap[rule.operator] || rule.operator
  const unit = rule.indicator === 'attendance_rate' ? '%' : ''
  return `${studentName}的${indName}${opName}${rule.threshold}${unit}（当前${Math.round(value)}${unit}）`
}

async function detectTrendWarnings(classId, students, openid) {
  const warnings = []
  for (const student of students.slice(0, 30)) {
    const sid = student.student_id || student._id
    const sname = student.student_name || student.name || ''
    try {
      const grades = await getAllRecords('grades', { class_id: classId, student_id: sid })
      const subjects = {}
      for (const g of grades) {
        const subj = g.subject || g.course_name || ''
        if (!subj) continue
        if (!subjects[subj]) subjects[subj] = []
        subjects[subj].push({ score: g.score || g.total_score || 0, term: g.semester_name || g.term || '' })
      }
      for (const [subj, records] of Object.entries(subjects)) {
        if (records.length < 3) continue
        const sorted = records.sort((a, b) => (a.term > b.term ? 1 : -1))
        const last3 = sorted.slice(-3).map(r => r.score)
        if (last3[0] > last3[1] && last3[1] > last3[2]) {
          const decline = last3[0] - last3[2]
          warnings.push({
            student_id: sid, student_name: sname,
            type: 'trend_decline', level: 'medium',
            message: `${subj}成绩连续3次下滑，累计下降${decline}分，可能面临不及格风险`,
            subject: subj, decline, class_id: classId
          })
        }
      }
    } catch (e) { console.error(`趋势预警${sid}失败:`, e) }
  }
  return warnings
}

async function pushWarningNotification(warning) {
  try {
    const msg = {
      touser: warning.notify_openid || '',
      msgtype: 'text',
      text: { content: `【预警通知】${warning.message}` }
    }
    if (!msg.touser) return { push_status: 'skipped' }
    return { push_status: 'sent' }
  } catch (e) {
    console.error('推送通知失败:', e)
    return { push_status: 'failed' }
  }
}

async function detectWarnings(data, openid) {
  const { class_id } = data || {}
  const identity = await verifyIdentity(openid)
  if (!identity.canWrite) return { success: false, message: '无操作权限' }
  const targetClassId = class_id || identity.classId
  if (!targetClassId) return { success: false, message: '缺少班级ID' }

  await ensureCollectionFn()

  let rules = []
  try {
    rules = await getAllRecords('growth_warning_rules', { class_id: targetClassId, enabled: true })
  } catch (e) { console.error('查询预警规则失败:', e) }
  if (rules.length === 0) rules = DEFAULT_WARNING_RULES.filter(r => r.enabled)

  const students = await getAllRecords('students', { class_id: targetClassId })
  const allWarnings = []

  for (const student of students.slice(0, 30)) {
    const sid = student.student_id || student._id
    const sname = student.student_name || student.name || ''

    for (const rule of rules) {
      try {
        const value = await getIndicatorValue(targetClassId, sid, rule.indicator)
        if (value === null) continue
        if (evaluateCondition(value, rule.operator, rule.threshold)) {
          const existingWarn = await db.collection('growth_warnings').where({
            rule_id: rule.rule_id, student_id: sid, status: 'pending'
          }).limit(1).get()
          if (existingWarn.data && existingWarn.data.length > 0) continue

          const message = buildWarningDescription(rule, value, sname)
          allWarnings.push({
            rule_id: rule.rule_id, student_id: sid, student_name: sname,
            indicator: rule.indicator, operator: rule.operator,
            threshold: rule.threshold, current_value: value,
            type: 'threshold', level: value < 40 ? 'high' : 'medium',
            message, class_id: targetClassId, status: 'pending',
            generated_at: Date.now(), notify_roles: rule.notify_roles || []
          })
        }
      } catch (e) { console.error(`预警检测${sid}规则${rule.rule_id}失败:`, e) }
    }
  }

  try {
    const trendWarnings = await detectTrendWarnings(targetClassId, students, openid)
    allWarnings.push(...trendWarnings)
  } catch (e) { console.error('趋势预警失败:', e) }

  const savedWarnings = []
  for (const w of allWarnings) {
    try {
      const res = await db.collection('growth_warnings').add({ data: w })
      savedWarnings.push({ ...w, _id: res._id })
      w._id = res._id
      pushWarningNotification(w)
    } catch (e) { console.error('保存预警失败:', e) }
  }

  return { success: true, data: { warnings: savedWarnings, total: savedWarnings.length } }
}

async function buildStudentPortrait(classId, studentId, aggregatedData) {
  const interests = new Set()
  const talents = new Set()
  const weakSubjects = []

  if (aggregatedData.activities) {
    for (const a of aggregatedData.activities) {
      if (a.type) interests.add(a.type)
    }
  }
  if (aggregatedData.certificates) {
    for (const c of aggregatedData.certificates) {
      if (c.name) talents.add(c.name)
      if (c.level && c.level !== '参与') talents.add(c.level)
    }
  }

  if (aggregatedData.grades && aggregatedData.grades.length > 0) {
    const subjectScores = {}
    for (const g of aggregatedData.grades) {
      if (!g.subject) continue
      if (!subjectScores[g.subject]) subjectScores[g.subject] = []
      subjectScores[g.subject].push(g.score)
    }

    try {
      const allGrades = await getAllRecords('grades', { class_id: classId })
      const classAvg = {}
      const classSubjectScores = {}
      for (const g of allGrades) {
        const subj = g.subject || g.course_name || ''
        if (!subj) continue
        if (!classSubjectScores[subj]) classSubjectScores[subj] = []
        classSubjectScores[subj].push(g.score || g.total_score || 0)
      }
      for (const [subj, scores] of Object.entries(classSubjectScores)) {
        classAvg[subj] = scores.reduce((s, v) => s + v, 0) / scores.length
      }

      for (const [subj, scores] of Object.entries(subjectScores)) {
        const avg = scores.reduce((s, v) => s + v, 0) / scores.length
        if (classAvg[subj] && avg < classAvg[subj] - 5) {
          weakSubjects.push(subj)
        }
      }
    } catch (e) { console.error('计算弱项失败:', e) }
  }

  return {
    interests: [...interests],
    weakSubjects,
    talents: [...talents]
  }
}

async function collaborativeFilter(classId, studentId, portrait) {
  const students = await getAllRecords('students', { class_id: classId })
  const otherStudents = students.filter(s => (s.student_id || s._id) !== studentId).slice(0, 20)

  const similarStudents = []
  for (const other of otherStudents) {
    const otherSid = other.student_id || other._id
    try {
      const otherData = await aggregateStudentData(classId, otherSid)
      const otherPortrait = await buildStudentPortrait(classId, otherSid, otherData)

      const interestSet = new Set(portrait.interests)
      const otherInterestSet = new Set(otherPortrait.interests)
      const intersection = [...interestSet].filter(i => otherInterestSet.has(i)).length
      const union = new Set([...portrait.interests, ...otherPortrait.interests]).size
      const jaccard = union > 0 ? intersection / union : 0

      if (jaccard > 0.3) {
        similarStudents.push({ student_id: otherSid, similarity: jaccard, data: otherData })
      }
    } catch (e) { }
  }

  const recActivities = new Set()
  for (const sim of similarStudents) {
    if (sim.data.activities) {
      for (const a of sim.data.activities) {
        if (a.name) recActivities.add(a.name)
      }
    }
  }

  return {
    similar_count: similarStudents.length,
    activities: [...recActivities],
    cf_score: similarStudents.length > 0 ? similarStudents.reduce((s, st) => s + st.similarity, 0) / similarStudents.length : 0
  }
}

const RESOURCE_LIBRARY = {
  '数学': ['数学基础课程', '数学思维训练', '数学竞赛辅导'],
  '英语': ['英语语法精讲', '英语阅读训练', '英语听力提升'],
  '语文': ['语文阅读理解训练', '作文写作指导', '古诗词鉴赏'],
  '物理': ['物理实验兴趣小组', '物理解题技巧', '物理竞赛辅导'],
  '化学': ['化学实验小组', '化学方程式精练', '化学竞赛辅导'],
  '生物': ['生物实验兴趣小组', '生物知识竞赛'],
  '历史': ['历史文化讲座', '历史知识竞赛'],
  '地理': ['地理知识竞赛', '地理科普活动']
}

function buildFallbackRecommendations(portrait, activities) {
  const activityRecs = []
  const resourceRecs = []
  const volunteerRecs = []

  for (const subj of portrait.weakSubjects) {
    const resources = RESOURCE_LIBRARY[subj]
    if (resources) {
      for (const r of resources.slice(0, 2)) {
        resourceRecs.push({ name: r, reason: `${subj}成绩偏低，推荐针对性提升资源`, type: 'course' })
      }
    }
  }

  const now = Date.now()
  const availableActivities = (activities || []).filter(a => {
    const endTime = a.end_time || a.end_date || 0
    return !endTime || endTime > now
  })

  for (const interest of portrait.interests) {
    const matched = availableActivities.filter(a => (a.type || a.activity_type || '').includes(interest))
    for (const m of matched.slice(0, 2)) {
      activityRecs.push({ name: m.name || m.activity_name || '', reason: `匹配您的兴趣: ${interest}`, match_score: 70 })
    }
  }

  for (const talent of portrait.talents) {
    const matched = availableActivities.filter(a => {
      const desc = (a.description || '').toLowerCase()
      return desc.includes(talent.toLowerCase()) || (a.type || '').includes('志愿')
    })
    for (const m of matched.slice(0, 1)) {
      volunteerRecs.push({ name: m.name || m.activity_name || '', reason: `发挥您的特长: ${talent}`, match_score: 65 })
    }
  }

  if (activityRecs.length === 0 && availableActivities.length > 0) {
    const popular = availableActivities.slice(0, 3)
    for (const p of popular) {
      activityRecs.push({ name: p.name || p.activity_name || '', reason: '班级热门活动', match_score: 50 })
    }
  }

  return { activity_recs: activityRecs, resource_recs: resourceRecs, volunteer_recs: volunteerRecs }
}

async function submitFeedback(data, openid) {
  const { item_name, feedback_type } = data || {}
  if (!item_name) return { success: false, message: '缺少推荐项名称' }
  if (!['not_interested', 'interested'].includes(feedback_type)) return { success: false, message: '无效反馈类型' }

  try {
    const existing = await db.collection('growth_recommendations')
      .where({ _openid: openid })
      .orderBy('generated_at', 'desc').limit(1).get()

    if (existing.data && existing.data.length > 0) {
      const rec = existing.data[0]
      const feedbacks = rec.feedbacks || []
      feedbacks.push({ item_name, feedback_type, created_at: Date.now() })
      await db.collection('growth_recommendations').doc(rec._id).update({
        data: { feedbacks }
      })
    }
    return { success: true }
  } catch (err) {
    return { success: false, message: '提交反馈失败: ' + err.message }
  }
}

async function resolveScoreValue(type, key, classId) {
  try {
    const classSettingsRes = await db.collection('class_settings')
      .where({ class_id: classId })
      .field({ skill_cert_rules: true })
      .get()

    const classRules = classSettingsRes.data && classSettingsRes.data.length > 0
      ? classSettingsRes.data[0].skill_cert_rules
      : null

    if (type === 'competition') {
      const classValue = classRules && classRules.competition && classRules.competition[key]
      if (classValue != null && Number.isInteger(classValue) && classValue > 0) {
        return { value: classValue, source: 'class_rule' }
      }
      if (DEFAULT_COMPETITION_SCORES[key] != null) {
        return { value: DEFAULT_COMPETITION_SCORES[key], source: 'system_default' }
      }
      return null
    }

    if (type === 'certificate') {
      const classValue = classRules && classRules.certificate && classRules.certificate[key]
      if (classValue != null && Number.isInteger(classValue) && classValue > 0) {
        return { value: classValue, source: 'class_rule' }
      }
      if (DEFAULT_CERTIFICATE_SCORES[key] != null) {
        return { value: DEFAULT_CERTIFICATE_SCORES[key], source: 'system_default' }
      }
      return null
    }

    return null
  } catch (err) {
    console.error('resolveScoreValue错误:', err)
    return null
  }
}

function generateRecordId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let random = ''
  for (let i = 0; i < 9; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return 'SC' + Date.now() + random
}

async function callScoreManager(params) {
  try {
    const res = await cloud.callFunction({
      name: 'scoreManager',
      data: {
        action: 'applyScoreChange',
        data: params
      }
    })
    return res.result || { success: false, message: '云函数调用无返回' }
  } catch (err) {
    console.error('callScoreManager错误:', err)
    return { success: false, message: err.message || '积分变更云函数调用失败' }
  }
}

async function addSkillCertRecord(data, OPENID) {
  const identity = await verifyIdentity(OPENID)
  if (!identity.role) {
    return { success: false, message: '未登录或身份未确认' }
  }

  const allowedRoles = ['admin', 'head_teacher', 'class_cadre', 'student']
  if (!allowedRoles.includes(identity.role)) {
    return { success: false, message: '您没有权限新增记录' }
  }

  const { type, name, level, category, award, issuer, event_date, remark, student_id, class_id, semester_id } = data

  if (!type || !['competition', 'certificate'].includes(type)) {
    return { success: false, message: '记录类型无效' }
  }
  if (!name || !name.trim()) {
    return { success: false, message: type === 'competition' ? '比赛名称不能为空' : '证书名称不能为空' }
  }

  if (type === 'competition') {
    if (!level || !COMPETITION_LEVELS.includes(level)) {
      return { success: false, message: '无效的比赛级别' }
    }
  }

  if (type === 'certificate') {
    if (!category || !category.trim()) {
      return { success: false, message: '证书类别不能为空' }
    }
  }

  if (!event_date || !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
    return { success: false, message: '日期格式无效，请使用YYYY-MM-DD格式' }
  }

  let finalStudentId = student_id || ''
  let finalStudentName = ''
  let finalClassId = class_id || identity.classId || ''
  let finalSemesterId = semester_id || ''

  if (identity.role === 'student') {
    finalStudentId = identity.studentId
    finalClassId = identity.classId
  }

  if (!finalStudentId) {
    return { success: false, message: '学生ID不能为空' }
  }
  if (!finalClassId) {
    return { success: false, message: '班级ID不能为空' }
  }

  if (identity.role === 'class_cadre' && finalClassId !== identity.classId) {
    return { success: false, message: '只能为本班学生新增记录' }
  }

  const studentRes = await db.collection('students').where({ student_id: finalStudentId }).limit(1).get()
  if (!studentRes.data || studentRes.data.length === 0) {
    return { success: false, message: '学生信息不存在' }
  }
  finalStudentName = studentRes.data[0].student_name || studentRes.data[0].name || ''

  if (!finalSemesterId) {
    const semesterRes = await db.collection('semesters').where({ is_active: true }).limit(1).get()
    if (semesterRes.data && semesterRes.data.length > 0) {
      finalSemesterId = semesterRes.data[0]._id || semesterRes.data[0].semester_id || ''
    }
  }

  const recordId = generateRecordId()
  const now = db.serverDate()

  const record = {
    record_id: recordId,
    type,
    student_id: finalStudentId,
    student_name: finalStudentName,
    class_id: finalClassId,
    semester_id: finalSemesterId,
    name: name.trim(),
    level: level || '',
    category: category || '',
    award: award || '',
    issuer: issuer || '',
    event_date,
    score_value: 0,
    score_record_id: '',
    approval_status: 'pending_first',
    approval_log: [{
      action: '提交',
      operator: identity.userName || '',
      operator_role: identity.role,
      time: now
    }],
    recorder_openid: OPENID,
    recorder_name: identity.userName || '',
    recorder_role: identity.role,
    remark: remark || '',
    created_at: now,
    updated_at: now
  }

  await db.collection('skill_cert_records').add({ data: record })

  return {
    success: true,
    data: { record_id: recordId, approval_status: 'pending_first' }
  }
}

async function getSkillCertRecords(data, OPENID) {
  const identity = await verifyIdentity(OPENID)
  if (!identity.role) {
    return { success: false, message: '未登录或身份未确认' }
  }

  const { type, approval_status, student_id, page, pageSize } = data
  const pageNum = Math.max(1, parseInt(page) || 1)
  const size = Math.min(100, Math.max(1, parseInt(pageSize) || 20))

  const query = {}

  switch (identity.role) {
    case 'student':
      query.student_id = identity.studentId
      break
    case 'parent':
      if (identity.studentId) {
        query.student_id = identity.studentId
      } else {
        return { success: true, data: [], total: 0, page: pageNum, pageSize: size }
      }
      break
    case 'head_teacher':
    case 'class_cadre':
      query.class_id = identity.classId
      break
    case 'subject_teacher':
      if (identity.classList && identity.classList.length > 0) {
        query.class_id = _.in(identity.classList.map(c => c.class_id))
      } else {
        query.class_id = identity.classId
      }
      break
    case 'admin':
      if (data.class_id) query.class_id = data.class_id
      break
    default:
      return { success: false, message: '无权限查看' }
  }

  if (type) query.type = type
  if (approval_status) query.approval_status = approval_status
  if (student_id && identity.role !== 'student') query.student_id = student_id

  try {
    const countRes = await db.collection('skill_cert_records').where(query).count()
    const total = countRes.total || 0

    const recordsRes = await db.collection('skill_cert_records')
      .where(query)
      .skip((pageNum - 1) * size)
      .limit(size)
      .orderBy('created_at', 'desc')
      .get()

    return {
      success: true,
      data: recordsRes.data || [],
      total,
      page: pageNum,
      pageSize: size
    }
  } catch (err) {
    console.error('getSkillCertRecords查询失败:', err)
    return { success: false, message: '查询失败' }
  }
}

async function getSkillCertRecordDetail(data, OPENID) {
  const identity = await verifyIdentity(OPENID)
  if (!identity.role) {
    return { success: false, message: '未登录或身份未确认' }
  }

  const { record_id } = data
  if (!record_id) {
    return { success: false, message: '记录ID不能为空' }
  }

  const recordRes = await db.collection('skill_cert_records').where({ record_id }).limit(1).get()
  if (!recordRes.data || recordRes.data.length === 0) {
    return { success: false, message: '记录不存在' }
  }

  const record = recordRes.data[0]

  if (identity.role === 'student' && record.student_id !== identity.studentId) {
    return { success: false, message: '无权查看该记录' }
  }
  if (identity.role === 'parent' && record.student_id !== identity.studentId) {
    return { success: false, message: '无权查看该记录' }
  }
  if (['head_teacher', 'class_cadre'].includes(identity.role) && record.class_id !== identity.classId) {
    return { success: false, message: '无权查看该记录' }
  }

  return { success: true, data: record }
}

async function approveSkillCertRecord(data, OPENID) {
  const identity = await verifyIdentity(OPENID)
  if (!identity.role) {
    return { success: false, message: '未登录或身份未确认' }
  }

  const { record_id, approve_action, reject_reason } = data
  if (!record_id || !approve_action) {
    return { success: false, message: '参数不完整' }
  }

  const validActions = ['first_approve', 'first_reject', 'final_approve', 'final_reject']
  if (!validActions.includes(approve_action)) {
    return { success: false, message: '无效的审批动作' }
  }

  if (['first_approve', 'first_reject'].includes(approve_action)) {
    if (!['admin', 'head_teacher', 'class_cadre'].includes(identity.role)) {
      return { success: false, message: '您没有初审权限' }
    }
    if (identity.role === 'class_cadre') {
      try {
        const permRes = await cloud.callFunction({
          name: 'manageAuthorization',
          data: { action: 'checkModulePermission', data: { module: 'skill_cert', action: 'approve' } }
        })
        if (!permRes.result || !permRes.result.success) {
          return { success: false, message: '您未被授权执行初审操作' }
        }
      } catch (err) {
        console.error('班干部权限校验失败:', err)
      }
    }
  }

  if (['final_approve', 'final_reject'].includes(approve_action)) {
    if (!['admin', 'head_teacher'].includes(identity.role)) {
      return { success: false, message: '您没有终审权限' }
    }
  }

  const recordRes = await db.collection('skill_cert_records').where({ record_id }).limit(1).get()
  if (!recordRes.data || recordRes.data.length === 0) {
    return { success: false, message: '记录不存在' }
  }

  const record = recordRes.data[0]

  if (['first_approve', 'first_reject'].includes(approve_action) && record.approval_status !== 'pending_first') {
    return { success: false, message: '该记录已处理，无法初审' }
  }
  if (['final_approve', 'final_reject'].includes(approve_action) && record.approval_status !== 'pending_final') {
    return { success: false, message: '该记录状态不支持终审' }
  }

  const now = db.serverDate()
  const logEntry = {
    action: approve_action === 'first_approve' ? '初审通过' :
            approve_action === 'first_reject' ? '初审驳回' :
            approve_action === 'final_approve' ? '终审通过' : '终审驳回',
    operator: identity.userName || '',
    operator_role: identity.role,
    time: now
  }
  if (reject_reason) logEntry.reason = reject_reason

  if (approve_action === 'final_approve') {
    const scoreKey = record.type === 'competition' ? record.level : record.category
    const scoreResult = await resolveScoreValue(record.type, scoreKey, record.class_id)

    if (!scoreResult) {
      return { success: false, message: '该级别/类别暂未配置积分规则，请班主任先配置' }
    }

    const reasonDetail = `${record.type === 'competition' ? '技能比赛' : '技能证书'} - ${record.type === 'competition' ? (COMPETITION_LEVEL_LABELS[record.level] || record.level) : (CERTIFICATE_CATEGORY_LABELS[record.category] || record.category)} - ${record.name}`

    const scoreChangeResult = await callScoreManager({
      student_id: record.student_id,
      class_id: record.class_id,
      semester_id: record.semester_id,
      score_change: scoreResult.value,
      source_type: 'skill_cert',
      item_name: record.name,
      item_id: record.record_id,
      reason_detail: reasonDetail,
      recorder_openid: OPENID,
      recorder_name: identity.userName || '',
      date: record.event_date
    })

    if (!scoreChangeResult.success) {
      return { success: false, message: '积分变更失败，审批未生效，请稍后重试' }
    }

    try {
      await db.collection('skill_cert_records').doc(record._id).update({
        data: {
          approval_status: 'approved',
          score_value: scoreResult.value,
          score_record_id: scoreChangeResult.data && scoreChangeResult.data.record_id ? scoreChangeResult.data.record_id : '',
          approval_log: _.push(logEntry),
          updated_at: now
        }
      })
    } catch (updateErr) {
      console.error('[COMPENSATE] action=finalApprove, record_id=' + record_id + ', step=updateStatus, error=' + updateErr.message + ', compensate=rollbackScore')
      await callScoreManager({
        student_id: record.student_id,
        class_id: record.class_id,
        semester_id: record.semester_id,
        score_change: -scoreResult.value,
        source_type: 'skill_cert',
        item_name: record.name,
        item_id: record.record_id,
        reason_detail: '终审状态更新失败-补偿回滚: ' + reasonDetail,
        recorder_openid: OPENID,
        recorder_name: identity.userName || '',
        date: record.event_date
      })
      return { success: false, message: '审批状态更新失败，积分已回滚' }
    }

    return {
      success: true,
      data: {
        record_id,
        approval_status: 'approved',
        score_change_result: {
          score_before: scoreChangeResult.data ? scoreChangeResult.data.score_before : 0,
          score_after: scoreChangeResult.data ? scoreChangeResult.data.score_after : 0,
          score_change: scoreResult.value,
          score_record_id: scoreChangeResult.data && scoreChangeResult.data.record_id ? scoreChangeResult.data.record_id : ''
        }
      }
    }
  }

  let newStatus = ''
  if (approve_action === 'first_approve') newStatus = 'pending_final'
  if (approve_action === 'first_reject') newStatus = 'rejected'
  if (approve_action === 'final_reject') newStatus = 'rejected'

  try {
    await db.collection('skill_cert_records').doc(record._id).update({
      data: {
        approval_status: newStatus,
        approval_log: _.push(logEntry),
        updated_at: now
      }
    })
  } catch (err) {
    return { success: false, message: '审批操作失败' }
  }

  return {
    success: true,
    data: { record_id, approval_status: newStatus }
  }
}

async function deleteSkillCertRecord(data, OPENID) {
  const identity = await verifyIdentity(OPENID)
  if (!identity.role) {
    return { success: false, message: '未登录或身份未确认' }
  }

  if (!['admin', 'head_teacher'].includes(identity.role)) {
    return { success: false, message: '您没有删除权限' }
  }

  const { record_id } = data
  if (!record_id) {
    return { success: false, message: '记录ID不能为空' }
  }

  const recordRes = await db.collection('skill_cert_records').where({ record_id }).limit(1).get()
  if (!recordRes.data || recordRes.data.length === 0) {
    return { success: false, message: '该记录已被删除' }
  }

  const record = recordRes.data[0]

  if (record.approval_status === 'approved') {
    const reasonDetail = `删除回滚: ${record.type === 'competition' ? '技能比赛' : '技能证书'} - ${record.type === 'competition' ? (COMPETITION_LEVEL_LABELS[record.level] || record.level) : (CERTIFICATE_CATEGORY_LABELS[record.category] || record.category)} - ${record.name}`

    const rollbackResult = await callScoreManager({
      student_id: record.student_id,
      class_id: record.class_id,
      semester_id: record.semester_id,
      score_change: -record.score_value,
      source_type: 'skill_cert',
      item_name: record.name,
      item_id: record.record_id,
      reason_detail: reasonDetail,
      recorder_openid: OPENID,
      recorder_name: identity.userName || '',
      date: record.event_date
    })

    if (!rollbackResult.success) {
      return { success: false, message: '积分回滚失败，记录未删除，请稍后重试' }
    }

    try {
      await db.collection('skill_cert_records').doc(record._id).remove()
    } catch (removeErr) {
      console.error('[COMPENSATE] action=delete, record_id=' + record_id + ', step=removeRecord, error=' + removeErr.message + ', compensate=restoreScore')
      await callScoreManager({
        student_id: record.student_id,
        class_id: record.class_id,
        semester_id: record.semester_id,
        score_change: record.score_value,
        source_type: 'skill_cert',
        item_name: record.name,
        item_id: record.record_id,
        reason_detail: '记录删除失败-补偿恢复: ' + record.name,
        recorder_openid: OPENID,
        recorder_name: identity.userName || '',
        date: record.event_date
      })
      return { success: false, message: '记录删除失败，积分已恢复' }
    }

    return {
      success: true,
      data: {
        record_id,
        score_rolled_back: true,
        score_change: -record.score_value,
        score_before: rollbackResult.data ? rollbackResult.data.score_before : 0,
        score_after: rollbackResult.data ? rollbackResult.data.score_after : 0
      }
    }
  }

  try {
    await db.collection('skill_cert_records').doc(record._id).remove()
  } catch (err) {
    return { success: false, message: '删除失败' }
  }

  return {
    success: true,
    data: { record_id, score_rolled_back: false }
  }
}

async function getSkillCertScoreRules(data, OPENID) {
  const identity = await verifyIdentity(OPENID)
  if (!identity.role) {
    return { success: false, message: '未登录或身份未确认' }
  }

  const classId = data.class_id || identity.classId
  if (!classId) {
    return { success: false, message: '班级ID不能为空' }
  }

  let classRules = null
  try {
    const classSettingsRes = await db.collection('class_settings')
      .where({ class_id: classId })
      .field({ skill_cert_rules: true })
      .limit(1)
      .get()
    if (classSettingsRes.data && classSettingsRes.data.length > 0) {
      classRules = classSettingsRes.data[0].skill_cert_rules || null
    }
  } catch (err) {
    console.error('查询班级积分规则失败:', err)
  }

  const result = { competition: {}, certificate: {} }

  COMPETITION_LEVELS.forEach(level => {
    const classValue = classRules && classRules.competition && classRules.competition[level]
    result.competition[level] = classValue != null
      ? { value: classValue, source: 'class_rule' }
      : { value: DEFAULT_COMPETITION_SCORES[level], source: 'system_default' }
  })

  CERTIFICATE_CATEGORIES.forEach(cat => {
    const classValue = classRules && classRules.certificate && classRules.certificate[cat]
    result.certificate[cat] = classValue != null
      ? { value: classValue, source: 'class_rule' }
      : { value: DEFAULT_CERTIFICATE_SCORES[cat], source: 'system_default' }
  })

  return { success: true, data: result }
}

async function saveSkillCertScoreRules(data, OPENID) {
  const identity = await verifyIdentity(OPENID)
  if (!identity.role) {
    return { success: false, message: '未登录或身份未确认' }
  }

  if (!['admin', 'head_teacher'].includes(identity.role)) {
    return { success: false, message: '您没有配置积分规则的权限' }
  }

  const { class_id, rules } = data
  if (!class_id) {
    return { success: false, message: '班级ID不能为空' }
  }
  if (!rules) {
    return { success: false, message: '规则数据不能为空' }
  }

  const validateValues = (obj) => {
    if (!obj || typeof obj !== 'object') return false
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (typeof val !== 'number' || !Number.isInteger(val) || val <= 0) return false
    }
    return true
  }

  if (rules.competition && !validateValues(rules.competition)) {
    return { success: false, message: '比赛积分值必须为正整数' }
  }
  if (rules.certificate && !validateValues(rules.certificate)) {
    return { success: false, message: '证书积分值必须为正整数' }
  }

  const now = db.serverDate()
  const skillCertRules = {
    competition: rules.competition || {},
    certificate: rules.certificate || {},
    updated_by: OPENID,
    updated_at: now
  }

  try {
    const existRes = await db.collection('class_settings').where({ class_id }).limit(1).get()
    if (existRes.data && existRes.data.length > 0) {
      await db.collection('class_settings').doc(existRes.data[0]._id).update({
        data: { skill_cert_rules: skillCertRules }
      })
    } else {
      await db.collection('class_settings').add({
        data: { class_id, skill_cert_rules: skillCertRules }
      })
    }
  } catch (err) {
    console.error('保存积分规则失败:', err)
    return { success: false, message: '保存失败' }
  }

  return { success: true, data: { class_id } }
}
