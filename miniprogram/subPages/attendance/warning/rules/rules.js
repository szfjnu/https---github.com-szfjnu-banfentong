const app = getApp();

Page({
  data: {
    classId: '',
    loading: true,
    absentLevels: [],
    leaveThreshold: 30,
    leaveIsDefault: true,
    absentIsDefault: true
  },

  onLoad(options) {
    this.setData({ classId: options.class_id || app.globalData.class_id || '' });
    this.loadConfig();
  },

  loadConfig: async function () {
    this.setData({ loading: true });
    try {
      const [absentRes, leaveRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'attendanceWarning',
          data: { action: 'getAbsentWarningConfig', data: { class_id: this.data.classId } }
        }),
        wx.cloud.callFunction({
          name: 'attendanceWarning',
          data: { action: 'getLeaveWarningConfig', data: { class_id: this.data.classId } }
        })
      ]);

      const absentResult = absentRes.result || {};
      const leaveResult = leaveRes.result || {};

      if (absentResult.success) {
        this.setData({ absentLevels: absentResult.data.warning_levels, absentIsDefault: absentResult.data.is_default });
      }
      if (leaveResult.success) {
        this.setData({ leaveThreshold: leaveResult.data.threshold_days, leaveIsDefault: leaveResult.data.is_default });
      }

      this.setData({ loading: false });
    } catch (err) {
      console.error('加载配置失败:', err);
      this.setData({ loading: false });
    }
  },

  onLevelMinInput: function (e) {
    const idx = e.currentTarget.dataset.index;
    const val = Number(e.detail.value);
    const levels = [...this.data.absentLevels];
    levels[idx].min_sections = val;
    this.setData({ absentLevels: levels });
  },

  onLevelMaxInput: function (e) {
    const idx = e.currentTarget.dataset.index;
    const val = e.detail.value ? Number(e.detail.value) : null;
    const levels = [...this.data.absentLevels];
    levels[idx].max_sections = val;
    this.setData({ absentLevels: levels });
  },

  onSaveAbsentConfig: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'saveAbsentWarningConfig', data: { class_id: this.data.classId, warning_levels: this.data.absentLevels } }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ absentIsDefault: false });
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: result.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onResetAbsentConfig: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'resetAbsentWarningConfig', data: { class_id: this.data.classId } }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ absentLevels: result.data.warning_levels, absentIsDefault: true });
        wx.showToast({ title: '已恢复默认', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: '恢复失败', icon: 'none' });
    }
  },

  onLeaveThresholdInput: function (e) {
    this.setData({ leaveThreshold: Number(e.detail.value) });
  },

  onSaveLeaveConfig: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'saveLeaveWarningConfig', data: { class_id: this.data.classId, threshold_days: this.data.leaveThreshold } }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ leaveIsDefault: false });
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: result.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onResetLeaveConfig: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'resetLeaveWarningConfig', data: { class_id: this.data.classId } }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ leaveThreshold: result.data.threshold_days, leaveIsDefault: true });
        wx.showToast({ title: '已恢复默认', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: '恢复失败', icon: 'none' });
    }
  }
});
