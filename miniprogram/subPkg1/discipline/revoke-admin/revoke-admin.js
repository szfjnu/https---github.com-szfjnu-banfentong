// pages/discipline/revoke-admin/revoke-admin.js - 撤销申请管理（班主任端汇总页）
const app = getApp();
const dh = require('../discipline-helper.js');

Page({
  data: {
    loading: true,
    classId: '',
    applications: [],
    filterStatus: 'pending',
    stats: { pending: 0, approved: 0, rejected: 0 },
    // 审核弹窗
    showReviewModal: false,
    reviewingApp: null,
    reviewAction: '',
    reviewComments: ''
  },

  onLoad: function () {
    this.setData({ classId: app.globalData.class_id });
  },

  onShow: function () {
    if (this.data.classId) this.loadApplications();
  },

  loadApplications: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: {
          action: 'getRevocationApplications',
          data: { class_id: this.data.classId }
        }
      });
      if (res.result && res.result.success) {
        const apps = (res.result.data || []).map(app => {
          app._statusText = dh.getRevokeStatusText(app.status);
          app._levelBadgeStyle = dh.getLevelBadgeStyle(app.levelColor);
          return app;
        });
        const pending = apps.filter(a => a.status === 'pending');
        const approved = apps.filter(a => a.status === 'approved');
        const rejected = apps.filter(a => a.status === 'rejected');
        this.setData({
          applications: apps,
          stats: { pending: pending.length, approved: approved.length, rejected: rejected.length }
        });
        this.updateDisplayList();
      }
    } catch (err) {
      console.error('加载撤销申请失败:', err);
    }
    this.setData({ loading: false });
  },

  updateDisplayList: function () {
    const { filterStatus, applications } = this.data;
    const displayList = filterStatus === 'all'
      ? applications
      : applications.filter(a => a.status === filterStatus);
    this.setData({ displayList });
  },

  onFilterChange: function (e) {
    this.setData({ filterStatus: e.currentTarget.dataset.status });
    this.updateDisplayList();
  },

  onShowReview: function (e) {
    const app = e.currentTarget.dataset.app;
    const action = e.currentTarget.dataset.action;
    this.setData({
      showReviewModal: true,
      reviewingApp: app,
      reviewAction: action,
      reviewComments: ''
    });
  },

  onHideReview: function () {
    this.setData({ showReviewModal: false, reviewingApp: null });
  },

  onReviewCommentInput: function (e) {
    this.setData({ reviewComments: e.detail.value });
  },

  onSubmitReview: async function () {
    const { reviewingApp, reviewAction, reviewComments } = this.data;
    if (!reviewingApp) return;

    wx.showLoading({ title: '提交中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: {
          action: 'reviewRevocationApplication',
          data: {
            application_id: reviewingApp.application_id,
            status: reviewAction,
            review_comments: reviewComments,
            reviewer_name: app.globalData.userInfo ? app.globalData.userInfo.nickName || '' : ''
          }
        }
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: reviewAction === 'approved' ? '已批准撤销' : '已拒绝申请', icon: 'success' });
        this.onHideReview();
        this.loadApplications();
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onViewRecord: function (e) {
    const recordId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/subPkg1/discipline/revoke-review/revoke-review?record_id=${recordId}` });
  },

  preventBubble: function () {}
});
