// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

const { getCallerInfo, requireTeacher, AUTH_ERRORS } = require('../utils/auth')

exports.main = async (event, context) => {
  const { recordId, classId } = event

  try {
    const caller = await getCallerInfo(event, classId)
    requireTeacher(caller)

    const recordRes = await db.collection('dorm_score_records')
      .doc(recordId)
      .get()

    if (!recordRes.data) {
      return {
        success: false,
        message: '记录不存在'
      }
    }

    const record = recordRes.data

    if (caller.role !== 'admin' && record.class_id && record.class_id !== caller.classId) {
      return { success: false, message: '无权删除其他班级的记录', code: AUTH_ERRORS.CLASS_DENIED }
    }

    if (record.link_to_personal) {
      const personalRes = await db.collection('score_records')
        .where({
          related_dorm_record_id: recordId
        })
        .get()

      if (personalRes.data && personalRes.data.length > 0) {
        for (const personalRecord of personalRes.data) {
          await db.collection('students').doc(personalRecord.student_id).update({
            data: {
              current_score: _.inc(-personalRecord.score_change),
              updated_at: db.serverDate()
            }
          })

          await db.collection('score_records').doc(personalRecord._id).remove()
        }
      }
    }

    await db.collection('dorm_score_records').doc(recordId).remove()

    return {
      success: true,
      message: '删除成功',
      data: {
        deletedRecordId: recordId,
        affectedStudents: record.affected_students,
        linkToPersonal: record.link_to_personal
      }
    }

  } catch (err) {
    console.error('删除宿舍记录失败:', err)
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
