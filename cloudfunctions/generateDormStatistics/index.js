// 云函数：生成宿舍统计报表
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const { getCallerInfo, requireTeacher } = require('./utils/auth')

exports.main = async (event, context) => {
  const { class_id, stat_type = 'daily', stat_date, building, room } = event

  try {
    const caller = await getCallerInfo(event, class_id)
    requireTeacher(caller)
    console.log('=== 开始生成宿舍统计报表 ===')
    console.log('参数:', { class_id, stat_type, stat_date, building, room })

    // 1. 获取当前学期
    let semesterQuery = { status: 'active' };
    if (class_id) {
      semesterQuery = { class_id: class_id, status: 'active' };
    }
    const semesterRes = await db.collection('semesters')
      .where(semesterQuery)
      .limit(1)
      .get()

    if (semesterRes.data.length === 0 && class_id) {
      const fallbackRes = await db.collection('semesters')
        .where({ status: 'active' })
        .limit(1)
        .get()
      if (fallbackRes.data.length > 0) {
        semesterRes.data = fallbackRes.data;
      }
    }

    if (semesterRes.data.length === 0) {
      return { success: false, message: '未找到当前学期' }
    }

    const semester = semesterRes.data[0]
    const semester_id = semester._id

    // 2. 确定统计时间范围
    const targetDate = stat_date ? new Date(stat_date) : new Date()
    const { startDate, endDate } = getDateRange(targetDate, stat_type)

    console.log('统计时间范围:', { startDate, endDate, stat_type })

    // 3. 构建查询条件
    const queryCondition = {
      class_id: class_id,
      semester_id: semester_id,
      date: _.gte(startDate).and(_.lte(endDate))
    }

    if (building) {
      queryCondition.building = building
    }
    if (room) {
      queryCondition.room = room
    }

    // 4. 查询宿舍积分记录
    const scoreRecordsRes = await db.collection('dorm_score_records')
      .where(queryCondition)
      .get()

    const scoreRecords = scoreRecordsRes.data
    console.log('查询到积分记录数:', scoreRecords.length)

    // 5. 查询检查记录
    const inspectionQuery = {
      class_id: class_id,
      inspection_date: _.gte(startDate).and(_.lte(endDate))
    }
    if (building) inspectionQuery.building = building
    if (room) inspectionQuery.room = room

    const inspectionRes = await db.collection('dorm_inspection_records')
      .where(inspectionQuery)
      .get()

    const inspectionRecords = inspectionRes.data
    console.log('查询到检查记录数:', inspectionRecords.length)

    // 6. 计算统计数据
    const statistics = calculateStatistics(scoreRecords, inspectionRecords)

    // 7. 计算积分分布
    const studentsRes = await db.collection('students')
      .where({
        class_id: class_id,
        is_boarding: true
      })
      .get()

    const scoreDistribution = calculateScoreDistribution(studentsRes.data)

    // 8. 统计高频违规
    const topViolations = calculateTopViolations(scoreRecords)

    // 9. 生成统计ID
    const stat_id = generateStatId(class_id, stat_type, targetDate, building, room)

    // 10. 保存或更新统计记录
    const statData = {
      stat_id: stat_id,
      class_id: class_id,
      semester_id: semester_id,
      stat_type: stat_type,
      stat_date: startDate,
      building: building || null,
      room: room || null,
      total_deduction_score: statistics.totalDeduction,
      total_add_score: statistics.totalAdd,
      net_score: statistics.netScore,
      converted_score: statistics.convertedScore,
      deduction_count: statistics.deductionCount,
      add_count: statistics.addCount,
      violation_count: statistics.violationCount,
      top_violations: topViolations,
      score_distribution: scoreDistribution,
      inspection_stats: statistics.inspectionStats,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }

    // 检查是否已存在
    const existRes = await db.collection('dorm_statistics')
      .where({ stat_id: stat_id })
      .limit(1)
      .get()

    if (existRes.data.length > 0) {
      // 更新
      await db.collection('dorm_statistics')
        .doc(existRes.data[0]._id)
        .update({ data: statData })
      console.log('更新统计记录成功')
    } else {
      // 新增
      await db.collection('dorm_statistics').add({ data: statData })
      console.log('新增统计记录成功')
    }

    return {
      success: true,
      message: '统计报表生成成功',
      data: statData
    }

  } catch (error) {
    console.error('生成统计报表失败:', error)
    return {
      success: false,
      message: error.message,
      error: error
    }
  }
}

// 获取统计时间范围
function getDateRange(targetDate, stat_type) {
  const year = targetDate.getFullYear()
  const month = targetDate.getMonth()
  const day = targetDate.getDate()
  const dayOfWeek = targetDate.getDay()

  let startDate, endDate

  switch (stat_type) {
    case 'daily':
      startDate = new Date(year, month, day, 0, 0, 0)
      endDate = new Date(year, month, day, 23, 59, 59)
      break

    case 'weekly':
      const weekStart = day === 0 ? day - 6 : 1 - day
      startDate = new Date(year, month, day + weekStart, 0, 0, 0)
      endDate = new Date(year, month, day + weekStart + 6, 23, 59, 59)
      break

    case 'monthly':
      startDate = new Date(year, month, 1, 0, 0, 0)
      endDate = new Date(year, month + 1, 0, 23, 59, 59)
      break

    case 'semester':
      // 学期统计从学期开始到当前日期
      startDate = new Date(2025, 2, 1) // 3月1日
      endDate = new Date(year, month, day, 23, 59, 59)
      break

    default:
      startDate = new Date(year, month, day, 0, 0, 0)
      endDate = new Date(year, month, day, 23, 59, 59)
  }

  return { startDate, endDate }
}

// 计算统计数据
function calculateStatistics(scoreRecords, inspectionRecords) {
  let totalDeduction = 0
  let totalAdd = 0
  let deductionCount = 0
  let addCount = 0
  let violationCount = 0
  let convertedScore = 0

  // 统计积分记录
  scoreRecords.forEach(record => {
    if (record.score_change < 0) {
      totalDeduction += Math.abs(record.score_change)
      deductionCount++
      violationCount++
    } else if (record.score_change > 0) {
      totalAdd += record.score_change
      addCount++
    }
  })

  const netScore = totalAdd - totalDeduction

  // 统计检查记录
  let totalInspections = inspectionRecords.length
  let totalScore = 0
  let passCount = 0

  inspectionRecords.forEach(record => {
    if (record.overall_score) {
      totalScore += record.overall_score
      if (record.overall_score >= 60) {
        passCount++
      }
    }
  })

  const avgScore = totalInspections > 0 ? Math.round(totalScore / totalInspections) : 0
  const passRate = totalInspections > 0 ? passCount / totalInspections : 0

  return {
    totalDeduction,
    totalAdd,
    netScore,
    convertedScore,
    deductionCount,
    addCount,
    violationCount,
    inspectionStats: {
      total_inspections: totalInspections,
      avg_score: avgScore,
      pass_rate: passRate
    }
  }
}

// 计算积分分布
function calculateScoreDistribution(students) {
  const distribution = {
    excellent: 0,  // 90-100
    good: 0,       // 70-89
    pass: 0,       // 60-69
    warning: 0,    // 40-59
    critical: 0    // 0-39
  }

  students.forEach(student => {
    const score = student.dorm_score || 100
    if (score >= 90) {
      distribution.excellent++
    } else if (score >= 70) {
      distribution.good++
    } else if (score >= 60) {
      distribution.pass++
    } else if (score >= 40) {
      distribution.warning++
    } else {
      distribution.critical++
    }
  })

  return distribution
}

// 计算高频违规Top5
function calculateTopViolations(scoreRecords) {
  const violationMap = {}

  scoreRecords.forEach(record => {
    if (record.score_change < 0 && record.item_name) {
      if (!violationMap[record.item_name]) {
        violationMap[record.item_name] = 0
      }
      violationMap[record.item_name]++
    }
  })

  const sortedViolations = Object.entries(violationMap)
    .map(([rule_name, count]) => ({ rule_name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return sortedViolations
}

// 生成统计ID
function generateStatId(class_id, stat_type, stat_date, building, room) {
  const dateStr = stat_date.toISOString().split('T')[0]
  let id = `stat_${class_id}_${stat_type}_${dateStr}`
  if (building) {
    id += `_${building}`
    if (room) {
      id += `_${room}`
    }
  }
  return id
}
