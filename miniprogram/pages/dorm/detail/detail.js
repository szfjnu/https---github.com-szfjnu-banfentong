const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    studentId: '',
    student: {
      name: '',
      class_name: '',
      dorm_info: {},
      dorm_score: 100
    },
    accounts: {
      original_score: 100,
      converted_score: 0
    },
    records: [],
    
    // 分页
    page: 0,
    pageSize: 20,
    hasMore: true,
    loadingMore: false
  },

  onLoad: function (options) {
    const studentId = options.student_id;
    if (studentId) {
      this.setData({ studentId });
      this.loadStudentInfo();
      this.loadRecords();
    }
  },

  // 加载学生信息
  loadStudentInfo: async function () {
    try {
      const { studentId } = this.data;
      
      const res = await db.collection('students')
        .where({
          student_id: studentId
        })
        .limit(1)
        .get();

      if (res.data.length > 0) {
        this.setData({
          student: res.data[0]
        });
        
        // 加载积分账户
        this.loadAccounts();
      }

    } catch (err) {
      console.error('加载学生信息失败:', err);
    }
  },

  // 加载积分账户
  loadAccounts: async function () {
    try {
      const { studentId, student } = this.data;
      const semesterId = app.globalData.semesterId || '';
      
      if (!semesterId) return;

      const res = await db.collection('dorm_score_accounts')
        .where({
          student_id: studentId,
          semester_id: semesterId
        })
        .limit(1)
        .get();

      if (res.data.length > 0) {
        this.setData({
          accounts: res.data[0]
        });
      }

    } catch (err) {
      console.error('加载积分账户失败:', err);
    }
  },

  // 加载记录
  loadRecords: async function (refresh = true) {
    if (refresh) {
      this.setData({ page: 0, hasMore: true });
    } else {
      this.setData({ loadingMore: true });
    }

    try {
      const { studentId, page, pageSize } = this.data;
      const skip = refresh ? 0 : page * pageSize;

      const res = await db.collection('dorm_score_records')
        .where({
          student_id: studentId
        })
        .orderBy('date', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get();

      const newRecords = res.data;
      const records = refresh ? newRecords : [...this.data.records, ...newRecords];

      this.setData({
        records,
        hasMore: newRecords.length === pageSize,
        loadingMore: false,
        page: refresh ? 0 : page
      });

    } catch (err) {
      console.error('加载记录失败:', err);
      this.setData({ loadingMore: false });
    }
  },

  // 加载更多
  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadRecords(false);
    }
  },

  // 筛选变化
  onFilterChange: function () {
    // TODO: 实现筛选功能
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 调整积分
  goToAdjust: function () {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 查看统计
  goToHistory: function () {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  }
});
