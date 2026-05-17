const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const { getCallerInfo, requireTeacher, requireTeacherOrDelegated, AUTH_ERRORS } = require('./utils/auth')

exports.main = async (event, context) => {
  const { action, data } = event
  const effectiveAction = action || 'convertDormScore'

  try {
    const caller = await getCallerInfo(event, data?.class_id)
    await requireTeacherOrDelegated(caller, 'dorm_score', 'write')

    switch (effectiveAction) {
      case 'convertDormScore':
      case 'adjustDormScore':
        return await adjustDormScore(data || event, caller)
      case 'batchConvertDormScore':
        return await batchConvertDormScore(data || {}, caller)
      case 'addDormScoreRecord':
        return await addDormScoreRecord(data || {}, caller)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('宿舍积分折算失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return {
      success: false,
      message: `折算失败: ${err.message}`
    }
  }
}

async function adjustDormScore(data, caller) {
  const { student_id, dorm_score_change, semester_id, class_id } = data

  if (!student_id || dorm_score_change === undefined || dorm_score_change === null) {
    return { success: false, message: '缺少必要参数: student_id, dorm_score_change' }
  }

  if (!class_id) {
    console.error('convertDormScore class_id缺失:', { student_id, class_id })
    return { success: false, message: '班级信息缺失，无法保存' }
  }

  let semesterQuery = { status: 'active' }
  if (class_id) {
    semesterQuery = { class_id: class_id, status: 'active' }
  }
  let semesterRes = await db.collection('semesters').where(semesterQuery).get()

  if (semesterRes.data.length === 0 && class_id) {
    const fallbackRes = await db.collection('semesters').where({ status: 'active' }).get()
    if (fallbackRes.data.length > 0) {
      semesterRes = fallbackRes
    }
  }

  if (semesterRes.data.length === 0) {
    return {
      success: false,
      message: '未找到当前学期'
    }
  }

  const currentSemester = semesterRes.data[0]
  const targetSemesterId = semester_id || currentSemester._id
  const conversionRatio = currentSemester.dorm_conversion_ratio || 0.3

  let dormAccount
  const accountRes = await db.collection('dorm_score_accounts').where({
    student_id: student_id,
    semester_id: targetSemesterId
  }).get()

  if (accountRes.data.length === 0) {
    const createRes = await db.collection('dorm_score_accounts').add({
      data: {
        student_id: student_id,
        class_id: class_id,
        semester_id: targetSemesterId,
        original_score: 100,
        converted_score: 0,
        conversion_ratio: conversionRatio,
        warning_count: 0,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    })
    dormAccount = { _id: createRes._id }
  } else {
    dormAccount = accountRes.data[0]
  }

  const convertedScoreChange = Math.round(dorm_score_change * conversionRatio * 100) / 100

  await db.collection('dorm_score_accounts').doc(dormAccount._id).update({
    data: {
      original_score: _.inc(dorm_score_change),
      current_score: _.inc(dorm_score_change),
      converted_score: _.inc(convertedScoreChange),
      updated_at: db.serverDate()
    }
  })

  if (convertedScoreChange !== 0) {
    await db.collection('score_records').add({
      data: {
        student_id: student_id,
        class_id: class_id,
        item_id: 'DORM_CONVERSION',
        score_change: convertedScoreChange,
        reason_detail: `宿舍积分折算 (系数${conversionRatio})`,
        date: db.serverDate(),
        recorder_name: '系统自动',
        recorder_openid: caller.openid,
        semester_id: targetSemesterId,
        source_type: '宿舍折算',
        approval_status: '已通过',
        created_at: db.serverDate()
      }
    })

    const studentRes = await db.collection('students').where({
      student_id: student_id
    }).get()

    if (studentRes.data.length > 0) {
      const currentStudent = studentRes.data[0]
      const newScore = (currentStudent.current_score || 100) + convertedScoreChange
      const newScoreLevel = calculateScoreLevel(newScore)

      await db.collection('students').where({
        student_id: student_id
      }).update({
        data: {
          current_score: _.inc(convertedScoreChange),
          dorm_converted_score: _.inc(convertedScoreChange),
          score_level: newScoreLevel,
          updated_at: db.serverDate()
        }
      })
    }
  }

  const updatedAccountRes = await db.collection('dorm_score_accounts').doc(dormAccount._id).get()
  const updatedAccount = updatedAccountRes.data
  const warningThreshold = currentSemester.dorm_warning_threshold || 60
  const criticalThreshold = currentSemester.dorm_critical_threshold || 40

  let warningType = null
  if (updatedAccount.original_score <= criticalThreshold) {
    warningType = '勒令退宿'
  } else if (updatedAccount.original_score <= warningThreshold) {
    warningType = '留宿察看'
  }

  if (warningType) {
    await db.collection('dorm_score_accounts').doc(dormAccount._id).update({
      data: {
        last_warning_type: warningType,
        warning_count: _.inc(1),
        updated_at: db.serverDate()
      }
    })
  }

  return {
    success: true,
    message: '宿舍积分折算完成',
    data: {
      student_id,
      dorm_score_change: dorm_score_change,
      converted_score_change: convertedScoreChange,
      conversion_ratio: conversionRatio,
      warning_type: warningType
    }
  }
}

async function batchConvertDormScore(data, caller) {
  const { students, semester_id, class_id } = data || {}
  if (!students || !Array.isArray(students) || students.length === 0) {
    return { success: false, message: '缺少必要参数: students(非空数组)' }
  }

  const results = []
  const errors = []

  for (const item of students) {
    try {
      const result = await adjustDormScore({
        student_id: item.student_id,
        dorm_score_change: item.dorm_score_change,
        semester_id,
        class_id
      }, caller)
      if (result.success) {
        results.push({ student_id: item.student_id, ...result.data })
      } else {
        errors.push({ student_id: item.student_id, message: result.message })
      }
    } catch (err) {
      errors.push({ student_id: item.student_id, message: err.message })
    }
  }

  return {
    success: true,
    message: `批量折算完成: ${results.length}成功, ${errors.length}失败`,
    data: { results, errors, total: students.length, successCount: results.length, failCount: errors.length }
  }
}

function calculateScoreLevel(score) {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 70) return '中等'
  if (score >= 60) return '及格'
  return '不及格'
}

async function addDormScoreRecord(data, caller) {
  const { class_id, semester_id, student_id, item_name, score_change, building, room, date, link_to_personal } = data

  if (!class_id || !student_id || score_change === undefined) {
    return { success: false, message: '缺少必要参数: class_id, student_id, score_change' }
  }

  let semesterId = semester_id
  if (!semesterId) {
    const semesterRes = await db.collection('semesters').where({ class_id, status: 'active' }).get()
    if (semesterRes.data.length === 0) {
      const fallbackRes = await db.collection('semesters').where({ status: 'active' }).get()
      if (fallbackRes.data.length === 0) return { success: false, message: '未找到当前学期' }
      semesterId = fallbackRes.data[0]._id
    } else {
      semesterId = semesterRes.data[0]._id
    }
  }

  const recordData = {
    class_id,
    semester_id: semesterId,
    student_id,
    item_name: item_name || '宿舍积分记录',
    score_change,
    building: building || '',
    room: room || '',
    date: date || new Date().toISOString().split('T')[0],
    link_to_personal: link_to_personal !== false,
    created_at: db.serverDate()
  }

  const addRes = await db.collection('dorm_score_records').add({ data: recordData })

  if (link_to_personal !== false) {
    await adjustDormScore({
      student_id,
      dorm_score_change: score_change,
      semester_id: semesterId,
      class_id
    }, caller)
  }

  return { success: true, message: '宿舍积分记录已添加', data: { record_id: addRes._id } }
}
