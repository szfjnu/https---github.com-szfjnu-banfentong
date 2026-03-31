// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 重置学生积分的云函数
 * 
 * @param {string} classId - 班级ID（可选，不传则重置所有学生）
 * @param {string} studentId - 学生ID（可选，不传则重置整个班级）
 * @param {number} initialScore - 初始积分，默认100
 * @param {string} semesterId - 学期ID
 */
exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command
  const { classId, studentId, initialScore = 100, semesterId } = event

  try {
    // 构建查询条件
    let query = {}
    if (studentId) {
      query.student_id = studentId
    } else if (classId) {
      query.class_id = classId
    }

    // 获取要重置的学生列表
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

    // 批量更新学生积分
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

    // 创建重置记录（可选）
    if (semesterId) {
      await db.collection('score_reset_logs').add({
        data: {
          reset_type: studentId ? 'single' : (classId ? 'class' : 'all'),
          class_id: classId || '',
          student_id: studentId || '',
          student_count: students.length,
          initial_score: initialScore,
          semester_id: semesterId,
          reset_by: event.userInfo ? event.userInfo.openId : 'system',
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

  } catch (err) {
    console.error('重置积分失败:', err)
    return {
      success: false,
      message: '重置失败: ' + err.message,
      error: err
    }
  }
}
