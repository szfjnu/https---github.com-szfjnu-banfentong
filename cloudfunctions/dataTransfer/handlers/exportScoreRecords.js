const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { ALLOWED_EXPORT_ROLES, DATA_TOO_LARGE_THRESHOLD } = require('../config/constants')
const batchQuery = require('../utils/batchQuery')
const excelStrategy = require('../strategies/excelStrategy')
const logger = require('../utils/logger')
const { checkPermission } = require('../utils/permission')

async function exportScoreRecordsHandler(data, OPENID) {
  const { classId, className, startDate, endDate, studentId } = data

  await checkPermission(OPENID, ALLOWED_EXPORT_ROLES)

  const query = { class_id: classId }
  if (startDate && endDate) {
    query.date = _.gte(startDate).and(_.lte(endDate))
  } else if (startDate) {
    query.date = _.gte(startDate)
  } else if (endDate) {
    query.date = _.lte(endDate)
  }
  if (studentId) {
    query.student_id = studentId
  }

  const records = await batchQuery.getAllRecords('score_records', query, 'date', 'desc')

  if (records.length > DATA_TOO_LARGE_THRESHOLD) {
    return {
      success: false,
      message: `数据量过大(${records.length}条)，超过阈值${DATA_TOO_LARGE_THRESHOLD}，请缩小查询范围`
    }
  }

  if (records.length === 0) {
    return {
      success: false,
      message: '没有符合条件的积分记录'
    }
  }

  const students = await batchQuery.getAllRecords('students', { class_id: classId })
  const studentMap = {}
  for (const s of students) {
    studentMap[s.student_id] = s.name
  }

  const exportData = records.map(r => ({
    '学号': r.student_id || '',
    '姓名': studentMap[r.student_id] || '',
    '积分项目': r.category || '',
    '分值': r.score !== undefined ? r.score : 0,
    '事由': r.reason || '',
    '日期': r.date || '',
    '记录人': r.operator_name || r.operator || ''
  }))

  const fileName = `${className || classId}_积分记录_${Date.now()}.xlsx`
  const result = await excelStrategy.generate(exportData, {
    fileName,
    sheetName: '积分记录'
  })

  await logger.log({
    action: 'exportScoreRecords',
    operator: OPENID,
    dataCount: records.length,
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
      recordCount: records.length
    }
  }
}

module.exports = { exportScoreRecordsHandler }
