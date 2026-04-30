// pages/discipline/revoke-review/revoke-review.js - 撤销审核（班主任端）
const app = getApp();
const dh = require('./discipline-helper.js');

Page({
  data: {
    loading: true,
    recordId: '',
    record: null,
    // 审核弹窗
    showReviewModal: false,
    reviewAction: '',
    reviewComments: '',
    reviewerName: '',
    submitting: false
  },

  onLoad: function (options) {
    const recordId = options.record_id;
    if (!recordId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({
      recordId,
      reviewerName: app.globalData.userInfo ? app.globalData.userInfo.nickName || '' : ''
    });
    this.loadDetail();
  },

  loadDetail: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: { action: 'getDisciplineDetail', data: { record_id: this.data.recordId } }
      });
      if (res.result && res.result.success) {
        this.setData({ record: dh.processRecordDetail(res.result.data) });
      }
    } catch (err) {
      console.error('加载详情失败:', err);
    }
    this.setData({ loading: false });
  },

  onShowReview: function (e) {
    const action = e.currentTarget.dataset.action;
    this.setData({ showReviewModal: true, reviewAction: action, reviewComments: '' });
  },

  onHideReview: function () {
    this.setData({ showReviewModal: false });
  },

  onReviewCommentInput: function (e) {
    this.setData({ reviewComments: e.detail.value });
  },

  onSubmitReview: async function () {
    const { reviewAction, reviewComments, reviewerName, record } = this.data;
    if (!record) return;

    // 查找待审核的撤销申请
    const pendingApp = record.revocationApplications.find(a => a.status === 'pending');
    if (!pendingApp) {
      wx.showToast({ title: '没有待审核的申请', icon: 'none' });
      this.onHideReview();
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: {
          action: 'reviewRevocationApplication',
          data: {
            application_id: pendingApp.application_id,
            status: reviewAction,
            review_comments: reviewComments,
            reviewer_name: reviewerName
          }
        }
      });

      if (res.result && res.result.success) {
        wx.showToast({ title: reviewAction === 'approved' ? '已批准撤销' : '已拒绝申请', icon: 'success' });
        this.onHideReview();
        this.loadDetail();
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
    this.setData({ submitting: false });
  },

  preventBubble: function () {}
});
