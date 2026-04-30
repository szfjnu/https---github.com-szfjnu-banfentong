// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { recordId, operatorId } = event

  console.log('开始删除宿舍记录:', recordId)

  try {
    // 1. 查询宿舍记录
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

    // 2. 检查是否关联到个人积分
    if (record.link_to_personal) {
      // 查询关联的个人积分记录
      const personalRes = await db.collection('score_records')
        .where({
          related_dorm_record_id: recordId
        })
        .get()

      if (personalRes.data && personalRes.data.length > 0) {
        // 扣除学生的个人积分
        const studentIds = personalRes.data.map(r => r.student_id)

        for (const personalRecord of personalRes.data) {
          // 扣除积分（注意：这里要减去当时加的积分）
          await db.collection('students').doc(personalRecord.student_id).update({
            data: {
              current_score: _.inc(-personalRecord.score_change),
              updated_at: db.serverDate()
            }
          })

          // 删除个人积分记录
          await db.collection('score_records').doc(personalRecord._id).remove()
        }

        console.log(`已删除 ${personalRes.data.length} 条关联的个人积分记录`)
      }
    }

    // 3. 删除宿舍记录
    await db.collection('dorm_score_records').doc(recordId).remove()

    console.log('宿舍记录删除成功')

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
    return {
      success: false,
      message: '删除失败: ' + err.message,
      error: err
    }
  }
}
