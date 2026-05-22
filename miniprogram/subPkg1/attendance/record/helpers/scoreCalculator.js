const app = getApp();

const scoreCalculator = {
  updateStudentScore: async function (classId, selectedDate, studentId, scoreChange, options) {
    options = options || {};
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await wx.cloud.callFunction({
          name: 'scoreManager',
          data: {
            action: 'applyScoreChange',
            data: {
              student_id: studentId,
              class_id: classId,
              semester_id: app.globalData.currentSemesterId || '',
              score_change: scoreChange,
              source_type: '考勤',
              item_id: options.item_id || `attendance_${options.category_code || ''}`,
              item_name: options.item_name || `考勤-${options.category_name || ''}`,
              rule_name: options.item_name || `考勤-${options.category_name || ''}`,
              rule_code: options.category_code || '',
              reason_detail: options.reason_detail || '',
              recorder_openid: app.globalData.openid,
              recorder_name: app.globalData.userInfo.nickName || '',
              date: selectedDate,
              source_record_id: options.source_record_id || ''
            }
          }
        });
        const result = res.result || {};
        if (!result.success) {
          console.error('统一积分变更失败:', result.message);
          lastError = new Error(result.message);
          // 如果是重复键错误或幂等结果，不需要重试
          if (result.message && (result.message.includes('E11000') || result.message.includes('duplicate'))) {
            continue;
          }
          // 其他业务错误不重试
          break;
        }
        // 成功或幂等，直接返回
        return result;
      } catch (err) {
        console.error(`调用积分云函数失败(第${attempt + 1}次):`, err);
        lastError = err;
        // 网络错误等可重试
        if (attempt < maxRetries) {
          const delay = 300 + Math.floor(Math.random() * 500);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有重试失败后，尝试重新计算积分确保一致性
    if (lastError) {
      console.warn('积分变更重试耗尽，触发积分重算:', studentId);
      try {
        await this.recalculateStudentScore(classId, studentId);
      } catch (recalcErr) {
        console.error('积分重算也失败:', recalcErr);
      }
    }
  },

  recalculateStudentScore: async function (classId, studentId) {
    try {
      const db = wx.cloud.database();

      const studentRes = await db.collection('students')
        .where({ student_id: studentId })
        .get();

      if (!studentRes.data || studentRes.data.length === 0) return;

      const student = studentRes.data[0];
      const initialScore = student.initial_score || 100;

      // 分批获取所有积分记录，避免超出单次查询上限
      let allRecords = [];
      let batch = 0;
      const batchSize = 100;
      while (true) {
        const recordsRes = await db.collection('score_records')
          .where({ student_id: studentId })
          .skip(batch * batchSize)
          .limit(batchSize)
          .get();
        if (!recordsRes.data || recordsRes.data.length === 0) break;
        allRecords = allRecords.concat(recordsRes.data);
        if (recordsRes.data.length < batchSize) break;
        batch++;
        if (batch >= 20) break;
      }

      const totalChange = allRecords.reduce((sum, r) => sum + (r.score_change || 0), 0);
      const newScore = initialScore + totalChange;

      const scoreRes = await wx.cloud.callFunction({
        name: 'updateStudentScore',
        data: {
          studentId: student._id,
          studentIdNumber: student.student_id,
          scoreAfter: newScore,
          classId: classId
        }
      });
      if (!scoreRes.result || !scoreRes.result.success) {
        console.error('重新计算积分-更新失败:', scoreRes.result?.message || '未知错误');
      }

    } catch (err) {
      console.error('重新计算积分失败:', err);
    }
  }
};

module.exports = scoreCalculator;
