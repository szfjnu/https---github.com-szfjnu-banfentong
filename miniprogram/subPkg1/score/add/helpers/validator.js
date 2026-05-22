const util = require('../../../../utils/util.js');

var validator = {};

validator.validateSubmit = function (data) {
  var selectedStudents = data.selectedStudents;
  var scoreValue = data.scoreValue;
  var reason = data.reason;
  var currentClassId = data.currentClassId;
  var currentSemesterId = data.currentSemesterId;
  var selectedItem = data.selectedItem;

  if (!selectedStudents || selectedStudents.length === 0) {
    util.showError('请选择至少一个学生');
    return false;
  }

  if (!scoreValue || scoreValue <= 0) {
    util.showError('请输入有效的积分值');
    return false;
  }

  if (!reason || !reason.trim()) {
    util.showError('请输入原因说明');
    return false;
  }

  if (!currentClassId) {
    util.showError('班级信息缺失,无法提交');
    return false;
  }

  if (!currentSemesterId) {
    util.showError('学期信息缺失,无法提交');
    return false;
  }

  if (!selectedItem || !selectedItem.record_id) {
    util.showError('请选择有效的积分规则');
    return false;
  }

  return true;
};

validator.checkPermission = function (role) {
  const app = getApp();
  if (!app.hasPermission('score', 'write')) {
    wx.showToast({
      title: '无权限操作',
      icon: 'none',
      duration: 2000
    });
    setTimeout(function () {
      wx.navigateBack();
    }, 2000);
    return false;
  }
  return true;
};

module.exports = validator;
