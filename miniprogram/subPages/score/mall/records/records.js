// pages/score/mall/records/records.js
const app = getApp();
const util = require('../../../../utils/util.js');

Page({
  data: {
    records: [],
    loading: true,
    hasMore: true,
    page: 0,
    pageSize: 20,
    studentId: '',

    // 筛选
    statusOptions: [
      { value: '', label: '全部状态' },
      { value: '待审批', label: '待审批' },
      { value: '已通过', label: '已通过' },
      { value: '已拒绝', label: '已拒绝' },
      { value: '已发货', label: '已发货' },
      { value: '已收货', label: '已收货' }
    ],
    selectedStatus: '',
    selectedStatusLabel: '全部状态'
  },

  onLoad: function () {
    const studentId = app.globalData.student_id;
    if (!studentId) {
      wx.showToast({ title: '未找到学生信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ studentId });
  },

  onShow: function () {
    this.onRefresh();
  },

  onPullDownRefresh: function () {
    this.onRefresh();
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  onRefresh: function () {
    this.setData({ page: 0, hasMore: true, records: [] });
    this.loadRecords();
  },

  loadMore: function () {
    this.setData({ page: this.data.page + 1 });
    this.loadRecords();
  },

  loadRecords: async function () {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const { studentId, selectedStatus, page, pageSize } = this.data;

      let query = { student_id: studentId };

      // 班级维度权限隔离
      const classId = app.globalData.class_id;
      if (classId) query.class_id = classId;

      if (selectedStatus) {
        query.status = selectedStatus;
      }

      const res = await db.collection('redemption_requests')
        .where(query)
        .orderBy('created_at', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get();

      const records = (res.data || []).map(item => ({
        ...item,
        dateStr: item.created_at ? util.formatDateTime(new Date(item.created_at)) : '',
        statusClass: this.getStatusClass(item.status),
        modeText: item.redemption_mode === '投标模式' ? '投标' : '直接',
        bidScoreText: item.bid_score ? `${item.bid_score}分` : `${item.required_score}分`,
        shippingText: item.shipping_status === 'shipped' ? '已发货' : (item.shipping_status === 'received' ? '已收货' : '待发货')
      }));

      this.setData({
        records: this.data.page === 0 ? records : [...this.data.records, ...records],
        hasMore: records.length === pageSize,
        loading: false
      });

      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载兑换记录失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  getStatusClass: function (status) {
    const map = {
      '待审批': 'pending',
      '已通过': 'approved',
      '已拒绝': 'rejected',
      '已发货': 'shipped',
      '已收货': 'received',
      '已中标': 'winning',
      '未中标': 'lost'
    };
    return map[status] || 'pending';
  },

  onStatusChange: function (e) {
    const index = e.detail.value;
    const selected = this.data.statusOptions[index];
    this.setData({
      selectedStatus: selected.value,
      selectedStatusLabel: selected.label
    });
    this.onRefresh();
  },

  // 确认收货
  onConfirmReceive: async function (e) {
    const record = e.currentTarget.dataset.record;
    wx.showModal({
      title: '确认收货',
      content: `确认已收到"${record.item_name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database();
            await db.collection('redemption_requests').doc(record._id).update({
              data: {
                shipping_status: 'received',
                received_at: db.serverDate(),
                status: '已收货',
                updated_at: db.serverDate()
              }
            });
            wx.showToast({ title: '已确认收货', icon: 'success' });
            this.onRefresh();
          } catch (err) {
            console.error('确认收货失败:', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 返回商城
  onBackToMall: function () {
    wx.navigateBack();
  }
});
