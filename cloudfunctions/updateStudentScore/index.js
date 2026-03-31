// 云函数：更新学生积分
// 该云函数具有管理员权限，可以绕过数据库权限限制
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { studentId, studentIdNumber, scoreAfter, operatorId, operatorName } = event
  
  console.log('=== updateStudentScore 云函数调用 ===')
  console.log('参数:', { studentId, studentIdNumber, scoreAfter, operatorId, operatorName })
  
  try {
    // 方法1：通过 _id 更新
    if (studentId) {
      console.log('尝试通过 _id 更新:', studentId)
      try {
        const result = await db.collection('students').doc(studentId).update({
          data: {
            current_score: scoreAfter,
            updated_at: db.serverDate(),
            updated_by: operatorId
          }
        })
        console.log('_id 更新结果:', result)
        if (result.stats && result.stats.updated > 0) {
          return {
            success: true,
            method: '_id',
            message: `积分更新成功，新积分: ${scoreAfter}`
          }
        }
      } catch (err) {
        console.log('_id 更新失败:', err.message)
      }
    }
    
    // 方法2：通过 student_id 更新
    if (studentIdNumber) {
      console.log('尝试通过 student_id 更新:', studentIdNumber)
      
      // 先查询学生
      const queryResult = await db.collection('students')
        .where({
          student_id: studentIdNumber
        })
        .limit(1)
        .get()
      
      console.log('查询结果:', queryResult)
      
      if (queryResult.data && queryResult.data.length > 0) {
        const studentDoc = queryResult.data[0]
        console.log('找到学生文档:', studentDoc._id)
        
        const updateResult = await db.collection('students').doc(studentDoc._id).update({
          data: {
            current_score: scoreAfter,
            updated_at: db.serverDate(),
            updated_by: operatorId
          }
        })
        console.log('student_id 更新结果:', updateResult)
        
        if (updateResult.stats && updateResult.stats.updated > 0) {
          return {
            success: true,
            method: 'student_id',
            message: `积分更新成功，新积分: ${scoreAfter}`
          }
        }
      }
    }
    
    // 两种方法都失败
    return {
      success: false,
      message: '未找到学生或更新失败'
    }
    
  } catch (error) {
    console.error('云函数执行错误:', error)
    return {
      success: false,
      message: error.message || '更新失败',
      error: error
    }
  }
}
