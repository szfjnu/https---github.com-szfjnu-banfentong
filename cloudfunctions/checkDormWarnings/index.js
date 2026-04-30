// 云函数：检查并生成宿舍积分预警
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { class_id, check_type = 'all', student_id } = event

  try {
    console.log('=== 开始检查宿舍积分预警 ===')
    console.log('参数:', { class_id, check_type, student_id })

    // 1. 获取当前学期
    const semesterRes = await db.collection('semesters')
      .where({ status: 'active' })
      .limit(1)
      .get()

    if (semesterRes.data.length === 0) {
      return { success: false, message: '未找到当前学期' }
    }

    const semester = semesterRes.data[0]
    const semester_id = semester._id
    const warningThreshold = semester.dorm_warning_threshold || 70
    const criticalThreshold = semester.dorm_critical_threshold || 40

    console.log('预警阈值:', { warningThreshold, criticalThreshold })

    // 2. 确定检查范围
    let studentsQuery = {
      is_boarding: true
    }

    if (student_id) {
      // 检查单个学生
      studentsQuery.student_id = student_id
    } else if (class_id) {
      // 检查整个班级
      studentsQuery.class_id = class_id
    }

    const studentsRes = await db.collection('students')
      .where(studentsQuery)
      .get()

    const students = studentsRes.data
    console.log('检查学生数:', students.length)

    // 3. 检查每个学生
    const warnings = []
    const now = new Date()

    for (const student of students) {
      const studentId = student.student_id
      const studentName = student.name || student.student_name
      const classId = student.class_id

      // 获取或创建宿舍积分账户（以账户积分为准，更实时准确）
      const accountRes = await db.collection('dorm_score_accounts')
        .where({
          student_id: studentId,
          semester_id: semester_id
        })
        .limit(1)
        .get()

      let account = accountRes.data.length > 0 ? accountRes.data[0] : null

      if (!account) {
        // 创建账户
        const createRes = await db.collection('dorm_score_accounts').add({
          data: {
            student_id: studentId,
            semester_id: semester_id,
            class_id: classId,
            original_score: 100,
            current_score: 100,
            converted_score: 0,
            conversion_ratio: 0.3,
            warning_count: 0,
            created_at: now,
            updated_at: now
          }
        })
        account = { _id: createRes._id, original_score: 100, current_score: 100 }
      }

      // 使用账户中的 current_score 作为实时宿舍积分（优先），否则用 original_score
      const dormScore = account.current_score !== undefined
        ? account.current_score
        : (account.original_score || 100)

      // 查询近期扣分情况（近7天）
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const recentDeductionRes = await db.collection('dorm_score_records')
        .where({
          student_id: studentId,
          semester_id: semester_id,
          score_change: _.lt(0),
          date: _.gte(sevenDaysAgo)
        })
        .get()

      const recentDeductionCount = recentDeductionRes.data.length

      // 计算扣分趋势（近7天 vs 前7天）
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      const previousDeductionRes = await db.collection('dorm_score_records')
        .where({
          student_id: studentId,
          semester_id: semester_id,
          score_change: _.lt(0),
          date: _.gte(fourteenDaysAgo).and(_.lt(sevenDaysAgo))
        })
        .get()

      const previousDeductionCount = previousDeductionRes.data.length
      const deductionTrend = recentDeductionCount - previousDeductionCount

      // 判断预警类型和等级（基于实时 dormScore）
      const warningResult = checkWarning(
        dormScore,
        recentDeductionCount,
        deductionTrend,
        warningThreshold,
        criticalThreshold
      )

      if (warningResult) {
        // 生成预警ID
        const warning_id = `warn_${studentId}_${Date.now()}`

        // 检查是否已有相同等级的生效预警
        const existWarningRes = await db.collection('dorm_warnings')
          .where({
            student_id: studentId,
            warning_level: warningResult.level,
            status: 'active'
          })
          .limit(1)
          .get()

        if (existWarningRes.data.length === 0) {
          // 创建新预警
          const warningData = {
            warning_id: warning_id,
            student_id: studentId,
            student_name: studentName,
            class_id: classId,
            semester_id: semester_id,
            building: student.dorm_info?.building || '',
            room: student.dorm_info?.room || '',
            warning_type: warningResult.type,
            warning_level: warningResult.level,
            trigger_score: dormScore,
            current_score: dormScore,
            deduction_count: recentDeductionCount,
            deduction_trend: deductionTrend,
            suggestions: generateSuggestions(warningResult, recentDeductionRes.data),
            is_notified: false,
            parent_notified: false,
            teacher_notified: false,
            status: 'active',
            created_at: now,
            updated_at: now
          }

          await db.collection('dorm_warnings').add({ data: warningData })

          // 更新宿舍积分账户
          await db.collection('dorm_score_accounts')
            .doc(account._id)
            .update({
              data: {
                warning_count: _.inc(1),
                last_warning_type: warningResult.level,
                last_warning_date: now,
                updated_at: now
              }
            })

          warnings.push(warningData)
          console.log(`创建预警: ${studentName} - ${warningResult.level}`)
        } else {
          console.log(`跳过已有预警: ${studentName} - ${warningResult.level}`)
        }
      }
    }

    console.log(`预警检查完成，生成 ${warnings.length} 条预警`)

    return {
      success: true,
      message: `预警检查完成，生成 ${warnings.length} 条预警`,
      data: {
        checked_count: students.length,
        warning_count: warnings.length,
        warnings: warnings
      }
    }

  } catch (error) {
    console.error('检查宿舍预警失败:', error)
    return {
      success: false,
      message: error.message,
      error: error
    }
  }
}

// 检查预警条件
function checkWarning(score, recentDeductionCount, deductionTrend, warningThreshold, criticalThreshold) {
  // 红色预警：积分 < 40 或 近7天扣分 >= 5次
  if (score < criticalThreshold || recentDeductionCount >= 5) {
    return {
      type: 'score_warning',
      level: 'red',
      reason: score < criticalThreshold ? '积分过低' : '近期扣分频繁'
    }
  }

  // 橙色预警：积分 < 50 或 近7天扣分 >= 3次
  if (score < 50 || recentDeductionCount >= 3) {
    return {
      type: recentDeductionCount >= 3 ? 'behavior_warning' : 'score_warning',
      level: 'orange',
      reason: score < 50 ? '积分较低' : '近期扣分较多'
    }
  }

  // 黄色预警：积分 < 70
  if (score < warningThreshold) {
    return {
      type: 'score_warning',
      level: 'yellow',
      reason: '积分接近预警线'
    }
  }

  // 趋势预警：扣分趋势上升
  if (deductionTrend > 2) {
    return {
      type: 'trend_warning',
      level: 'yellow',
      reason: '扣分趋势上升'
    }
  }

  return null
}

// 生成改进建议
function generateSuggestions(warningResult, recentDeductions) {
  const suggestions = []

  // 基于预警类型生成建议
  if (warningResult.level === 'red') {
    suggestions.push({
      suggestion: '请立即与班主任或宿管老师沟通，制定改进计划',
      priority: 1
    })
    suggestions.push({
      suggestion: '建议家长介入，共同督促学生改善宿舍表现',
      priority: 2
    })
  } else if (warningResult.level === 'orange') {
    suggestions.push({
      suggestion: '请认真反思近期宿舍表现，找出问题所在',
      priority: 1
    })
    suggestions.push({
      suggestion: '建议主动向老师汇报整改情况',
      priority: 2
    })
  } else {
    suggestions.push({
      suggestion: '请注意保持宿舍卫生和纪律',
      priority: 1
    })
  }

  // 基于具体扣分项生成建议
  const deductionTypes = {}
  recentDeductions.forEach(record => {
    if (record.item_name) {
      deductionTypes[record.item_name] = (deductionTypes[record.item_name] || 0) + 1
    }
  })

  Object.entries(deductionTypes).forEach(([item, count], index) => {
    suggestions.push({
      suggestion: `重点改善：${item}（近期${count}次）`,
      priority: index + 3
    })
  })

  return suggestions.slice(0, 5) // 最多返回5条建议
}
