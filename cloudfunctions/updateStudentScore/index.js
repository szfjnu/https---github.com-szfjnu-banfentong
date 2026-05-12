// 云函数：更新学生积分
// 需要教师或管理员权限
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const { getCallerInfo, requireTeacher, AUTH_ERRORS } = require('./utils/auth')

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { studentId, studentIdNumber, scoreAfter, operatorId, operatorName, classId } = event

  try {
    const caller = await getCallerInfo(event, classId)
    requireTeacher(caller)

    if (studentId) {
      const result = await db.collection('students').doc(studentId).update({
        data: {
          current_score: scoreAfter,
          updated_at: db.serverDate(),
          updated_by: caller.openid
        }
      })
      if (result.stats && result.stats.updated > 0) {
        return {
          success: true,
          method: '_id',
          message: `积分更新成功，新积分: ${scoreAfter}`
        }
      }
    }

    if (studentIdNumber) {
      const queryResult = await db.collection('students')
        .where({
          student_id: studentIdNumber
        })
        .limit(1)
        .get()

      if (queryResult.data && queryResult.data.length > 0) {
        const studentDoc = queryResult.data[0]

        const updateResult = await db.collection('students').doc(studentDoc._id).update({
          data: {
            current_score: scoreAfter,
            updated_at: db.serverDate(),
            updated_by: caller.openid
          }
        })

        if (updateResult.stats && updateResult.stats.updated > 0) {
          return {
            success: true,
            method: 'student_id',
            message: `积分更新成功，新积分: ${scoreAfter}`
          }
        }
      }
    }

    return {
      success: false,
      message: '未找到学生或更新失败'
    }

  } catch (error) {
    console.error('云函数执行错误:', error)
    if (error.code && Object.values(AUTH_ERRORS).includes(error.code)) {
      return { success: false, message: error.message, code: error.code }
    }
    return {
      success: false,
      message: error.message || '更新失败',
      error: error
    }
  }
}
