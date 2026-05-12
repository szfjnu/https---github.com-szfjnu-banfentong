// pages/attendance/attendance.js
const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    // 基础信息
    classId: '',
    currentSemesterId: '',
    userRole: '',
    isAdmin: false, // 是否是班主任或管理员
    
    // 当前选中的日期
    selectedDate: '',
    selectedDateStr: '',
    
    // 周视图数据
    weekTitle: '',
    weekDays: [],
    currentWeekStart: null,
    
    // 班级统计数据
    classStats: {
      total_count: 0,
      present_count: 0,
      sick_leave_count: 0,
      personal_leave_count: 0,
      late_count: 0,
      early_leave_count: 0,
      absent_count: 0,
      actual_attendance_rate: 0,
      assessment_attendance_rate: 0
    },
    
    // 学生列表（用于考勤录入）
    students: [],
    showStudentList: false,
    
    // 考勤类别
    attendanceCategories: [],
    
    // 底部导航
    currentNav: 'calendar',
    
    // 加载状态
    loading: true,
    statsLoading: true,
    showMoreActions: false
  },

  onLoad: function (options) {
    this.initPage();
  },

  onShow: function () {
    if (this.data.classId) {
      this.refreshData();
    }
  },

  // 初始化页面
  initPage: function () {
    const classId = app.globalData.class_id;
    const role = app.globalData.role;
    const semesterId = app.globalData.currentSemesterId || '';
    const isAdmin = app.hasPermission('attendance', 'add');
    const canViewAll = app.hasPermission('attendance', 'view');
    const isStudentView = !canViewAll;
    
    this.setData({
      classId: classId,
      userRole: role,
      currentSemesterId: semesterId,
      isAdmin: isAdmin,
      canViewAll: canViewAll,
      isStudentView: isStudentView
    });
    
    if (!classId) {
      wx.showToast({
        title: '请先选择班级',
        icon: 'none'
      });
      return;
    }
    
    // 初始化日期（今天）
    const today = new Date();
    const todayStr = this.formatDate(today);
    
    this.setData({
      selectedDate: todayStr,
      selectedDateStr: this.formatDisplayDate(today)
    });
    
    // 初始化周视图
    this.initWeekView(today);
    
    // 并行加载数据
    this.loadAttendanceCategories();
    this.loadClassStats(todayStr);
  },

  // 刷新数据
  refreshData: function () {
    this.loadAttendanceCategories();
    this.loadClassStats(this.data.selectedDate);
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.refreshData();
    wx.stopPullDownRefresh();
  },

  // 加载考勤类别
  loadAttendanceCategories: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('attendance_categories')
        .where({
          class_id: this.data.classId,
          is_active: true
        })
        .orderBy('sort_order', 'asc')
        .get();
      
      let categories = res.data || [];
      
      // 如果没有自定义类别，使用默认类别
      if (categories.length === 0) {
        categories = this.getDefaultCategories();
      }
      
      this.setData({ attendanceCategories: categories });
    } catch (err) {
      console.error('加载考勤类别失败:', err);
      // 使用默认类别
      this.setData({ 
        attendanceCategories: this.getDefaultCategories() 
      });
    }
  },

  // 获取默认考勤类别
  getDefaultCategories: function () {
    const app = getApp();
    const rules = app.globalData.attendanceRules || {};
    const lateDeduction = rules.late_deduction || -1;
    const earlyDeduction = rules.early_leave_deduction || -1;
    const absentDeduction = rules.absent_deduction || -5;
    return [
      { category_id: 'sick_leave', category_name: '病假', score_deduction: 0, color: '#52c41a', icon: '🏥' },
      { category_id: 'personal_leave', category_name: '事假', score_deduction: 0, color: '#1890ff', icon: '📝' },
      { category_id: 'late', category_name: '迟到', score_deduction: lateDeduction, color: '#fa8c16', icon: '⏰' },
      { category_id: 'early_leave', category_name: '早退', score_deduction: earlyDeduction, color: '#faad14', icon: '🏃' },
      { category_id: 'absent', category_name: '旷课', score_deduction: absentDeduction, color: '#ff4d4f', icon: '❌' }
    ];
  },

  // 加载班级统计数据
  loadClassStats: async function (date) {
    this.setData({ statsLoading: true });
    
    try {
      // 强制重新计算统计数据，确保数据准确
      await this.calculateClassStats(date);
    } catch (err) {
      console.error('加载班级统计失败:', err);
      this.setData({ statsLoading: false });
    }
  },

  // 计算班级统计数据
  calculateClassStats: async function (date) {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 获取班级学生总数
      const studentsRes = await db.collection('students')
        .where({
          class_id: this.data.classId,
          status: _.neq('graduated')
        })
        .count();
      
      const totalCount = studentsRes.total || 0;
      
      if (totalCount === 0) {
        this.setData({
          classStats: this.getEmptyStats(),
          statsLoading: false
        });
        return;
      }
      
      // 获取当日考勤记录 - 兼容不同class_id格式
      const recordsRes = await db.collection('attendance_records')
        .where({
          class_id: this.data.classId,
          date: date
        })
        .get();
      
      const records = recordsRes.data || [];
      console.log('考勤记录查询结果:', records.length, '条, 日期:', date, '班级ID:', this.data.classId);
      
      // 3. 建立 ID 到 Code 的映射 (关键修复)
      // 这样即便 category_id 是 "CAT17743271959085"，我们也能知道它是 "absent"
      const catMap = {};
      this.data.attendanceCategories.forEach(cat => {
        catMap[cat.category_id] = cat.category_code || ''; 
      });
      // 统计各类别人数
      let sickLeaveCount = 0;
      let personalLeaveCount = 0;
      let lateCount = 0;
      let earlyLeaveCount = 0;
      let absentCount = 0;
      
      // 使用 Set 统计不重复的学生
      const sickLeaveStudents = new Set();
      const personalLeaveStudents = new Set();
      const lateStudents = new Set();
      const earlyLeaveStudents = new Set();
      const absentStudents = new Set();
      
      records.forEach(record => {
        // 优先使用记录中的 category_code，如果没有则通过映射从 category_id 获取
        const code = record.category_code || catMap[record.category_id] || '';
        const studentId = record.student_id;
        
        console.log('处理记录:', record.student_name, 'code:', code);
        
        if (code === 'sick_leave') sickLeaveStudents.add(studentId);
        else if (code === 'personal_leave') personalLeaveStudents.add(studentId);
        else if (code === 'late') lateStudents.add(studentId);
        else if (code === 'early_leave') earlyLeaveStudents.add(studentId);
        else if (code === 'absent') absentStudents.add(studentId);
      });

     
      sickLeaveCount = sickLeaveStudents.size;
      personalLeaveCount = personalLeaveStudents.size;
      lateCount = lateStudents.size;
      earlyLeaveCount = earlyLeaveStudents.size;
      absentCount = absentStudents.size;
      
      console.log('统计结果 - 病假:', sickLeaveCount, '事假:', personalLeaveCount, '迟到:', lateCount, '早退:', earlyLeaveCount, '旷课:', absentCount);
      
      // 计算实际出勤人数和出勤率
      const presentCount = totalCount - sickLeaveCount - personalLeaveCount - absentCount;
      const actualAttendanceRate = totalCount > 0 ? ((presentCount / totalCount) * 100).toFixed(1) : 0;
      const assessmentAttendanceRate = totalCount > 0 ? (((totalCount - absentCount) / totalCount) * 100).toFixed(1) : 0;
      
      const stats = {
        total_count: totalCount,
        present_count: Math.max(0, presentCount), // 确保不出现负数,
        sick_leave_count: sickLeaveCount,
        personal_leave_count: personalLeaveCount,
        late_count: lateCount,
        early_leave_count: earlyLeaveCount,
        absent_count: absentCount,
        actual_attendance_rate: parseFloat(actualAttendanceRate),
        assessment_attendance_rate: parseFloat(assessmentAttendanceRate)
      };
      
      console.log('最终统计数据:', stats);
      
      this.setData({
        classStats: stats,
        statsLoading: false
      });
      
      // 保存统计数据
      await this.saveAttendanceStats(date, stats);
      
    } catch (err) {
      console.error('计算统计数据失败:', err);
      this.setData({ statsLoading: false });
    }
  },

  // 保存统计数据
  saveAttendanceStats: async function (date, stats) {
    try {
      const db = wx.cloud.database();
      
      // 检查是否已存在
      const checkRes = await db.collection('attendance_statistics')
        .where({
          class_id: this.data.classId,
          date: date
        })
        .get();
      
      const statData = {
        ...stats,
        class_id: this.data.classId,
        date: date,
        semester_id: this.data.currentSemesterId,
        updated_at: db.serverDate()
      };
      
      if (checkRes.data && checkRes.data.length > 0) {
        const updateRes = await wx.cloud.callFunction({
          name: 'attendanceWarning',
          data: {
            action: 'updateAttendanceStatistics',
            data: {
              statId: checkRes.data[0]._id,
              ...statData,
              class_id: this.data.classId
            }
          }
        });
        if (!updateRes.result || !updateRes.result.success) {
          console.error('更新考勤统计失败:', updateRes.result?.message || '未知错误');
        }
      } else {
        statData.stat_id = `STAT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
        statData.created_at = db.serverDate();
        const addRes = await wx.cloud.callFunction({
          name: 'attendanceWarning',
          data: {
            action: 'addAttendanceStatistics',
            data: {
              ...statData,
              class_id: this.data.classId
            }
          }
        });
        if (!addRes.result || !addRes.result.success) {
          console.error('添加考勤统计失败:', addRes.result?.message || '未知错误');
        }
      }
    } catch (err) {
      console.error('保存统计数据失败:', err);
    }
  },

  // 获取空统计数据
  getEmptyStats: function () {
    return {
      total_count: 0,
      present_count: 0,
      sick_leave_count: 0,
      personal_leave_count: 0,
      late_count: 0,
      early_leave_count: 0,
      absent_count: 0,
      actual_attendance_rate: 0,
      assessment_attendance_rate: 0
    };
  },

  // 初始化周视图
  initWeekView: function (date) {
    const weekStart = this.getWeekStart(date);
    this.setData({ currentWeekStart: weekStart });
    this.updateWeekView(weekStart);
  },

  // 获取周起始日期（周一）
  getWeekStart: function (date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  },

  // 更新周视图
  updateWeekView: function (weekStart) {
    const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
    const today = new Date();
    const weekDays = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);

      weekDays.push({
        date: this.formatDate(date),
        dayName: dayNames[i],
        dayNum: date.getDate(),
        isToday: this.isSameDay(date, today),
        isSelected: this.isSameDay(date, new Date(this.data.selectedDate)),
        status: '' // 将从数据库加载
      });
    }

    // 设置周标题
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekTitle = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;

    this.setData({ weekDays, weekTitle });
    this.loadWeekAttendanceStatus();
  },

  // 加载周考勤状态
  loadWeekAttendanceStatus: async function () {
    try {
      const db = wx.cloud.database();
      const { weekDays, classId } = this.data;
      
      const startDate = weekDays[0].date;
      const endDate = weekDays[6].date;
      
      // 获取本周的统计数据
      const statRes = await db.collection('attendance_statistics')
        .where({
          class_id: classId,
          date: db.command.gte(startDate).and(db.command.lte(endDate))
        })
        .get();
      
      const stats = statRes.data || [];
      
      // 更新周视图状态
      const updatedWeekDays = weekDays.map(day => {
        const dayStat = stats.find(s => s.date === day.date);
        if (dayStat) {
          // 根据统计数据判断状态
          let status = 'good'; // 默认良好（出勤率>=95%）
          if (dayStat.assessment_attendance_rate < 90) {
            status = 'warning'; // 警告（出勤率<90%）
          }
          if (dayStat.assessment_attendance_rate < 80) {
            status = 'danger'; // 危险（出勤率<80%）
          }
          return { ...day, status: status, rate: dayStat.assessment_attendance_rate };
        }
        return { ...day, status: '', rate: null };
      });
      
      this.setData({ weekDays: updatedWeekDays });
    } catch (err) {
      console.error('加载周考勤状态失败:', err);
    }
  },

  // 上一周
  onPrevWeek: function () {
    const weekStart = new Date(this.data.currentWeekStart);
    weekStart.setDate(weekStart.getDate() - 7);
    this.setData({ currentWeekStart: weekStart });
    this.updateWeekView(weekStart);
  },

  // 下一周
  onNextWeek: function () {
    const weekStart = new Date(this.data.currentWeekStart);
    weekStart.setDate(weekStart.getDate() + 7);
    this.setData({ currentWeekStart: weekStart });
    this.updateWeekView(weekStart);
  },

  // 点击日期
  onDayClick: function (e) {
    const date = e.currentTarget.dataset.date;
    const dateObj = new Date(date);
    
    this.setData({
      selectedDate: date,
      selectedDateStr: this.formatDisplayDate(dateObj)
    });
    
    // 更新周视图选中状态
    const updatedWeekDays = this.data.weekDays.map(day => ({
      ...day,
      isSelected: day.date === date
    }));
    this.setData({ weekDays: updatedWeekDays });
    
    // 加载该日期的统计数据
    this.loadClassStats(date);
  },

  // 显示学生列表（录入考勤）
  onShowStudentList: function () {
    if (!this.data.isAdmin) {
      wx.showToast({
        title: '无权限操作',
        icon: 'none'
      });
      return;
    }
    
    wx.navigateTo({
      url: `/subPkg1/attendance/record/record?class_id=${this.data.classId}&date=${this.data.selectedDate}&mode=edit`
    });
  },

  // 查看考勤记录
  onNavToRecord: function () {
    wx.navigateTo({
      url: `/subPkg1/attendance/record/record?class_id=${this.data.classId}`
    });
  },

  // 考勤设置
  onNavToSettings: function () {
    this.setData({ showMoreActions: false });
    wx.navigateTo({
      url: `/subPkg1/attendance/settings/settings?class_id=${this.data.classId}`
    });
  },

  // 请假审批记录
  onNavToLeaveApproval: function () {
    wx.navigateTo({
      url: `/subPkg1/attendance/leave/leave?class_id=${this.data.classId}`
    });
  },

  // 全勤统计
  onNavToFullAttendance: function () {
    this.setData({ showMoreActions: false });
    wx.navigateTo({
      url: `/subPkg1/attendance/fullstats/fullstats?class_id=${this.data.classId}`
    });
  },

  onNavToWarning: function () {
    this.setData({ showMoreActions: false });
    wx.navigateTo({
      url: `/subPkg1/attendance/warning/warning?class_id=${this.data.classId}`
    });
  },

  onNavToTimetable: function () {
    this.setData({ showMoreActions: false });
    wx.navigateTo({
      url: `/subPkg1/attendance/timetable/timetable?class_id=${this.data.classId}`
    });
  },

  onNavToHoliday: function () {
    this.setData({ showMoreActions: false });
    wx.navigateTo({
      url: `/subPkg1/attendance/holiday/holiday?class_id=${this.data.classId}`
    });
  },

  onToggleMoreActions: function () {
    this.setData({ showMoreActions: !this.data.showMoreActions });
  },

  // 格式化日期 (YYYY-MM-DD)
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 格式化显示日期 (YYYY年MM月DD日)
  formatDisplayDate: function (date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDay = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
    return `${year}年${month}月${day}日 ${weekDay}`;
  },

  // 判断是否同一天
  isSameDay: function (d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }
});