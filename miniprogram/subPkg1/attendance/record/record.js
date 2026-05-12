const app = getApp();
const util = require('../../../utils/util.js');
const dataFormatter = require('./helpers/dataFormatter.js');
const scoreCalculator = require('./helpers/scoreCalculator.js');
const submitHandler = require('./helpers/submitHandler.js');
const studentLoader = require('./helpers/studentLoader.js');
const recordLoader = require('./helpers/recordLoader.js');

Page({
  data: {
    classId: '', userRole: '', isAdmin: false, mode: 'view', selectedDate: '',
    showFilterModal: false, filterGroupId: '', filterGroupName: '全部小组',
    filterStudentId: '', filterStudentName: '全部学生', filterCategoryId: '',
    filterCategoryName: '全部类别', filterStartDate: '', filterEndDate: '', filterTimeLabel: '全部时间',
    groups: [], students: [], filteredStudents: [], categories: [],
    timeOptions: [
      { value: 'all', label: '全部时间' }, { value: 'today', label: '今天' },
      { value: 'week', label: '本周' }, { value: 'month', label: '本月' },
      { value: 'semester', label: '本学期' }, { value: 'custom', label: '自定义' }
    ],
    selectedTimeOption: 'all', selectedTimeOptionLabel: '全部时间',
    records: [], loading: false, hasMore: true, page: 0, pageSize: 20,
    editStudents: [], filteredEditStudents: [], selectedEditStudents: [],
    editGroupOptions: [{ value: '', label: '全部分组' }], selectedEditGroup: '',
    selectedEditGroupIndex: 0, searchKeyword: '', selectedCategoryId: '',
    selectedCategoryName: '', selectedCategoryCode: '',
    period_sections: [], selected_period_sections: [],
    show_period_selector: false, is_absent_category: false,
    showRecordDetail: false, recordDetail: {},
    statistics: { total: 0, sickLeave: 0, personalLeave: 0, late: 0, earlyLeave: 0, absent: 0 }
  },

  onLoad: function (options) {
    const classId = options.class_id || app.globalData.class_id;
    const semesterId = app.globalData.currentSemesterId || '';
    const role = app.globalData.role;
    const isAdmin = ['admin', 'head_teacher'].includes(role);
    const mode = options.mode || 'view';
    const date = options.date || dataFormatter.formatDate(new Date());

    this.setData({
      classId: classId,
      semester_id: semesterId,
      userRole: role,
      isAdmin: isAdmin,
      mode: mode,
      selectedDate: date
    });

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

  onPullDownRefresh: function () {
    this.refreshData();
    wx.stopPullDownRefresh();
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  refreshData: function () {
    this.setData({ page: 0, hasMore: true, records: [] });
    this.loadRecords();
    this.loadStatistics();
  },

  loadGroups: async function () {
    try {
      const groups = await recordLoader.loadGroups(this.data.classId);
      this.setData({ groups: groups });
    } catch (err) {
      console.error('加载小组失败:', err);
    }
  },

  loadStudents: async function () {
    try {
      const students = await recordLoader.loadStudents(this.data.classId);
      this.setData({ students: students, filteredStudents: students });
    } catch (err) {
      console.error('加载学生失败:', err);
    }
  },

  loadCategories: async function () {
    try {
      const categories = await recordLoader.loadCategories(this.data.classId);
      this.setData({ categories: categories });
    } catch (err) {
      console.error('加载考勤类别失败:', err);
      const defaultCategories = dataFormatter.getDefaultCategories();
      this.setData({ categories: [{ category_id: '', category_name: '全部类别' }, ...defaultCategories] });
    }
  },

  initDefaultTimeFilter: function () {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = dataFormatter.getMonthLastDay(year, month);
    this.setData({
      filterStartDate: startDate,
      filterEndDate: endDate,
      filterTimeLabel: `${year}年${month}月`,
      selectedTimeOption: 'month',
      selectedTimeOptionLabel: '本月'
    });
  },

  loadRecords: async function () {
    this.setData({ loading: true });
    try {
      const { classId, filterGroupId, filterStudentId, filterCategoryId, filterStartDate, filterEndDate, page, pageSize, students } = this.data;
      const records = await recordLoader.loadRecords(classId, filterGroupId, filterStudentId, filterCategoryId, filterStartDate, filterEndDate, students, page, pageSize);
      this.setData({
        records: this.data.page === 0 ? records : [...this.data.records, ...records],
        hasMore: records.length === this.data.pageSize,
        loading: false,
        page: page
      });
      this.loadStatistics();
    } catch (err) {
      console.error('加载考勤记录失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  loadStatistics: async function () {
    try {
      const { classId, filterGroupId, filterStudentId, filterStartDate, filterEndDate, students, categories } = this.data;
      const statistics = await recordLoader.loadStatistics(classId, filterGroupId, filterStudentId, filterStartDate, filterEndDate, students, categories);
      this.setData({ statistics: statistics });
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  loadMore: function () {
    this.setData({ page: this.data.page + 1 });
    this.loadRecords();
  },

  onShowFilter: function () { this.setData({ showFilterModal: true }); },
  onCloseFilter: function () { this.setData({ showFilterModal: false }); },

  onGroupChange: function (e) {
    const index = e.detail.value;
    const group = this.data.groups[index];
    let filteredStudents = this.data.students;
    if (group.group_id) {
      filteredStudents = this.data.students.filter(s => !s.student_id || s.group_id === group.group_id);
    }
    this.setData({
      filterGroupId: group.group_id,
      filterGroupName: group.group_name,
      filterStudentId: '',
      filterStudentName: '全部学生',
      filteredStudents: [{ student_id: '', name: '全部学生' }, ...filteredStudents.filter(s => s.student_id)]
    });
  },

  onStudentChange: function (e) {
    const index = e.detail.value;
    const student = this.data.filteredStudents[index];
    this.setData({ filterStudentId: student.student_id, filterStudentName: student.name });
  },

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
      ...s, checked: selectedValues.indexOf(s.section_id) > -1
    }));
    this.setData({ selected_period_sections: selectedValues, period_sections });
  },

  onViewRecordDetail: function (e) {
    const record = e.currentTarget.dataset.record;
    if (record) {
      this.setData({ showRecordDetail: true, recordDetail: record });
    }
  },

  onCloseRecordDetail: function () { this.setData({ showRecordDetail: false }); },

  onTimeOptionChange: function (e) {
    const index = e.detail.value;
    const option = this.data.timeOptions[index];
    if (option.value === 'custom') {
      this.setData({ selectedTimeOption: option.value, selectedTimeOptionLabel: '自定义', filterTimeLabel: '自定义' });
      return;
    }
    this.setData({ selectedTimeOption: option.value, selectedTimeOptionLabel: option.label });
    this.applyTimeFilter(option.value);
  },

  applyTimeFilter: function (optionValue) {
    const result = dataFormatter.applyTimeFilter(optionValue, app);
    if (result.error) {
      util.showError(result.error);
      return;
    }
    this.setData(result);
  },

  onCustomStartChange: function (e) { this.setData({ filterStartDate: e.detail.value }); },
  onCustomEndChange: function (e) { this.setData({ filterEndDate: e.detail.value }); },

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

  doDeleteRecord: async function (record) {
    wx.showLoading({ title: '删除中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'deleteRecordWithScore',
        data: { recordType: 'attendance', recordId: record._id }
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        util.showSuccess('删除成功');
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

  recalculateStudentScore: async function (studentId) {
    await scoreCalculator.recalculateStudentScore(this.data.classId, studentId);
  },

  updateAttendanceStats: async function (date) { console.log('更新考勤统计:', date); },

  loadEditStudents: async function () {
    try {
      const editStudents = await studentLoader.loadEditStudents(this.data.classId, this.data.selectedDate);
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
      const groupOptions = await studentLoader.loadEditGroupOptions(this.data.classId);
      this.setData({ editGroupOptions: groupOptions });
    } catch (err) {
      console.error('加载分组选项失败:', err);
    }
  },

  onEditGroupChange: async function (e) {
    const index = e.detail.value;
    const selectedOption = this.data.editGroupOptions[index];
    this.setData({ selectedEditGroup: selectedOption.value, selectedEditGroupIndex: index });
    if (selectedOption.value) {
      await this.loadEditStudentsByGroup(selectedOption.value);
    } else {
      await this.loadEditStudents();
    }
  },

  loadEditStudentsByGroup: async function (groupName) {
    try {
      const result = await studentLoader.loadEditStudentsByGroup(this.data.classId, this.data.selectedDate, groupName);
      if (result.error) {
        wx.showToast({ title: result.error, icon: 'none' });
        this.setData({ editStudents: [], selectedEditStudents: [] });
        return;
      }
      this.setData({
        editStudents: result.students,
        filteredEditStudents: result.students,
        selectedEditStudents: [],
        searchKeyword: ''
      });
    } catch (err) {
      console.error('按分组加载学生失败:', err);
    }
  },

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
    const filtered = dataFormatter.filterStudentsByKeyword(this.data.editStudents, keyword);
    this.setData({ filteredEditStudents: filtered });
  },

  onSelectAll: function () {
    const { editStudents, searchKeyword } = this.data;
    const filtered = dataFormatter.filterStudentsByKeyword(editStudents, searchKeyword);
    const allSelected = filtered.every(s => s.selected);
    const newStudents = editStudents.map(s => {
      const inFilter = filtered.some(fs => fs.student_id === s.student_id);
      if (inFilter) return { ...s, selected: !allSelected };
      return s;
    });
    const filteredEditStudents = dataFormatter.filterStudentsByKeyword(newStudents, searchKeyword);
    const selectedEditStudents = newStudents.filter(s => s.selected);
    this.setData({ editStudents: newStudents, filteredEditStudents, selectedEditStudents });
  },

  onSaveAttendance: async function () {
    const { selectedCategoryId, selectedEditStudents, is_absent_category, period_sections, selected_period_sections } = this.data;

    if (!selectedCategoryId) {
      util.showError('请选择考勤类别');
      return;
    }
    if (selectedEditStudents.length === 0) {
      util.showError('请选择学生');
      return;
    }
    if (is_absent_category && period_sections.length > 0 && selected_period_sections.length === 0) {
      util.showError('请选择旷课节次');
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      await submitHandler.saveAttendance(this);

      wx.hideLoading();
      util.showSuccess('保存成功');

      if (this.data.is_absent_category) {
        wx.cloud.callFunction({
          name: 'attendanceWarning',
          data: { action: 'detectWarnings', data: { class_id: this.data.classId } }
        }).catch(err => console.error('触发预警检测失败:', err));
      }

      wx.navigateBack();
    } catch (err) {
      console.error('保存考勤失败:', err);
      wx.hideLoading();
      util.showError('保存失败');
    }
  },

  updateStudentScore: async function (studentId, scoreChange, options) {
    await scoreCalculator.updateStudentScore(this.data.classId, this.data.selectedDate, studentId, scoreChange, options);
  }
});
