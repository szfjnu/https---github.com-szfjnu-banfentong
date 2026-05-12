const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');
const validator = require('./helpers/validator.js');
const dataFormatter = require('./helpers/dataFormatter.js');
const submitHandler = require('./helpers/submitHandler.js');
const studentLoader = require('./helpers/studentLoader.js');

Page({
  data: {
    loading: true,
    submitting: false,
    students: [],
    filteredStudents: [],
    selectedStudents: [],
    searchKeyword: '',
    classOptions: [{ value: '', label: '全部班级' }],
    selectedClass: '',
    selectedClassIndex: 0,
    groupOptions: [{ value: '', label: '全部分组' }],
    selectedGroup: '',
    selectedGroupIndex: 0,
    categories: [],
    scoreItems: [],
    cascaderData: [],
    cascaderValue: [0, 0],
    selectedCategory: '',
    selectedItem: null,
    sourceTypes: [
      { value: '日常积分', label: '日常积分' },
      { value: '志愿服务', label: '志愿服务' },
      { value: '竞赛获奖', label: '竞赛获奖' },
      { value: '证书获得', label: '证书获得' },
      { value: '处分扣分', label: '处分扣分' },
      { value: '宿舍折算', label: '宿舍折算' },
      { value: '其他', label: '其他' }
    ],
    selectedSourceTypeIndex: 0,
    sourceType: '日常积分',
    scoreValue: 0,
    isAddScore: true,
    reason: '',
    remark: '',
    currentSemester: null,
    userRole: '',
    currentClassId: '',
    currentSemesterId: '',
    managedClasses: []
  },

  onLoad: async function () {
    this.checkPermission();
    await this.initUserContext();
    this.loadData();
  },

  initUserContext: async function () {
    const role = app.globalData.role;
    const classId = app.globalData.class_id || '';
    let semesterId = app.globalData.currentSemesterId || '';

    if (!semesterId) {
      try {
        const semester = await app.getCurrentSemester();
        if (semester) {
          semesterId = semester._id || semester.semester_id || '';
        }
      } catch (err) {
        console.error('【积分登记】获取学期失败:', err);
      }
    }

    this.setData({ currentClassId: classId, currentSemesterId: semesterId });

    if (role === 'head_teacher' && classId) {
      const className = await submitHandler.getClassNameById(classId);
      this.setData({
        selectedClass: classId,
        selectedClassIndex: classId ? 1 : 0,
        managedClasses: [classId],
        classOptions: [
          { value: '', label: '全部班级' },
          { value: classId, label: className || '我的班级' }
        ]
      });
    } else if (role === 'admin' || role === 'subject_teacher') {
      await this.loadManagedClasses();
    }
  },

  loadManagedClasses: async function () {
    try {
      const role = app.globalData.role;
      const openid = app.globalData.openid;

      if (role === 'admin') {
        const res = await api.classApi.getClasses();
        const classes = res.data || [];
        this.setData({ managedClasses: classes.map(c => c.class_id || c._id) });
      } else if (role === 'subject_teacher') {
        const relationData = await studentLoader.getSubjectTeacherClasses(openid);
        this.setData({ managedClasses: relationData.map(r => r.class_id) });
      }
    } catch (err) {
      console.error('加载管理的班级失败:', err);
    }
  },

  checkPermission: function () {
    const role = app.globalData.role;
    this.setData({ userRole: role });
    validator.checkPermission(role);
  },

  loadData: async function () {
    this.setData({ loading: true });
    try {
      await Promise.all([
        this.loadStudents(),
        this.loadClasses(),
        this.loadGroups(),
        this.loadScoreItems(),
        this.loadCurrentSemester()
      ]);
      this.setData({ loading: false });
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  loadStudents: async function (filterByClassId) {
    try {
      const role = app.globalData.role;
      const { currentClassId, managedClasses, currentSemesterId } = this.data;

      const resolved = await studentLoader.resolveStudentQueryClassId(
        role, currentClassId, managedClasses, app.globalData.openid, app.globalData.class_id, filterByClassId
      );

      if (resolved.noStudents) {
        this.setData({ students: [] });
        return;
      }

      const queryClassId = resolved.isMultiple ? resolved.classIds : resolved.classId;
      const studentsData = await studentLoader.fetchStudents(queryClassId, app.globalData.class_id);
      let students = dataFormatter.processStudentsData(studentsData);
      students = await studentLoader.filterByStudentStatus(students, currentSemesterId, currentClassId);

      this.setData({ students: students });
      this.applyStudentFilter();
    } catch (err) {
      console.error('【加载学生失败】:', err);
      this.setData({ students: [] });
    }
  },

  loadClasses: async function () {
    if (app.globalData.role === 'head_teacher') return;
    try {
      const res = await api.classApi.getClasses();
      const classOptions = [
        { value: '', label: '全部班级' },
        ...res.data.map(item => ({ value: item._id, label: item.class_name }))
      ];
      this.setData({ classOptions: classOptions });
    } catch (err) {
      console.error('加载班级列表失败:', err);
    }
  },

  loadGroups: async function () {
    try {
      const res = await api.groupApi.getGroups();
      const groupOptions = [
        { value: '', label: '全部分组' },
        ...res.data.map(item => ({ value: item.group_name || item.name, label: item.group_name || item.name }))
      ];
      this.setData({ groupOptions: groupOptions });
    } catch (err) {
      console.error('加载分组列表失败:', err);
      if (err.errCode === -502005) {
        this.setData({ groupOptions: [{ value: '', label: '全部分组' }] });
      }
    }
  },

  loadScoreItems: async function () {
    try {
      const { isAddScore } = this.data;
      const classId = this.data.currentClassId || app.globalData.class_id || '';

      const [catCfRes, itemCfRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'scoreManager',
          data: { action: 'getScoreCategories', data: { classId: classId } }
        }),
        wx.cloud.callFunction({
          name: 'scoreManager',
          data: { action: 'getScoreItems', data: { classId: classId, semesterId: app.globalData.currentSemesterId || '' } }
        })
      ]);

      const categoryList = (catCfRes.result && catCfRes.result.data) || [];
      const allItems = (itemCfRes.result && itemCfRes.result.data) || [];
      const result = dataFormatter.buildScoreItemCascaderData(categoryList, allItems, isAddScore);

      this.setData({
        scoreItems: result.scoreItems,
        filteredScoreItems: result.filteredScoreItems,
        categories: result.categories,
        categoryMap: result.categoryMap,
        cascaderData: result.cascaderData,
        selectedCategory: result.selectedCategory,
        cascaderValue: [0, 0]
      });

      if (result.firstItems.length > 0) {
        this.updateSelectedItem(result.firstItems[0]);
      }
    } catch (err) {
      console.error('加载积分项目失败:', err);
      util.showError('积分配置加载失败');
    }
  },

  rebuildCascaderData: function () {
    const { scoreItems, isAddScore, categoryMap } = this.data;
    const result = dataFormatter.rebuildCascaderData(scoreItems, isAddScore, categoryMap);
    this.setData({
      filteredScoreItems: result.filteredScoreItems,
      categories: result.categories,
      categoryMap: result.categoryMap,
      cascaderData: result.cascaderData,
      selectedCategory: result.selectedCategory,
      cascaderValue: [0, 0]
    });
    if (result.firstItems.length > 0) {
      this.updateSelectedItem(result.firstItems[0]);
    }
  },

  updateSelectedItem: function (item) {
    if (!item) return;
    this.setData({
      selectedItem: item,
      scoreValue: Math.abs(item.score_value || 0),
      isAddScore: (item.score_value || 0) > 0,
      reason: item.rule_name || item.name || item.item_name || ''
    });
  },

  loadCurrentSemester: async function () {
    try {
      const res = await api.semesterApi.getCurrentSemester();
      if (res.data && res.data.length > 0) {
        const semester = res.data[0];
        this.setData({ currentSemester: semester, currentSemesterId: semester._id });
      }
    } catch (err) {
      console.error('加载当前学期失败:', err);
    }
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.applyStudentFilter();
  },

  applyStudentFilter: function () {
    const { students, selectedClass, selectedGroup, searchKeyword } = this.data;
    this.setData({ filteredStudents: dataFormatter.applyFilter(students, selectedClass, selectedGroup, searchKeyword) });
  },

  onClassChange: async function (e) {
    const index = e.detail.value;
    const selectedOption = this.data.classOptions[index];
    const classIdOrEmpty = selectedOption.value;
    this.setData({ selectedClass: classIdOrEmpty, selectedClassIndex: index });
    if (app.globalData.role === 'admin' && classIdOrEmpty) {
      await this.loadStudents(classIdOrEmpty);
    } else if (!classIdOrEmpty) {
      await this.loadStudents();
    }
  },

  onGroupChange: async function (e) {
    const index = e.detail.value;
    const selectedGroup = this.data.groupOptions[index].value;
    this.setData({ selectedGroup: selectedGroup, selectedGroupIndex: index });
    if (selectedGroup) {
      await this.loadStudentsByGroup(selectedGroup);
    } else {
      await this.loadStudents();
    }
  },

  loadStudentsByGroup: async function (groupName) {
    try {
      const { currentClassId } = this.data;
      const result = await studentLoader.loadStudentsByGroup(groupName, currentClassId, app.globalData.class_id);

      if (result.error) {
        wx.showToast({ title: result.error, icon: 'none' });
        this.setData({ students: [] });
        return;
      }

      this.setData({ students: result.students });
      this.applyStudentFilter();
    } catch (err) {
      console.error('【按分组加载学生失败】:', err);
      this.setData({ students: [] });
      wx.showToast({ title: '加载分组学生失败', icon: 'none' });
    }
  },

  onCascaderChange: function (e) {
    const value = e.detail.value;
    const catIndex = value[0] || 0;
    const itemIndex = value[1] || 0;
    const { categories, categoryMap } = this.data;
    const selectedCategory = categories[catIndex];
    const items = categoryMap[selectedCategory] || [];
    const selectedItem = items[itemIndex];
    if (!selectedItem) return;
    this.setData({ cascaderValue: value, selectedCategory: selectedCategory });
    this.updateSelectedItem(selectedItem);
  },

  onCascaderColumnChange: function (e) {
    const { column, value } = e.detail;
    const { categories, categoryMap } = this.data;
    if (column === 0) {
      const items = categoryMap[categories[value]] || [];
      if (items.length === 0) {
        this.setData({
          'cascaderData[1]': [{ name: '该分类暂无项目', score: 0, type: '加分', item: null }],
          cascaderValue: [value, 0]
        });
        return;
      }
      this.setData({
        'cascaderData[1]': dataFormatter.buildCascaderSecondColumn(items),
        cascaderValue: [value, 0]
      });
    }
  },

  onToggleScoreType: function () {
    this.setData({ isAddScore: !this.data.isAddScore });
    this.rebuildCascaderData();
  },

  onSourceTypeChange: function (e) {
    const index = e.detail.value;
    this.setData({ selectedSourceTypeIndex: index, sourceType: this.data.sourceTypes[index].value });
  },

  onScoreValueInput: function (e) {
    this.setData({ scoreValue: Math.abs(parseInt(e.detail.value) || 0) });
  },

  onScoreValueChange: function (e) {
    const delta = e.currentTarget.dataset.delta;
    let newValue = this.data.scoreValue + delta;
    if (newValue < 0) newValue = 0;
    const maxScore = app.globalData.scoreMax || 100;
    if (newValue > maxScore) newValue = maxScore;
    this.setData({ scoreValue: newValue });
  },

  onReasonInput: function (e) {
    this.setData({ reason: e.detail.value });
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },

  onToggleStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const students = this.data.students.map(s => {
      if (s.student_id === studentId) return { ...s, selected: !s.selected };
      return s;
    });
    this.setData({ students: students, selectedStudents: students.filter(s => s.selected) });
    this.applyStudentFilter();
  },

  onSelectAll: function () {
    const { students, selectedClass, selectedGroup, searchKeyword } = this.data;
    let filteredStudents = students;
    if (selectedClass) filteredStudents = filteredStudents.filter(s => s.class_id === selectedClass);
    if (selectedGroup) filteredStudents = filteredStudents.filter(s => s.group === selectedGroup);
    if (searchKeyword) {
      filteredStudents = filteredStudents.filter(s => s.name.includes(searchKeyword) || s.student_id.includes(searchKeyword));
    }
    const allSelected = filteredStudents.every(s => s.selected);
    const newStudents = students.map(s => {
      if (filteredStudents.some(fs => fs.student_id === s.student_id)) return { ...s, selected: !allSelected };
      return s;
    });
    this.setData({ students: newStudents, selectedStudents: newStudents.filter(s => s.selected) });
  },

  onSubmit: async function () {
    if (this.data.submitting) return;
    const { selectedStudents, scoreValue, isAddScore, reason, remark, sourceType, selectedItem, currentClassId, currentSemesterId } = this.data;

    if (!validator.validateSubmit({ selectedStudents, scoreValue, reason, currentClassId, currentSemesterId, selectedItem })) return;

    try {
      const hasPermission = await submitHandler.verifyTeacherPermission(app.globalData.role, app.globalData.openid, currentClassId);
      if (!hasPermission) { util.showError('您没有权限对该班级进行操作'); return; }
    } catch (err) {
      console.error('权限校验失败:', err);
      util.showError('权限校验失败');
      return;
    }

    const actualScoreChange = isAddScore ? scoreValue : -scoreValue;
    const content = '确定要为 ' + selectedStudents.length + ' 名学生' + (isAddScore ? '添加' : '扣减') + ' ' + scoreValue + ' 积分吗？\n原因：' + reason;

    wx.showModal({
      title: '确认提交',
      content: content,
      success: async (res) => { if (res.confirm) await this.submitScoreRecords(actualScoreChange, isAddScore); }
    });
  },

  submitScoreRecords: async function (actualScoreChange, isAdd) {
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      const { selectedStudents, selectedItem, reason, remark, sourceType, currentSemester } = this.data;
      const operatorName = (app.globalData.userInfo && app.globalData.userInfo.name) || app.globalData.name || '管理员';
      const operatorType = app.globalData.role === 'admin' ? '管理员' : (app.globalData.role === 'head_teacher' ? '班主任' : '教师');

      let successCount = 0;
      let failCount = 0;
      const failedStudents = [];

      for (const student of selectedStudents) {
        try {
          const { recordData, scoreAfter } = submitHandler.buildRecordData(student, actualScoreChange, isAdd, {
            currentClassId: this.data.currentClassId,
            selectedItem, selectedCategory: this.data.selectedCategory,
            reason, remark, operatorName, operatorType,
            operatorId: app.globalData.openid, sourceType,
            currentSemesterId: this.data.currentSemesterId,
            semesterName: (currentSemester && (currentSemester.semester_name || currentSemester.name)) || ''
          });

          await submitHandler.addScoreRecord(recordData);
          const updateRes = await submitHandler.updateStudentScore(student, scoreAfter, app.globalData.openid, operatorName);
          if (updateRes.success) {
            successCount++;
          } else {
            failCount++;
            failedStudents.push(student.name + '(' + updateRes.reason + ')');
          }
        } catch (err) {
          console.error('为 ' + student.name + ' 添加积分失败:', err);
          failCount++;
          failedStudents.push(student.name);
        }
      }

      wx.hideLoading();
      this.setData({ submitting: false });

      if (failCount === 0) {
        util.showSuccess('成功为 ' + successCount + ' 名学生' + (isAdd ? '添加' : '扣减') + '积分');
        setTimeout(() => { wx.navigateBack(); }, 1500);
      } else {
        wx.showModal({
          title: '部分成功',
          content: '成功：' + successCount + '人\n失败：' + failCount + '人\n失败学生：' + failedStudents.join('、'),
          showCancel: false
        });
      }
    } catch (err) {
      console.error('提交积分记录失败:', err);
      wx.hideLoading();
      this.setData({ submitting: false });
      util.showError('提交失败: ' + (err.message || err.errMsg || '未知错误'));
    }
  }
});
