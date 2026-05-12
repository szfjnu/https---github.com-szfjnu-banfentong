const app = getApp();

const scoreCalculator = {
  updateStudentScore: async function (classId, selectedDate, studentId, scoreChange, options) {
    options = options || {};
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
            date: selectedDate
          }
        }
      });
      const result = res.result || {};
      if (!result.success) {
        console.error('统一积分变更失败:', result.message);
      }
    } catch (err) {
      console.error('调用积分云函数失败:', err);
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

      const recordsRes = await db.collection('score_records')
        .where({ student_id: studentId })
        .get();

      const records = recordsRes.data || [];
      const totalChange = records.reduce((sum, r) => sum + (r.score_change || 0), 0);
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
