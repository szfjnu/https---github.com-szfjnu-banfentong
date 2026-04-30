// pages/discipline/record/record.js - 处分记录管理（班主任端）
const app = getApp();
const dh = require('./discipline-helper.js');

Page({
  data: {
    loading: true,
    classId: '',
    records: [],
    displayList: [],
    filterStatus: 'all',
    stats: { total: 0, active: 0, revoked: 0 },
    levelConfigs: [],
    page: 1,
    hasMore: true
  },

  onLoad: function () {
    this.setData({ classId: app.globalData.class_id });
  },

  onShow: function () {
    if (this.data.classId) {
      this.loadLevelConfigs();
      this.loadRecords();
      this.loadStats();
    }
  },

  loadLevelConfigs: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: { action: 'getLevelConfigs', data: { class_id: this.data.classId } }
      });
      if (res.result && res.result.success) {
        this.setData({ levelConfigs: res.result.data });
      }
    } catch (err) {
      console.error('加载级别配置失败:', err);
    }
  },

  loadRecords: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: {
          action: 'getDisciplineRecords',
          data: { class_id: this.data.classId, status: this.data.filterStatus === 'all' ? '' : this.data.filterStatus }
        }
      });
      if (res.result && res.result.success) {
        const records = res.result.data.map(r => dh.processRecordItem(r));
        this.setData({ records }, () => { this.updateDisplayList(); });
      }
    } catch (err) {
      console.error('加载处分记录失败:', err);
    }
    this.setData({ loading: false });
  },

  loadStats: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: { action: 'getDisciplineStats', data: { class_id: this.data.classId } }
      });
      if (res.result && res.result.success) {
        this.setData({ stats: res.result.data });
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  updateDisplayList: function () {
    const { filterStatus, records } = this.data;
    let displayList = records;
    if (filterStatus !== 'all') {
      displayList = records.filter(r => r.status === filterStatus);
    }
    this.setData({ displayList });
  },

  onFilterChange: function (e) {
    this.setData({ filterStatus: e.currentTarget.dataset.status });
    this.updateDisplayList();
  },

  onAddRecord: function () {
    wx.navigateTo({ url: '/subPages/discipline/record/add/add' });
  },

  onViewDetail: function (e) {
    const recordId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/subPages/discipline/revoke-review/revoke-review?record_id=${recordId}` });
  },

  onDeleteRecord: function (e) {
    const record = e.currentTarget.dataset.record;
    wx.showModal({
      title: '确认删除',
      content: `确认删除${record.student_name}的${record.discipline_level}处分记录？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'manageDiscipline',
              data: { action: 'deleteDisciplineRecord', data: { record_id: record.record_id } }
            });
            if (result.result && result.result.success) {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadRecords();
              this.loadStats();
            }
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  onGoLevelConfig: function () {
    wx.navigateTo({ url: '/subPages/discipline/level-config/level-config' });
  },

  onGoRevokeAdmin: function () {
    wx.navigateTo({ url: '/subPages/discipline/revoke-admin/revoke-admin' });
  },

  preventBubble: function () {}
});
