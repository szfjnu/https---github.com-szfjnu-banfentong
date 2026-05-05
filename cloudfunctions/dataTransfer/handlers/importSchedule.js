const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { BATCH_SIZE, ALLOWED_IMPORT_ROLES } = require('../config/constants')
const strategyManager = require('../strategies/strategyManager')
const scheduleValidator = require('../utils/scheduleValidator')
const logger = require('../utils/logger')
const { checkPermission } = require('../utils/permission')

async function doPreview(fileID, classId, className, semesterName) {
  const fileName = fileID.split('/').pop()
  const format = strategyManager.detectFormat(fileName)
  const strategy = strategyManager.getStrategy(format)
  const result = await strategy.parseSchedule(fileID, { classId, className, semesterName })

  for (const row of result.rows) {
    if (row.valid) {
      if (classId) row.schedule.class_id = classId
      if (className) row.schedule.class_name = className
      if (semesterName) row.schedule.semester_name = semesterName
    }
  }

  return result
}

async function doImport(previewData, classId, className, semesterName) {
  const validRows = previewData.filter(r => r.valid)
  const errors = []
  let successCount = 0
  let failCount = 0
  let skipCount = 0

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE)
    const tasks = batch.map(async (row) => {
      try {
        const schedule = { ...row.schedule }
        if (classId) schedule.class_id = classId
        if (className) schedule.class_name = className
        if (semesterName) schedule.semester_name = semesterName

        if (schedule.teacher_name && !schedule.teacher_openid) {
          try {
            const teacherRes = await db.collection('users')
              .where(_.or([
                { realName: schedule.teacher_name },
                { name: schedule.teacher_name },
                { nickName: schedule.teacher_name }
              ]))
              .limit(1)
              .get()
            if (teacherRes.data && teacherRes.data.length > 0) {
              schedule.teacher_openid = teacherRes.data[0]._openid
            }
          } catch (e) {
            console.error('查找教师openid失败:', e)
          }
        }

        const now = Date.now()
        schedule.updatedAt = now
        if (!schedule.createdAt) schedule.createdAt = now

        const { data: existing } = await db.collection('schedules')
          .where({
            schedule_id: schedule.schedule_id
          })
          .limit(1)
          .get()

        if (existing.length > 0) {
          skipCount++
          return
        }

        await db.collection('schedules').add({ data: schedule })
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

async function importScheduleHandler(data, OPENID) {
  const { fileID, classId, className, semesterName, confirm, previewData } = data

  await checkPermission(OPENID, ALLOWED_IMPORT_ROLES)

  if (!confirm) {
    const previewResult = await doPreview(fileID, classId, className, semesterName)
    await logger.log({
      action: 'importSchedule_preview',
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

  const result = await doImport(previewData, classId, className, semesterName)
  await logger.log({
    action: 'importSchedule_import',
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

module.exports = { importScheduleHandler }
