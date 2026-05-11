// pages/attendance/record/record.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');
const batchQuery = require('../../../utils/batchQuery.js');

Page({
  data: {
    // 基础信息
    classId: '',
    userRole: '',
    isAdmin: false,
    
    // 页面模式: 'view' 查看模式 / 'edit' 编辑模式（从主页面跳转来录入考勤）
    mode: 'view',
    selectedDate: '',
    
    // 筛选条件
    showFilterModal: false,
    filterGroupId: '', // 按小组筛选
    filterGroupName: '全部小组',
    filterStudentId: '', // 按学生筛选
    filterStudentName: '全部学生',
    filterCategoryId: '', // 按考勤类别筛选
    filterCategoryName: '全部类别',
    filterStartDate: '',
    filterEndDate: '',
    filterTimeLabel: '全部时间',
    
    // 小组列表
    groups: [],
    
    // 学生列表
    students: [],
    filteredStudents: [], // 根据小组筛选后的学生
    
    // 考勤类别
    categories: [],
    
    // 时间筛选选项
    timeOptions: [
      { value: 'all', label: '全部时间' },
      { value: 'today', label: '今天' },
      { value: 'week', label: '本周' },
      { value: 'month', label: '本月' },
      { value: 'semester', label: '本学期' },
      { value: 'custom', label: '自定义' }
    ],
    selectedTimeOption: 'all',
    selectedTimeOptionLabel: '全部时间', // 当前选择的时间选项标签
    
    // 考勤记录列表
    records: [],
    loading: false,
    hasMore: true,
    page: 0,
    pageSize: 20,
    
    // 编辑模式相关
    editStudents: [],
    filteredEditStudents: [],
    selectedEditStudents: [],
    editGroupOptions: [{ value: '', label: '全部分组' }],
    selectedEditGroup: '',
    selectedEditGroupIndex: 0,
    searchKeyword: '',
    selectedCategoryId: '',
    selectedCategoryName: '',
    selectedCategoryCode: '',

    period_sections: [],
    selected_period_sections: [],
    show_period_selector: false,
    is_absent_category: false,
    
    showRecordDetail: false,
    recordDetail: {},
    
    // 统计数据
    statistics: {
      total: 0,
      sickLeave: 0,
      personalLeave: 0,
      late: 0,
      earlyLeave: 0,
      absent: 0
    }
  },

  onLoad: function (options) {
    const classId = options.class_id || app.globalData.class_id;
    const semesterId = app.globalData.currentSemesterId || ''; // 获取当前学期
    const role = app.globalData.role;
    const isAdmin = ['admin', 'head_teacher'].includes(role);
    const mode = options.mode || 'view';
    const date = options.date || this.formatDate(new Date());
    
    this.setData({
      classId: classId,
      semester_id: semesterId, // 存入 data 供保存时使用
      userRole: role,
      isAdmin: isAdmin,
      mode: mode,
      selectedDate: date
    });
    
    // 初始化数据
    this.loadGroups();
    this.loadStudents();
    this.loadCategories();
    
    if (mode === 'view') {
      this.initDefaultTimeFilter();
      this.loadRecords();
    } else if (mode === 'edit') {
      this.loadEditStudents();
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.refreshData();
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  // 刷新数据
  refreshData: function () {
    this.setData({
      page: 0,
      hasMore: true,
      records: []
    });
    this.loadRecords();
    this.loadStatistics();
  },

  // 加载小组列表
  loadGroups: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('student_groups')
        .where({
          class_id: this.data.classId,
          is_deleted: false
        })
        .orderBy('created_at', 'desc')
        .get();
      
      const groups = [{ group_id: '', group_name: '全部小组' }, ...(res.data || [])];
      this.setData({ groups: groups });
    } catch (err) {
      console.error('加载小组失败:', err);
    }
  },

  // 加载学生列表
  loadStudents: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const allStudents = await batchQuery.getAllRecords('students', {
        class_id: this.data.classId,
        status: _.neq('graduated')
      }, 'student_id', 'asc');
      
      const students = [{ student_id: '', name: '全部学生' }, ...allStudents];
      this.setData({ 
        students: students,
        filteredStudents: students
      });
      if (allStudents.length > 0 && allStudents.length % 20 === 0) {
      }
    } catch (err) {
      console.error('加载学生失败:', err);
    }
  },

  // 加载考勤类别
  loadCategories: async function () {
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
      
      const categoryOptions = [{ category_id: '', category_name: '全部类别' }, ...categories];
      this.setData({ categories: categoryOptions });
    } catch (err) {
      console.error('加载考勤类别失败:', err);
      const defaultCategories = this.getDefaultCategories();
      this.setData({ 
        categories: [{ category_id: '', category_name: '全部类别' }, ...defaultCategories]
      });
    }
  },

  // 获取默认考勤类别
  getDefaultCategories: function () {
    return [
      { category_id: 'sick_leave', category_name: '病假', score_deduction: 0, color: '#52c41a', icon: '🏥' },
      { category_id: 'personal_leave', category_name: '事假', score_deduction: 0, color: '#1890ff', icon: '📝' },
      { category_id: 'late', category_name: '迟到', score_deduction: -1, color: '#fa8c16', icon: '⏰' },
      { category_id: 'early_leave', category_name: '早退', score_deduction: -1, color: '#faad14', icon: '🏃' },
      { category_id: 'absent', category_name: '旷课', score_deduction: -5, color: '#ff4d4f', icon: '❌' }
    ];
  },

  // 初始化默认时间筛选（本月）
  initDefaultTimeFilter: function () {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = this.getMonthLastDay(year, month);
    
    this.setData({
      filterStartDate: startDate,
      filterEndDate: endDate,
      filterTimeLabel: `${year}年${month}月`,
      selectedTimeOption: 'month',
      selectedTimeOptionLabel: '本月'
    });
  },

  // 获取月份最后一天
  getMonthLastDay: function (year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;
  },

  // 加载考勤记录
  loadRecords: async function () {
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const { classId, filterGroupId, filterStudentId, filterCategoryId, filterStartDate, filterEndDate } = this.data;
      
      // 构建查询条件
      let query = { class_id: classId };
      
      // 按学生筛选
      if (filterStudentId) {
        query.student_id = filterStudentId;
      } else if (filterGroupId) {
        // 按小组筛选（需要先获取小组成员）
        const groupStudents = this.data.students.filter(s => s.group_id === filterGroupId);
        const studentIds = groupStudents.map(s => s.student_id);
        if (studentIds.length > 0) {
          query.student_id = _.in(studentIds);
        }
      }
      
      // 按考勤类别筛选
      if (filterCategoryId) {
        query.category_id = filterCategoryId;
      }
      
      // 按时间筛选
      if (filterStartDate && filterEndDate) {
        query.date = _.gte(filterStartDate).and(_.lte(filterEndDate));
      }
      
      // 分页查询
      const res = await db.collection('attendance_records')
        .where(query)
        .orderBy('date', 'desc')
        .orderBy('created_at', 'desc')
        .skip(this.data.page * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();
      
      const records = (res.data || []).map(record => ({
        ...record,
        dateStr: util.formatDate(new Date(record.date)),
        categoryColor: this.getCategoryColor(record.category_id),
        categoryIcon: this.getCategoryIcon(record.category_id)
      }));
      
      this.setData({
        records: this.data.page === 0 ? records : [...this.data.records, ...records],
        hasMore: records.length === this.data.pageSize,
        loading: false,
        page: this.data.page
      });
      
      // 加载统计
      this.loadStatistics();
      
    } catch (err) {
      console.error('加载考勤记录失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 加载统计数据
  loadStatistics: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const { classId, filterGroupId, filterStudentId, filterStartDate, filterEndDate } = this.data;
      
      let query = { class_id: classId };
      
      if (filterStudentId) {
        query.student_id = filterStudentId;
      } else if (filterGroupId) {
        const groupStudents = this.data.students.filter(s => s.group_id === filterGroupId);
        const studentIds = groupStudents.map(s => s.student_id);
        if (studentIds.length > 0) {
          query.student_id = _.in(studentIds);
        }
      }
      
      if (filterStartDate && filterEndDate) {
        query.date = _.gte(filterStartDate).and(_.lte(filterEndDate));
      }
      
      const res = await db.collection('attendance_records')
        .where(query)
        .get();
      
      const records = res.data || [];
      // 获取类别映射
      const catMap = {};
      this.data.categories.forEach(c => {
        catMap[c.category_id] = c.category_code || '';
      });

      const statistics = {
        total: records.length,
        sickLeave: records.filter(r => catMap[r.category_id] === 'sick_leave').length,
        personalLeave: records.filter(r => catMap[r.category_id] === 'personal_leave').length,
        late: records.filter(r => catMap[r.category_id] === 'late').length,
        earlyLeave: records.filter(r => catMap[r.category_id] === 'early_leave').length,
        absent: records.filter(r => catMap[r.category_id] === 'absent').length
      };
      
      this.setData({ statistics: statistics });
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 加载更多
  loadMore: function () {
    this.setData({ page: this.data.page + 1 });
    this.loadRecords();
  },

  // 获取类别颜色
  getCategoryColor: function (categoryId) {
    const colorMap = {
      'sick_leave': '#52c41a',
      'personal_leave': '#1890ff',
      'late': '#fa8c16',
      'early_leave': '#faad14',
      'absent': '#ff4d4f'
    };
    return colorMap[categoryId] || '#999999';
  },

  // 获取类别图标
  getCategoryIcon: function (categoryId) {
    const iconMap = {
      'sick_leave': '🏥',
      'personal_leave': '📝',
      'late': '⏰',
      'early_leave': '🏃',
      'absent': '❌'
    };
    return iconMap[categoryId] || '📌';
  },

  // 显示筛选弹窗
  onShowFilter: function () {
    this.setData({ showFilterModal: true });
  },

  // 关闭筛选弹窗
  onCloseFilter: function () {
    this.setData({ showFilterModal: false });
  },

  // 选择小组
  onGroupChange: function (e) {
    const index = e.detail.value;
    const group = this.data.groups[index];
    
    // 根据小组筛选学生
    let filteredStudents = this.data.students;
    if (group.group_id) {
      filteredStudents = this.data.students.filter(s => !s.student_id || s.group_id === group.group_id);
    }
    
    this.setData({
      filterGroupId: group.group_id,
      filterGroupName: group.group_name,
      filterStudentId: '', // 重置学生筛选
      filterStudentName: '全部学生',
      filteredStudents: [{ student_id: '', name: '全部学生' }, ...filteredStudents.filter(s => s.student_id)]
    });
  },

  // 选择学生
  onStudentChange: function (e) {
    const index = e.detail.value;
    const student = this.data.filteredStudents[index];
    this.setData({
      filterStudentId: student.student_id,
      filterStudentName: student.name
    });
  },

  // 选择考勤类别
  onCategoryChange: function (e) {
    const index = e.detail.value;
    const category = this.data.categories[index];
    const isAbsent = category.category_id === 'absent' || category.category_code === 'absent';
    this.setData({
      filterCategoryId: category.category_id,
      filterCategoryName: category.category_name,
      selectedCategoryId: category.category_id,
      selectedCategoryName: category.category_name,
      selectedCategoryCode: category.category_code || category.category_id,
      is_absent_category: isAbsent,
      show_period_selector: isAbsent,
      selected_period_sections: []
    });
    if (isAbsent) {
      this.loadTimetableSections();
    }
  },

  loadTimetableSections: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'getTimetableByDate', data: { class_id: this.data.classId, date: this.data.selectedDate } }
      });
      const result = res.result || {};
      if (result.success) {
        const classSections = (result.data.sections || [])
          .filter(s => s.section_type === 'class')
          .map(s => ({ ...s, section_id: String(s.section_id), checked: false }));
        this.setData({ period_sections: classSections });
      }
    } catch (err) {
      console.error('加载节次失败:', err);
    }
  },

  onPeriodSectionChange: function (e) {
    const selectedValues = e.detail.value;
    const period_sections = this.data.period_sections.map(s => ({
      ...s,
      checked: selectedValues.indexOf(s.section_id) > -1
    }));
    this.setData({
      selected_period_sections: selectedValues,
      period_sections
    });
  },


  onViewRecordDetail: function (e) {
    const record = e.currentTarget.dataset.record;
    if (record) {
      this.setData({ showRecordDetail: true, recordDetail: record });
    }
  },

  onCloseRecordDetail: function () {
    this.setData({ showRecordDetail: false });
  },

  // 时间筛选选项变化
  onTimeOptionChange: function (e) {
    const index = e.detail.value;
    const option = this.data.timeOptions[index];
    
    if (option.value === 'custom') {
      this.setData({ 
        selectedTimeOption: option.value,
        selectedTimeOptionLabel: '自定义',
        filterTimeLabel: '自定义'
      });
      return;
    }
    
    this.setData({
      selectedTimeOption: option.value,
      selectedTimeOptionLabel: option.label
    });
    
    this.applyTimeFilter(option.value);
  },

  // 应用时间筛选
  applyTimeFilter: function (optionValue) {
    const now = new Date();
    let startDate = '';
    let endDate = '';
    let label = '';
    
    switch (optionValue) {
      case 'today':
        startDate = this.formatDate(now);
        endDate = startDate;
        label = '今天';
        break;
        
      case 'week':
        const weekStart = this.getWeekStart(now);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        startDate = this.formatDate(weekStart);
        endDate = this.formatDate(weekEnd);
        label = '本周';
        break;
        
      case 'month':
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        endDate = this.getMonthLastDay(year, month);
        label = `${year}年${month}月`;
        break;
        
      case 'semester':
        // TODO: 获取当前学期的时间范围
        const semester = app.globalData.currentSemester;
        if (semester) {
          startDate = this.formatDate(new Date(semester.start_date));
          endDate = this.formatDate(new Date(semester.end_date));
          label = semester.name || '本学期';
        } else {
          util.showError('暂无学期数据');
          return;
        }
        break;
        
      default:
        label = '全部时间';
        break;
    }
    
    this.setData({
      filterStartDate: startDate,
      filterEndDate: endDate,
      filterTimeLabel: label,
      selectedTimeOption: optionValue
    });
  },

  // 自定义开始日期
  onCustomStartChange: function (e) {
    this.setData({ filterStartDate: e.detail.value });
  },

  // 自定义结束日期
  onCustomEndChange: function (e) {
    this.setData({ filterEndDate: e.detail.value });
  },

  // 确认筛选
  onConfirmFilter: function () {
    const { selectedTimeOption, filterStartDate, filterEndDate } = this.data;
    
    if (selectedTimeOption === 'custom') {
      if (!filterStartDate || !filterEndDate) {
        util.showError('请选择完整的时间范围');
        return;
      }
      if (new Date(filterStartDate) > new Date(filterEndDate)) {
        util.showError('开始日期不能大于结束日期');
        return;
      }
      this.setData({ filterTimeLabel: `${filterStartDate} 至 ${filterEndDate}` });
    }
    
    this.setData({ showFilterModal: false });
    this.refreshData();
  },

  // 重置筛选
  onResetFilter: function () {
    this.setData({
      filterGroupId: '',
      filterGroupName: '全部小组',
      filterStudentId: '',
      filterStudentName: '全部学生',
      filterCategoryId: '',
      filterCategoryName: '全部类别',
      filterStartDate: '',
      filterEndDate: '',
      filterTimeLabel: '全部时间',
      selectedTimeOption: 'all',
      filteredStudents: this.data.students
    });
  },

  // 删除考勤记录
  onDeleteRecord: function (e) {
    const record = e.currentTarget.dataset.record;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${record.student_name} 的 ${record.category_name} 记录吗？删除后积分将重新计算。`,
      success: (res) => {
        if (res.confirm) {
          this.doDeleteRecord(record);
        }
      }
    });
  },

  // 执行删除操作
  doDeleteRecord: async function (record) {
    wx.showLoading({ title: '删除中...' });
    
    try {
      // 使用云函数删除记录并回退积分
      const res = await wx.cloud.callFunction({
        name: 'deleteRecordWithScore',
        data: {
          recordType: 'attendance',
          recordId: record._id
        }
      });
      
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        util.showSuccess('删除成功');
        // 刷新列表
        this.refreshData();
      } else {
        util.showError(res.result?.message || '删除失败');
      }
      
    } catch (err) {
      console.error('删除失败:', err);
      wx.hideLoading();
      util.showError('删除失败');
    }
  },

  // 重新计算学生积分
  recalculateStudentScore: async function (studentId) {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 获取学生信息
      const studentRes = await db.collection('students')
        .where({ student_id: studentId })
        .get();
      
      if (!studentRes.data || studentRes.data.length === 0) return;
      
      const student = studentRes.data[0];
      const initialScore = student.initial_score || 100;
      
      // 获取该学生所有积分记录
      const recordsRes = await db.collection('score_records')
        .where({ student_id: studentId })
        .get();
      
      const records = recordsRes.data || [];
      const totalChange = records.reduce((sum, r) => sum + (r.score_change || 0), 0);
      const newScore = initialScore + totalChange;
      
      // 更新学生积分
      await db.collection('students').doc(student._id).update({
        data: {
          current_score: newScore,
          updated_at: db.serverDate()
        }
      });
      
    } catch (err) {
      console.error('重新计算积分失败:', err);
    }
  },

  // 更新考勤统计
  updateAttendanceStats: async function (date) {
    // 触发重新计算该日期的统计数据
    // 这里可以调用云函数或直接在前端重新计算
    console.log('更新考勤统计:', date);
  },

  // 编辑模式：加载学生列表
  loadEditStudents: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const allStudents = await batchQuery.getAllRecords('students', {
        class_id: this.data.classId,
        status: _.neq('graduated')
      }, 'student_id', 'asc');
      
      const attendanceRes = await db.collection('attendance_records')
        .where({
          class_id: this.data.classId,
          date: this.data.selectedDate
        })
        .get();
      
      const attendanceMap = {};
      (attendanceRes.data || []).forEach(record => {
        attendanceMap[record.student_id] = record;
      });
      
      const editStudents = allStudents.map(student => ({
        ...student,
        attendance: attendanceMap[student.student_id] || null,
        selected: false
      }));
      
      this.setData({
        editStudents: editStudents,
        filteredEditStudents: editStudents,
        selectedEditStudents: [],
        searchKeyword: '',
        selectedEditGroup: '',
        selectedEditGroupIndex: 0
      });
      
      this.loadEditGroupOptions();
    } catch (err) {
      console.error('加载编辑学生列表失败:', err);
    }
  },

  loadEditGroupOptions: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('student_groups')
        .where({ class_id: this.data.classId, is_deleted: false })
        .orderBy('created_at', 'desc')
        .get();
      const groupOptions = [{ value: '', label: '全部分组' }, ...(res.data || []).map(g => ({ value: g.group_name, label: g.group_name }))];
      this.setData({ editGroupOptions: groupOptions });
    } catch (err) {
      console.error('加载分组选项失败:', err);
    }
  },

  onEditGroupChange: async function (e) {
    const index = e.detail.value;
    const selectedOption = this.data.editGroupOptions[index];
    this.setData({
      selectedEditGroup: selectedOption.value,
      selectedEditGroupIndex: index
    });
    if (selectedOption.value) {
      await this.loadEditStudentsByGroup(selectedOption.value);
    } else {
      await this.loadEditStudents();
    }
  },

  loadEditStudentsByGroup: async function (groupName) {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const groupRes = await db.collection('student_groups')
        .where({ group_name: groupName, class_id: this.data.classId })
        .limit(1)
        .get();
      if (!groupRes.data || groupRes.data.length === 0) {
        wx.showToast({ title: '未找到该分组', icon: 'none' });
        this.setData({ editStudents: [], selectedEditStudents: [] });
        return;
      }
      const members = groupRes.data[0].members || [];
      if (members.length === 0) {
        this.setData({ editStudents: [], selectedEditStudents: [] });
        return;
      }
      const memberIds = members.map(m => m.student_id);
      const studentsData = await batchQuery.getAllRecords('students', {
        student_id: _.in(memberIds),
        status: _.neq('graduated')
      });
      const attendanceRes = await db.collection('attendance_records')
        .where({ class_id: this.data.classId, date: this.data.selectedDate })
        .get();
      const attendanceMap = {};
      (attendanceRes.data || []).forEach(record => {
        attendanceMap[record.student_id] = record;
      });
      const editStudents = studentsData.map(student => ({
        ...student,
        attendance: attendanceMap[student.student_id] || null,
        selected: false
      }));
      this.setData({ editStudents: editStudents, filteredEditStudents: editStudents, selectedEditStudents: [], searchKeyword: '' });
    } catch (err) {
      console.error('按分组加载学生失败:', err);
    }
  },

  // 编辑模式：选择考勤类别
  onSelectCategory: function (e) {
    const categoryId = e.currentTarget.dataset.id;
    const categoryName = e.currentTarget.dataset.name;
    const categoryCode = e.currentTarget.dataset.code || categoryId;
    const isAbsent = categoryId === 'absent' || categoryCode === 'absent';
    const period_sections = this.data.period_sections.map(s => ({ ...s, checked: false }));
    this.setData({
      selectedCategoryId: categoryId,
      selectedCategoryName: categoryName,
      selectedCategoryCode: categoryCode,
      is_absent_category: isAbsent,
      show_period_selector: isAbsent,
      selected_period_sections: [],
      period_sections
    });
    if (isAbsent) {
      this.loadTimetableSections();
    }
  },

  // 编辑模式：选择学生
  onSelectStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const editStudents = this.data.editStudents.map(s => {
      if (s.student_id === studentId) return { ...s, selected: !s.selected };
      return s;
    });
    const filteredEditStudents = this.data.filteredEditStudents.map(s => {
      if (s.student_id === studentId) return { ...s, selected: !s.selected };
      return s;
    });
    const selectedEditStudents = editStudents.filter(s => s.selected);
    this.setData({ editStudents, filteredEditStudents, selectedEditStudents });
  },

  onSearchInput: function (e) {
    const keyword = (e.detail.value || '').trim().substring(0, 50);
    this.setData({ searchKeyword: keyword });
    if (!keyword) {
      this.setData({ filteredEditStudents: this.data.editStudents });
      return;
    }
    const lower = keyword.toLowerCase();
    const filtered = this.data.editStudents.filter(s =>
      (s.name && s.name.toLowerCase().includes(lower)) ||
      (s.student_id && String(s.student_id).toLowerCase().includes(lower))
    );
    this.setData({ filteredEditStudents: filtered });
  },

  onSelectAll: function () {
    const { editStudents, searchKeyword } = this.data;
    let filtered = editStudents;
    if (searchKeyword) {
      const lower = searchKeyword.toLowerCase();
      filtered = filtered.filter(s =>
        (s.name && s.name.toLowerCase().includes(lower)) ||
        (s.student_id && String(s.student_id).toLowerCase().includes(lower))
      );
    }
    const allSelected = filtered.every(s => s.selected);
    const newStudents = editStudents.map(s => {
      const inFilter = filtered.some(fs => fs.student_id === s.student_id);
      if (inFilter) return { ...s, selected: !allSelected };
      return s;
    });
    const filteredEditStudents = newStudents.filter(s => {
      if (!searchKeyword) return true;
      const lower = searchKeyword.toLowerCase();
      return (s.name && s.name.toLowerCase().includes(lower)) ||
             (s.student_id && String(s.student_id).toLowerCase().includes(lower));
    });
    const selectedEditStudents = newStudents.filter(s => s.selected);
    this.setData({ editStudents: newStudents, filteredEditStudents, selectedEditStudents });
  },

  // 编辑模式：保存考勤记录
  onSaveAttendance: async function () {
    const { selectedCategoryId, selectedCategoryCode, selectedDate, selectedEditStudents } = this.data;
    
    if (!selectedCategoryId) {
      util.showError('请选择考勤类别');
      return;
    }
    
    if (selectedEditStudents.length === 0) {
      util.showError('请选择学生');
      return;
    }

    if (this.data.is_absent_category && this.data.period_sections.length > 0 && this.data.selected_period_sections.length === 0) {
      util.showError('请选择旷课节次');
      return;
    }
    
    wx.showLoading({ title: '保存中...' });
    
    try {
      const db = wx.cloud.database();
      const category = this.data.categories.find(c => c.category_id === selectedCategoryId);
      
      // 获取category_code，优先使用选中时的code，其次从类别中获取
      const categoryCode = selectedCategoryCode || category?.category_code || selectedCategoryId;
      
      for (const student of selectedEditStudents) {
        // 检查是否已有考勤记录
        const existRes = await db.collection('attendance_records')
          .where({
            student_id: student.student_id,
            class_id: this.data.classId,
            date: selectedDate
          })
          .get();
        
        if (existRes.data && existRes.data.length > 0) {
          // 更新现有记录
          const existingRecord = existRes.data[0];
          const oldScoreChange = existingRecord.score_change || 0;
          const newScoreChange = category.score_deduction || 0;
          const scoreDiff = newScoreChange - oldScoreChange;

          await db.collection('attendance_records')
            .doc(existingRecord._id)
            .update({
              data: {
                category_id: selectedCategoryId,
                category_code: categoryCode,
                category_name: category.category_name,
                score_change: newScoreChange,
                semester_id: app.globalData.currentSemesterId || '',
                updated_at: db.serverDate()
              }
            });

          // 如果积分有变化，同步更新积分记录和学生总积分
          if (scoreDiff !== 0) {
            await this.updateStudentScore(student.student_id, scoreDiff, {
              category_code: categoryCode,
              category_name: category.category_name,
              reason_detail: `${selectedDate} ${category.category_name}(调整，原${oldScoreChange}→新${newScoreChange})`
            });
          }
        } else {
          // 创建新记录
          if (this.data.is_absent_category && this.data.selected_period_sections.length > 0) {
            const selectedSections = this.data.period_sections.filter(s =>
              this.data.selected_period_sections.includes(s.section_id)
            );
            for (const section of selectedSections) {
              const existSectionRes = await db.collection('attendance_records')
                .where({
                  student_id: student.student_id,
                  class_id: this.data.classId,
                  date: selectedDate,
                  period_section: section.section_id
                })
                .limit(1).get();
              if (existSectionRes.data && existSectionRes.data.length > 0) continue;

              const recordId = `AR${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
              await db.collection('attendance_records').add({
                data: {
                  record_id: recordId,
                  student_id: student.student_id,
                  student_name: student.name,
                  class_id: this.data.classId,
                  date: selectedDate,
                  category_id: selectedCategoryId,
                  category_code: categoryCode,
                  category_name: category.category_name,
                  score_change: category.score_deduction || 0,
                  reason: '',
                  period_section: section.section_id,
                  period_section_name: section.section_name,
                  period_start_time: section.start_time,
                  period_end_time: section.end_time,
                  recorder_openid: app.globalData.openid,
                  recorder_name: app.globalData.userInfo.nickName,
                  recorder_role: this.data.userRole,
                  semester_id: app.globalData.currentSemesterId || '',
                  created_at: db.serverDate(),
                  updated_at: db.serverDate()
                }
              });
            }
            if (category.score_deduction && category.score_deduction !== 0) {
              const totalDeduction = (category.score_deduction || 0) * selectedSections.length;
              await this.updateStudentScore(student.student_id, totalDeduction, {
                category_code: categoryCode,
                category_name: category.category_name,
                reason_detail: `${selectedDate} ${category.category_name}(${selectedSections.length}节)`
              });
            }
          } else {
          const recordId = `AR${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
          await db.collection('attendance_records').add({
            data: {
              record_id: recordId,
              student_id: student.student_id,
              student_name: student.name,
              class_id: this.data.classId,
              date: selectedDate,
              category_id: selectedCategoryId,
              category_code: categoryCode,
              category_name: category.category_name,
              score_change: category.score_deduction || 0,
              reason: '',
              recorder_openid: app.globalData.openid,
              recorder_name: app.globalData.userInfo.nickName,
              recorder_role: this.data.userRole,
              semester_id: app.globalData.currentSemesterId || '',
              created_at: db.serverDate(),
              updated_at: db.serverDate()
            }
          });
          
          // 如果有积分扣减，创建积分记录
          if (category.score_deduction && category.score_deduction !== 0) {
            await this.updateStudentScore(student.student_id, category.score_deduction, {
              category_code: categoryCode,
              category_name: category.category_name,
              reason_detail: `${selectedDate} ${category.category_name}`
            });
          }
          }
        }
      }
      
      wx.hideLoading();
      util.showSuccess('保存成功');

      if (this.data.is_absent_category) {
        wx.cloud.callFunction({
          name: 'attendanceWarning',
          data: { action: 'detectWarnings', data: { class_id: this.data.classId } }
        }).catch(err => console.error('触发预警检测失败:', err));
      }
      
      // 返回上一页
      wx.navigateBack();
      
    } catch (err) {
      console.error('保存考勤失败:', err);
      wx.hideLoading();
      util.showError('保存失败');
    }
  },

  // 格式化日期
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 获取周起始日期（周一）
  getWeekStart: function (date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  },

  updateStudentScore: async function (studentId, scoreChange, options = {}) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'applyScoreChange',
          data: {
            student_id: studentId,
            class_id: this.data.classId,
            semester_id: app.globalData.currentSemesterId || '',
            score_change: scoreChange,
            source_type: '考勤',
            item_id: options.item_id || `attendance_${options.category_code || ''}`,
            item_name: options.item_name || `考勤-${options.category_name || ''}`,
            rule_name: options.item_name || `考勤-${options.category_name || ''}`,
            rule_code: options.category_code || '',
            reason_detail: options.reason_detail || '',
            recorder_openid: app.globalData.openid,
            recorder_name: app.globalData.userInfo.nickName || '',
            date: this.data.selectedDate
          }
        }
      });
      const result = res.result || {};
      if (!result.success) {
        console.error('统一积分变更失败:', result.message);
      }
    } catch (err) {
      console.error('调用积分云函数失败:', err);
    }
  }
});