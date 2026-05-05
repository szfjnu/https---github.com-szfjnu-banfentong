const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { ALLOWED_EXPORT_ROLES } = require('../config/constants')
const batchQuery = require('../utils/batchQuery')
const excelStrategy = require('../strategies/excelStrategy')
const logger = require('../utils/logger')
const { checkPermission } = require('../utils/permission')

async function exportStudentHandler(data, OPENID) {
  const { classId, className } = data

  await checkPermission(OPENID, ALLOWED_EXPORT_ROLES)

  const students = await batchQuery.getAllRecords('students', { class_id: classId })

  if (students.length === 0) {
    return {
      success: false,
      message: '该班级没有学生数据'
    }
  }

  const exportData = students.map(s => ({
    '学号': s.student_id || '',
    '姓名': s.name || '',
    '性别': s.gender || '',
    '当前积分': s.score !== undefined ? s.score : (s.initial_score || 0),
    '班干部': s.position || '',
    '联系电话': s.phone || '',
    '家长姓名': s.parent_name || '',
    '家长电话': s.parent_phone || ''
  }))

  const fileName = `${className || classId}_学生数据_${Date.now()}.xlsx`
  const result = await excelStrategy.generate(exportData, {
    fileName,
    sheetName: '学生数据'
  })

  await logger.log({
    action: 'exportStudent',
    operator: OPENID,
    dataCount: students.length,
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
      recordCount: students.length
    }
  }
}

module.exports = { exportStudentHandler }
