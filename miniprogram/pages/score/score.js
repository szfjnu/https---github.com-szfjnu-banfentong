// pages/score/score.js
const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');
const batchQuery = require('../../utils/batchQuery.js');

Page({
  data: {
    students: [],
    allRankedStudents: [],
    searchKeyword: '',
    loading: true,
    page: 0,
    pageSize: 50,
    hasMore: true,
    userRole: '',  // 用户角色
    currentClassId: '',

    // 学生个人积分信息（学生/家长模式）
    myScoreInfo: null,
    myRank: 0,
    totalStudents: 0,
    isStudentMode: false
  },

  onLoad: function () {
    this.setData({ 
      userRole: app.globalData.role,
      currentClassId: app.globalData.class_id || '' 
    });
    this.initView();
  },

  onShow: function () {
    const newClassId = app.globalData.class_id || '';
    this.setData({ 
      userRole: app.globalData.role,
      currentClassId: newClassId
    });
    this.initView();
  },

  // 根据角色初始化视图
  initView: function () {
    const role = this.data.userRole;
    const canAddScore = app.hasPermission('score', 'add');
    const canViewAll = app.hasPermission('score', 'view');
    const isStudentMode = !canViewAll;
    this.setData({ isStudentMode, canAddScore });

    if (isStudentMode) {
      this.loadMyScore();
    } else {
      this.loadRanking();
    }
  },

  // 学生/家长：加载个人积分和排名
  loadMyScore: async function () {
    this.setData({ loading: true });
    try {
      const studentId = app.globalData.student_id;
      const classId = this.data.currentClassId;
      if (!studentId || !classId) {
        this.setData({ loading: false });
        return;
      }

      const db = wx.cloud.database();
      const _ = db.command;

      // 获取个人积分
      const studentRes = await db.collection('students')
        .where({ student_id: studentId, class_id: classId })
        .limit(1)
        .get();

      if (!studentRes.data || studentRes.data.length === 0) {
        this.setData({ loading: false });
        return;
      }

      const student = studentRes.data[0];
      const currentScore = student.current_score || 100;

      // 获取班级排名 - 查询积分高于自己的学生数量
      const rankRes = await db.collection('students')
        .where({
          class_id: classId,
          current_score: _.gt(currentScore),
          status: _.neq('graduated')
        })
        .count();

      // 获取班级总人数
      const totalRes = await db.collection('students')
        .where({
          class_id: classId,
          status: _.neq('graduated')
        })
        .count();

      const myRank = rankRes.total + 1;
      const totalStudents = totalRes.total;

      this.setData({
        myScoreInfo: {
          ...student,
          scoreLevel: util.getScoreLevel(currentScore),
          scoreColor: util.getScoreColor(currentScore)
        },
        myRank,
        totalStudents,
        loading: false
      });

    } catch (err) {
      console.error('加载个人积分失败:', err);
      this.setData({ loading: false });
    }
  },

  // 管理员/教师：加载积分排行榜
  loadRanking: async function (refresh = true) {
    if (refresh) {
      this.setData({ loading: true, page: 0 });
    }

    try {
      const { searchKeyword, currentClassId, userRole, page, pageSize } = this.data;

      let query = {};
      if (userRole !== 'admin' && currentClassId) {
        query.class_id = currentClassId;
      }

      const allStudents = await batchQuery.getAllRecords('students', query, 'current_score', 'desc');

      let students = allStudents.map(student => ({
        ...student,
        scoreLevel: util.getScoreLevel(student.current_score || 100),
        scoreColor: util.getScoreColor(student.current_score || 100)
      }));

      if (searchKeyword) {
        students = students.filter(s =>
          s.name.includes(searchKeyword) ||
          s.student_id.includes(searchKeyword)
        );
      }

      const displayStudents = students.slice(0, (page + 1) * pageSize);
      const hasMore = displayStudents.length < students.length;

      this.setData({
        allRankedStudents: students,
        students: displayStudents,
        loading: false,
        hasMore: hasMore
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
      url: `/subPages/student/detail/detail?id=${studentId}`
    });
  },

  // 查看积分记录
  onViewRecords: function () {
    wx.navigateTo({
      url: '/subPages/score/record/record'
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
      url: '/subPages/score/add/add'
    });
  },

  // 积分规则管理
  onManageRules: function () {
    wx.navigateTo({
      url: '/subPages/score/rules/rules'
    });
  },

  // 兑换管理
  onManageExchange: function () {
    wx.navigateTo({
      url: '/subPages/score/mall/admin/admin'
    });
  },

  // 兑换台账
  onManageLedger: function () {
    wx.navigateTo({
      url: '/subPages/score/mall/ledger/ledger'
    });
  },

  // 学生端：去积分商城
  onGoMall: function () {
    wx.navigateTo({
      url: '/subPages/score/mall/mall'
    });
  },

  // 学生端：去志愿服务
  onGoVolunteer: function () {
    wx.navigateTo({
      url: '/subPages/volunteer/volunteer'
    });
  },

  // 学生端：去住宿积分
  onGoDorm: function () {
    wx.navigateTo({
      url: '/subPages/dorm/mydorm/mydorm'
    });
  },

  // 查看积分规则（学生/家长端）
  onViewRules: function () {
    wx.navigateTo({
      url: '/subPages/score/rules/rules'
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
      const { allRankedStudents, page, pageSize } = this.data;
      const newPage = page + 1;
      const displayStudents = allRankedStudents.slice(0, (newPage + 1) * pageSize);
      this.setData({
        page: newPage,
        students: displayStudents,
        hasMore: displayStudents.length < allRankedStudents.length
      });
    }
  }
});
