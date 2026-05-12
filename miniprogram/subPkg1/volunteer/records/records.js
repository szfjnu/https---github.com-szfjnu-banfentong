// pages/volunteer/records/records.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    records: [],
    loading: true,
    hasMore: true,
    page: 0,
    pageSize: 20,
    studentId: '',
    classId: '',
    
    // 筛选
    statusOptions: [
      { value: '', label: '全部状态' },
      { value: '待班委审核', label: '待班委审核' },
      { value: '待班主任审核', label: '待班主任审核' },
      { value: '已通过', label: '已通过' },
      { value: '已拒绝', label: '已拒绝' }
    ],
    selectedStatus: '',
    selectedStatusLabel: '全部状态'
  },

  onLoad: function () {
    const role = app.globalData.role;
    const studentId = app.globalData.student_id;
    const classId = app.globalData.class_id;
    
    if (!studentId) {
      wx.showToast({ title: '未找到学生信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    
    this.setData({ studentId, classId });
    this.loadRecords();
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
      const { studentId, classId, selectedStatus, page, pageSize } = this.data;
      
      let query = { student_id: studentId, class_id: classId };
      
      if (selectedStatus) {
        query.approval_status = selectedStatus;
      }
      
      const res = await db.collection('volunteer_records')
        .where(query)
        .orderBy('created_at', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get();
      
      const records = (res.data || []).map(item => ({
        ...item,
        dateStr: item.date ? util.formatDate(new Date(item.date)) : '',
        statusClass: this.getStatusClass(item.approval_status),
        statusText: this.getStatusText(item.approval_status, item.is_verified)
      }));
      
      this.setData({
        records: this.data.page === 0 ? records : [...this.data.records, ...records],
        hasMore: records.length === pageSize,
        loading: false
      });
      
      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载记录失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
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

  onStatusChange: function (e) {
    const index = e.detail.value;
    const selected = this.data.statusOptions[index];
    this.setData({
      selectedStatus: selected.value,
      selectedStatusLabel: selected.label
    });
    this.onRefresh();
  },

  onRecordDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPkg1/volunteer/detail/detail?id=${id}`
    });
  },

  onAddRecord: function () {
    wx.navigateTo({
      url: '/subPkg1/volunteer/add/add'
    });
  }
});
