// 云函数:AI点评生成
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const { getCallerInfo, requireTeacher, AUTH_ERRORS } = require('./utils/auth')

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
        { role: 'system', content: systemPrompt || '你是一名专业的班主任，擅长撰写学生评语和综合评价。' },
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

exports.main = async (event, context) => {
  const { student_id, review_type, review_period } = event
  const { class_id } = event

  try {
    if (event._prompt) {
      const caller = await getCallerInfo(event, class_id)
      const content = await callAI(event._prompt, event._systemPrompt || '')
      return { success: true, data: { content } }
    }

    const caller = await getCallerInfo(event, class_id)
    requireTeacher(caller)

    const studentRes = await db.collection('students').where({
      student_id: student_id
    }).get()

    if (studentRes.data.length === 0) {
      return { success: false, message: '学生不存在' }
    }

    const student = studentRes.data[0]

    const { class_id } = event
    let semesterQuery = { status: 'active' };
    if (class_id) {
      semesterQuery = { class_id: class_id, status: 'active' };
    }
    let semesterRes = await db.collection('semesters').where(semesterQuery).get()

    if (semesterRes.data.length === 0 && class_id) {
      const fallbackRes = await db.collection('semesters').where({ status: 'active' }).get()
      if (fallbackRes.data.length > 0) {
        semesterRes = fallbackRes;
      }
    }

    if (semesterRes.data.length === 0) {
      return { success: false, message: '未找到当前学期' }
    }

    const semester_id = semesterRes.data[0]._id

    // 3. 根据点评类型收集数据
    let startDate, endDate
    const now = new Date()

    if (review_type === '按月') {
      // 按月:解析review_period,如"2024年12月"
      const monthMatch = review_period.match(/(\d{4})年(\d{1,2})月/)
      if (monthMatch) {
        const year = parseInt(monthMatch[1])
        const month = parseInt(monthMatch[2])
        startDate = new Date(year, month - 1, 1)
        endDate = new Date(year, month, 0, 23, 59, 59)
      } else {
        // 如果没有指定月份,使用当前月
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      }
    } else if (review_type === '按学期') {
      // 按学期:使用学期开始和结束日期
      const semesterData = semesterRes.data[0]
      startDate = new Date(semesterData.start_date)
      endDate = new Date(semesterData.end_date)
    } else if (review_type === '按学年') {
      // 按学年:使用当前学年
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth()
      if (currentMonth >= 8) {
        // 9月及之后,属于新学年
        startDate = new Date(currentYear, 8, 1)
        endDate = new Date(currentYear + 1, 7, 31, 23, 59, 59)
      } else {
        // 9月之前
        startDate = new Date(currentYear - 1, 8, 1)
        endDate = new Date(currentYear, 7, 31, 23, 59, 59)
      }
    }

    // 4. 收集积分数据
    const scoreRecordsRes = await db.collection('score_records').where({
      student_id: student_id,
      date: _.gte(startDate).and(_.lte(endDate))
    }).get()

    const scoreRecords = scoreRecordsRes.data
    const totalScoreChange = scoreRecords.reduce((sum, record) => sum + record.score_change, 0)

    // 5. 收集活动数据
    const volunteerRecordsRes = await db.collection('volunteer_records').where({
      student_id: student_id,
      date: _.gte(startDate).and(_.lte(endDate))
    }).get()

    const volunteerRecords = volunteerRecordsRes.data
    const volunteerHours = volunteerRecords.reduce((sum, record) => sum + record.duration, 0)

    // 6. 收集竞赛数据
    const competitionRecordsRes = await db.collection('competition_records').where({
      student_id: student_id,
      award_date: _.gte(startDate).and(_.lte(endDate))
    }).get()

    const competitionRecords = competitionRecordsRes.data

    // 7. 收集证书数据
    const certificateRecordsRes = await db.collection('skill_certificates').where({
      student_id: student_id,
      issue_date: _.gte(startDate).and(_.lte(endDate))
    }).get()

    const certificateRecords = certificateRecordsRes.data

    // 8. 收集处分数据
    const disciplineRecordsRes = await db.collection('discipline_records').where({
      student_id: student_id,
      issue_date: _.gte(startDate).and(_.lte(endDate)),
      is_revoked: false
    }).get()

    const disciplineRecords = disciplineRecordsRes.data

    // 9. 生成AI点评内容（优先使用AI接口，失败则回退模板）
    let reviewContent = ''
    let usedAI = false
    try {
      const dataSummary = `学生姓名：${student.name}
当前总积分：${student.current_score}
本${review_type === '按月' ? '月' : review_type === '按学期' ? '学期' : '学年'}积分变化：${totalScoreChange > 0 ? '+' : ''}${totalScoreChange}分
志愿服务时长：${volunteerHours}小时
竞赛参与次数：${competitionRecords.length}次
获得证书数量：${certificateRecords.length}个
受处分次数：${disciplineRecords.length}次${disciplineRecords.length > 0 ? '（级别：' + disciplineRecords.map(d => d.discipline_level).join('、') + '）' : ''}`

      const aiPrompt = `请为以下学生生成一份${review_type}综合评语（${review_period}）：

${dataSummary}

要求：
1. 评语应客观、有建设性，语言亲切自然
2. 分别评价积分表现、活动参与、纪律表现
3. 给出针对性改进建议
4. 总字数300-500字
5. 用第二人称"你"称呼学生`

      const aiSystemPrompt = '你是一名经验丰富的班主任，擅长撰写学生综合评语。评语应客观准确，积极鼓励为主，同时指出需改进之处。语气亲切自然。'

      reviewContent = await callAI(aiPrompt, aiSystemPrompt)
      if (reviewContent) usedAI = true
    } catch (aiErr) {
      console.error('AI生成评语失败，回退模板生成:', aiErr.message)
    }

    if (!usedAI) {
      reviewContent = generateReviewContent({
        student,
        review_type,
        review_period,
        totalScoreChange,
        volunteerHours,
        competitionCount: competitionRecords.length,
        certificateCount: certificateRecords.length,
        disciplineCount: disciplineRecords.length,
        disciplineLevels: disciplineRecords.map(d => d.discipline_level)
      })
    }

    // 10. 生成改进建议
    let suggestions = []
    if (usedAI) {
      try {
        const sugPrompt = `基于以下学生数据，给出3-5条简洁的改进建议（每条不超过20字）：
积分变化：${totalScoreChange > 0 ? '+' : ''}${totalScoreChange}分，志愿服务：${volunteerHours}小时，竞赛：${competitionRecords.length}次，处分：${disciplineRecords.length}次`
        const sugResult = await callAI(sugPrompt, '你是教育顾问，给出简洁可操作的学生改进建议。')
        if (sugResult) {
          suggestions = sugResult.split('\n').filter(s => s.trim()).map(s => s.replace(/^[\d.、\-\s]+/, '').trim()).slice(0, 5)
        }
      } catch (err) {
        console.error('AI生成建议失败:', err.message)
      }
    }
    if (suggestions.length === 0) {
      suggestions = generateSuggestions({
        totalScoreChange,
        volunteerHours,
        competitionCount: competitionRecords.length,
        certificateCount: certificateRecords.length,
        disciplineCount: disciplineRecords.length
      })
    }

    // 11. 保存点评记录
    const reviewRes = await db.collection('ai_reviews').add({
      data: {
        student_id: student_id,
        review_type: review_type,
        review_period: review_period,
        review_content: reviewContent,
        score_summary: {
          total_score: student.current_score,
          score_change: totalScoreChange,
          score_trend: totalScoreChange > 0 ? '上升' : totalScoreChange < 0 ? '下降' : '稳定'
        },
        activity_summary: {
          volunteer_hours: volunteerHours,
          competition_count: competitionRecords.length,
          certificate_count: certificateRecords.length
        },
        discipline_summary: {
          discipline_count: disciplineRecords.length,
          discipline_levels: disciplineRecords.map(d => d.discipline_level)
        },
        suggestions: suggestions,
        is_edited: false,
        is_confirmed: false,
        generated_by_ai: usedAI,
        created_at: new Date(),
        updated_at: new Date()
      }
    })

    return {
      success: true,
      message: 'AI点评生成成功',
      data: {
        review_id: reviewRes._id,
        review_content: reviewContent,
        suggestions: suggestions
      }
    }

  } catch (err) {
    console.error('生成AI点评失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return { success: false, message: `生成失败: ${err.message}` }
  }
}

// 生成点评内容
function generateReviewContent(data) {
  const { student, review_type, review_period, totalScoreChange, volunteerHours, competitionCount, certificateCount, disciplineCount, disciplineLevels } = data

  let content = `【${review_type}学生点评】\n`
  content += `学生姓名:${student.name}\n`
  content += `点评周期:${review_period}\n\n`

  // 积分情况
  content += `【积分表现】\n`
  content += `本${review_type === '按月' ? '月' : review_type === '按学期' ? '学期' : '学年'}积分变化:${totalScoreChange > 0 ? '+' : ''}${totalScoreChange}分\n`
  content += `当前总积分:${student.current_score}分\n`
  content += `积分等级:${student.score_level}\n`
  
  if (totalScoreChange > 0) {
    content += `积分呈上升趋势,表现优秀!\n`
  } else if (totalScoreChange < 0) {
    content += `积分有所下降,需要加强自我管理。\n`
  } else {
    content += `积分保持稳定,继续保持。\n`
  }
  content += `\n`

  // 活动参与
  content += `【活动参与】\n`
  content += `志愿服务时长:${volunteerHours}小时\n`
  content += `竞赛参与次数:${competitionCount}次\n`
  content += `获得证书数量:${certificateCount}个\n`
  
  if (volunteerHours > 10) {
    content += `志愿服务表现积极,值得表扬!\n`
  }
  if (competitionCount > 0) {
    content += `积极参与竞赛,展现了良好的竞争意识。\n`
  }
  if (certificateCount > 0) {
    content += `获得了多项技能证书,综合能力突出。\n`
  }
  content += `\n`

  // 纪律表现
  if (disciplineCount > 0) {
    content += `【纪律表现】\n`
    content += `本${review_type === '按月' ? '月' : review_type === '按学期' ? '学期' : '学年'}受到处分:${disciplineCount}次\n`
    content += `处分级别:${disciplineLevels.join('、')}\n`
    content += `希望加强纪律意识,严格遵守校规校纪。\n\n`
  } else {
    content += `【纪律表现】\n`
    content += `本${review_type === '按月' ? '月' : review_type === '按学期' ? '学期' : '学年'}无违纪记录,表现良好。\n\n`
  }

  // 总结
  content += `【综合评价】\n`
  if (totalScoreChange >= 0 && disciplineCount === 0) {
    content += `${student.name}同学在本${review_type === '按月' ? '月' : review_type === '按学期' ? '学期' : '学年'}表现优秀,积极参与各项活动,遵守纪律,是同学们学习的榜样。`
  } else if (totalScoreChange >= 0 && disciplineCount > 0) {
    content += `${student.name}同学在本${review_type === '按月' ? '月' : review_type === '按学期' ? '学期' : '学年'}整体表现良好,积极参与活动,但需要注意纪律问题。`
  } else if (totalScoreChange < 0 && disciplineCount === 0) {
    content += `${student.name}同学在本${review_type === '按月' ? '月' : review_type === '按学期' ? '学期' : '学年'}积分有所下降,但无违纪记录,建议多参与活动提升积分。`
  } else {
    content += `${student.name}同学在本${review_type === '按月' ? '月' : review_type === '按学期' ? '学期' : '学年'}需要加强自我管理,积极参与活动,严格遵守纪律。`
  }

  return content
}

// 生成改进建议
function generateSuggestions(data) {
  const { totalScoreChange, volunteerHours, competitionCount, certificateCount, disciplineCount } = data
  const suggestions = []

  if (totalScoreChange < 0) {
    suggestions.push('建议多参与班级活动,争取获得加分机会')
    suggestions.push('注意日常行为规范,避免扣分')
  }

  if (volunteerHours < 5) {
    suggestions.push('建议增加志愿服务时长,培养社会责任感')
  }

  if (competitionCount === 0) {
    suggestions.push('建议积极参加各类竞赛活动,提升综合素质')
  }

  if (certificateCount === 0) {
    suggestions.push('建议获取专业技能证书,增强就业竞争力')
  }

  if (disciplineCount > 0) {
    suggestions.push('需要加强纪律意识,严格遵守校规校纪')
    suggestions.push('建议主动与老师沟通,寻求帮助和指导')
  }

  if (suggestions.length === 0) {
    suggestions.push('继续保持优秀表现,争取更大进步')
  }

  return suggestions
}
