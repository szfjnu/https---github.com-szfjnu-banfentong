// pages/duty/check/check.js - 值日检查+加减分
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    loading: true,
    classId: '',
    dutyDate: '',
    // 当日任务列表
    tasks: [],
    pendingTasks: [], // 待检查的任务
    checkedTasks: [], // 已检查的任务
    displayList: [],// 用于存放当前筛选后的列表，方便 WXML 渲染
    // 检查弹窗
    showCheckModal: false,
    currentTask: null,
    // 检查表单
    checkForm: {
      is_qualified: true,
      inspection_score: 5,
      score_change: 0,
      problems: '',
      comment: '',
      inspector_name: '',
      inspector_role: '卫生委员'
    },
    roleOptions: ['卫生委员', '值班干部', '班主任'],
    // 批量检查
    batchMode: false,
    selectedTaskIds: [],
    // 筛选
    filterStatus: 'pending' // 'pending', 'checked', 'all'
  },

  onLoad: function (options) {
    // 权限校验：仅管理员/班主任/班干部可访问
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'class_cadre') {
      wx.showToast({ title: '无权限访问', icon: 'none', duration: 2000 });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    const today = new Date();
    const todayStr = this.formatDate(today);

    this.setData({
      classId: app.globalData.class_id,
      dutyDate: options.duty_date || todayStr,
      'checkForm.inspector_name': app.globalData.userInfo?.nickName || ''
    });

    this.loadTasks();
  },

  formatDate: function (date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  loadTasks: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getDutyTasks',
          data: {
            class_id: this.data.classId,
            duty_date: this.data.dutyDate
          }
        }
      });

      if (res.result && res.result.success) {
        const tasks = res.result.data || [];
        const pendingTasks = tasks.filter(t => t.status === '待完成');
        const checkedTasks = tasks.filter(t => t.status === '已完成' || t.status === '未完成');

        // 在这里直接调用更新方法，确保初始加载时列表正确
        this.setData({ tasks, pendingTasks, checkedTasks }, () => {

          this.updateDisplayList();

        });
        
      }
    } catch (err) {
      console.error('加载任务失败:', err);
      util.showError('加载失败');
    }
    this.setData({ loading: false });
  },

  // 【新增】更新当前显示列表的公共方法
  updateDisplayList: function () {

    const { filterStatus, pendingTasks, checkedTasks, tasks } = this.data;
    let list = [];
    if (filterStatus === 'pending') {

      list = pendingTasks;

    } else if (filterStatus === 'checked') {

      list = checkedTasks;

    } else {

      list = tasks;

    }
    this.setData({ displayList: list });
  },

  // 日期切换
  onDateChange: function (e) {
    this.setData({ dutyDate: e.detail.value });
    this.loadTasks();
  },

  // 筛选切换时，更新 currentDisplayList
  onFilterChange: function (e) {
    this.setData({ filterStatus: e.currentTarget.dataset.status });
      this.updateDisplayList(); // 筛选条件改变时，重新计算 displayList
  },

  // 获取当前显示的任务列表
  getFilteredTasks: function () {
    const { filterStatus, pendingTasks, checkedTasks, tasks } = this.data;
    if (filterStatus === 'pending') return pendingTasks;
    if (filterStatus === 'checked') return checkedTasks;
    return tasks;
  },

  // 打开检查弹窗
  onOpenCheck: function (e) {
    const task = e.currentTarget.dataset.task;
    // 获取模板默认分值
    let defaultScore = 2;
    let deductionScore = -2;

    this.setData({
      showCheckModal: true,
      currentTask: task,
      checkForm: {
        is_qualified: true,
        inspection_score: 5,
        score_change: defaultScore,
        problems: '',
        comment: '',
        inspector_name: this.data.checkForm.inspector_name,
        inspector_role: this.data.checkForm.inspector_role
      }
    });
  },

  // 关闭检查弹窗
  onHideCheckModal: function () {
    this.setData({ showCheckModal: false, currentTask: null });
  },

  // 检查表单变更
  onQualifiedChange: function (e) {
    const isQualified = e.currentTarget.dataset.value;
    this.setData({
      'checkForm.is_qualified': isQualified,
      'checkForm.inspection_score': isQualified ? 5 : 1,
      'checkForm.score_change': isQualified ? 2 : -2
    });
  },

  onScoreChange: function (e) {
    this.setData({ 'checkForm.inspection_score': Number(e.detail.value) });
  },

  onCustomScoreChange: function (e) {
    this.setData({ 'checkForm.score_change': Number(e.detail.value) });
  },

  onProblemInput: function (e) {
    this.setData({ 'checkForm.problems': e.detail.value });
  },

  onCommentInput: function (e) {
    this.setData({ 'checkForm.comment': e.detail.value });
  },

  onInspectorNameInput: function (e) {
    this.setData({ 'checkForm.inspector_name': e.detail.value });
  },

  onRoleChange: function (e) {
    this.setData({ 'checkForm.inspector_role': this.data.roleOptions[e.detail.value] });
  },

  // 提交检查结果
  onSubmitCheck: async function () {
    const { currentTask, checkForm } = this.data;
    if (!currentTask) return;

    wx.showLoading({ title: '提交中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'inspectTask',
          data: {
            task_id: currentTask.task_id,
            is_qualified: checkForm.is_qualified,
            inspection_score: checkForm.inspection_score,
            score_change: checkForm.score_change,
            problems: checkForm.problems,
            problem_images: [],
            comment: checkForm.comment,
            inspector_name: checkForm.inspector_name,
            inspector_role: checkForm.inspector_role
          }
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        const scoreText = checkForm.is_qualified
          ? `合格 +${res.result.data.score_change}分`
          : `不合格 ${res.result.data.score_change}分`;
        util.showSuccess(`检查完成：${scoreText}`);
        this.onHideCheckModal();
        this.loadTasks();
      } else {
        util.showError(res.result.message || '检查失败');
      }
    } catch (err) {
      wx.hideLoading();
      console.error('检查提交失败:', err);
      util.showError('提交失败');
    }
  },

  // 查看学生详情
  onViewStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    if (studentId) {
      wx.navigateTo({
        url: `/subPkg1/student/detail/detail?id=${studentId}`
      });
    }
  },

  // 批量检查：全部合格
  onBatchAllQualified: async function () {
    const { pendingTasks, checkForm } = this.data;
    if (pendingTasks.length === 0) {
      wx.showToast({ title: '没有待检查任务', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '批量检查',
      content: `确认将${pendingTasks.length}个任务全部标记为合格？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '批量检查中...', mask: true });
          try {
            const batchTasks = pendingTasks.map(t => ({
              task_id: t.task_id,
              is_qualified: true,
              inspection_score: 5,
              score_change: 2,
              problems: '',
              comment: '批量合格',
              inspector_name: checkForm.inspector_name,
              inspector_role: checkForm.inspector_role
            }));

            const result = await wx.cloud.callFunction({
              name: 'manageDuty',
              data: {
                action: 'batchInspect',
                data: { tasks: batchTasks }
              }
            });

            wx.hideLoading();
            if (result.result && result.result.success) {
              util.showSuccess('批量检查完成');
              this.loadTasks();
            } else {
              util.showError('批量检查失败');
            }
          } catch (err) {
            wx.hideLoading();
            util.showError('操作失败');
          }
        }
      }
    });
  },

  // 阻止冒泡
  preventBubble: function () {}
});
