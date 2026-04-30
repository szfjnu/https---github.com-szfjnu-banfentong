// pages/discipline/level-config/level-config.js - 处分级别配置
const app = getApp();
const dh = require('./discipline-helper.js');

Page({
  data: {
    loading: true,
    classId: '',
    levels: [],
    isDefault: false,
    showEditModal: false,
    editingLevel: null,
    form: {
      level_name: '',
      level_code: '',
      level_order: 1,
      probation_months: 0,
      thought_reports: 0,
      service_hours: 0,
      score_deduction: 0,
      color: '#faad14'
    }
  },

  onLoad: function () {
    this.setData({ classId: app.globalData.class_id });
    this.loadLevels();
  },

  onShow: function () {
    if (this.data.classId) this.loadLevels();
  },

  loadLevels: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: { action: 'getLevelConfigs', data: { class_id: this.data.classId } }
      });
      if (res.result && res.result.success) {
        const levels = res.result.data.map(l => dh.processLevelItem(l));
        this.setData({ levels, isDefault: res.result.isDefault || false });
      }
    } catch (err) {
      console.error('加载级别配置失败:', err);
    }
    this.setData({ loading: false });
  },

  onInitConfigs: async function () {
    wx.showModal({
      title: '初始化配置',
      content: '将使用默认7级处分配置，确认初始化？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '初始化中...', mask: true });
          try {
            const result = await wx.cloud.callFunction({
              name: 'manageDiscipline',
              data: { action: 'initLevelConfigs', data: { class_id: this.data.classId } }
            });
            wx.hideLoading();
            if (result.result && result.result.success) {
              wx.showToast({ title: '初始化成功', icon: 'success' });
              this.loadLevels();
            } else {
              wx.showToast({ title: result.result.message || '初始化失败', icon: 'none' });
            }
          } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  onEditLevel: function (e) {
    const level = e.currentTarget.dataset.level;
    this.setData({
      showEditModal: true,
      editingLevel: level,
      form: {
        level_name: level.level_name,
        level_code: level.level_code,
        level_order: level.level_order,
        probation_months: level.probation_months,
        thought_reports: level.thought_reports,
        service_hours: level.service_hours,
        score_deduction: level.score_deduction,
        color: level.color
      }
    });
  },

  onAddLevel: function () {
    this.setData({
      showEditModal: true,
      editingLevel: null,
      form: {
        level_name: '',
        level_code: '',
        level_order: this.data.levels.length + 1,
        probation_months: 0,
        thought_reports: 0,
        service_hours: 0,
        score_deduction: 0,
        color: '#faad14'
      }
    });
  },

  onHideModal: function () {
    this.setData({ showEditModal: false, editingLevel: null });
  },

  onFormInput: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`form.${field}`]: field === 'level_name' || field === 'level_code' || field === 'color' ? value : Number(value) });
  },

  onSave: async function () {
    const { form, editingLevel, classId } = this.data;
    if (!form.level_name) {
      wx.showToast({ title: '请填写级别名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      const action = editingLevel ? 'updateLevelConfig' : 'addLevelConfig';
      const data = editingLevel
        ? { config_id: editingLevel.config_id, ...form }
        : { class_id: classId, ...form };

      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: { action, data }
      });

      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.onHideModal();
        this.loadLevels();
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onDeleteLevel: function (e) {
    const level = e.currentTarget.dataset.level;
    wx.showModal({
      title: '确认删除',
      content: `确认删除"${level.level_name}"级别？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'manageDiscipline',
              data: { action: 'deleteLevelConfig', data: { config_id: level.config_id } }
            });
            if (result.result && result.result.success) {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadLevels();
            }
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  preventBubble: function () {}
});
