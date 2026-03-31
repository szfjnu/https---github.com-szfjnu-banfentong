// pages/join/bind/bind.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    classId: '',
    students: [],
    filteredStudents: [],
    selectedStudentId: '',
    searchKeyword: '',
    sortType: 'name', // name: 按姓名, id: 按学号
    isAddingNew: false,
    loading: true
  },

  onLoad: function (options) {
    if (options.classId) {
      this.setData({ classId: options.classId });
      this.loadStudents();
    }
  },

  // 加载学生列表
  loadStudents: async function () {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({
          class_id: this.data.classId
        })
        .get();

      let students = res.data;

      // 排序
      students = this.sortStudents(students);

      this.setData({
        students,
        filteredStudents: students,
        loading: false
      });
    } catch (err) {
      console.error('加载学生失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 排序学生
  sortStudents: function (students) {
    if (this.data.sortType === 'name') {
      return students.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    } else {
      return students.sort((a, b) => a.student_id.localeCompare(b.student_id));
    }
  },

  // 搜索输入
  onSearchInput: function (e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });

    // 过滤学生
    const filtered = this.data.students.filter(s =>
      s.name.includes(keyword) || s.student_id.includes(keyword)
    );

    this.setData({ filteredStudents: filtered });
  },

  // 清除搜索
  onClearSearch: function () {
    this.setData({
      searchKeyword: '',
      filteredStudents: this.data.students
    });
  },

  // 切换排序
  onToggleSort: function () {
    const newSortType = this.data.sortType === 'name' ? 'id' : 'name';
    const sorted = this.sortStudents([...this.data.students]);

    this.setData({
      sortType: newSortType,
      students: sorted,
      filteredStudents: sorted
    });
  },

  // 选择学生
  onSelectStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    this.setData({
      selectedStudentId: studentId,
      isAddingNew: false
    });
  },

  // 添加新学生
  onAddStudent: function () {
    this.setData({
      isAddingNew: true,
      selectedStudentId: ''
    });

    // 跳转到确认页，标记为添加新学生
    wx.navigateTo({
      url: `/pages/join/confirm/confirm?classId=${this.data.classId}&role=parent&addNew=true`
    });
  },

  // 下一步
  onNext: function () {
    if (!this.data.selectedStudentId && !this.data.isAddingNew) {
      util.showError('请选择学生');
      return;
    }

    // 跳转到确认页
    wx.navigateTo({
      url: `/pages/join/confirm/confirm?classId=${this.data.classId}&role=parent&studentId=${this.data.selectedStudentId}`
    });
  }
});
