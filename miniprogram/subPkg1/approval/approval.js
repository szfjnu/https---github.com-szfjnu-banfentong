// pages/approval/approval.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    activeTab: 'pending',    // pending, approved, rejected, mine
    businessType: '',        // 空=全部, volunteer, certificate, competition
    approvals: [],
    loading: true,
    hasMore: true,
    page: 0,
    pageSize: 20,
    stats: {
      pendingCadre: 0,
      pendingTeacher: 0,
      approved: 0,
      rejected: 0
    },
    // 权限
    canApproveCadre: false,
    canApproveTeacher: false,
    // 业务类型选项
    businessTypes: [
      { value: '', label: '全部类型' },
      { value: 'volunteer', label: '志愿服务' },
      { value: 'score', label: '积分变动' },
      { value: 'attendance', label: '考勤记录' },
      { value: 'duty', label: '值日管理' },
      { value: 'dorm', label: '宿舍管理' },
      { value: 'discipline', label: '处分管理' }
    ],
    businessTypeIndex: 0
  },

  onLoad: function (options) {
    const classId = app.globalData.class_id;
    const role = app.globalData.role;

    if (!classId) {
      wx.showToast({ title: '请先选择班级', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({
      currentClassId: classId,
      canApproveCadre: ['class_cadre', 'head_teacher', 'admin'].includes(role),
      canApproveTeacher: ['head_teacher', 'admin'].includes(role)
    });

    // 学生角色：检查是否有审批权限（通过 student_authorizations）
    if (role === 'student') {
      this.checkStudentApprovePermission();
    }

    // 确定默认标签
    if (this.data.canApproveTeacher) {
      this.setData({ activeTab: 'pending' });
    } else if (this.data.canApproveCadre) {
      this.setData({ activeTab: 'pending' });
    } else {
      this.setData({ activeTab: 'mine' });
    }

    if (options.type) {
      const idx = this.data.businessTypes.findIndex(b => b.value === options.type);
      if (idx >= 0) {
        this.setData({ businessType: options.type, businessTypeIndex: idx });
      }
    }
  },

  // 检查学生是否有审批权限
  checkStudentApprovePermission: async function () {
    try {
      const db = wx.cloud.database();
      const studentId = app.globalData.student_id;
      const classId = app.globalData.class_id;
      if (!studentId || !classId) return;

      const res = await db.collection('student_authorizations')
        .where({ class_id: classId, student_id: studentId })
        .limit(1)
        .get();

      if (res.data && res.data.length > 0) {
        const permissions = res.data[0].permissions || {};
        // 检查任意模块是否有 approve 权限
        const hasApprove = Object.values(permissions).some(actions =>
          Array.isArray(actions) && actions.includes('approve')
        );
        if (hasApprove) {
          this.setData({ canApproveCadre: true });
        }
      }
    } catch (err) {
      console.error('检查审批权限失败:', err);
    }
  },

  onShow: function () {
    this.onRefresh();
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.onRefresh();
  },

  // 刷新
  onRefresh: function () {
    this.setData({ page: 0, hasMore: true, approvals: [] });
    this.loadStats();
    this.loadApprovals();
  },

  // 加载统计
  loadStats: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'approvalWorkflow',
        data: {
          action: 'getApprovalStats',
          data: {
            classId: this.data.currentClassId,
            businessType: this.data.businessType
          }
        }
      });

      if (res.result.success) {
        this.setData({ stats: res.result.data });
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 加载审批列表
  loadApprovals: async function () {
    this.setData({ loading: true });

    try {
      const role = app.globalData.role;
      let status = '';

      if (this.data.activeTab === 'pending') {
        if (this.data.canApproveCadre && !this.data.canApproveTeacher) {
          status = 'pending_cadre';
        } else if (this.data.canApproveTeacher) {
          status = 'pending_teacher';
        }
      } else if (this.data.activeTab === 'approved') {
        status = 'approved';
      } else if (this.data.activeTab === 'rejected') {
        status = 'rejected';
      }

      const res = await wx.cloud.callFunction({
        name: 'approvalWorkflow',
        data: {
          action: 'getPendingApprovals',
          data: {
            classId: this.data.currentClassId,
            businessType: this.data.businessType,
            status: status,
            page: this.data.page,
            pageSize: this.data.pageSize
          }
        }
      });

      if (res.result.success) {
        const approvals = (res.result.data.list || []).map(item => ({
          ...item,
          createdTimeStr: item.created_at ? util.formatTime(new Date(item.created_at)) : '',
          statusLabel: this.getStatusLabel(item.status),
          statusColor: this.getStatusColor(item.status),
          businessTypeLabel: this.getBusinessTypeLabel(item.business_type)
        }));

        this.setData({
          approvals: this.data.page === 0 ? approvals : [...this.data.approvals, ...approvals],
          hasMore: res.result.data.hasMore,
          loading: false
        });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载审批列表失败:', err);
      this.setData({ loading: false });
    }

    wx.stopPullDownRefresh();
  },

  // 标签切换
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab, page: 0, hasMore: true, approvals: [] });
    this.loadApprovals();
  },

  // 业务类型切换
  onBusinessTypeChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      businessTypeIndex: index,
      businessType: this.data.businessTypes[index].value
    });
    this.onRefresh();
  },

  // 查看详情
  onViewDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPkg1/approval/detail/detail?id=${id}`
    });
  },

  // 快速审批
  onQuickApprove: function (e) {
    const approval = e.currentTarget.dataset.item;
    this.doApproval(approval._id, true);
  },

  onQuickReject: function (e) {
    const approval = e.currentTarget.dataset.item;
    wx.showModal({
      title: '驳回原因',
      editable: true,
      placeholderText: '请输入驳回原因',
      success: (res) => {
        if (res.confirm) {
          this.doApproval(approval._id, false, res.content || '');
        }
      }
    });
  },

  // 执行审批
  doApproval: async function (approvalId, approved, note = '') {
    const role = app.globalData.role;
    let action;

    // 班委或有审批权限的学生使用 cadre 审批
    if (role === 'class_cadre' || (role === 'student' && this.data.canApproveCadre)) {
      action = 'approveByCadre';
    } else if (role === 'head_teacher' || role === 'admin') {
      action = 'approveByTeacher';
    } else {
      action = 'approveByCadre'; // 默认尝试班委审批
    }

    wx.showLoading({ title: '处理中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'approvalWorkflow',
        data: {
          action: action,
          data: {
            approvalId: approvalId,
            approved: approved,
            note: note
          }
        }
      });

      wx.hideLoading();

      if (res.result.success) {
        wx.showToast({
          title: approved ? '已通过' : '已驳回',
          icon: 'success'
        });
        this.onRefresh();
      } else {
        wx.showToast({
          title: res.result.error || '操作失败',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('审批失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 获取状态标签
  getStatusLabel: function (status) {
    const map = {
      pending_cadre: '待班委审核',
      pending_teacher: '待班主任审核',
      approved: '已通过',
      rejected: '已驳回'
    };
    return map[status] || status;
  },

  // 获取状态颜色
  getStatusColor: function (status) {
    const map = {
      pending_cadre: '#fa8c16',
      pending_teacher: '#1890ff',
      approved: '#52c41a',
      rejected: '#ff4d4f'
    };
    return map[status] || '#999';
  },

  // 获取业务类型标签
  getBusinessTypeLabel: function (type) {
    const map = {
      volunteer: '志愿服务',
      certificate: '技能证书',
      competition: '技能比赛',
      score: '积分变动',
      attendance: '考勤记录',
      duty: '值日管理',
      dorm: '宿舍管理',
      discipline: '处分管理'
    };
    return map[type] || type;
  }
});
