// pages/class/detail/detail.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');

Page({
  data: {
    classId: '',
    classInfo: null,
    myClasses: [],
    currentClassIndex: 0,
    statistics: {},
    activities: [],
    loading: true,

    // 新增数据
    todayDate: '',
    todayCourses: [],
    todayTasks: [],
    notificationCount: 0,
    topStudents: [],
    todayBirthdays: [],  // 今日生日学生列表
    currentNav: 'home'   // 当前导航项
  },

  onLoad: function (options) {
    // 设置今日日期
    const today = new Date();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const todayDate = `${today.getMonth() + 1}月${today.getDate()}日 星期${weekDays[today.getDay()]}`;

    this.setData({ todayDate });

    if (options.id) {
      this.setData({ classId: options.id });
      this.loadData();
    }
    this.loadMyClasses();
  },

  onShow: function () {
    if (this.data.classId) {
      this.loadData();
    }
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      await this.loadClassInfo();
      await this.loadStatistics();
      await this.loadTopStudents();
      await this.loadTodayBirthdays();
      await this.loadActivities();

      this.setData({ loading: false });
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 加载班级信息
  loadClassInfo: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('classes').doc(this.data.classId).get();

      if (res.data) {
        this.setData({ classInfo: res.data });
      }
    } catch (err) {
      console.error('加载班级信息失败:', err);
    }
  },

  // 加载我的班级列表
  loadMyClasses: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('classes')
        .where({
          creator_id: app.globalData.openid
        })
        .orderBy('created_at', 'desc')
        .get();

      this.setData({ myClasses: res.data });

      // 设置当前班级索引
      const currentIndex = res.data.findIndex(c => c._id === this.data.classId);
      if (currentIndex >= 0) {
        this.setData({ currentClassIndex: currentIndex });
      }
    } catch (err) {
      console.error('加载我的班级失败:', err);
    }
  },

  // 加载统计数据
  loadStatistics: async function () {
    try {
      const db = wx.cloud.database();

      // 获取学生列表
      const studentsRes = await db.collection('students')
        .where({
          class_id: this.data.classId
        })
        .get();

      const students = studentsRes.data;
      const studentCount = students.length;

      // 计算平均积分
      const totalScore = students.reduce((sum, s) => sum + (s.current_score || 100), 0);
      const avgScore = studentCount > 0 ? (totalScore / studentCount).toFixed(1) : 100;

      // 统计优秀学生（积分 >= 110）
      const excellentCount = students.filter(s => (s.current_score || 100) >= 110).length;

      // 统计待关注学生（积分 < 90）
      const warningCount = students.filter(s => (s.current_score || 100) < 90).length;

      // 统计待处理事项（示例：待审核的积分记录）
      const pendingRes = await db.collection('score_records')
        .where({
          class_id: this.data.classId,
          status: 'pending'
        })
        .count();

      this.setData({
        statistics: {
          studentCount,
          avgScore,
          excellentCount,
          warningCount,
          pendingCount: pendingRes.total
        }
      });
    } catch (err) {
      console.error('加载统计数据失败:', err);
    }
  },

  // 加载Top 5学生
  loadTopStudents: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({
          class_id: this.data.classId
        })
        .orderBy('current_score', 'desc')
        .limit(5)
        .get();

      this.setData({ topStudents: res.data });
    } catch (err) {
      console.error('加载排行榜失败:', err);
    }
  },

  // 加载今日生日学生
  loadTodayBirthdays: async function () {
    try {
      const db = wx.cloud.database();

      // 获取班级所有学生
      const res = await db.collection('students')
        .where({
          class_id: this.data.classId
        })
        .get();

      // 获取今天的日期（月-日格式）
      const today = new Date();
      const todayMD = this.formatMonthDay(today);

      // 过滤今天生日的学生
      const birthdayStudents = res.data.filter(student => {
        if (!student.date_of_birth) return false;
        const birthday = new Date(student.date_of_birth);
        const birthdayMD = this.formatMonthDay(birthday);
        return birthdayMD === todayMD;
      });

      this.setData({ todayBirthdays: birthdayStudents });
    } catch (err) {
      console.error('加载生日学生失败:', err);
    }
  },

  // 格式化月-日
  formatMonthDay: function (date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}-${day}`;
  },

  // 发送生日祝福
  onSendWish: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const studentName = e.currentTarget.dataset.name;

    wx.showModal({
      title: '发送生日祝福',
      content: `确定要给${studentName}发送生日祝福吗？`,
      success: (res) => {
        if (res.confirm) {
          // TODO: 实现发送祝福功能（可以发送通知或积分奖励）
          wx.showToast({
            title: '祝福已发送',
            icon: 'success'
          });
        }
      }
    });
  },

  // 加载最近动态
  loadActivities: async function () {
    try {
      const db = wx.cloud.database();

      // 获取最近的积分记录
      const scoreRes = await db.collection('score_records')
        .where({
          class_id: this.data.classId
        })
        .orderBy('record_date', 'desc')
        .limit(5)
        .get();

      const activities = scoreRes.data.map(item => ({
        _id: item._id,
        icon: '📊',
        title: `${item.student_name || '学生'} 积分${item.score_change > 0 ? '+' : ''}${item.score_change}`,
        time: util.formatDate(new Date(item.record_date))
      }));

      this.setData({ activities });
    } catch (err) {
      console.error('加载动态失败:', err);
      this.setData({ activities: [] });
    }
  },

  // 切换班级
  onSwitchClass: function (e) {
    const index = e.detail.value;
    const selectedClass = this.data.myClasses[index];

    if (selectedClass._id !== this.data.classId) {
      this.setData({
        classId: selectedClass._id,
        currentClassIndex: index
      });
      this.loadData();
    }
  },

  // 显示通知
  onShowNotifications: function () {
    wx.showToast({
      title: '暂无新通知',
      icon: 'none'
    });
  },

  // 查看完整课表
  onViewFullSchedule: function () {
    wx.showToast({
      title: '课表功能开发中',
      icon: 'none'
    });
  },

  // 切换任务状态
  onToggleTask: function (e) {
    const index = e.currentTarget.dataset.index;
    const tasks = this.data.todayTasks;
    tasks[index].completed = !tasks[index].completed;
    this.setData({ todayTasks: tasks });
  },

  // 查看全部排行榜
  onViewAllRank: function () {
    wx.navigateTo({
      url: `/pages/score/score?class_id=${this.data.classId}`
    });
  },

  // 查看待处理
  onViewPending: function () {
    wx.showToast({
      title: '待处理功能开发中',
      icon: 'none'
    });
  },

  // 进入设置页面
  onGoToSettings: function () {
    wx.navigateTo({
      url: `/subPages/class/settings/settings?id=${this.data.classId}`
    });
  },

  // 学生管理
  onManageStudents: function () {
    this.setData({ currentNav: 'student' });
    wx.navigateTo({
      url: `/pages/student/student?class_id=${this.data.classId}`
    });
  },

  // 积分管理
  onManageScore: function () {
    this.setData({ currentNav: 'score' });
    wx.navigateTo({
      url: `/pages/score/score?class_id=${this.data.classId}`
    });
  },

  // 志愿服务
  onManageVolunteer: function () {
    this.setData({ currentNav: 'volunteer' });
    wx.navigateTo({
      url: `/subPages/volunteer/volunteer?class_id=${this.data.classId}`
    });
  },

  // 考勤管理
  onManageAttendance: function () {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 返回首页
  onNavToHome: function () {
    this.setData({ currentNav: 'home' });
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 显示更多菜单
  onShowMoreMenu: function () {
    this.setData({ currentNav: 'more' });

    const role = app.globalData.role;
    let menuItems = [];

    // 根据角色显示不同的菜单项
    if (role === 'admin' || role === 'head_teacher') {
      menuItems = [
        '班级设置',
        '考勤管理',
        '学期管理',
        '数据统计',
        '班级成员'
      ];
    } else if (role === 'student' || role === 'parent') {
      menuItems = [
        '我的积分',
        '积分商城',
        '志愿服务',
        '班级成员'
      ];
    } else {
      menuItems = [
        '班级设置',
        '考勤管理',
        '班级成员'
      ];
    }

    wx.showActionSheet({
      itemList: menuItems,
      success: (res) => {
        const tapIndex = res.tapIndex;
        switch (menuItems[tapIndex]) {
          case '班级设置':
            this.onGoToSettings();
            break;
          case '考勤管理':
            this.onManageAttendance();
            break;
          case '学期管理':
            wx.navigateTo({
              url: '/subPages/semester/semester'
            });
            break;
          case '数据统计':
            wx.showToast({
              title: '功能开发中',
              icon: 'none'
            });
            break;
          case '班级成员':
            wx.showToast({
              title: '功能开发中',
              icon: 'none'
            });
            break;
          case '我的积分':
            wx.navigateTo({
              url: `/pages/score/score?class_id=${this.data.classId}`
            });
            break;
          case '积分商城':
            wx.navigateTo({
              url: `/subPages/score/mall/mall?class_id=${this.data.classId}`
            });
            break;
          case '志愿服务':
            wx.navigateTo({
              url: `/subPages/volunteer/volunteer?class_id=${this.data.classId}`
            });
            break;
        }
      }
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadData();
    wx.stopPullDownRefresh();
  }
});
