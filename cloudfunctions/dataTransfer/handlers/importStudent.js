const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { BATCH_SIZE, ALLOWED_IMPORT_ROLES } = require('../config/constants')
const strategyManager = require('../strategies/strategyManager')
const logger = require('../utils/logger')
const { checkPermission } = require('../utils/permission')

async function doPreview(fileID, classId, className) {
  const fileName = fileID.split('/').pop()
  const format = strategyManager.detectFormat(fileName)
  const strategy = strategyManager.getStrategy(format)
  const result = await strategy.parse(fileID, { classId, className })

  for (const row of result.rows) {
    if (row.valid) {
      row.student.class_id = classId
      row.student.class_name = className
    }
  }

  return result
}

async function doImport(previewData, classId, className) {
  const validRows = previewData.filter(r => r.valid)
  const errors = []
  let successCount = 0
  let failCount = 0
  let skipCount = 0

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE)
    const tasks = batch.map(async (row, idx) => {
      try {
        const student = { ...row.student, class_id: classId, class_name: className }
        if (student.current_score === undefined) student.current_score = student.initial_score || 100
        if (student.initial_score === undefined) student.initial_score = 100
        if (student.dorm_score === undefined) student.dorm_score = 100
        if (!student.created_at) student.created_at = db.serverDate()
        if (!student.updated_at) student.updated_at = db.serverDate()
        const { data: existing } = await db.collection('students')
          .where({
            student_id: student.student_id,
            class_id: classId
          })
          .limit(1)
          .get()

        if (existing.length > 0) {
          skipCount++
          return
        }

        await db.collection('students').add({ data: student })
        successCount++
      } catch (e) {
        failCount++
        errors.push(`第${row.rowIndex}行: ${e.message}`)
      }
    })
    await Promise.all(tasks)
  }

  return { successCount, failCount, skipCount, errors }
}

async function importStudentHandler(data, OPENID) {
  const { fileID, classId, className, confirm, previewData } = data

  await checkPermission(OPENID, ALLOWED_IMPORT_ROLES)

  if (!confirm) {
    const previewResult = await doPreview(fileID, classId, className)
    await logger.log({
      action: 'importStudent_preview',
      operator: OPENID,
      dataCount: previewResult.rows.length,
      result: 'success',
      classId
    })
    return {
      success: true,
      data: previewResult
    }
  }

  const result = await doImport(previewData, classId, className)
  await logger.log({
    action: 'importStudent_import',
    operator: OPENID,
    dataCount: previewData.length,
    result: result.failCount === 0 ? 'success' : 'partial',
    classId
  })
  return {
    success: true,
    data: result
  }
}

module.exports = { importStudentHandler }
