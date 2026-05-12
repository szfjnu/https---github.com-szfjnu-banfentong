// pages/volunteer/detail/detail.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    record: null,
    loading: true,
    recordId: ''
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ recordId: options.id });
      this.loadRecord(options.id);
    }
  },

  loadRecord: async function (id) {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('volunteer_records').doc(id).get();

      if (res.data) {
        const record = res.data;
        this.setData({
          record: {
            ...record,
            dateStr: record.date ? util.formatDate(new Date(record.date)) : '',
            createdStr: record.created_at ? util.formatDateTime(new Date(record.created_at)) : '',
            statusClass: this.getStatusClass(record.approval_status),
            statusText: this.getStatusText(record.approval_status, record.is_verified),
            typeColor: this.getTypeColor(record.service_type)
          },
          loading: false
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: '记录不存在', icon: 'none' });
      }
    } catch (err) {
      console.error('加载记录失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  getStatusClass: function (status) {
    const map = {
      '待班委审核': 'pending',
      '待班主任审核': 'pending-head',
      '已通过': 'approved',
      '已拒绝': 'rejected'
    };
    return map[status] || 'pending';
  },

  getStatusText: function (status, isVerified) {
    if (isVerified) return '已通过';
    return status || '待审核';
  },

  getTypeColor: function (type) {
    const colorMap = {
      '社区服务': '#1890ff',
      '环保活动': '#52c41a',
      '助老助残': '#fa8c16',
      '支教助学': '#722ed1',
      '其他': '#999999'
    };
    return colorMap[type] || '#999999';
  },

  // 预览图片
  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    const urls = this.data.record.proof_images || [];
    wx.previewImage({
      current: url,
      urls: urls
    });
  }
});
