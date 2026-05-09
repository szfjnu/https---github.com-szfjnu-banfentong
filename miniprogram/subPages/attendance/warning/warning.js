const app = getApp();

Page({
  data: {
    classId: '',
    loading: true,
    currentTab: 'absent',
    warnings: [],
    summary: { total: 0, absent_discipline_count: 0, leave_warning_count: 0 },
    stats: null
  },

  onLoad(options) {
    this.setData({ classId: options.classId || app.globalData.class_id || '' });
    this.loadWarnings();
    this.loadStats();
  },

  onShow() {
    if (this.data.classId) {
      this.loadWarnings();
      this.loadStats();
    }
  },

  onPullDownRefresh() {
    this.loadWarnings().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.loadWarnings();
  },

  loadWarnings: async function () {
    this.setData({ loading: true });
    try {
      const warningType = this.data.currentTab === 'absent' ? 'absent_discipline' : 'leave_warning';
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'getWarnings', data: { class_id: this.data.classId, warning_type: warningType } }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ warnings: result.data.warnings, summary: result.data.summary, loading: false });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载预警数据失败:', err);
      this.setData({ loading: false });
    }
  },

  loadStats: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'getWarningStats', data: { class_id: this.data.classId } }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ stats: result.data });
      }
    } catch (err) {
      console.error('加载预警统计失败:', err);
    }
  },

  onDetectWarnings: async function () {
    wx.showLoading({ title: '检测中...' });
    try {
      await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'detectWarnings', data: { class_id: this.data.classId } }
      });
      wx.hideLoading();
      this.loadWarnings();
      this.loadStats();
      wx.showToast({ title: '检测完成', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '检测失败', icon: 'none' });
    }
  },

  goToRules: function () {
    wx.navigateTo({ url: `/subPages/attendance/warning/rules/rules?class_id=${this.data.classId}` });
  }
});
