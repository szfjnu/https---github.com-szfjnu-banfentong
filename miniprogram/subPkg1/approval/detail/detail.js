// pages/approval/detail/detail.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    approvalId: '',
    approval: null,
    businessRecord: null,
    loading: true,
    // 审批操作
    canApprove: false,
    approveAction: '',  // approveByCadre, approveByTeacher
    rejectNote: '',
    showRejectModal: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ approvalId: options.id });
      this.loadData();
    }
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      // 获取审批详情
      const res = await wx.cloud.callFunction({
        name: 'approvalWorkflow',
        data: {
          action: 'getApprovalDetail',
          data: { approvalId: this.data.approvalId }
        }
      });

      if (res.result.success && res.result.data) {
        const approval = res.result.data;

        // 格式化审批历史
        const history = (approval.approval_history || []).map(h => ({
          ...h,
          timeStr: h.time ? util.formatTime(new Date(h.time)) : '',
          actionLabel: this.getActionLabel(h.action),
          stepLabel: this.getStepLabel(h.step)
        }));

        this.setData({
          approval: {
            ...approval,
            createdTimeStr: approval.created_at ? util.formatTime(new Date(approval.created_at)) : '',
            statusLabel: this.getStatusLabel(approval.status),
            statusColor: this.getStatusColor(approval.status),
            businessTypeLabel: this.getBusinessTypeLabel(approval.business_type),
            formattedHistory: history
          },
          loading: false
        });

        // 判断审批权限
        this.checkApprovalPermission(approval);

        // 加载业务记录
        this.loadBusinessRecord(approval);
      } else {
        this.setData({ loading: false });
        util.showError('加载失败');
      }
    } catch (err) {
      console.error('加载审批详情失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 检查审批权限
  checkApprovalPermission: function (approval) {
    const role = app.globalData.role;

    if (approval.status === 'pending_cadre' && ['class_cadre', 'head_teacher', 'admin'].includes(role)) {
      this.setData({ canApprove: true, approveAction: 'approveByCadre' });
    } else if (approval.status === 'pending_teacher' && ['head_teacher', 'admin'].includes(role)) {
      this.setData({ canApprove: true, approveAction: 'approveByTeacher' });
    } else {
      this.setData({ canApprove: false });
    }
  },

  // 加载业务记录
  loadBusinessRecord: async function (approval) {
    try {
      const collectionMap = {
        volunteer: 'volunteer_records',
        certificate: 'certificates',
        competition: 'competition_records'
      };

      const collection = collectionMap[approval.business_type];
      if (!collection) return;

      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: {
          action: 'getClassDetail',
          data: { classId: approval.class_id }
        }
      });

      // 使用业务ID获取记录
      try {
        const db = wx.cloud.database();
        const recordRes = await db.collection(collection).doc(approval.business_id).get();
        if (recordRes.data) {
          this.setData({ businessRecord: recordRes.data });
        }
      } catch (e) {
        // 可能无权限读取，尝试通过云函数
        console.log('直接读取失败，尝试其他方式');
      }
    } catch (err) {
      console.error('加载业务记录失败:', err);
    }
  },

  // 通过
  onApprove: function () {
    wx.showModal({
      title: '确认通过',
      content: '确定要通过此审批吗？',
      success: (res) => {
        if (res.confirm) {
          this.doApproval(true, '');
        }
      }
    });
  },

  // 驳回
  onReject: function () {
    this.setData({ showRejectModal: true, rejectNote: '' });
  },

  // 驳回原因输入
  onRejectNoteInput: function (e) {
    this.setData({ rejectNote: e.detail.value });
  },

  // 确认驳回
  onConfirmReject: function () {
    if (!this.data.rejectNote.trim()) {
      util.showError('请输入驳回原因');
      return;
    }
    this.doApproval(false, this.data.rejectNote.trim());
    this.setData({ showRejectModal: false });
  },

  // 取消驳回
  onCancelReject: function () {
    this.setData({ showRejectModal: false });
  },

  // 执行审批
  doApproval: async function (approved, note) {
    wx.showLoading({ title: '处理中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'approvalWorkflow',
        data: {
          action: this.data.approveAction,
          data: {
            approvalId: this.data.approvalId,
            approved: approved,
            note: note
          }
        }
      });

      wx.hideLoading();

      if (res.result.success) {
        wx.showToast({ title: approved ? '已通过' : '已驳回', icon: 'success' });
        setTimeout(() => this.loadData(), 1500);
      } else {
        util.showError(res.result.error || '操作失败');
      }
    } catch (err) {
      console.error('审批失败:', err);
      wx.hideLoading();
      util.showError('操作失败');
    }
  },

  // 辅助方法
  getStatusLabel: function (status) {
    const map = { pending_cadre: '待班委审核', pending_teacher: '待班主任审核', approved: '已通过', rejected: '已驳回' };
    return map[status] || status;
  },

  getStatusColor: function (status) {
    const map = { pending_cadre: '#fa8c16', pending_teacher: '#1890ff', approved: '#52c41a', rejected: '#ff4d4f' };
    return map[status] || '#999';
  },

  getBusinessTypeLabel: function (type) {
    const map = { volunteer: '志愿服务', certificate: '技能证书', competition: '技能比赛' };
    return map[type] || type;
  },

  getActionLabel: function (action) {
    const map = { submit: '提交', approve: '通过', reject: '驳回' };
    return map[action] || action;
  },

  getStepLabel: function (step) {
    const map = { submit: '提交', cadre: '班委审核', teacher: '班主任审核' };
    return map[step] || step;
  },

  preventBubble() {},
});
