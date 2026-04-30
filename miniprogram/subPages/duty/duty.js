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
    activeTab: 'today'
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

    // 仅管理员/班主任/班干部可进入
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'class_cadre') {
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
    wx.navigateTo({ url: '/subPages/duty/template/template' });
  },

  // 跳转到值日安排
  onGoArrange: function () {
    wx.navigateTo({
      url: `/subPages/duty/arrange/arrange?duty_date=${this.data.selectedDate}`
    });
  },

  // 跳转到值日检查
  onGoCheck: function () {
    wx.navigateTo({
      url: `/subPages/duty/check/check?duty_date=${this.data.selectedDate}`
    });
  },

  // 轮转配置
  onGoRotation: function () {
    wx.navigateTo({ url: '/subPages/duty/arrange/arrange?mode=rotation' });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadPageData().then(() => wx.stopPullDownRefresh());
  }
});
