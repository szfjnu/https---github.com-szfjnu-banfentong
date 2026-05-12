const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    loading: true,
    records: [],
    
    // 筛选条件
    typeOptions: ['全部类型', '卫生检查', '纪律检查', '安全检查', '综合检查'],
    selectedTypeIndex: 0,
    selectedDate: '',
    
    // 分页
    page: 0,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,
    
    classId: ''
  },

  onLoad: function () {
    this.setData({
      classId: app.globalData.class_id
    });
    this.loadRecords();
  },

  onPullDownRefresh: function () {
    this.setData({ page: 0, hasMore: true });
    this.loadRecords().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载检查记录
  loadRecords: async function (refresh = true) {
    if (refresh) {
      this.setData({ loading: true, page: 0, hasMore: true });
    } else {
      this.setData({ loadingMore: true });
    }

    try {
      const { classId, selectedTypeIndex, selectedDate, page, pageSize } = this.data;
      const typeOptions = this.data.typeOptions;
      const skip = refresh ? 0 : page * pageSize;

      // 构建查询条件
      let query = {
        class_id: classId
      };

      // 类型筛选
      if (selectedTypeIndex > 0) {
        query.inspection_type = typeOptions[selectedTypeIndex];
      }

      // 日期筛选
      if (selectedDate) {
        query.inspection_date = selectedDate;
      }

      const res = await db.collection('dorm_inspection_records')
        .where(query)
        .orderBy('inspection_date', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get();

      // 格式化状态文本
      const newRecords = res.data.map(r => ({
        ...r,
        status_text: this.getStatusText(r.status)
      }));

      const records = refresh ? newRecords : [...this.data.records, ...newRecords];

      this.setData({
        records,
        loading: false,
        loadingMore: false,
        hasMore: newRecords.length === pageSize,
        page: refresh ? 0 : page
      });

    } catch (err) {
      console.error('加载检查记录失败:', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 获取状态文本
  getStatusText: function (status) {
    const map = {
      pending: '待处理',
      processed: '已处理',
      archived: '已归档'
    };
    return map[status] || '未知';
  },

  // 类型筛选变化
  onTypeChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({ selectedTypeIndex: index });
    this.loadRecords(true);
  },

  // 日期筛选变化
  onDateChange: function (e) {
    const date = e.detail.value;
    this.setData({ selectedDate: date });
    this.loadRecords(true);
  },

  // 加载更多
  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadRecords(false);
    }
  },

  // 查看详情
  viewDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPkg2/dorm/inspection/detail/detail?id=${id}`
    });
  },

  // 新建检查记录
  goToAdd: function () {
    wx.navigateTo({
      url: '/subPkg2/dorm/inspection/add/add'
    });
  }
});
