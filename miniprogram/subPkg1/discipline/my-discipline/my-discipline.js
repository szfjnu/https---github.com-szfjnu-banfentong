// pages/discipline/my-discipline/my-discipline.js - 学生端我的处分
const app = getApp();
const dh = require('../discipline-helper.js');

Page({
  data: {
    loading: true,
    studentId: '',
    classId: '',
    records: [],
    displayList: [],
    activeTab: 'active',
    isCurrentEmpty: false,
    stats: { total: 0, active: 0, revoked: 0 }
  },

  onLoad: function () {
    const studentId = app.globalData.student_id;
    const classId = app.globalData.class_id;
    if (!studentId) {
      wx.showToast({ title: '未获取到学生信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ studentId, classId });
    this.loadData();
  },

  onShow: function () {
    if (this.data.studentId) this.loadData();
  },

  loadData: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: { action: 'getMyDisciplineRecords', data: { student_id: this.data.studentId } }
      });
      if (res.result && res.result.success) {
        const records = res.result.data.map(r => dh.processRecordItem(r));
        const active = records.filter(r => r.status === 'active');
        const revoked = records.filter(r => r.status === 'revoked');
        this.setData({
          records,
          stats: { total: records.length, active: active.length, revoked: revoked.length }
        });
        this.updateDisplayList();
      }
    } catch (err) {
      console.error('加载处分记录失败:', err);
    }
    this.setData({ loading: false });
  },

  updateDisplayList: function () {
    const { activeTab, records } = this.data;
    let displayList = records;
    if (activeTab === 'active') {
      displayList = records.filter(r => r.status === 'active');
    } else if (activeTab === 'revoked') {
      displayList = records.filter(r => r.status === 'revoked');
    }
    this.setData({ displayList, isCurrentEmpty: displayList.length === 0 });
  },

  onTabChange: function (e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
    this.updateDisplayList();
  },

  onApplyRevoke: function (e) {
    const recordId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/subPkg1/discipline/revoke-apply/revoke-apply?record_id=${recordId}` });
  },

  onViewDetail: function (e) {
    const recordId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/subPkg1/discipline/revoke-apply/revoke-apply?record_id=${recordId}` });
  }
});
