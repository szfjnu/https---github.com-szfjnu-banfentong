// pages/duty/duty.js - 值日管理主页面（管理员视角）
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    loading: true,
    currentClassId: '',
    userRole: '',
    // 日期选择
    todayDate: '',
    selectedDate: '',
    // 今日值日信息
    todayDutyGroup: null,
    todayTasks: [],
    // 轮转信息
    rotation: null,
    dutyGroups: [],
    // 统计概览
    stats: {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      incompleteTasks: 0
    },
    // 模板数量
    templateCount: 0,
    // 当前tab
    activeTab: 'today',
    // 编辑弹窗
    showEditModal: false,
    editingTask: null,
    editForm: {
      task_name: '',
      duty_date: '',
      student_name: '',
      score_for_qualified: 2,
      deduction_for_unqualified: -2,
      group_name: ''
    },
    editSubmitting: false
  },

  onLoad: function () {
    this.initPage();
  },

  onShow: function () {
    if (this.data.currentClassId) {
      this.loadPageData();
    }
  },

  initPage: function () {
    const classId = app.globalData.class_id;
    const role = app.globalData.role;

    if (!classId) {
      wx.showModal({
        title: '提示',
        content: '请先选择班级',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }

    // 管理角色或拥有模块权限可进入
    if (!app.hasPermission('duty', 'check')) {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    const today = new Date();
    const todayStr = this.formatDate(today);

    this.setData({
      currentClassId: classId,
      userRole: role,
      todayDate: todayStr,
      selectedDate: todayStr
    });

    this.loadPageData();
  },

  formatDate: function (date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  loadPageData: async function () {
    this.setData({ loading: true });
    try {
      await Promise.all([
        this.loadRotation(),
        this.loadTodayTasks(),
        this.loadDutyStats(),
        this.loadTemplateCount()
      ]);
    } catch (err) {
      console.error('加载数据失败:', err);
      util.showError('加载失败');
    }
    this.setData({ loading: false });
  },

  // 加载轮转配置
  loadRotation: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getRotation',
          data: { class_id: this.data.currentClassId }
        }
      });

      if (res.result && res.result.success) {
        const rotation = res.result.data;
        this.setData({ rotation });

        if (rotation && rotation.group_ids && rotation.group_ids.length > 0) {
          // 获取当前值日小组
          const currentGroup = rotation.group_ids[rotation.current_index || 0];
          this.setData({ todayDutyGroup: currentGroup });

          // 加载所有值日小组
          const db = wx.cloud.database();
          const _ = db.command;
          const groupRes = await db.collection('student_groups')
            .where({
              _id: _.in(rotation.group_ids.map(g => g.group_id || g)),
              is_deleted: _.neq(true)
            })
            .get();

          this.setData({ dutyGroups: groupRes.data || [] });
        }
      }
    } catch (err) {
      console.error('加载轮转配置失败:', err);
    }
  },

  // 加载今日任务
  loadTodayTasks: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getDutyTasks',
          data: {
            class_id: this.data.currentClassId,
            duty_date: this.data.selectedDate
          }
        }
      });

      if (res.result && res.result.success) {
        const tasks = res.result.data || [];
        this.setData({ todayTasks: tasks });
      }
    } catch (err) {
      console.error('加载今日任务失败:', err);
    }
  },

  // 加载统计
  loadDutyStats: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getDutyStats',
          data: { class_id: this.data.currentClassId }
        }
      });

      if (res.result && res.result.success) {
        const d = res.result.data;
        this.setData({
          stats: {
            totalTasks: d.totalTasks || 0,
            completedTasks: d.completedTasks || 0,
            pendingTasks: d.pendingTasks || 0,
            incompleteTasks: d.incompleteTasks || 0
          }
        });
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 加载模板数量
  loadTemplateCount: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getTemplates',
          data: { class_id: this.data.currentClassId }
        }
      });

      if (res.result && res.result.success) {
        this.setData({ templateCount: (res.result.data || []).length });
      }
    } catch (err) {
      console.error('加载模板数量失败:', err);
    }
  },

  // 日期选择
  onDateChange: function (e) {
    this.setData({ selectedDate: e.detail.value });
    this.loadTodayTasks();
  },

  // Tab切换
  onTabChange: function (e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  // 跳转到任务模板管理
  onGoTemplate: function () {
    wx.navigateTo({ url: '/subPkg1/duty/template/template' });
  },

  // 跳转到值日安排
  onGoArrange: function () {
    wx.navigateTo({
      url: `/subPkg1/duty/arrange/arrange?duty_date=${this.data.selectedDate}`
    });
  },

  // 跳转到值日检查
  onGoCheck: function () {
    wx.navigateTo({
      url: `/subPkg1/duty/check/check?duty_date=${this.data.selectedDate}`
    });
  },

  // 轮转配置
  onGoRotation: function () {
    wx.navigateTo({ url: '/subPkg1/duty/arrange/arrange?mode=rotation' });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadPageData().then(() => wx.stopPullDownRefresh());
  },

  onEditTask: function (e) {
    const task = e.currentTarget.dataset.task;
    this.setData({
      showEditModal: true,
      editingTask: task,
      editForm: {
        task_name: task.task_name || '',
        duty_date: task.duty_date || '',
        student_name: task.student_name || '',
        score_for_qualified: (task.inspection && task.inspection.default_score) || 2,
        deduction_for_unqualified: (task.inspection && task.inspection.deduction_score) || -2,
        group_name: task.group_name || ''
      }
    });
  },

  onEditFormChange: function (e) {
    const field = e.currentTarget.dataset.field;
    let value = e.detail.value;
    if (field === 'score_for_qualified' || field === 'deduction_for_unqualified') {
      value = Number(value);
    }
    this.setData({ [`editForm.${field}`]: value });
  },

  onEditSubmit: async function () {
    const { editingTask, editForm, currentClassId, userRole } = this.data;
    if (!editingTask) return;

    this.setData({ editSubmitting: true });
    wx.showLoading({ title: '保存中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'updateDutyTask',
          data: {
            task_id: editingTask.task_id,
            class_id: currentClassId,
            role: userRole,
            task_name: editForm.task_name,
            duty_date: editForm.duty_date,
            student_name: editForm.student_name,
            score_for_qualified: editForm.score_for_qualified,
            deduction_for_unqualified: editForm.deduction_for_unqualified,
            group_name: editForm.group_name
          }
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({ title: '修改成功', icon: 'success' });
        this.setData({ showEditModal: false, editingTask: null });
        this.loadPageData();
      } else {
        wx.showToast({ title: res.result.message || '修改失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('修改任务失败:', err);
      wx.showToast({ title: '修改失败', icon: 'none' });
    }

    this.setData({ editSubmitting: false });
  },

  onEditCancel: function () {
    this.setData({ showEditModal: false, editingTask: null });
  },

  onDeleteTask: function (e) {
    const task = e.currentTarget.dataset.task;
    const hasScore = (task.status === '已完成' || task.status === '未完成') && task.score_change !== 0;

    wx.showModal({
      title: '确认删除',
      content: hasScore
        ? `该任务已产生积分变化（${task.score_change > 0 ? '+' : ''}${task.score_change}），删除后将回退积分。确认删除？`
        : '确认删除该值日任务？',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '删除中...', mask: true });
        try {
          const result = await wx.cloud.callFunction({
            name: 'manageDuty',
            data: {
              action: 'deleteDutyTask',
              data: {
                task_id: task.task_id,
                class_id: this.data.currentClassId,
                role: this.data.userRole
              }
            }
          });

          wx.hideLoading();

          if (result.result && result.result.success) {
            const rolledBack = result.result.data && result.result.data.score_rolled_back;
            wx.showToast({ title: rolledBack ? '已删除，积分已回退' : '已删除', icon: 'success' });
            this.loadPageData();
          } else {
            wx.showToast({ title: result.result.message || '删除失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          console.error('删除任务失败:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  preventBubble() {},
});
