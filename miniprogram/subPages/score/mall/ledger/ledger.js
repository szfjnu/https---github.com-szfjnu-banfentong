// pages/score/mall/ledger/ledger.js
const app = getApp();
const util = require('../../../../utils/util.js');

Page({
  data: {
    loading: true,
    activeTab: 'pending',

    // 待审批
    pendingRequests: [],
    // 已通过
    approvedRequests: [],
    // 已发货
    shippedRequests: [],
    // 全部
    allRequests: [],

    // 统计
    stats: {
      pendingCount: 0,
      approvedCount: 0,
      shippedCount: 0,
      totalScore: 0
    },

    // 搜索
    searchKeyword: '',

    // 权限
    canManage: false
  },

  onLoad: function () {
    const role = app.globalData.role;
    const canManage = ['admin', 'head_teacher', 'class_cadre'].includes(role);
    
    if (!canManage) {
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }

    this.setData({ canManage });
  },

  onShow: function () {
    this.loadData();
  },

  onPullDownRefresh: function () {
    this.loadData();
  },

  loadData: async function () {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const classId = app.globalData.class_id;

      const res = await db.collection('redemption_requests')
        .where({ class_id: classId })
        .orderBy('created_at', 'desc')
        .limit(200)
        .get();

      const allRequests = (res.data || []).map(item => ({
        ...item,
        created_at_text: item.created_at ? util.formatDateTime(new Date(item.created_at)) : '',
        approval_time_text: item.approval_time ? util.formatDateTime(new Date(item.approval_time)) : '',
        shipping_status_text: this.getShippingText(item.shipping_status),
        statusClass: this.getStatusClass(item.status)
      }));

      const pendingRequests = allRequests.filter(r => r.status === '待审批');
      const approvedRequests = allRequests.filter(r => r.status === '已通过');
      const shippedRequests = allRequests.filter(r => r.status === '已发货' || r.status === '已收货');

      // 统计
      const totalScore = allRequests
        .filter(r => r.status === '已通过' || r.status === '已发货' || r.status === '已收货')
        .reduce((sum, r) => sum + (r.bid_score || r.required_score || 0), 0);

      this.setData({
        allRequests,
        pendingRequests,
        approvedRequests,
        shippedRequests,
        stats: {
          pendingCount: pendingRequests.length,
          approvedCount: approvedRequests.length,
          shippedCount: shippedRequests.length,
          totalScore: totalScore
        },
        loading: false
      });

      wx.stopPullDownRefresh();

    } catch (err) {
      console.error('加载台账失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  getShippingText: function (status) {
    const map = {
      'shipped': '已发货',
      'received': '已收货',
      'pending': '待发货'
    };
    return map[status] || '待发货';
  },

  getStatusClass: function (status) {
    const map = {
      '待审批': 'pending',
      '已通过': 'approved',
      '已拒绝': 'rejected',
      '已发货': 'shipped',
      '已收货': 'received'
    };
    return map[status] || 'pending';
  },

  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 班委审核 - 批准
  onApprove: async function (e) {
    const request = e.currentTarget.dataset.request;
    const role = app.globalData.role;

    if (role === 'class_cadre') {
      // 班委只能初审，推送班主任
      wx.showModal({
        title: '班委初审通过',
        content: `确认初审通过"${request.item_name}"的兑换申请吗？将推送至班主任最终审批。`,
        success: async (res) => {
          if (res.confirm) {
            try {
              const db = wx.cloud.database();
              await db.collection('redemption_requests').doc(request._id).update({
                data: {
                  status: '待班主任审批',
                  cadre_approver: app.globalData.userInfo?.nickName || '班委',
                  cadre_approval_time: db.serverDate(),
                  updated_at: db.serverDate()
                }
              });
              wx.showToast({ title: '初审通过', icon: 'success' });
              this.loadData();
            } catch (err) {
              console.error('初审失败:', err);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    } else {
      // 班主任/管理员直接批准
      wx.showModal({
        title: '确认批准',
        content: `确认批准"${request.item_name}"的兑换申请吗？将扣除${request.bid_score || request.required_score}积分。`,
        success: async (res) => {
          if (res.confirm) {
            await this.processApprove(request);
          }
        }
      });
    }
  },

  // 处理批准逻辑
  processApprove: async function (request) {
    try {
      wx.showLoading({ title: '处理中...', mask: true });
      const db = wx.cloud.database();

      // 更新兑换请求状态
      await db.collection('redemption_requests').doc(request._id).update({
        data: {
          status: '已通过',
          approver: app.globalData.userInfo?.nickName || '管理员',
          approval_time: db.serverDate(),
          shipping_status: 'pending',
          updated_at: db.serverDate()
        }
      });

      // 扣除学生积分
      const score = request.bid_score || request.required_score || 0;
      if (score > 0) {
        await db.collection('students')
          .where({
            student_id: request.student_id,
            class_id: request.class_id
          })
          .update({
            data: {
              current_score: db.command.inc(-score),
              updated_at: db.serverDate()
            }
          });
      }

      // 更新商品库存
      if (request.item_id) {
        const itemRes = await db.collection('redemption_items')
          .where({ item_id: request.item_id })
          .limit(1)
          .get();

        if (itemRes.data && itemRes.data.length > 0) {
          await db.collection('redemption_items').doc(itemRes.data[0]._id).update({
            data: {
              quantity: db.command.inc(-1),
              updated_at: db.serverDate()
            }
          });
        }
      }

      wx.hideLoading();
      wx.showToast({ title: '批准成功', icon: 'success' });
      this.loadData();

    } catch (err) {
      console.error('批准失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 拒绝兑换
  onReject: async function (e) {
    const request = e.currentTarget.dataset.request;

    wx.showModal({
      title: '拒绝兑换',
      content: `确定要拒绝"${request.item_name}"的兑换申请吗？`,
      editable: true,
      placeholderText: '请输入拒绝原因（选填）',
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database();
            await db.collection('redemption_requests').doc(request._id).update({
              data: {
                status: '已拒绝',
                reject_reason: res.content || '',
                approver: app.globalData.userInfo?.nickName || '管理员',
                approval_time: db.serverDate(),
                updated_at: db.serverDate()
              }
            });
            wx.showToast({ title: '已拒绝', icon: 'success' });
            this.loadData();
          } catch (err) {
            console.error('拒绝失败:', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 确认发货
  onShip: async function (e) {
    const request = e.currentTarget.dataset.request;

    wx.showModal({
      title: '确认发货',
      content: `确认"${request.item_name}"已发货给${request.student_name}吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database();
            await db.collection('redemption_requests').doc(request._id).update({
              data: {
                status: '已发货',
                shipping_status: 'shipped',
                shipped_at: db.serverDate(),
                updated_at: db.serverDate()
              }
            });
            wx.showToast({ title: '已确认发货', icon: 'success' });
            this.loadData();
          } catch (err) {
            console.error('确认发货失败:', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 搜索
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  }
});
