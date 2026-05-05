const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { ALLOWED_EXPORT_ROLES } = require('../config/constants')
const batchQuery = require('../utils/batchQuery')
const excelStrategy = require('../strategies/excelStrategy')
const logger = require('../utils/logger')
const { checkPermission } = require('../utils/permission')

function resolvePeriodRange(periodType, startDate, endDate) {
  const now = new Date()
  let start, end

  if (periodType === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  } else if (periodType === 'week') {
    const day = now.getDay() || 7
    start = new Date(now)
    start.setDate(now.getDate() - day + 1)
    end = new Date(start)
    end.setDate(start.getDate() + 6)
  } else if (periodType === 'semester') {
    start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth() >= 7 ? 8 : 1, 1)
    end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() >= 7 ? 12 : 7, 0)
  } else {
    start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1)
    end = endDate ? new Date(endDate) : now
  }

  const format = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { startDate: format(start), endDate: format(end) }
}

function aggregateAttendance(students, attendanceRecords) {
  const studentAttendanceMap = {}

  for (const s of students) {
    studentAttendanceMap[s.student_id] = {
      student_id: s.student_id,
      name: s.name,
      出勤天数: 0,
      缺勤天数: 0,
      迟到天数: 0,
      请假天数: 0
    }
  }

  for (const record of attendanceRecords) {
    const sid = record.student_id
    if (!studentAttendanceMap[sid]) {
      studentAttendanceMap[sid] = {
        student_id: sid,
        name: record.student_name || '',
        出勤天数: 0,
        缺勤天数: 0,
        迟到天数: 0,
        请假天数: 0
      }
    }
    const status = String(record.status || '').trim()
    if (status === 'present' || status === '出勤' || status === '正常') {
      studentAttendanceMap[sid].出勤天数++
    } else if (status === 'absent' || status === '缺勤' || status === '旷课') {
      studentAttendanceMap[sid].缺勤天数++
    } else if (status === 'late' || status === '迟到') {
      studentAttendanceMap[sid].迟到天数++
    } else if (status === 'leave' || status === '请假') {
      studentAttendanceMap[sid].请假天数++
    }
  }

  return Object.values(studentAttendanceMap)
}

async function exportAttendanceHandler(data, OPENID) {
  const { classId, className, periodType, startDate, endDate } = data

  await checkPermission(OPENID, ALLOWED_EXPORT_ROLES)

  const period = resolvePeriodRange(periodType, startDate, endDate)

  const students = await batchQuery.getAllRecords('students', { class_id: classId })

  if (students.length === 0) {
    return {
      success: false,
      message: '该班级没有学生数据'
    }
  }

  const attendanceQuery = {
    class_id: classId,
    date: _.gte(period.startDate).and(_.lte(period.endDate))
  }
  const attendanceRecords = await batchQuery.getAllRecords('attendance', attendanceQuery, 'date', 'desc')

  const aggregated = aggregateAttendance(students, attendanceRecords)

  const exportData = aggregated.map(a => ({
    '学号': a.student_id || '',
    '姓名': a.name || '',
    '出勤天数': a.出勤天数,
    '缺勤天数': a.缺勤天数,
    '迟到天数': a.迟到天数,
    '请假天数': a.请假天数
  }))

  const fileName = `${className || classId}_考勤汇总_${Date.now()}.xlsx`
  const result = await excelStrategy.generate(exportData, {
    fileName,
    sheetName: '考勤汇总'
  })

  await logger.log({
    action: 'exportAttendance',
    operator: OPENID,
    dataCount: aggregated.length,
    result: 'success',
    classId,
    fileId: result.fileID
  })

  return {
    success: true,
    data: {
      fileID: result.fileID,
      downloadURL: result.downloadURL,
      fileName: result.fileName,
      recordCount: aggregated.length,
      period
    }
  }
}

module.exports = { exportAttendanceHandler }
