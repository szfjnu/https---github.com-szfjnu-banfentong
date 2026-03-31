// pages/score/score.js
const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    students: [],
    searchKeyword: '',
    loading: true,
    page: 0,
    pageSize: 50,
    hasMore: true,
    userRole: '',  // 用户角色
    currentClassId: '' // 【新增】用于存储班级ID
  },

  onLoad: function () {
    this.setData({ 
      userRole: app.globalData.role,
      currentClassId: app.globalData.class_id || '' 
    });
    this.loadRanking();
  },

  onShow: function () {
    // 【修改】切换回来时也检查一下班级ID（防止切换班级后数据未更新）
    const newClassId = app.globalData.class_id || '';
    const shouldRefresh = newClassId !== this.data.currentClassId;
    this.setData({ 
      userRole: app.globalData.role,
      currentClassId: newClassId
    });
    if (shouldRefresh) {
      this.loadRanking();
    }
  },

  // 加载积分排行榜
  loadRanking: async function (refresh = true) {
    if (refresh) {
      this.setData({ loading: true, page: 0, hasMore: true });
    }

    try {
      const { page, pageSize, searchKeyword, currentClassId, userRole } = this.data;
      const skip = refresh ? 0 : page * pageSize;
      
      // 【关键修改】构建参数对象，包含分页、搜索和班级ID
      let params = {
        limit: pageSize,
        skip: skip
      };
      // 【关键修改】如果不是超级管理员，添加班级过滤条件
      // 注意：这里假设你的后端逻辑是根据是否有 class_id 参数来判断
      if (userRole !== 'admin' && currentClassId) {
        params.class_id = currentClassId; 
      }

      // 【关键修改】将参数传入 API
      const res = await api.scoreApi.getScoreRanking(params);

      let students = res.data;

      // 如果有搜索关键词,进行过滤
      if (searchKeyword) {
        students = students.filter(s =>
          s.name.includes(searchKeyword) ||
          s.student_id.includes(searchKeyword)
        );
      }

      students = students.map(student => ({
        ...student,
        scoreLevel: util.getScoreLevel(student.current_score || 100),
        scoreColor: util.getScoreColor(student.current_score || 100)
      }));

      this.setData({
        students: refresh ? students : [...this.data.students, ...students],
        loading: false,
        hasMore: students.length === pageSize,
        page: refresh ? 0 : page
      });
    } catch (err) {
      console.error('加载排行榜失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  // 搜索确认
  onSearch: function () {
    this.loadRanking(true);
  },

  // 清除搜索
  onClearSearch: function () {
    this.setData({ searchKeyword: '' });
    this.loadRanking(true);
  },

  // 查看详情
  onViewDetail: function (e) {
    const studentId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/student/detail/detail?id=${studentId}`
    });
  },

  // 查看积分记录
  onViewRecords: function () {
    wx.navigateTo({
      url: '/pages/score/record/record'
    });
  },

  // 添加积分
  onAddScore: function () {
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'teacher') {
      wx.showToast({
        title: '无权限操作',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    wx.navigateTo({
      url: '/pages/score/add/add'
    });
  },

  // 积分规则管理
  onManageRules: function () {
    wx.navigateTo({
      url: '/pages/score/rules/rules'
    });
  },

  // 兑换管理
  onManageExchange: function () {
    wx.navigateTo({
      url: '/pages/score/mall/admin/admin'
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadRanking(true);
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadRanking(false);
    }
  }
});
