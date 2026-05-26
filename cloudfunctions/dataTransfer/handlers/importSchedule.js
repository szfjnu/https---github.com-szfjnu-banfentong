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
  const fileFormat = strategyManager.detectFormat(fileName)
  let effectiveFormat = fileFormat
  let scheduleFormat = 'flat'

  if (fileFormat === 'excel') {
    try {
      const formatResult = await strategyManager.detectScheduleFormat(fileID)
      if (formatResult.formatType === 'matrix') {
        effectiveFormat = 'matrix'
        scheduleFormat = 'matrix'
      }
    } catch (e) {
      console.error('检测课表格式失败，降级为扁平格式:', e)
    }
  }

  const strategy = strategyManager.getStrategy(effectiveFormat)
  const result = await strategy.parseSchedule(fileID, { classId, className, semesterName })

  for (const row of result.rows) {
    if (row.valid) {
      if (classId) row.schedule.class_id = classId
      if (className) row.schedule.class_name = className
      if (semesterName) row.schedule.semester_name = semesterName
    }
  }

  result.formatType = scheduleFormat
  return result
}

async function doImport(previewData, classId, className, semesterName, scheduleTypeId, semesterId) {
  const validRows = previewData.filter(r => r.valid)
  const errors = []
  let successCount = 0
  let failCount = 0
  let skipCount = 0

  const VALID_TYPE_IDS = ['class_schedule', 'teacher_schedule']
  const resolvedTypeId = VALID_TYPE_IDS.includes(scheduleTypeId) ? scheduleTypeId : 'class_schedule'

  if (classId) {
    try {
      const deleteQuery = { class_id: classId, schedule_type_id: resolvedTypeId }
      if (semesterName) deleteQuery.semester_name = semesterName
      let skip = 0
      while (true) {
        const oldRecords = await db.collection('schedules')
          .where(deleteQuery)
          .skip(skip)
          .limit(100)
          .get()
        for (const old of oldRecords.data) {
          await db.collection('schedules').doc(old._id).remove()
        }
        if (oldRecords.data.length < 100) break
        skip += 100
      }
    } catch (e) {
      console.error('清除旧课表失败:', e)
    }
  }

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE)
    const tasks = batch.map(async (row) => {
      try {
        const schedule = { ...row.schedule }
        if (classId) schedule.class_id = classId
        if (className) schedule.class_name = className
        if (semesterName) schedule.semester_name = semesterName
        schedule.schedule_type_id = row.schedule.schedule_type_id || resolvedTypeId
        schedule.schedule_type = row.schedule.schedule_type || '课程'
        if (semesterId) schedule.semester_id = semesterId

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
  const { fileID, classId, className, semesterName, semesterId, confirm, previewData, scheduleTypeId } = data

  

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

  const result = await doImport(previewData, classId, className, semesterName, scheduleTypeId, semesterId)
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
