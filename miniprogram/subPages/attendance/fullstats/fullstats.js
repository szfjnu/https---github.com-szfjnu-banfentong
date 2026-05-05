// pages/attendance/fullstats/fullstats.js
const app = getApp();
const util = require('../../../utils/util.js');
const excelTransfer = require('../../utils/excelTransfer.js');
const batchQuery = require('../../../utils/batchQuery.js');

Page({
  data: {
    classId: '',
    
    // 统计类型
    statType: 'week', // week, month, semester
    statTypeOptions: ['week', 'month', 'semester'],
    statTypeLabels: ['周统计', '月统计', '学期统计'],
    currentTypeIndex: 0,
    
    // 时间选择
    currentPeriod: '',
    currentPeriodLabel: '',
    
    // 统计数据
    statistics: {
      total_students: 0,
      full_attendance_count: 0,
      full_attendance_rate: 0,
      details: []
    },
    
    // 学生全勤详情列表
    studentList: [],
    
    // 加载状态
    loading: true
  },

  onLoad: function (options) {
    const classId = options.class_id || app.globalData.class_id;
    this.setData({ classId: classId });
    
    // 初始化为当前周
    this.initCurrentPeriod();
    this.loadStatistics();
  },

  // 初始化当前时间周期
  initCurrentPeriod: function () {
    const now = new Date();
    let period = '';
    let label = '';
    
    // 默认显示本周
    const weekStart = this.getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    period = `${this.formatDate(weekStart)}_${this.formatDate(weekEnd)}`;
    label = `本周 (${this.formatDisplayDate(weekStart)} - ${this.formatDisplayDate(weekEnd)})`;
    
    this.setData({
      currentPeriod: period,
      currentPeriodLabel: label
    });
  },

  // 切换统计类型
  onStatTypeChange: function (e) {
    const index = e.detail.value;
    const type = this.data.statTypeOptions[index];
    
    this.setData({
      currentTypeIndex: index,
      statType: type
    });
    
    // 更新时间周期
    this.updateCurrentPeriod();
    this.loadStatistics();
  },

  // 更新当前时间周期
  updateCurrentPeriod: function () {
    const now = new Date();
    let period = '';
    let label = '';
    
    switch (this.data.statType) {
      case 'week':
        const weekStart = this.getWeekStart(now);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        period = `${this.formatDate(weekStart)}_${this.formatDate(weekEnd)}`;
        label = `本周 (${this.formatDisplayDate(weekStart)} - ${this.formatDisplayDate(weekEnd)})`;
        break;
        
      case 'month':
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        period = `${year}-${month.toString().padStart(2, '0')}`;
        label = `${year}年${month}月`;
        break;
        
      case 'semester':
        // 获取当前学期
        const semester = app.globalData.currentSemester;
        if (semester) {
          period = semester.semester_id || semester._id;
          label = semester.name || '本学期';
        } else {
          period = 'current';
          label = '本学期';
        }
        break;
    }
    
    this.setData({
      currentPeriod: period,
      currentPeriodLabel: label
    });
  },

  // 加载统计数据
  loadStatistics: async function () {
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const { classId, statType, currentPeriod } = this.data;
      
      // 获取班级学生总数
      const studentsResData = await wx.cloud.callFunction({
        name: 'manageAuthorization',
        data: { action: 'getStudents', data: { class_id: classId } }
      });
      const totalStudents = (studentsResData.result && studentsResData.result.success) ? studentsResData.result.data : [];
      
      const totalStudentIds = totalStudents.map(s => s.student_id);
      
      // 根据统计类型计算时间范围
      const { startDate, endDate } = this.getDateRange();
      
      // 获取该时间范围内的考勤记录
      const attendanceRecords = await batchQuery.getAllRecords('attendance_records', {
        class_id: classId,
        student_id: _.in(totalStudentIds),
        date: _.gte(startDate).and(_.lte(endDate))
      });
      
      // 统计每个学生的考勤情况
      const studentStats = {};
      totalStudents.forEach(student => {
        studentStats[student.student_id] = {
          student_id: student.student_id,
          name: student.name,
          sick_leave_days: 0,
          personal_leave_days: 0,
          late_count: 0,
          early_leave_count: 0,
          absent_count: 0,
          is_full_attendance: true
        };
      });
      
      // 按学生汇总考勤记录
      attendanceRecords.forEach(record => {
        const stat = studentStats[record.student_id];
        if (stat) {
          if (record.category_id === 'sick_leave') {
            stat.sick_leave_days++;
            stat.is_full_attendance = false;
          } else if (record.category_id === 'personal_leave') {
            stat.personal_leave_days++;
            stat.is_full_attendance = false;
          } else if (record.category_id === 'late') {
            stat.late_count++;
          } else if (record.category_id === 'early_leave') {
            stat.early_leave_count++;
          } else if (record.category_id === 'absent') {
            stat.absent_count++;
            stat.is_full_attendance = false;
          }
        }
      });
      
      // 转换为数组并排序
      const studentList = Object.values(studentStats).sort((a, b) => {
        // 全勤的排在前面
        if (a.is_full_attendance && !b.is_full_attendance) return -1;
        if (!a.is_full_attendance && b.is_full_attendance) return 1;
        // 按姓名排序
        return a.name.localeCompare(b.name);
      });
      
      // 统计全勤人数
      const fullAttendanceCount = studentList.filter(s => s.is_full_attendance).length;
      const fullAttendanceRate = totalStudents.length > 0 
        ? ((fullAttendanceCount / totalStudents.length) * 100).toFixed(1)
        : 0;
      
      this.setData({
        statistics: {
          total_students: totalStudents.length,
          full_attendance_count: fullAttendanceCount,
          full_attendance_rate: parseFloat(fullAttendanceRate),
          details: studentList
        },
        studentList: studentList,
        loading: false
      });
      
    } catch (err) {
      console.error('加载统计失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 获取日期范围
  getDateRange: function () {
    const { statType, currentPeriod } = this.data;
    let startDate = '';
    let endDate = '';
    
    switch (statType) {
      case 'week':
        const [start, end] = currentPeriod.split('_');
        startDate = start;
        endDate = end;
        break;
        
      case 'month':
        const [year, month] = currentPeriod.split('-');
        startDate = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        endDate = `${year}-${month}-${lastDay}`;
        break;
        
      case 'semester':
        // 从学期数据获取时间范围
        const semester = app.globalData.currentSemester;
        if (semester) {
          startDate = this.formatDate(new Date(semester.start_date));
          endDate = this.formatDate(new Date(semester.end_date));
        } else {
          // 默认当前学期
          const now = new Date();
          startDate = this.formatDate(new Date(now.getFullYear(), 0, 1));
          endDate = this.formatDate(new Date(now.getFullYear(), 11, 31));
        }
        break;
    }
    
    return { startDate, endDate };
  },

  // 上一周期
  onPrevPeriod: function () {
    const { statType } = this.data;
    let newPeriod = '';
    let newLabel = '';
    
    switch (statType) {
      case 'week':
        const currentStart = new Date(this.data.currentPeriod.split('_')[0]);
        currentStart.setDate(currentStart.getDate() - 7);
        const weekStart = this.getWeekStart(currentStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        newPeriod = `${this.formatDate(weekStart)}_${this.formatDate(weekEnd)}`;
        newLabel = `${this.formatDisplayDate(weekStart)} - ${this.formatDisplayDate(weekEnd)}`;
        break;
        
      case 'month':
        const [year, month] = this.data.currentPeriod.split('-').map(Number);
        let newMonth = month - 1;
        let newYear = year;
        if (newMonth === 0) {
          newMonth = 12;
          newYear--;
        }
        newPeriod = `${newYear}-${newMonth.toString().padStart(2, '0')}`;
        newLabel = `${newYear}年${newMonth}月`;
        break;
        
      case 'semester':
        util.showError('暂不支持查看其他学期');
        return;
    }
    
    this.setData({
      currentPeriod: newPeriod,
      currentPeriodLabel: newLabel
    });
    
    this.loadStatistics();
  },

  // 下一周期
  onNextPeriod: function () {
    const { statType } = this.data;
    let newPeriod = '';
    let newLabel = '';
    
    switch (statType) {
      case 'week':
        const currentStart = new Date(this.data.currentPeriod.split('_')[0]);
        currentStart.setDate(currentStart.getDate() + 7);
        const weekStart = this.getWeekStart(currentStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        newPeriod = `${this.formatDate(weekStart)}_${this.formatDate(weekEnd)}`;
        newLabel = `${this.formatDisplayDate(weekStart)} - ${this.formatDisplayDate(weekEnd)}`;
        break;
        
      case 'month':
        const [year, month] = this.data.currentPeriod.split('-').map(Number);
        let newMonth = month + 1;
        let newYear = year;
        if (newMonth === 13) {
          newMonth = 1;
          newYear++;
        }
        newPeriod = `${newYear}-${newMonth.toString().padStart(2, '0')}`;
        newLabel = `${newYear}年${newMonth}月`;
        break;
        
      case 'semester':
        util.showError('暂不支持查看其他学期');
        return;
    }
    
    this.setData({
      currentPeriod: newPeriod,
      currentPeriodLabel: newLabel
    });
    
    this.loadStatistics();
  },

  // 导出统计
  onExportStats: async function () {
    const perm = excelTransfer.checkExportPermission()
    if (!perm.allowed) {
      util.showError(perm.reason)
      return
    }

    const { studentList, statistics, statType, currentPeriodLabel, classId } = this.data
    if (!studentList || studentList.length === 0) {
      util.showError('暂无数据可导出')
      return
    }

    wx.showModal({
      title: '导出考勤统计',
      content: `将导出「${currentPeriodLabel}」的考勤统计到Excel，是否继续？`,
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '正在生成Excel...', mask: true })
        try {
          const result = await excelTransfer.callDataTransfer('exportAttendance', {
            class_id: classId,
            stat_type: statType,
            period_label: currentPeriodLabel,
            student_list: studentList,
            summary: {
              total_students: statistics.total_students,
              full_attendance_count: statistics.full_attendance_count,
              full_attendance_rate: statistics.full_attendance_rate
            }
          })

          wx.hideLoading()
          if (result.fileID) {
            await excelTransfer.downloadExcel(result.fileID)
            util.showSuccess('导出成功')
          } else {
            util.showError('导出失败：未获取到文件')
          }
        } catch (err) {
          wx.hideLoading()
          console.error('导出考勤统计失败:', err)
          util.showError(err.message || '导出失败')
        }
      }
    })
  },

  // 获取周起始日期（周一）
  getWeekStart: function (date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  },

  // 格式化日期 (YYYY-MM-DD)
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 格式化显示日期 (M月D日)
  formatDisplayDate: function (date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
});