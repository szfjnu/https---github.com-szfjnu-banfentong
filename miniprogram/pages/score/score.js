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
    userRole: '',
    currentClassId: '',

    myScoreInfo: null,
    myRank: 0,
    totalStudents: 0,
    isStudentMode: false,
    topStudents: [],
    myStudentId: '',

    accessibleStudentIds: [],
    permissionType: 'none'
  },

  onLoad: function () {
    this.setData({ 
      userRole: app.globalData.role,
      currentClassId: app.globalData.class_id || '',
      myStudentId: app.globalData.student_id || ''
    });
    this.initView();
  },

  onShow: function () {
    const newClassId = app.globalData.class_id || '';
    this.setData({ 
      userRole: app.globalData.role,
      currentClassId: newClassId,
      myStudentId: app.globalData.student_id || ''
    });
    this.initView();
  },

  initView: async function () {
    const role = this.data.userRole;
    const canViewAll = role === 'admin' || role === 'head_teacher' || role === 'subject_teacher';
    const isStudentMode = !canViewAll;
    const canAddScore = canViewAll;
    this.setData({ isStudentMode, canAddScore });

    if (!isStudentMode) {
      await this.loadPermissionInfo();
    }

    if (isStudentMode) {
      this.loadMyScore();
    } else {
      this.loadRanking();
    }
  },

  loadPermissionInfo: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'getAccessibleStudents',
          data: { class_id: this.data.currentClassId }
        }
      });

      if (res.result && res.result.success) {
        const { permission_type, accessible_student_ids } = res.result;
        this.setData({
          permissionType: permission_type,
          accessibleStudentIds: accessible_student_ids
        });
      }
    } catch (err) {
      console.error('权限预判断失败:', err);
      const role = this.data.userRole;
      if (role === 'admin' || role === 'head_teacher' || role === 'subject_teacher') {
        this.setData({ permissionType: 'all', accessibleStudentIds: [] });
      }
    }
  },

  loadMyScore: async function () {
    this.setData({ loading: true });
    try {
      const studentId = this.data.myStudentId;
      const classId = this.data.currentClassId;
      if (!studentId || !classId) {
        this.setData({ loading: false });
        return;
      }

      const db = wx.cloud.database();
      const _ = db.command;

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

      const rankRes = await db.collection('students')
        .where({
          class_id: classId,
          current_score: _.gt(currentScore),
          status: _.neq('graduated')
        })
        .count();

      const totalRes = await db.collection('students')
        .where({
          class_id: classId,
          status: _.neq('graduated')
        })
        .count();

      const myRank = rankRes.total + 1;
      const totalStudents = totalRes.total;

      const allStudentsRes = await batchQuery.getAllRecords('students', 
        { class_id: classId, status: _.neq('graduated') }, 
        'current_score', 'desc'
      );

      const allStudents = (allStudentsRes || []).map(s => ({
        ...s,
        bonusScore: s.bonus_score || 0,
        scoreLevel: util.getScoreLevel(s.current_score || 100),
        scoreColor: util.getScoreColor(s.current_score || 100),
        isSelf: s.student_id === studentId
      }));

      allStudents.sort((a, b) => {
        const scoreA = a.current_score || 100;
        const scoreB = b.current_score || 100;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const bonusA = a.bonusScore || 0;
        const bonusB = b.bonusScore || 0;
        if (bonusB !== bonusA) return bonusB - bonusA;
        return (a.student_id || '').localeCompare(b.student_id || '');
      });

      const topStudents = allStudents.slice(0, 5);
      const selfInTop = topStudents.some(s => s.isSelf);

      let myRankInList = myRank;
      if (!selfInTop) {
        const selfIdx = allStudents.findIndex(s => s.isSelf);
        myRankInList = selfIdx >= 0 ? selfIdx + 1 : myRank;
      }

      this.setData({
        myScoreInfo: {
          ...student,
          scoreLevel: util.getScoreLevel(currentScore),
          scoreColor: util.getScoreColor(currentScore)
        },
        myRank: myRankInList,
        totalStudents,
        topStudents,
        loading: false
      });

    } catch (err) {
      console.error('加载个人积分失败:', err);
      this.setData({ loading: false });
    }
  },

  loadRanking: async function (refresh = true) {
    if (refresh) {
      this.setData({ loading: true, page: 0 });
    }

    try {
      const { searchKeyword, currentClassId, userRole } = this.data;

      let query = {};
      if (userRole !== 'admin' && currentClassId) {
        query.class_id = currentClassId;
      }

      const allStudents = await batchQuery.getAllRecords('students', query, 'current_score', 'desc');

      let students = allStudents.map(student => {
        const bonusScore = student.bonus_score || 0;
        let canView = true;
        if (this.data.permissionType === 'specific') {
          canView = this.data.accessibleStudentIds.includes(student.student_id);
        }
        return {
          ...student,
          bonusScore,
          scoreLevel: util.getScoreLevel(student.current_score || 100),
          scoreColor: util.getScoreColor(student.current_score || 100),
          canView
        };
      });

      students.sort((a, b) => {
        const scoreA = a.current_score || 100;
        const scoreB = b.current_score || 100;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const bonusA = a.bonusScore || 0;
        const bonusB = b.bonusScore || 0;
        if (bonusB !== bonusA) return bonusB - bonusA;
        return (a.student_id || '').localeCompare(b.student_id || '');
      });

      if (searchKeyword) {
        students = students.filter(s =>
          s.name.includes(searchKeyword) ||
          s.student_id.includes(searchKeyword)
        );
      }

      const { page, pageSize } = this.data;
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

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearch: function () {
    this.loadRanking(true);
  },

  onClearSearch: function () {
    this.setData({ searchKeyword: '' });
    this.loadRanking(true);
  },

  onViewDetail: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const classId = this.data.currentClassId;

    if (this.data.isStudentMode) {
      if (studentId !== this.data.myStudentId) {
        return;
      }
    } else {
      if (this.data.permissionType === 'specific') {
        if (!this.data.accessibleStudentIds.includes(studentId)) {
          wx.showToast({ title: '无权限查看该学生', icon: 'none', duration: 2000 });
          return;
        }
      }
    }

    wx.navigateTo({
      url: `/subPkg1/score/record/record?studentId=${studentId}&classId=${classId}`
    });
  },

  onViewRecords: function () {
    wx.navigateTo({
      url: '/subPkg1/score/record/record'
    });
  },

  onAddScore: function () {
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'teacher') {
      wx.showToast({ title: '无权限操作', icon: 'none', duration: 2000 });
      return;
    }
    wx.navigateTo({ url: '/subPkg1/score/add/add' });
  },

  onManageRules: function () {
    wx.navigateTo({ url: '/subPkg1/score/rules/rules' });
  },

  onManageExchange: function () {
    wx.navigateTo({ url: '/subPkg1/score/mall/admin/admin' });
  },

  onManageLedger: function () {
    wx.navigateTo({ url: '/subPkg1/score/mall/ledger/ledger' });
  },

  onGoMall: function () {
    wx.navigateTo({ url: '/subPkg1/score/mall/mall' });
  },

  onGoVolunteer: function () {
    wx.navigateTo({ url: '/subPkg1/volunteer/volunteer' });
  },

  onGoDorm: function () {
    wx.navigateTo({ url: '/subPkg2/dorm/mydorm/mydorm' });
  },

  onViewRules: function () {
    wx.navigateTo({ url: '/subPkg1/score/rules/rules' });
  },

  onPullDownRefresh: function () {
    this.initView();
    wx.stopPullDownRefresh();
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading && !this.data.isStudentMode) {
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
