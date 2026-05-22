// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { getCallerInfo, requireTeacherOrModule, AUTH_ERRORS } = require('./utils/auth')

/**
 * 删除记录并回退积分的云函数
 * 支持：考勤记录、志愿服务记录、卫生值日记录
 * 
 * @param {string} recordType - 记录类型：attendance(考勤) 或 volunteer(志愿服务) 或 duty(卫生值日)
 * @param {string} recordId - 记录ID
 * @param {string} classId - 班级ID（用于鉴权）
 */
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command
  const { action, data } = event
  const params = (data && typeof data === 'object') ? data : event
  const { recordType, recordId, classId } = params

  if (!recordType || !recordId) {
    return {
      success: false,
      message: '缺少必要参数'
    }
  }

  try {
    const caller = await getCallerInfo(event, classId)
    await requireTeacherOrModule(caller, 'score')

    let record = null
    let studentId = ''
    let scoreChange = 0
    let collectionName = ''
    let relatedScoreRecordId = ''
    let sourceTypeLabel = ''

    if (recordType === 'attendance') {
      collectionName = 'attendance_records'
      sourceTypeLabel = '考勤'
      const res = await db.collection('attendance_records').doc(recordId).get()
      if (!res.data) {
        return { success: false, message: '考勤记录不存在' }
      }
      record = res.data
      studentId = record.student_id
      scoreChange = record.score_change || 0
      relatedScoreRecordId = record.related_score_record_id || ''
    } else if (recordType === 'volunteer') {
      collectionName = 'volunteer_records'
      sourceTypeLabel = '志愿服务'
      const res = await db.collection('volunteer_records').doc(recordId).get()
      if (!res.data) {
        return { success: false, message: '志愿服务记录不存在' }
      }
      record = res.data
      studentId = record.student_id
      scoreChange = record.score_change || 0
      relatedScoreRecordId = record.related_score_record_id || ''
    } else if (recordType === 'duty') {
      collectionName = 'duty_tasks'
      sourceTypeLabel = '卫生值日'
      const res = await db.collection('duty_tasks').doc(recordId).get()
      if (!res.data) {
        return { success: false, message: '值日记录不存在' }
      }
      record = res.data
      studentId = record.student_id
      scoreChange = record.score_change || 0
      relatedScoreRecordId = record.related_score_record_id || ''
    } else {
      return { success: false, message: '不支持的记录类型' }
    }

    if (caller.role !== 'admin' && record.class_id && record.class_id !== caller.classId) {
      return { success: false, message: '无权删除其他班级的记录', code: AUTH_ERRORS.CLASS_DENIED }
    }

    await db.collection(collectionName).doc(recordId).remove()

    if (relatedScoreRecordId) {
      await db.collection('score_records').doc(relatedScoreRecordId).remove()
    } else {
      const scoreRecordsRes = await db.collection('score_records')
        .where({
          student_id: studentId,
          source_type: sourceTypeLabel,
          source_record_id: recordId
        })
        .get()
      
      if (scoreRecordsRes.data && scoreRecordsRes.data.length > 0) {
        for (const sr of scoreRecordsRes.data) {
          await db.collection('score_records').doc(sr._id).remove()
        }
      }
    }

    if (scoreChange !== 0) {
      const reverseChange = -scoreChange
      try {
        await db.collection('students')
          .where({ student_id: studentId })
          .update({
            data: {
              current_score: _.inc(reverseChange),
              updated_at: db.serverDate()
            }
          })
      } catch (incErr) {
        console.error('原子操作回退失败，尝试补偿:', incErr)
        const studentRes = await db.collection('students')
          .where({ student_id: studentId })
          .get()
        if (studentRes.data && studentRes.data.length > 0) {
          const student = studentRes.data[0]
          const newScore = Math.max(0, (student.current_score || 100) + reverseChange)
          await db.collection('students').doc(student._id).update({
            data: {
              current_score: newScore,
              updated_at: db.serverDate()
            }
          })
        }
      }
    }

    return {
      success: true,
      message: '删除成功，积分已回退',
      data: {
        recordType,
        recordId,
        scoreReversed: scoreChange !== 0
      }
    }

  } catch (err) {
    console.error('删除记录失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return {
      success: false,
      message: '删除失败: ' + err.message,
      error: err
    }
  }
}
