const app = getApp();
const db = wx.cloud.database();
const _ = db.command;
const batchQuery = require('../../../utils/batchQuery.js');

Page({
  data: {
    activeTab: 'overview',
    
    // 统计数据
    stats: {
      totalStudents: 0,
      avgScore: 0,
      warningCount: 0,
      criticalCount: 0
    },
    
    // 积分分布
    distribution: [],
    
    // 高频违规
    topViolations: [],
    
    // 排名列表
    rankingList: [],
    
    // 预警列表
    warningList: [],
    
    classId: ''
  },

  onLoad: function () {
    this.setData({
      classId: app.globalData.class_id
    });
    this.loadData();
  },

  onShow: function () {
    this.loadData();
  },

  // 加载数据
  loadData: async function () {
    try {
      wx.showLoading({ title: '加载中...' });

      // 并行加载多个数据
      await Promise.all([
        this.loadStats(),
        this.loadDistribution(),
        this.loadTopViolations(),
        this.loadRanking(),
        this.loadWarnings()
      ]);

      wx.hideLoading();
    } catch (err) {
      console.error('加载数据失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 加载统计数据
  loadStats: async function () {
    const { classId } = this.data;
    
    const students = await batchQuery.getAllRecords('students', {
      class_id: classId,
      is_boarding: true
    });
    const totalStudents = students.length;
    const totalScore = students.reduce((sum, s) => sum + (s.dorm_score || 100), 0);
    const avgScore = totalStudents > 0 ? Math.round(totalScore / totalStudents) : 0;
    const warningCount = students.filter(s => (s.dorm_score || 100) < 60).length;
    const criticalCount = students.filter(s => (s.dorm_score || 100) < 40).length;
    
    this.setData({
      stats: {
        totalStudents,
        avgScore,
        warningCount,
        criticalCount
      }
    });
  },

  // 加载积分分布
  loadDistribution: async function () {
    const { classId } = this.data;
    
    const students = await batchQuery.getAllRecords('students', {
      class_id: classId,
      is_boarding: true
    });
    const total = students.length;
    
    const excellent = students.filter(s => (s.dorm_score || 100) >= 90).length;
    const good = students.filter(s => {
      const score = s.dorm_score || 100;
      return score >= 70 && score < 90;
    }).length;
    const pass = students.filter(s => {
      const score = s.dorm_score || 100;
      return score >= 60 && score < 70;
    }).length;
    const warning = students.filter(s => {
      const score = s.dorm_score || 100;
      return score >= 40 && score < 60;
    }).length;
    const danger = students.filter(s => (s.dorm_score || 100) < 40).length;
    
    const distribution = [
      {
        label: '优秀 (90-100)',
        count: excellent,
        percent: total > 0 ? Math.round(excellent / total * 100) : 0,
        class: 'excellent'
      },
      {
        label: '良好 (70-89)',
        count: good,
        percent: total > 0 ? Math.round(good / total * 100) : 0,
        class: 'good'
      },
      {
        label: '合格 (60-69)',
        count: pass,
        percent: total > 0 ? Math.round(pass / total * 100) : 0,
        class: 'pass'
      },
      {
        label: '预警 (40-59)',
        count: warning,
        percent: total > 0 ? Math.round(warning / total * 100) : 0,
        class: 'warning'
      },
      {
        label: '危险 (<40)',
        count: danger,
        percent: total > 0 ? Math.round(danger / total * 100) : 0,
        class: 'danger'
      }
    ];
    
    this.setData({ distribution });
  },

  // 加载高频违规
  loadTopViolations: async function () {
    // TODO: 从 dorm_statistics 表查询，或从 dorm_score_records 聚合
    this.setData({ topViolations: [] });
  },

  // 加载排名
  loadRanking: async function () {
    const { classId } = this.data;
    
    const res = await batchQuery.getAllRecords('students', {
      class_id: classId,
      is_boarding: true
    }, 'dorm_score', 'desc');
    
    const rankingList = res.map(s => ({
      ...s,
      building: s.dorm_info?.building || '-',
      room: s.dorm_info?.room || '-'
    }));
    
    this.setData({ rankingList });
  },

  // 加载预警列表
  loadWarnings: async function () {
    const { classId } = this.data;
    
    const warningData = await batchQuery.getAllRecords('dorm_warnings', {
      class_id: classId,
      status: 'active'
    }, 'created_at', 'desc');
    
    const warningList = warningData.map(w => ({
      ...w,
      warning_level_text: this.getWarningLevelText(w.warning_level)
    }));
    
    this.setData({ warningList });
  },

  // 获取预警等级文本
  getWarningLevelText: function (level) {
    const map = {
      yellow: '黄色预警',
      orange: '橙色预警',
      red: '红色预警'
    };
    return map[level] || '预警';
  },

  // 标签切换
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 查看学生详情
  viewStudentDetail: function (e) {
    const studentId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/dorm/detail/detail?student_id=${studentId}`
    });
  }
});
