// pages/index/index.js
const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');
const batchQuery = require('../../utils/batchQuery.js');

Page({
  data: {
    userInfo: null,
    role: '',
    roleLabel: '',
    currentSemester: null,
    statistics: {},
    quickActions: [],
    loading: true,
    
    // 天气信息
    weather: null,
    weatherLoading: true,
    
    // 积分排行榜
    scoreRanking: [],
    rankingLoading: true,
    
    // 今日课程
    todayCourses: [],
    coursesLoading: true,
    courseViewType: 'class',
    currentCourses: [],
    upcomingCourses: [],
    finishedCourses: [],
    showFinishedCourses: false,
    allCoursesFinished: false,
    
    // 今日生日学生
    birthdayStudents: [],
    birthdayLoading: true,

    // 管理干部权限
    isStudentLeader: false,
    leaderPermissions: [],
    perm_score_register: false,
    perm_volunteer_submit: false,
    perm_dorm_score: false,
    perm_duty_check: false,
    perm_duty_arrange: false,
    perm_attendance_register: false
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.loadData();
    this._startCourseRefreshTimer();
  },

  onHide: function () {
    this._stopCourseRefreshTimer();
  },

  onUnload: function () {
    this._stopCourseRefreshTimer();
  },

  // 检查登录状态
  checkLogin: function () {
    if (!app.globalData.userInfo || !app.globalData.openid) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return;
    }

    this.setData({
      userInfo: app.globalData.userInfo,
      role: app.globalData.role,
      roleLabel: this.getRoleLabel(app.globalData.role)
    });
  },

  // 获取角色标签
  getRoleLabel: function (role) {
    const roleMap = {
      'admin': '管理员',
      'head_teacher': '班主任',
      'subject_teacher': '科任老师',
      'class_cadre': '班干部',
      'student': '学生',
      'parent': '家长'
    };
    return roleMap[role] || '未知角色';
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      if (Object.keys(app.globalData.authorizations || {}).length === 0 && app.globalData.student_id) {
        await app.loadUserAuthorizations();
      }

      await this.getCurrentSemester();

      this.loadQuickActions();

      this.setData({ loading: false });

      this.loadStatistics().catch(err => console.error('加载统计失败(非阻塞):', err));

      this.loadWeather().catch(err => console.error('加载天气失败(非阻塞):', err));
      this.loadScoreRanking().catch(err => console.error('加载排行失败(非阻塞):', err));
      this.loadTodayCourses().catch(err => console.error('加载课程失败(非阻塞):', err));
      this.loadBirthdayStudents().catch(err => console.error('加载生日失败(非阻塞):', err));

      if (this.data.role === 'student') {
        this.loadMyPermissions().catch(err => console.error('加载权限失败(非阻塞):', err));
      }
    } catch (err) {
      console.error('加载核心数据失败:', err);
      this.setData({ loading: false });
    }
  },

  // 获取当前学期
  getCurrentSemester: async function () {
    try {
      const res = await api.semesterApi.getCurrentSemester();
      if (res.data.length > 0) {
        const semester = res.data[0];
        this.setData({ currentSemester: semester });
        app.globalData.currentSemester = semester;
        app.globalData.currentSemesterId = semester._id || semester.semester_id || '';
        app.globalData.currentSemesterName = semester.name || '';
        wx.setStorageSync('currentSemesterId', app.globalData.currentSemesterId);
      }
    } catch (err) {
      console.error('获取学期失败:', err);
    }
  },

  // 加载统计数据
  loadStatistics: async function () {
    const role = this.data.role;
    // 1. 获取当前班级ID
    const classId = app.globalData.class_id;
    try {
      if (role === 'admin' || role === 'head_teacher' || role === 'subject_teacher') {
        // 管理员和教师统计
        // 2. 关键修改：通过云函数获取全量学生
        const studentsCfRes = await wx.cloud.callFunction({
          name: 'manageAuthorization',
          data: { action: 'getStudents', data: { class_id: classId } },
          timeout: 10000
        });
        const studentsRes = { data: (studentsCfRes.result && studentsCfRes.result.success) ? studentsCfRes.result.data : [] };
      
        const students = studentsRes.data;

        // 3. 统计时过滤 (双重保险，如果API没过滤掉)
        const filteredStudents = classId 
          ? students.filter(s => s.class_id === classId) 
          : students;

        const totalScore = filteredStudents.reduce((sum, s) => sum + (s.current_score || 100), 0);
        const avgScore = filteredStudents.length > 0 ? (totalScore / filteredStudents.length).toFixed(1) : 100;
      
        // TODO: 这里也需要修改 API 调用，获取当前班级的待审批数量
        // 假设你有一个获取审批数量的API，也需要传入 class_id
        // const pendingRes = await api.approvalApi.getPendingCount({ class_id: classId });
        // const pendingCount = pendingRes.data.count || 0;

        // 获取考勤率
        const attendanceRate = await this.calculateAttendanceRate(classId);
        
        this.setData({
          statistics: {
            studentCount: filteredStudents.length,
            avgScore: avgScore,
            attendanceRate: attendanceRate,
            pendingApprovals: 0 // 需要后端支持
          }
        });
      
  //    if (role === 'admin' || role === 'head_teacher' || role === 'subject_teacher') {
  //      // 管理员和教师统计
  //      const studentsRes = await api.studentApi.getStudents({ limit: 1000 });
  //      const students = studentsRes.data;

  //      const totalScore = students.reduce((sum, s) => sum + (s.current_score || 100), 0);
  //      const avgScore = students.length > 0 ? (totalScore / students.length).toFixed(1) : 100;

  //      this.setData({
  //        statistics: {
  //          studentCount: students.length,
  //          avgScore: avgScore,
  //          attendanceRate: 95,
  //          pendingApprovals: 0
  //        }
  //      });

      } else if (role === 'student') {
        // 学生统计
        const studentId = app.globalData.student_id;
        if (studentId) {
          const studentRes = await api.studentApi.getStudentByStudentId(studentId);
          if (studentRes.data && studentRes.data.length > 0) {
            const student = studentRes.data[0];
            const score = student.current_score || 100;

            // 获取志愿服务统计
            const volunteerRes = await api.volunteerApi.getStatistics(studentId);
            const volunteerHours = volunteerRes.data && volunteerRes.data.totalHours ? volunteerRes.data.totalHours : 0;
            const volunteerScore = volunteerRes.data && volunteerRes.data.totalScore ? volunteerRes.data.totalScore : 0;
            const volunteerCount = volunteerRes.data && volunteerRes.data.recordCount ? volunteerRes.data.recordCount : 0;

            this.setData({
              statistics: {
                myScore: score,
                scoreLevel: util.getScoreLevel(score),
                attendanceCount: 0,
                volunteerHours: volunteerHours,
                volunteerScore: volunteerScore,
                volunteerCount: volunteerCount
              }
            });
          }
        }
      } else if (role === 'parent') {
        // 家长统计
        const studentId = app.globalData.student_id;
        if (studentId) {
          const studentRes = await api.studentApi.getStudentByStudentId(studentId);
          if (studentRes.data && studentRes.data.length > 0) {
            const student = studentRes.data[0];
            const score = student.current_score || 100;

            // 获取志愿服务统计
            const volunteerRes = await api.volunteerApi.getStatistics(studentId);
            const volunteerHours = volunteerRes.data && volunteerRes.data.totalHours ? volunteerRes.data.totalHours : 0;
            const volunteerScore = volunteerRes.data && volunteerRes.data.totalScore ? volunteerRes.data.totalScore : 0;
            const volunteerCount = volunteerRes.data && volunteerRes.data.recordCount ? volunteerRes.data.recordCount : 0;

            this.setData({
              statistics: {
                childScore: score,
                scoreLevel: util.getScoreLevel(score),
                volunteerHours: volunteerHours,
                volunteerScore: volunteerScore,
                volunteerCount: volunteerCount
              }
            });
          }
        }
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 计算考勤率
  calculateAttendanceRate: async function (classId) {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 获取今天的日期
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      
      // 查询今天的考勤统计
      const statRes = await db.collection('attendance_statistics')
        .where({
          class_id: classId,
          date: todayStr
        })
        .get();
      
      if (statRes.data && statRes.data.length > 0) {
        // 返回考核出勤率
        return statRes.data[0].assessment_attendance_rate || 0;
      }
      
      // 如果今天没有统计数据，查询最近的统计数据
      const recentStatRes = await db.collection('attendance_statistics')
        .where({
          class_id: classId
        })
        .orderBy('date', 'desc')
        .limit(1)
        .get();
      
      if (recentStatRes.data && recentStatRes.data.length > 0) {
        return recentStatRes.data[0].assessment_attendance_rate || 0;
      }
      
      // 如果没有统计数据，返回默认值
      return 100;
      
    } catch (err) {
      console.error('计算考勤率失败:', err);
      return 95; // 返回默认值
    }
  },

  // 加载天气信息
  loadWeather: async function () {
    this.setData({ weatherLoading: true });
    
    try {
      // 获取用户位置
      const location = await this.getUserLocation();
      
      if (location) {
        // 调用天气API（这里使用和风天气API作为示例）
        const weather = await this.fetchWeather(location);
        this.setData({ weather, weatherLoading: false });
      } else {
        // 使用默认天气
        this.setData({
          weather, 
        //weather: this.getDefaultWeather(),
          weatherLoading: false 
        });
      }
    } catch (err) {
      console.error('加载天气失败:', err);
      this.setData({ 
        weather: this.getDefaultWeather(),
        weatherLoading: false 
      });
    }
  },

  // 获取用户位置
  getUserLocation: function () {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'wgs84',
        success: (res) => {
          resolve({
            latitude: res.latitude,
            longitude: res.longitude
          });
        },
        fail: (err) => {
          console.log('获取位置失败，使用默认位置:', err);
          resolve(null);
        }
      });
    });
  },

  // 获取天气数据（实时和模拟）
// 获取天气数据
fetchWeather: async function (location) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'getWeather',
      data: {
        longitude: location.longitude,
        latitude: location.latitude
      },
      timeout: 8000
    });

    console.log('云函数返回结果:', res.result);

    // 2. 判断云函数是否执行成功
    if (res.result.success && res.result.data.status === '1') {
      // 3. ⭐️ 核心修复：解析高德API返回的复杂结构
      const weatherData = res.result.data.lives[0]; // 取出第一条数据
      
      // 4. ⭐️ 转换为前端页面需要的格式
      return {
        temp: weatherData.temperature,
        weather: weatherData.weather,
        humidity: weatherData.humidity , // 加上百分号
        wind: weatherData.winddirection + weatherData.windpower,
        city: weatherData.city,
        tips: this.getWeatherTips(weatherData.weather) // 调用提示函数
      };
      
    } else {
      console.error('云函数业务错误:', res.result.message || res.result.info);
      return this.getDefaultWeather();
    }

  } catch (error) {
    console.error('调用云函数异常:', error);
    return this.getDefaultWeather();
  }
},
  // 获取默认天气
  getDefaultWeather: function () {
    return {
    temp: '--',
    weather: '获取中',
    humidity: '--',
    wind: '--',
    city: '未知',
    tips: '天气信息获取中'
  };
},

  // 获取天气提示
  getWeatherTips: function (weather) {
    const tipsMap = {
      '晴': '今日晴朗，适合户外活动',
      '多云': '云量较多，气温适宜',
      '阴': '天色阴沉，注意保暖',
      '小雨': '有小雨，记得带伞',
      '中雨': '雨势较大，注意出行安全'
    };
    return tipsMap[weather] || '关注天气变化';
  },

  // 加载积分排行榜（本月TOP5）
  loadScoreRanking: async function () {
    this.setData({ rankingLoading: true });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 获取本月起止时间
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      
      // 查询本月积分记录，按学生汇总
      const classId = app.globalData.class_id;
      if (!classId) {
        this.setData({ rankingLoading: false });
        return;
      }

      // 获取学生列表并按积分排序
      const studentsRes = await db.collection('students')
        .where({
          class_id: classId,
          status: _.neq('graduated')
        })
        .orderBy('current_score', 'desc')
        .limit(5)
        .get();

      const students = studentsRes.data || [];
      
      // 获取本月积分变化
      const studentIds = students.map(s => s.student_id);
      
      // 查询本月积分记录
      const recordsRes = await db.collection('score_records')
        .where({
          class_id: classId,
          student_id: _.in(studentIds),
          created_at: _.gte(monthStart).and(_.lte(monthEnd))
        })
        .get();

      // 计算每个学生本月积分变化
      const monthlyScores = {};
      (recordsRes.data || []).forEach(record => {
        const sid = record.student_id;
        const score = record.score_change || record.score_value || 0;
        monthlyScores[sid] = (monthlyScores[sid] || 0) + score;
      });

      // 组装排行榜数据
      const ranking = students.map((student, index) => ({
        rank: index + 1,
        student_id: student.student_id,
        name: student.name || student.student_name || '未知',
        avatar: student.avatar || '',
        totalScore: student.current_score || 100,
        monthlyScore: monthlyScores[student.student_id] || 0,
        badge: this.getRankBadge(index + 1)
      }));

      // 按本月积分重新排序
      ranking.sort((a, b) => b.monthlyScore - a.monthlyScore);
      ranking.forEach((item, index) => {
        item.rank = index + 1;
        item.badge = this.getRankBadge(index + 1);
      });

      this.setData({ 
        scoreRanking: ranking.slice(0, 5),
        rankingLoading: false 
      });
    } catch (err) {
      console.error('加载排行榜失败:', err);
      this.setData({ rankingLoading: false });
    }
  },

  // 获取排名徽章
  getRankBadge: function (rank) {
    const badges = {
      1: '🥇',
      2: '🥈',
      3: '🥉'
    };
    return badges[rank] || '';
  },

  // 加载今日课程
  loadTodayCourses: async function () {
    this.setData({ coursesLoading: true });
    
    try {
      const today = new Date().getDay();
      if (today === 0 || today === 6) {
        this.setData({ todayCourses: [], coursesLoading: false });
        return;
      }

      const classId = app.globalData.class_id;
      if (!classId) {
        this.setData({ coursesLoading: false });
        return;
      }

      const semesterName = app.globalData.currentSemesterName || '';
      const courseViewType = this.data.courseViewType;

      const res = await wx.cloud.callFunction({
        name: 'manageSchedule',
        data: {
          action: 'getSchedule',
          data: {
            class_id: classId,
            semester_name: semesterName,
            week_day: today,
            course_view_type: courseViewType
          }
        }
      });

      let courses = [];
      if (res.result && res.result.success) {
        courses = (res.result.data || []).filter(c => c.status !== 'cancelled').map(course => ({
          ...course,
          period: course.section,
          time: course.time_range || this.getPeriodTime(course.section),
          course_name: course.course_name || course.subject_name || '未设置',
          status: this.getCourseStatus(course)
        }));
      }

      this.setData({ 
        todayCourses: courses,
        coursesLoading: false 
      });

      this.filterCourseDisplay(courses);
      this._startCourseRefreshTimer();
    } catch (err) {
      console.error('加载课程失败:', err);
      this.setData({ coursesLoading: false });
    }
  },

  // 获取节次时间
  getPeriodTime: function (period) {
    const timeMap = {
      1: '08:00-08:45',
      2: '08:55-09:40',
      3: '10:00-10:45',
      4: '10:55-11:40',
      5: '14:00-14:45',
      6: '14:55-15:40',
      7: '16:00-16:45',
      8: '16:55-17:40'
    };
    return timeMap[period] || '';
  },

  timeToMinutes: function (timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return -1
    const parts = timeStr.split(':')
    if (parts.length < 2) return -1
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (isNaN(h) || isNaN(m)) return -1
    return h * 60 + m
  },

  getCourseStatus: function (course) {
    const now = new Date()
    const currentTime = now.getHours() * 60 + now.getMinutes()

    let startTime = -1
    let endTime = -1

    if (course.start_time && course.end_time) {
      startTime = this.timeToMinutes(course.start_time)
      endTime = this.timeToMinutes(course.end_time)
    }

    if (startTime === -1 || endTime === -1) {
      const periodTimes = {
        1: { start: 8 * 60, end: 8 * 60 + 45 },
        2: { start: 8 * 60 + 55, end: 9 * 60 + 40 },
        3: { start: 10 * 60, end: 10 * 60 + 45 },
        4: { start: 10 * 60 + 55, end: 11 * 60 + 40 },
        5: { start: 14 * 60, end: 14 * 60 + 45 },
        6: { start: 14 * 60 + 55, end: 15 * 60 + 40 },
        7: { start: 16 * 60, end: 16 * 60 + 45 },
        8: { start: 16 * 60 + 55, end: 17 * 60 + 40 }
      }
      const section = course.section || course.period
      const time = periodTimes[section]
      if (!time) return ''
      startTime = time.start
      endTime = time.end
    }

    if (currentTime < startTime) return '未开始'
    if (currentTime < endTime) return '进行中'
    return '已结束'
  },

  filterCourseDisplay: function (courses) {
    const current = []
    const upcoming = []
    const finished = []

    for (const course of courses) {
      if (course.status === '进行中') {
        current.push(course)
      } else if (course.status === '未开始') {
        if (upcoming.length < 2) {
          upcoming.push(course)
        }
      } else if (course.status === '已结束') {
        finished.push(course)
      }
    }

    const allFinished = current.length === 0 && upcoming.length === 0 && finished.length > 0

    this.setData({
      currentCourses: current,
      upcomingCourses: upcoming,
      finishedCourses: finished,
      allCoursesFinished: allFinished,
      showFinishedCourses: false
    })
  },

  toggleFinishedCourses: function () {
    this.setData({ showFinishedCourses: !this.data.showFinishedCourses })
  },

  _startCourseRefreshTimer: function () {
    this._stopCourseRefreshTimer()
    this._courseRefreshTimer = setInterval(() => {
      this._refreshCourseStatus()
    }, 5 * 60 * 1000)
  },

  _stopCourseRefreshTimer: function () {
    if (this._courseRefreshTimer) {
      clearInterval(this._courseRefreshTimer)
      this._courseRefreshTimer = null
    }
  },

  _refreshCourseStatus: function () {
    const courses = this.data.todayCourses
    if (!courses || courses.length === 0) return

    const updated = courses.map(course => ({
      ...course,
      status: this.getCourseStatus(course)
    }))

    this.setData({ todayCourses: updated })
    this.filterCourseDisplay(updated)
  },

  // 切换课程视图类型
  switchCourseView: function () {
    const newType = this.data.courseViewType === 'class' ? 'teacher' : 'class';
    this.setData({ courseViewType: newType });
    this.loadTodayCourses();
  },

  // 加载今日生日学生
  loadBirthdayStudents: async function () {
    this.setData({ birthdayLoading: true });
    
    try {
      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      const todayMD = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      
      const classId = app.globalData.class_id;
      if (!classId) {
        this.setData({ birthdayLoading: false });
        return;
      }

      const db = wx.cloud.database();
      const _ = db.command;
      const allStudents = await batchQuery.getAllRecords('students', {
        class_id: classId,
        status: _.neq('graduated')
      }, 'student_id', 'asc');

      const birthdayStudents = allStudents.filter(student => {
        if (!student.birthday) return false;
        // 解析生日格式 (假设格式为 YYYY-MM-DD)
        const birthdayParts = student.birthday.split('-');
        if (birthdayParts.length >= 2) {
          const studentMD = `${birthdayParts[1]}-${birthdayParts[2]}`;
          return studentMD === todayMD;
        }
        return false;
      }).map(student => ({
        student_id: student.student_id,
        name: student.name || student.student_name || '未知',
        avatar: student.avatar || '',
        age: this.calculateAge(student.birthday)
      }));

      this.setData({ 
        birthdayStudents,
        birthdayLoading: false 
      });
    } catch (err) {
      console.error('加载生日学生失败:', err);
      this.setData({ birthdayLoading: false });
    }
  },

  // 计算年龄
  calculateAge: function (birthday) {
    if (!birthday) return null;
    const birth = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  },

  // 发送生日祝福
  sendBirthdayWish: function (e) {
    const { name } = e.currentTarget.dataset;
    wx.showModal({
      title: '发送祝福',
      content: `是否向 ${name} 发送生日祝福？`,
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '祝福已发送',
            icon: 'success'
          });
        }
      }
    });
  },

  // 加载快捷操作
  loadQuickActions: function () {
    const role = this.data.role;
    const authorizations = app.globalData.authorizations || {};
    let actions = [];

    if (role === 'admin' || role === 'head_teacher') {
      actions = [
        { title: '学生管理', icon: 'student', color: '#1890ff', colorDark: '#096dd9', url: '/pages/student/student', disabled: false },
        { title: '班级管理', icon: 'class', color: '#13c2c2', colorDark: '#08979c', url: '/subPages/class/class', disabled: false },
        { title: '分组管理', icon: 'class', color: '#eb2f96', colorDark: '#c41d7f', url: '/subPages/group/group', disabled: false },
        { title: '考勤管理', icon: 'attendance', color: '#722ed1', colorDark: '#531dab', url: '/subPages/attendance/attendance', disabled: false },
        { title: '积分管理', icon: 'score', color: '#52c41a', colorDark: '#389e0d', url: '/pages/score/score', disabled: false },
        { title: '积分台账', icon: 'score', color: '#2f54eb', colorDark: '#1d39c4', url: '/subPages/score/mall/ledger/ledger', disabled: false },
        { title: '志愿服务', icon: 'volunteer', color: '#fa8c16', colorDark: '#d46b08', url: '/subPages/volunteer/volunteer', disabled: false },
        { title: '宿舍管理', icon: 'dorm', color: '#faad14', colorDark: '#d48806', url: '/subPages/dorm/dorm', disabled: false },
        { title: '值日管理', icon: 'duty', color: '#13c2c2', colorDark: '#08979c', url: '/subPages/duty/duty', disabled: false },
        { title: '处分管理', icon: 'record', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/discipline/record/record', disabled: false },
        { title: '审批中心', icon: 'approval', color: '#722ed1', colorDark: '#531dab', url: '/subPages/approval/approval', disabled: false },
        { title: '学期管理', icon: 'semester', color: '#722ed1', colorDark: '#531dab', url: '/subPages/semester/semester', disabled: false },
        { title: '通知中心', icon: 'notification', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/usercenter/notifications/notifications', disabled: false },
        { title: '座位管理', icon: 'duty', color: '#faad14', colorDark: '#d48806', url: '/subPages/seat/seat/seat', disabled: false },
        { title: '成长档案', icon: 'score', color: '#52c41a', colorDark: '#389e0d', url: '/pages/growth/profile', disabled: false }
      ];
    } else if (role === 'subject_teacher') {
      // 科任老师：可查看班级信息、学生、积分、志愿服务、审批
      actions = [
        { title: '学生管理', icon: 'student', color: '#1890ff', colorDark: '#096dd9', url: '/pages/student/student', disabled: false },
        { title: '考勤查看', icon: 'attendance', color: '#722ed1', colorDark: '#531dab', url: '/subPages/attendance/attendance', disabled: false },
        { title: '积分查看', icon: 'score', color: '#52c41a', colorDark: '#389e0d', url: '/pages/score/score', disabled: false },
        { title: '志愿服务', icon: 'volunteer', color: '#fa8c16', colorDark: '#d46b08', url: '/subPages/volunteer/volunteer', disabled: false },
        { title: '审批中心', icon: 'approval', color: '#722ed1', colorDark: '#531dab', url: '/subPages/approval/approval', disabled: false },
        { title: '通知中心', icon: 'notification', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/usercenter/notifications/notifications', disabled: false },
        { title: '成长档案', icon: 'score', color: '#52c41a', colorDark: '#389e0d', url: '/pages/growth/profile', disabled: false }
      ];
    } else if (role === 'class_cadre') {
      // 班干部：可管理值日、查看学生、提交志愿服务、审批
      actions = [
        { title: '学生名单', icon: 'student', color: '#1890ff', colorDark: '#096dd9', url: '/pages/student/student', disabled: false },
        { title: '我的积分', icon: 'score', color: '#52c41a', colorDark: '#389e0d', url: '/pages/score/score', disabled: false },
        { title: '志愿服务', icon: 'volunteer', color: '#fa8c16', colorDark: '#d46b08', url: '/subPages/volunteer/volunteer', disabled: false },
        { title: '值日管理', icon: 'duty', color: '#13c2c2', colorDark: '#08979c', url: '/subPages/duty/duty', disabled: false },
        { title: '微聊陪伴', icon: 'aichat', color: '#667eea', colorDark: '#5b6abf', url: '/subPages/aichat/aichat', disabled: false },
        { title: '聚光点', icon: 'activity', color: '#667eea', colorDark: '#5b6abf', url: '/subPages/activity/list/list', disabled: false },
        { title: '心灵树洞', icon: 'treehole', color: '#52c41a', colorDark: '#389e0d', url: '/subPages/treehole/treehole', disabled: false },
        { title: '英雄台', icon: 'hero', color: '#faad14', colorDark: '#d48806', url: '/subPages/hero/hero', disabled: false },
        { title: '校园闲鱼', icon: 'flea', color: '#fa8c16', colorDark: '#d46b08', url: '/subPages/flea/flea', disabled: false },
        { title: '成绩管理', icon: 'grade', color: '#722ed1', colorDark: '#531dab', url: '/subPages/grade/grade', disabled: false },
        { title: '我的处分', icon: 'record', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/discipline/my-discipline/my-discipline', disabled: false },
        { title: '审批中心', icon: 'approval', color: '#722ed1', colorDark: '#531dab', url: '/subPages/approval/approval', disabled: false },
        { title: '通知中心', icon: 'notification', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/usercenter/notifications/notifications', disabled: false }
      ];
    } else if (role === 'student') {
      actions = [
        { title: '我的积分', icon: 'score', color: '#1890ff', colorDark: '#096dd9', url: '/pages/score/score', disabled: false },
        { title: '志愿服务', icon: 'volunteer', color: '#52c41a', colorDark: '#389e0d', url: '/subPages/volunteer/volunteer', disabled: false },
        { title: '积分商城', icon: 'mall', color: '#fa8c16', colorDark: '#d46b08', url: '/subPages/score/mall/mall', disabled: false },
        { title: '住宿积分', icon: 'dorm', color: '#13c2c2', colorDark: '#08979c', url: '/subPages/dorm/mydorm/mydorm', disabled: false, isDorm: true },
        { title: '我的值日', icon: 'duty', color: '#eb2f96', colorDark: '#c41d7f', url: '/subPages/duty/myduty/myduty', disabled: false },
        { title: '我的座位', icon: 'duty', color: '#faad14', colorDark: '#d48806', url: '/subPages/seat/seat/seat', disabled: false },
        { title: '成长档案', icon: 'score', color: '#52c41a', colorDark: '#389e0d', url: '/pages/growth/profile', disabled: false },
        { title: '我的处分', icon: 'record', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/discipline/my-discipline/my-discipline', disabled: false },
        { title: '个人设置', icon: 'settings', color: '#8c8c8c', colorDark: '#595959', url: '/subPages/usercenter/settings/settings', disabled: false },
        { title: '通知中心', icon: 'notification', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/usercenter/notifications/notifications', disabled: false }
      ];
    } else if (role === 'parent') {
      actions = [
        { title: '孩子积分', icon: 'score', color: '#1890ff', colorDark: '#096dd9', url: '/pages/score/score', disabled: false },
        { title: '志愿服务', icon: 'volunteer', color: '#52c41a', colorDark: '#389e0d', url: '/subPages/volunteer/volunteer', disabled: false },
        { title: '积分商城', icon: 'mall', color: '#fa8c16', colorDark: '#d46b08', url: '/subPages/score/mall/mall', disabled: false },
        { title: '孩子值日', icon: 'duty', color: '#eb2f96', colorDark: '#c41d7f', url: '/subPages/duty/myduty/myduty', disabled: false },
        { title: '孩子座位', icon: 'duty', color: '#faad14', colorDark: '#d48806', url: '/subPages/seat/seat/seat', disabled: false },
        { title: '成长档案', icon: 'score', color: '#52c41a', colorDark: '#389e0d', url: '/pages/growth/profile', disabled: false },
        { title: '孩子处分', icon: 'record', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/discipline/my-discipline/my-discipline', disabled: false },
        { title: '个人设置', icon: 'settings', color: '#8c8c8c', colorDark: '#595959', url: '/subPages/usercenter/settings/settings', disabled: false },
        { title: '通知中心', icon: 'notification', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/usercenter/notifications/notifications', disabled: false }
      ];
    }

    // 基于授权权限动态注入管理类快捷操作（学生/家长/班干部）
    if (role === 'student' || role === 'parent' || role === 'class_cadre') {
      const authActions = [];
      // 积分管理授权
      if (authorizations.score && (authorizations.score.includes('write') || authorizations.score.includes('approve'))) {
        authActions.push({ title: '积分管理', icon: 'score', color: '#52c41a', colorDark: '#389e0d', url: '/pages/score/score', disabled: false });
      }
      // 考勤管理授权
      if (authorizations.attendance && (authorizations.attendance.includes('write') || authorizations.attendance.includes('approve'))) {
        authActions.push({ title: '考勤管理', icon: 'attendance', color: '#722ed1', colorDark: '#531dab', url: '/subPages/attendance/attendance', disabled: false });
      }
      // 值日管理授权
      if (authorizations.duty && (authorizations.duty.includes('write') || authorizations.duty.includes('approve'))) {
        authActions.push({ title: '值日检查', icon: 'duty', color: '#13c2c2', colorDark: '#08979c', url: '/subPages/duty/check/check', disabled: false });
      }
      // 宿舍管理授权
      if (authorizations.dorm && (authorizations.dorm.includes('write') || authorizations.dorm.includes('approve'))) {
        authActions.push({ title: '宿舍管理', icon: 'dorm', color: '#faad14', colorDark: '#d48806', url: '/subPages/dorm/dorm', disabled: false });
      }
      // 志愿服务管理授权
      if (authorizations.volunteer && (authorizations.volunteer.includes('write') || authorizations.volunteer.includes('approve'))) {
        authActions.push({ title: '志愿管理', icon: 'volunteer', color: '#fa8c16', colorDark: '#d46b08', url: '/subPages/volunteer/volunteer', disabled: false });
      }
      // 处分管理授权
      if (authorizations.discipline && (authorizations.discipline.includes('write') || authorizations.discipline.includes('approve'))) {
        authActions.push({ title: '处分管理', icon: 'record', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/discipline/record/record', disabled: false });
      }
      // 通知管理授权
      if (authorizations.notification && authorizations.notification.includes('write')) {
        authActions.push({ title: '发布通知', icon: 'notification', color: '#ff4d4f', colorDark: '#cf1322', url: '/subPages/usercenter/notifications/notifications?tab=publish', disabled: false });
      }
      // 学生管理授权（查看学生列表）
      if (authorizations.score && authorizations.score.includes('read') && !actions.find(a => a.url === '/pages/student/student')) {
        authActions.push({ title: '学生名单', icon: 'student', color: '#1890ff', colorDark: '#096dd9', url: '/pages/student/student', disabled: false });
      }

      // 将授权操作插入到已有操作列表前面
      if (authActions.length > 0) {
        actions = [...authActions, ...actions];
      }
    }

    this.setData({ quickActions: actions });
  },

  // 快捷操作点击
  onQuickAction: function (e) {
    const url = e.currentTarget.dataset.url;
    const disabled = e.currentTarget.dataset.disabled;
    
    if (disabled) {
      wx.showToast({
        title: '功能开发中',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 检查页面是否在tabBar中
    const tabBarPages = ['/pages/index/index', '/pages/student/student', '/pages/score/score', '/pages/discover/discover', '/pages/usercenter/usercenter'];
    
    if (tabBarPages.includes(url)) {
      // tabBar页面使用switchTab
      wx.switchTab({ url: url });
    } else {
      // 普通页面使用navigateTo
      wx.navigateTo({ 
        url: url,
        fail: (err) => {
          console.error('页面跳转失败:', err);
          wx.showToast({
            title: '页面跳转失败',
            icon: 'none',
            duration: 2000
          });
        }
      });
    }
  },

  // 查看更多排行榜
  goToRanking: function () {
    wx.navigateTo({
      url: '/pages/score/ranking/ranking'
    });
  },

  // 跳转到学生详情页
  goToStudentDetail: function (e) {
    const studentId = e.currentTarget.dataset.id;
    if (!studentId) return;
    wx.navigateTo({
      url: `/subPages/student/detail/detail?id=${studentId}`
    });
  },

  // 跳转到学生列表
  goToStudentList: function () {
    wx.switchTab({
      url: '/pages/student/student'
    });
  },

  // 跳转到积分页面
  goToScorePage: function () {
    wx.switchTab({
      url: '/pages/score/score'
    });
  },

  // 跳转到考勤页面
  goToAttendance: function () {
    wx.navigateTo({
      url: '/subPages/attendance/attendance'
    });
  },

  // 跳转到审批页面
  goToApproval: function () {
    wx.navigateTo({
      url: '/subPages/approval/approval'
    });
  },

  // 跳转到志愿服务页面
  goToVolunteer: function () {
    wx.navigateTo({
      url: '/subPages/volunteer/volunteer'
    });
  },

  // 查看课程表
  goToSchedule: function () {
    wx.navigateTo({
      url: '/subPages/schedule/schedule/schedule'
    });
  },

  loadMyPermissions: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageAuthorization',
        data: { action: 'getMyPermissions', data: {} }
      });
      if (res.result && res.result.success) {
        const { is_leader, permissions } = res.result.data;
        const permMap = {
          isStudentLeader: is_leader,
          leaderPermissions: permissions
        };
        (permissions || []).forEach(p => { permMap[`perm_${p}`] = true; });
        this.setData(permMap);
        app.globalData.isLeader = is_leader;
        app.globalData.leaderPermissions = permissions;
      }
    } catch (err) {
      console.error('查询权限失败:', err);
      this.setData({ isStudentLeader: false, leaderPermissions: [] });
    }
  },

  goToScoreRegister: function () {
    wx.navigateTo({ url: '/pages/score/score' });
  },

  goToAttendanceRegister: function () {
    wx.navigateTo({ url: '/subPages/attendance/record/record' });
  },

  goToVolunteerSubmit: function () {
    wx.navigateTo({ url: '/subPages/volunteer/volunteer' });
  },

  goToDormScore: function () {
    wx.navigateTo({ url: '/subPages/dorm/dorm' });
  },

  goToDutyCheck: function () {
    wx.navigateTo({ url: '/subPages/duty/check/check' });
  },

  goToDutyArrange: function () {
    wx.navigateTo({ url: '/subPages/duty/duty' });
  }
});
