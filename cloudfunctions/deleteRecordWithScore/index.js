// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 删除记录并回退积分的云函数
 * 支持：考勤记录、志愿服务记录
 * 
 * @param {string} recordType - 记录类型：attendance(考勤) 或 volunteer(志愿服务)
 * @param {string} recordId - 记录ID
 */
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command
  const { recordType, recordId } = event

  if (!recordType || !recordId) {
    return {
      success: false,
      message: '缺少必要参数'
    }
  }

  try {
    let record = null
    let studentId = ''
    let scoreChange = 0
    let collectionName = ''
    let relatedScoreRecordId = ''

    // 根据记录类型获取记录信息
    if (recordType === 'attendance') {
      collectionName = 'attendance_records'
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
      const res = await db.collection('volunteer_records').doc(recordId).get()
      if (!res.data) {
        return { success: false, message: '志愿服务记录不存在' }
      }
      record = res.data
      studentId = record.student_id
      scoreChange = record.score_change || 0
      relatedScoreRecordId = record.related_score_record_id || ''
    } else {
      return { success: false, message: '不支持的记录类型' }
    }

    console.log(`删除${recordType}记录:`, recordId, '学生:', studentId, '积分变化:', scoreChange)

    // 1. 删除原始记录
    await db.collection(collectionName).doc(recordId).remove()
    console.log('原始记录已删除')

    // 2. 删除关联的积分记录
    if (relatedScoreRecordId) {
      await db.collection('score_records').doc(relatedScoreRecordId).remove()
      console.log('关联积分记录已删除:', relatedScoreRecordId)
    } else {
      // 如果没有关联ID，尝试通过学生ID和日期查找
      const scoreRecordsRes = await db.collection('score_records')
        .where({
          student_id: studentId,
          source_type: recordType === 'attendance' ? '考勤' : '志愿服务',
          date: record.date
        })
        .get()
      
      if (scoreRecordsRes.data && scoreRecordsRes.data.length > 0) {
        for (const sr of scoreRecordsRes.data) {
          await db.collection('score_records').doc(sr._id).remove()
          console.log('找到并删除积分记录:', sr._id)
        }
      }
    }

    // 3. 回退学生积分（积分变化是负数时需要加回去，正数时需要减回去）
    if (scoreChange !== 0) {
      const reverseChange = -scoreChange // 取反
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
        console.log('学生积分已回退:', student.current_score, '->', newScore)
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
    return {
      success: false,
      message: '删除失败: ' + err.message,
      error: err
    }
  }
}
