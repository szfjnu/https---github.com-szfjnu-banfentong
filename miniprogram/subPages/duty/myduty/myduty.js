// pages/duty/myduty/myduty.js - 学生端：我的值日任务
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    loading: true,
    studentId: '',
    classId: '',
    userRole: '',
    // 我的任务
    myTasks: [],
    pendingTasks: [],  // 待完成
    completedTasks: [], // 已完成
    incompleteTasks: [], // 未完成
    // 提醒
    reminders: [],
    unreadCount: 0,
    // 当前tab
    activeTab: 'pending',
    currentTasks: [],     // 当前tab对应的任务列表（供WXML使用）
    isCurrentEmpty: false, // 当前tab是否为空
    // 统计
    myStats: {
      total: 0,
      completed: 0,
      incomplete: 0,
      totalScore: 0
    }
  },

  onLoad: function () {
    const studentId = app.globalData.student_id;
    const classId = app.globalData.class_id;
    const role = app.globalData.role;

    if (!studentId) {
      wx.showToast({ title: '未获取到学生信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ studentId, classId, userRole: role });
    this.loadPageData();
  },

  onShow: function () {
    if (this.data.studentId) {
      this.loadPageData();
    }
  },

  onPullDownRefresh: function () {
    this.loadPageData().then(() => wx.stopPullDownRefresh());
  },

  loadPageData: async function () {
    this.setData({ loading: true });
    try {
      await Promise.all([
        this.loadMyTasks(),
        this.loadMyReminders()
      ]);
      this.calculateStats();
    } catch (err) {
      console.error('加载数据失败:', err);
      util.showError('加载失败');
    }
    this.setData({ loading: false });
  },

  // 加载我的任务
  loadMyTasks: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getMyDutyTasks',
          data: {
            student_id: this.data.studentId,
            class_id: this.data.classId,
            limit: 50
          }
        }
      });

      if (res.result && res.result.success) {
        const tasks = res.result.data || [];
        const pendingTasks = tasks.filter(t => t.status === '待完成');
        const completedTasks = tasks.filter(t => t.status === '已完成');
        const incompleteTasks = tasks.filter(t => t.status === '未完成');

        this.setData({
          myTasks: tasks,
          pendingTasks,
          completedTasks,
          incompleteTasks
        });
        this.updateCurrentTasks();
      }
    } catch (err) {
      console.error('加载我的任务失败:', err);
    }
  },

  // 加载我的提醒
  loadMyReminders: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getMyReminders',
          data: {
            student_id: this.data.studentId,
            is_read: false
          }
        }
      });

      if (res.result && res.result.success) {
        const reminders = res.result.data || [];
        this.setData({
          reminders,
          unreadCount: reminders.length
        });
      }
    } catch (err) {
      console.error('加载提醒失败:', err);
    }
  },

  // 计算统计
  calculateStats: function () {
    const { myTasks } = this.data;
    const total = myTasks.length;
    const completed = myTasks.filter(t => t.status === '已完成').length;
    const incomplete = myTasks.filter(t => t.status === '未完成').length;
    const totalScore = myTasks.reduce((sum, t) => sum + (t.score_change || 0), 0);

    this.setData({
      myStats: { total, completed, incomplete, totalScore }
    });
  },

  // Tab切换
  onTabChange: function (e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
    this.updateCurrentTasks();
  },

  // 标记提醒已读
  onMarkRead: async function (e) {
    const reminderId = e.currentTarget.dataset.id;
    try {
      await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'markReminderRead',
          data: { reminder_id: reminderId }
        }
      });

      this.loadMyReminders();
    } catch (err) {
      console.error('标记已读失败:', err);
    }
  },

  // 全部已读
  onMarkAllRead: async function () {
    const { reminders } = this.data;
    for (const r of reminders) {
      await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'markReminderRead',
          data: { reminder_id: r.reminder_id }
        }
      });
    }
    this.loadMyReminders();
    wx.showToast({ title: '已全部标记已读', icon: 'success' });
  },

  // 更新当前tab对应的任务列表（供WXML绑定使用）
  updateCurrentTasks: function () {
    const { activeTab, pendingTasks, completedTasks, incompleteTasks } = this.data;
    let currentTasks = [];
    if (activeTab === 'pending') currentTasks = pendingTasks;
    else if (activeTab === 'completed') currentTasks = completedTasks;
    else if (activeTab === 'incomplete') currentTasks = incompleteTasks;
    this.setData({
      currentTasks,
      isCurrentEmpty: currentTasks.length === 0
    });
  },

  // 获取当前tab的任务列表（供JS内部调用）
  getCurrentTasks: function () {
    const { activeTab, pendingTasks, completedTasks, incompleteTasks } = this.data;
    if (activeTab === 'pending') return pendingTasks;
    if (activeTab === 'completed') return completedTasks;
    if (activeTab === 'incomplete') return incompleteTasks;
    return [];
  }
});
