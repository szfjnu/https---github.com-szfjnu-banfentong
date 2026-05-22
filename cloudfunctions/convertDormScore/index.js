const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const { getCallerInfo, requireTeacherOrModule, AUTH_ERRORS } = require('./utils/auth')

exports.main = async (event, context) => {
  const { action, data } = event
  const effectiveAction = action || 'convertDormScore'

  try {
    const caller = await getCallerInfo(event, data?.class_id)
    await requireTeacherOrModule(caller, 'dorm_score')

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
  const {
    student_id, dorm_score_change, semester_id, class_id,
    record_type, rule_id, rule_name, rule_category, dorm_info,
    remark, source_record_id, item_id, item_name,
    recorder_name: dataRecorderName, recorder_openid: dataRecorderOpenid
  } = data

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
  const now = db.serverDate()

  // 1. 写入 dorm_score_records（宿舍积分明细记录）
  // 仅在非 batchConvertDormScore 流程时写入（batch 流程已自行写入）
  if (!source_record_id) {
    // 兼容 dorm_info 的两种格式：字符串("A栋-301") 或 对象({building, room})
    let buildingValue = ''
    let roomValue = ''
    if (dorm_info && typeof dorm_info === 'object') {
      buildingValue = dorm_info.building || ''
      roomValue = dorm_info.room || ''
    } else if (dorm_info && typeof dorm_info === 'string' && dorm_info.includes('-')) {
      const parts = dorm_info.split('-')
      buildingValue = parts[0] || ''
      roomValue = parts[1] || ''
    }
    const dormRecordId = `DSR${Date.now()}${Math.random().toString(36).substr(2, 9)}`
    const dormRecordData = {
      record_id: dormRecordId,
      student_id,
      class_id,
      semester_id: targetSemesterId,
      item_id: item_id || rule_id || '',
      item_name: item_name || rule_name || '宿舍积分变更',
      record_type: record_type || (dorm_score_change >= 0 ? 'service' : 'violation'),
      building: buildingValue,
      room: roomValue,
      score_change: dorm_score_change,
      score_value: dorm_score_change,
      dorm_score: Math.abs(dorm_score_change),
      conversion_ratio: conversionRatio,
      remark: remark || '',
      recorder_name: dataRecorderName || caller.realName || '管理员',
      recorder_openid: dataRecorderOpenid || caller.openid,
      record_date: now,
      created_at: now,
      updated_at: now
    }
    await db.collection('dorm_score_records').add({ data: dormRecordData })
  }

  // 2. 更新 dorm_score_accounts（宿舍积分账户）
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
        current_score: 100,
        converted_score: 0,
        conversion_ratio: conversionRatio,
        warning_count: 0,
        created_at: now,
        updated_at: now
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
      updated_at: now
    }
  })

  // 3. 同步个人积分（score_records + students.current_score）
  if (convertedScoreChange !== 0) {
    const stuRes = await db.collection('students')
      .where({ student_id, class_id })
      .limit(1)
      .get()

    if (stuRes.data && stuRes.data.length > 0) {
      const student = stuRes.data[0]
      const scoreBefore = student.current_score !== undefined && student.current_score !== null
        ? Number(student.current_score) : 100
      const scoreAfter = scoreBefore + convertedScoreChange
      const scoreRecordId = `SR${Date.now()}${Math.random().toString(36).substr(2, 9)}`

      const effectiveItemName = item_name || rule_name || '宿舍积分折算'
      const effectiveReason = remark
        ? `${effectiveItemName} (系数${conversionRatio}, ${remark})`
        : `${effectiveItemName} (系数${conversionRatio})`

      await db.collection('score_records').add({
        data: {
          record_id: scoreRecordId,
          record_type: 'record',
          student_id,
          student_name: student.name || student.student_name || '',
          class_id,
          semester_id: targetSemesterId,
          item_id: item_id || rule_id || 'DORM_CONVERSION',
          item_name: effectiveItemName,
          rule_id: rule_id || '',
          rule_name: rule_name || effectiveItemName,
          rule_code: 'DORM_SCORE',
          rule_category: rule_category || '宿舍管理',
          score_change: convertedScoreChange,
          score_value: convertedScoreChange,
          score_before: scoreBefore,
          score_after: scoreAfter,
          score_type: convertedScoreChange >= 0 ? '加分' : '扣分',
          reason_detail: effectiveReason,
          source_type: '宿舍管理',
          source_record_id: source_record_id || '',
          approval_status: '已通过',
          status: '已确认',
          recorder_openid: caller.openid,
          recorder_name: caller.realName || '',
          created_at: now,
          updated_at: now
        }
      })

      const newScoreLevel = calculateScoreLevel(scoreAfter)
      await db.collection('students').doc(student._id).update({
        data: {
          current_score: scoreAfter,
          dorm_converted_score: _.inc(convertedScoreChange),
          score_level: newScoreLevel,
          updated_at: now
        }
      })
    }
  }

  // 4. 预警检测
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
        updated_at: now
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
  const { students, student_ids, score_change, semester_id, class_id,
    record_type, select_mode, dorm_info, item_id, item_name,
    dorm_score, conversion_ratio, link_to_personal, remark, recorder_name, recorder_openid
  } = data || {}

  // 兼容两种参数格式：
  // 1. 旧格式: { students: [{ student_id, dorm_score_change }] }
  // 2. 新格式: { student_ids: [...], score_change, ... }（来自前端add.js）
  let studentList = []
  let commonScoreChange = score_change

  if (students && Array.isArray(students) && students.length > 0) {
    studentList = students
  } else if (student_ids && Array.isArray(student_ids) && student_ids.length > 0) {
    studentList = student_ids.map(sid => ({ student_id: sid, dorm_score_change: commonScoreChange }))
  } else {
    return { success: false, message: '缺少必要参数: students 或 student_ids(非空数组)' }
  }

  if (!class_id) {
    return { success: false, message: '缺少必要参数: class_id' }
  }

  const results = []
  const errors = []

  for (const item of studentList) {
    try {
      const sid = item.student_id
      const dormScoreChange = item.dorm_score_change || commonScoreChange

      // batchConvertDormScore 不单独写 dorm_score_records，
      // 因为 adjustDormScore 内部会处理（source_record_id 为空时自动写入）
      const result = await adjustDormScore({
        student_id: sid,
        dorm_score_change: dormScoreChange,
        semester_id,
        class_id,
        record_type,
        item_id,
        item_name,
        rule_id: item_id,
        rule_name: item_name,
        rule_category: '宿舍管理',
        dorm_info,
        remark,
        link_to_personal,
        recorder_name,
        recorder_openid
      }, caller)

      if (result.success) {
        results.push({ student_id: sid, ...result.data })
      } else {
        errors.push({ student_id: sid, message: result.message })
      }
    } catch (err) {
      errors.push({ student_id: item.student_id, message: err.message })
    }
  }

  return {
    success: true,
    message: `批量处理完成: ${results.length}成功, ${errors.length}失败`,
    data: {
      results,
      errors,
      total: studentList.length,
      successCount: results.length,
      failCount: errors.length,
      record_id: results.length > 0 ? results[0].record_id || '' : ''
    }
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

  // adjustDormScore 内部会写入 dorm_score_records + dorm_score_accounts + score_records + students
  const result = await adjustDormScore({
    student_id,
    dorm_score_change: score_change,
    semester_id,
    class_id,
    item_name: item_name || '宿舍积分记录',
    dorm_info: { building: building || '', room: room || '' },
    link_to_personal: link_to_personal !== false
  }, caller)

  return result
}
