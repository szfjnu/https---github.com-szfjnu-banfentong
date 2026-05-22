const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { getCallerInfo, requireTeacherOrModule, AUTH_ERRORS } = require('./utils/auth')

exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command
  const { action, data } = event

  try {
    switch (action) {
      case 'batchReset':
        return await batchReset(data || {}, event)
      case 'logReset':
        return await logReset(data || {}, event)
      default:
        return await legacyReset(event)
    }
  } catch (err) {
    console.error('重置积分失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return {
      success: false,
      message: '重置失败: ' + err.message,
      error: err
    }
  }
}

async function batchReset(data, event) {
  const db = cloud.database()
  const _ = db.command
  const { classId, semesterId, resetSettings, students } = data

  if (!classId) {
    return { success: false, message: '缺少班级ID' }
  }

  const caller = await getCallerInfo(event, classId)
  await requireTeacherOrModule(caller, 'score')

  const initialScore = resetSettings?.initial_score || 100
  let query = { class_id: classId }
  let studentList = []

  if (students && students.length > 0) {
    studentList = students
  } else {
    const studentsRes = await db.collection('students').where(query).get()
    studentList = studentsRes.data || []
  }

  if (studentList.length === 0) {
    return { success: false, message: '没有找到符合条件的学生' }
  }

  const updatePromises = studentList.map(student => {
    const docId = student._id
    return db.collection('students').doc(docId).update({
      data: {
        current_score: initialScore,
        initial_score: initialScore,
        updated_at: db.serverDate()
      }
    })
  })

  await Promise.all(updatePromises)

  return {
    success: true,
    message: `成功重置 ${studentList.length} 名学生的积分`,
    data: { count: studentList.length, initialScore }
  }
}

async function logReset(data, event) {
  const db = cloud.database()
  const { classId, semesterId, resetScope, resetRules, affectedCount, totalScoreReset, operatorId, operatorName, operatorRole } = data

  if (!classId) {
    return { success: false, message: '缺少班级ID' }
  }

  const caller = await getCallerInfo(event, classId)
  await requireTeacherOrModule(caller, 'score')

  await db.collection('score_reset_logs').add({
    data: {
      reset_type: resetScope || 'class',
      class_id: classId,
      semester_id: semesterId || '',
      reset_scope: resetScope || '',
      reset_rules: resetRules || {},
      student_count: affectedCount || 0,
      total_score_reset: totalScoreReset || 0,
      reset_by: caller.openid,
      operator_id: operatorId || '',
      operator_name: operatorName || '',
      operator_role: operatorRole || '',
      reset_at: db.serverDate(),
      created_at: db.serverDate()
    }
  })

  return { success: true, message: '日志记录成功' }
}

async function legacyReset(event) {
  const db = cloud.database()
  const _ = db.command
  const { classId, studentId, initialScore = 100, semesterId } = event

  const caller = await getCallerInfo(event, classId)
  await requireTeacherOrModule(caller, 'score')

  let query = {}
  if (studentId) {
    query.student_id = studentId
  } else if (classId) {
    query.class_id = classId
  }

  const studentsRes = await db.collection('students')
    .where(query)
    .get()

  const students = studentsRes.data || []

  if (students.length === 0) {
    return {
      success: false,
      message: '没有找到符合条件的学生'
    }
  }

  console.log(`准备重置 ${students.length} 名学生的积分`)

  const updatePromises = students.map(student => {
    return db.collection('students').doc(student._id).update({
      data: {
        current_score: initialScore,
        initial_score: initialScore,
        updated_at: db.serverDate()
      }
    })
  })

  await Promise.all(updatePromises)
  console.log('学生积分已重置')

  if (semesterId) {
    await db.collection('score_reset_logs').add({
      data: {
        reset_type: studentId ? 'single' : (classId ? 'class' : 'all'),
        class_id: classId || '',
        student_id: studentId || '',
        student_count: students.length,
        initial_score: initialScore,
        semester_id: semesterId,
        reset_by: caller.openid,
        reset_at: db.serverDate(),
        created_at: db.serverDate()
      }
    })
  }

  return {
    success: true,
    message: `成功重置 ${students.length} 名学生的积分`,
    data: {
      count: students.length,
      initialScore
    }
  }
}
