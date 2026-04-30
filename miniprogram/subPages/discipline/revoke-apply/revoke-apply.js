// pages/discipline/revoke-apply/revoke-apply.js - 撤销申请（学生端）
const app = getApp();
const dh = require('./discipline-helper.js');

Page({
  data: {
    loading: true,
    recordId: '',
    studentId: '',
    record: null,
    // 思想汇报提交
    showThoughtModal: false,
    thoughtForm: { title: '', content: '', report_month: '' },
    // 服务令提交
    showServiceModal: false,
    serviceForm: { service_type: '', hours: 0, description: '', date: '' },
    // 撤销申请
    showRevokeModal: false,
    revokeForm: { application_reason: '', student_self_reflection: '' },
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
      studentId: app.globalData.student_id
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

  // 思想汇报
  onShowThoughtModal: function () {
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    this.setData({
      showThoughtModal: true,
      thoughtForm: { title: '思想汇报', content: '', report_month: month }
    });
  },

  onThoughtInput: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`thoughtForm.${field}`]: e.detail.value });
  },

  onSubmitThought: async function () {
    const { thoughtForm, recordId, studentId } = this.data;
    if (!thoughtForm.content) { wx.showToast({ title: '请填写汇报内容', icon: 'none' }); return; }

    this.setData({ submitting: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: {
          action: 'submitThoughtReport',
          data: {
            discipline_record_id: recordId,
            student_id: studentId,
            student_name: app.globalData.userInfo ? app.globalData.userInfo.nickName || '' : '',
            title: thoughtForm.title,
            content: thoughtForm.content,
            report_month: thoughtForm.report_month
          }
        }
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: '提交成功', icon: 'success' });
        this.setData({ showThoughtModal: false });
        this.loadDetail();
      } else {
        wx.showToast({ title: res.result.message || '提交失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
    this.setData({ submitting: false });
  },

  // 服务令
  onShowServiceModal: function () {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    this.setData({
      showServiceModal: true,
      serviceForm: { service_type: '服务令', hours: 0, description: '', date: dateStr }
    });
  },

  onServiceInput: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`serviceForm.${field}`]: field === 'hours' ? Number(e.detail.value) : e.detail.value });
  },

  onServiceDateChange: function (e) {
    this.setData({ 'serviceForm.date': e.detail.value });
  },

  onSubmitService: async function () {
    const { serviceForm, recordId, studentId } = this.data;
    if (!serviceForm.hours || serviceForm.hours <= 0) { wx.showToast({ title: '请填写服务时长', icon: 'none' }); return; }

    this.setData({ submitting: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: {
          action: 'submitServiceRecord',
          data: {
            discipline_record_id: recordId,
            student_id: studentId,
            student_name: app.globalData.userInfo ? app.globalData.userInfo.nickName || '' : '',
            service_type: serviceForm.service_type,
            hours: serviceForm.hours,
            description: serviceForm.description,
            date: serviceForm.date
          }
        }
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: '提交成功', icon: 'success' });
        this.setData({ showServiceModal: false });
        this.loadDetail();
      } else {
        wx.showToast({ title: res.result.message || '提交失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
    this.setData({ submitting: false });
  },

  // 撤销申请
  onShowRevokeModal: function () {
    this.setData({
      showRevokeModal: true,
      revokeForm: { application_reason: '', student_self_reflection: '' }
    });
  },

  onRevokeInput: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`revokeForm.${field}`]: e.detail.value });
  },

  onSubmitRevoke: async function () {
    const { revokeForm, recordId, studentId } = this.data;
    if (!revokeForm.application_reason) { wx.showToast({ title: '请填写申请理由', icon: 'none' }); return; }

    this.setData({ submitting: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: {
          action: 'submitRevocationApplication',
          data: {
            discipline_record_id: recordId,
            student_id: studentId,
            student_name: app.globalData.userInfo ? app.globalData.userInfo.nickName || '' : '',
            application_reason: revokeForm.application_reason,
            student_self_reflection: revokeForm.student_self_reflection
          }
        }
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: '撤销申请已提交', icon: 'success' });
        this.setData({ showRevokeModal: false });
        this.loadDetail();
      } else {
        wx.showToast({ title: res.result.message || '提交失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
    this.setData({ submitting: false });
  },

  onHideModal: function () {
    this.setData({ showThoughtModal: false, showServiceModal: false, showRevokeModal: false });
  },

  preventBubble: function () {}
});
