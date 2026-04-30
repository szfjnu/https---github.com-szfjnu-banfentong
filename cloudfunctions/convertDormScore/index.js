// 云函数:宿舍积分折算
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { student_id, dorm_score_change, recorder_openid, semester_id } = event

  try {
    // 1. 获取当前学期信息
    const semesterRes = await db.collection('semesters').where({
      status: 'active'
    }).get()
    
    if (semesterRes.data.length === 0) {
      return {
        success: false,
        message: '未找到当前学期'
      }
    }
    
    const currentSemester = semesterRes.data[0]
    const targetSemesterId = semester_id || currentSemester._id
    const conversionRatio = currentSemester.dorm_conversion_ratio || 0.3

    // 2. 获取或创建宿舍积分账户
    let dormAccount
    const accountRes = await db.collection('dorm_score_accounts').where({
      student_id: student_id,
      semester_id: targetSemesterId
    }).get()
    
    if (accountRes.data.length === 0) {
      // 创建新账户
      const createRes = await db.collection('dorm_score_accounts').add({
        data: {
          student_id: student_id,
          semester_id: targetSemesterId,
          original_score: 100,
          converted_score: 0,
          conversion_ratio: conversionRatio,
          warning_count: 0,
          created_at: new Date(),
          updated_at: new Date()
        }
      })
      dormAccount = { _id: createRes._id }
    } else {
      dormAccount = accountRes.data[0]
    }

    // 3. 计算折算积分（保留两位小数）
    const convertedScoreChange = Math.round(dorm_score_change * conversionRatio * 100) / 100

    // 4. 更新宿舍积分账户
    await db.collection('dorm_score_accounts').doc(dormAccount._id).update({
      data: {
        original_score: _.inc(dorm_score_change),
        converted_score: _.inc(convertedScoreChange),
        updated_at: new Date()
      }
    })

    // 5. 在日常积分记录中创建折算记录
    if (convertedScoreChange !== 0) {
      const scoreRecordRes = await db.collection('score_records').add({
        data: {
          student_id: student_id,
          item_id: 'DORM_CONVERSION',
          score_change: convertedScoreChange,
          reason_detail: '宿舍积分折算',
          date: new Date(),
          recorder_name: '系统自动',
          recorder_openid: 'system',
          semester_id: targetSemesterId,
          source_type: '宿舍折算',
          approval_status: '已通过',
          created_at: new Date()
        }
      })

      // 6. 更新学生总积分
      await db.collection('students').where({
        student_id: student_id
      }).update({
        data: {
          current_score: _.inc(convertedScoreChange),
          dorm_converted_score: _.inc(convertedScoreChange),
          score_level: calculateScoreLevel(_.inc(convertedScoreChange)),
          updated_at: new Date()
        }
      })
    }

    // 7. 检查是否需要发送预警
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
          updated_at: new Date()
        }
      })
    }

    return {
      success: true,
      message: '宿舍积分折算完成',
      data: {
        dorm_score_change: dorm_score_change,
        converted_score_change: convertedScoreChange,
        conversion_ratio: conversionRatio,
        warning_type: warningType
      }
    }

  } catch (err) {
    console.error('宿舍积分折算失败:', err)
    return {
      success: false,
      message: `折算失败: ${err.message}`
    }
  }
}

// 计算积分等级
function calculateScoreLevel(score) {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 70) return '中等'
  if (score >= 60) return '及格'
  return '不及格'
}
