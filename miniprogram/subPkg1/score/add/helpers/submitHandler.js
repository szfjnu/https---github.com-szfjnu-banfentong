var submitHandler = {};

submitHandler.verifyTeacherPermission = async function (role, openid, currentClassId) {
  if (role === 'admin') {
    return true;
  }

  if (role === 'head_teacher') {
    var app = getApp();
    var teacherClassId = app.globalData.class_id;
    return teacherClassId === currentClassId;
  }

  if (role === 'subject_teacher') {
    try {
      var db = wx.cloud.database();
      var res = await db.collection('user_class_relation')
        .where({
          user_openid: openid,
          class_id: currentClassId,
          role: 'subject_teacher',
          status: 'joined'
        })
        .count();
      return res.total > 0;
    } catch (err) {
      console.error('查询教师权限失败:', err);
      return false;
    }
  }

  return false;
};

submitHandler.buildRecordData = function (student, actualScoreChange, isAdd, params) {
  var scoreBefore = student.current_score || 100;
  var scoreAfter = Math.max(0, scoreBefore + actualScoreChange);

  var recordData = {
    record_type: 'record',
    record_id: 'REC-' + Date.now(),

    student_id: student.student_id,
    student_id_number: student.student_id,
    student_name: student.name,
    class_name: student.class_name,
    class_id: params.currentClassId,

    score_before: scoreBefore,
    score_after: scoreAfter,
    score_value: actualScoreChange,
    score_change: actualScoreChange,
    score_type: isAdd ? '加分' : '扣分',

    rule_id: params.selectedItem ? params.selectedItem.record_id : '',
    rule_name: params.selectedItem ? (params.selectedItem.rule_name || params.selectedItem.name) : params.reason,
    rule_category: params.selectedItem ? params.selectedItem.rule_category : (params.selectedCategory || ''),
    rule_code: params.selectedItem ? params.selectedItem.rule_code : '',
    rule_version: params.selectedItem ? (params.selectedItem.version_number || '1.0.0') : '1.0.0',

    reason: params.reason,
    remark: params.remark || '',
    record_date: new Date().toISOString(),
    date: new Date(),
    operator_name: params.operatorName,
    operator_type: params.operatorType,
    operator_id: params.operatorId,

    status: '已确认',
    approval_status: '已通过',
    source_type: params.sourceType,

    semester_id: params.currentSemesterId,
    semester_name: params.semesterName,

    created_at: new Date(),
    updated_at: new Date()
  };

  return { recordData: recordData, scoreBefore: scoreBefore, scoreAfter: scoreAfter };
};

submitHandler.addScoreRecord = async function (recordData) {
  try {
    var addRecordRes = await wx.cloud.callFunction({
      name: 'scoreManager',
      data: { action: 'addScoreRecord', data: recordData }
    });
    if (!addRecordRes.result || !addRecordRes.result.success) {
      console.error('积分记录添加失败:', addRecordRes.result);
    }
  } catch (err) {
    console.error('积分记录添加云函数调用失败:', err);
  }
};

submitHandler.updateStudentScore = async function (student, scoreAfter, operatorId, operatorName) {
  try {
    var updateResult = await wx.cloud.callFunction({
      name: 'updateStudentScore',
      data: {
        studentId: student._id,
        studentIdNumber: student.student_id,
        scoreAfter: scoreAfter,
        operatorId: operatorId,
        operatorName: operatorName
      }
    });

    console.log('云函数返回结果:', updateResult);

    if (updateResult.result && updateResult.result.success) {
      console.log('学生积分更新成功: ' + student.name + ', 新积分: ' + scoreAfter + ', 方法: ' + updateResult.result.method);
      return { success: true };
    } else {
      console.error('学生积分更新失败: ' + student.name, updateResult.result);
      return { success: false, reason: '积分更新失败' };
    }
  } catch (cloudErr) {
    console.error('云函数调用失败:', cloudErr);
    return { success: false, reason: '云函数调用失败' };
  }
};

submitHandler.getClassNameById = async function (classId) {
  try {
    var db = wx.cloud.database();
    var res = await db.collection('classes')
      .doc(classId)
      .field({ class_name: true })
      .get();
    return (res.data && res.data.class_name) || '';
  } catch (err) {
    console.error('获取班级名称失败:', err);
    return '';
  }
};

module.exports = submitHandler;
