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

  const validStudentIds = []
  for (const row of result.rows) {
    if (row.valid && row.student.student_id) {
      validStudentIds.push(row.student.student_id)
    }
  }

  const existingMap = {}
  if (validStudentIds.length > 0) {
    const uniqueIds = [...new Set(validStudentIds)]
    for (let i = 0; i < uniqueIds.length; i += 20) {
      const batch = uniqueIds.slice(i, i + 20)
      const { data: existing } = await db.collection('students')
        .where({
          student_id: _.in(batch),
          class_id: classId
        })
        .get()
      for (const s of existing) {
        existingMap[s.student_id] = s._id
      }
    }
  }

  let duplicateCount = 0
  for (const row of result.rows) {
    if (row.valid) {
      row.student.class_id = classId
      row.student.class_name = className

      if (row.student.student_id && existingMap[row.student.student_id]) {
        row.duplicate = true
        row.existingDocId = existingMap[row.student.student_id]
        duplicateCount++
      }
    }
  }

  result.duplicateCount = duplicateCount
  return result
}

async function doImport(previewData, classId, className, overwrite) {
  const validRows = previewData.filter(r => r.valid)
  const errors = []
  let successCount = 0
  let failCount = 0
  let skipCount = 0
  let overwriteCount = 0

  const studentIds = validRows.filter(r => r.student.student_id && !r.duplicate).map(r => r.student.student_id)
  const existingMap = {}
  if (studentIds.length > 0) {
    const uniqueIds = [...new Set(studentIds)]
    for (let i = 0; i < uniqueIds.length; i += 20) {
      const batch = uniqueIds.slice(i, i + 20)
      const { data: existing } = await db.collection('students')
        .where({ student_id: _.in(batch), class_id: classId })
        .get()
      for (const s of existing) {
        existingMap[s.student_id] = s._id
      }
    }
  }

  for (const row of validRows) {
    try {
      const student = { ...row.student, class_id: classId, class_name: className }
      if (student.current_score === undefined) student.current_score = student.initial_score || 100
      if (student.initial_score === undefined) student.initial_score = 100
      if (student.dorm_score === undefined) student.dorm_score = 100
      if (!student.updated_at) student.updated_at = db.serverDate()

      let existingDocId = row.existingDocId || null
      if (!existingDocId && student.student_id) {
        existingDocId = existingMap[student.student_id] || null
      }

      if (existingDocId || row.duplicate) {
        if (overwrite && (row.duplicate || existingDocId)) {
          const docId = existingDocId || row.existingDocId
          if (docId) {
            const { _id, created_at, ...updateData } = student
            await db.collection('students').doc(docId).update({ data: updateData })
            overwriteCount++
            successCount++
          }
        } else {
          skipCount++
        }
        continue
      }

      if (!student.created_at) student.created_at = db.serverDate()
      await db.collection('students').add({ data: student })
      successCount++
    } catch (e) {
      failCount++
      errors.push(`第${row.rowIndex}行: ${e.message}`)
    }
  }

  return { successCount, failCount, skipCount, overwriteCount, errors }
}

async function doDirectImport(students, classId, OPENID) {
  if (!classId) {
    const relRes = await db.collection('user_class_relation')
      .where({ user_openid: OPENID, status: 'joined' })
      .limit(1).get()
    if (relRes.data && relRes.data.length > 0) {
      classId = relRes.data[0].class_id
    }
  }

  if (!classId) {
    return { success: false, message: '缺少班级ID，且无法自动获取当前用户班级' }
  }

  const existingMap = {}
  const studentIds = students.filter(s => s.student_id).map(s => s.student_id)
  if (studentIds.length > 0) {
    const uniqueIds = [...new Set(studentIds)]
    for (let i = 0; i < uniqueIds.length; i += 20) {
      const batch = uniqueIds.slice(i, i + 20)
      const { data: existing } = await db.collection('students')
        .where({ student_id: _.in(batch), class_id: classId })
        .get()
      for (const s of existing) {
        existingMap[s.student_id] = s._id
      }
    }
  }

  const errors = []
  let successCount = 0
  let failCount = 0
  let skipCount = 0
  let overwriteCount = 0

  for (const student of students) {
    try {
      student.class_id = classId
      if (!student.created_at) student.created_at = db.serverDate()
      if (!student.updated_at) student.updated_at = db.serverDate()
      if (student.current_score === undefined) student.current_score = student.initial_score || 100
      if (student.initial_score === undefined) student.initial_score = 100
      if (student.dorm_score === undefined) student.dorm_score = 100

      if (student.student_id && existingMap[student.student_id]) {
        const { _id, created_at, ...updateData } = student
        await db.collection('students').doc(existingMap[student.student_id]).update({ data: updateData })
        overwriteCount++
        successCount++
        continue
      }

      await db.collection('students').add({ data: student })
      successCount++
    } catch (e) {
      failCount++
      errors.push(`导入失败: ${e.message}`)
    }
  }

  return { success: true, data: { successCount, failCount, skipCount, overwriteCount, errors } }
}

async function importStudentHandler(data, OPENID) {
  let { fileID, classId, className, confirm, previewData, overwrite, students } = data

  if (students && Array.isArray(students) && students.length > 0) {
    return await doDirectImport(students, classId || data.class_id, OPENID)
  }

  if (!classId) {
    classId = data.class_id
  }

  if (!classId) {
    const relRes = await db.collection('user_class_relation')
      .where({ user_openid: OPENID, status: 'joined' })
      .limit(1)
      .get()
    if (relRes.data && relRes.data.length > 0) {
      classId = relRes.data[0].class_id
      if (!className) {
        try {
          const classRes = await db.collection('classes').doc(classId).get()
          className = classRes.data.class_name || ''
        } catch (e) { className = '' }
      }
    }
  }

  if (!classId) {
    return { success: false, message: '缺少班级ID，且无法自动获取当前用户班级' }
  }

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

  const result = await doImport(previewData, classId, className, overwrite)
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
