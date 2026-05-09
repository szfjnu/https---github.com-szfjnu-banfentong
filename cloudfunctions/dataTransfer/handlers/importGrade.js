const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { ALLOWED_IMPORT_ROLES } = require('../config/constants')
const strategyManager = require('../strategies/strategyManager')
const logger = require('../utils/logger')
const { checkPermission } = require('../utils/permission')

async function doPreview(fileID, classId, term, examType, subject) {
  const fileName = fileID.split('/').pop()
  const format = strategyManager.detectFormat(fileName)
  const strategy = strategyManager.getStrategy(format)
  const result = await strategy.parseGrade(fileID, { classId, term, examType, subject })

  for (const row of result.rows) {
    if (row.valid && row.grade) {
      if (classId) row.grade.class_id = classId
      if (term) row.grade.term = term
      if (examType) row.grade.exam_type = examType
    }
  }

  return result
}

async function importGradeHandler(data, OPENID) {
  const { fileID, classId, term, examType, subject, confirm, previewData } = data

  await checkPermission(OPENID, ALLOWED_IMPORT_ROLES)

  if (!confirm) {
    const previewResult = await doPreview(fileID, classId, term, examType, subject)
    await logger.log({
      action: 'importGrade_preview',
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

  const validRows = (previewData || []).filter(r => r.valid)
  const errors = []
  let successCount = 0
  let failCount = 0

  for (const row of validRows) {
    try {
      const grade = { ...row.grade }
      if (classId) grade.class_id = classId
      if (term) grade.term = term
      if (examType) grade.exam_type = examType

      grade.score = Number(grade.score)
      grade.is_pass = grade.score >= 60
      grade.created_at = db.serverDate()
      grade.updated_at = db.serverDate()
      grade.created_by = OPENID

      await db.collection('grades').add({ data: grade })
      successCount++
    } catch (e) {
      failCount++
      errors.push(`第${row.rowIndex}行: ${e.message}`)
    }
  }

  await logger.log({
    action: 'importGrade_import',
    operator: OPENID,
    dataCount: validRows.length,
    result: failCount === 0 ? 'success' : 'partial',
    classId
  })

  return {
    success: true,
    data: { successCount, failCount, errors }
  }
}

module.exports = { importGradeHandler }
