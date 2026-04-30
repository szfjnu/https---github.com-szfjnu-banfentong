// pages/grade/grade.js
// 成绩管理中心 - 页面逻辑
const app = getApp();

Page({
  data: {
    loading: true,
    role: '',
    classId: '',
    studentId: '',

    // 考试类型 Tab
    currentExamType: 'monthly',

    // 学期选择
    termList: [],
    termIndex: 0,
    currentTerm: '',

    // 科目选择
    subjectList: ['全部'],
    subjectIndex: 0,
    currentSubject: '',

    // 统计数据（班主任/管理员）
    stats: null,

    // 学生/家长：个人成绩列表
    myGrades: [],

    // 班主任/管理员：全班成绩表格
    studentList: [],
    allSubjects: [],

    // 批量导入弹窗
    showImportModal: false,
    importText: '',
    importing: false,

    // 批量录入科目选择
    importSubject: '',
    importSubjectIndex: 0,
    importSubjectList: []
  },

  onLoad: function () {
    this.setData({
      role: app.globalData.role || '',
      classId: app.globalData.class_id || '',
      studentId: app.globalData.student_id || ''
    });
    this.initPage();
  },

  onShow: function () {
    // 每次显示时刷新角色和班级信息
    const newRole = app.globalData.role || '';
    const newClassId = app.globalData.class_id || '';
    if (newRole !== this.data.role || newClassId !== this.data.classId) {
      this.setData({
        role: newRole,
        classId: newClassId,
        studentId: app.globalData.student_id || ''
      });
      this.initPage();
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadGrades().then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 初始化页面
  initPage: function () {
    this.generateTermList();
    this.loadGrades();
  },

  // 生成学期列表（当前往前推4个学期）
  generateTermList: function () {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const termList = [];

    // 当前学期判断：1-6月为上一年秋季，7-12月为当年春季
    let startYear = currentMonth <= 6 ? currentYear - 1 : currentYear;
    let startTerm = currentMonth <= 6 ? '秋季' : '春季';

    // 生成4个学期
    for (let i = 0; i < 4; i++) {
      const label = `${startYear}${startTerm}`;
      termList.push(label);
      if (startTerm === '秋季') {
        startTerm = '春季';
      } else {
        startTerm = '秋季';
        startYear = startYear + 1;
      }
    }

    // 默认选择当前学期（第一个）
    this.setData({
      termList: termList,
      termIndex: 0,
      currentTerm: termList[0]
    });
  },

  // 切换考试类型
  switchExamType: function (e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.currentExamType) return;

    this.setData({
      currentExamType: type,
      loading: true
    });
    this.loadGrades();
  },

  // 学期选择变更
  onTermChange: function (e) {
    const index = e.detail.value;
    this.setData({
      termIndex: index,
      currentTerm: this.data.termList[index],
      loading: true
    });
    this.loadGrades();
  },

  // 科目选择变更
  onSubjectChange: function (e) {
    const index = e.detail.value;
    const subject = this.data.subjectList[index] === '全部' ? '' : this.data.subjectList[index];
    this.setData({
      subjectIndex: index,
      currentSubject: subject,
      loading: true
    });
    this.loadGrades();
  },

  // 加载成绩数据
  loadGrades: async function () {
    const { classId, currentTerm, currentExamType, currentSubject, role, studentId } = this.data;

    if (!classId || !currentTerm || !currentExamType) {
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });

    try {
      // 并行请求：成绩列表 + 统计数据
      const params = {
        class_id: classId,
        term: currentTerm,
        exam_type: currentExamType,
        subject: currentSubject,
        role: role,
        student_id: studentId
      };

      const listRes = await wx.cloud.callFunction({
        name: 'gradeManager',
        data: {
          action: 'getList',
          data: params
        }
      });

      const result = listRes.result || {};
      if (!result.success) {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const grades = result.data.grades || [];
      const studentList = result.data.studentList || [];

      // 提取所有科目
      const subjectSet = new Set();
      grades.forEach(g => {
        if (g.subject) subjectSet.add(g.subject);
      });
      const allSubjects = Array.from(subjectSet);

      // 更新科目选择器（合并"全部"选项）
      const subjectList = ['全部', ...allSubjects];
      // 保持当前科目选择不变（如果科目还在列表中）
      let subjectIndex = 0;
      if (currentSubject) {
        const idx = subjectList.indexOf(currentSubject);
        if (idx >= 0) subjectIndex = idx;
      }

      // 学生/家长：提取个人成绩
      let myGrades = [];
      if (role === 'student' || role === 'parent') {
        myGrades = grades.map(g => ({
          _id: g._id,
          subject: g.subject,
          score: g.score,
          is_pass: g.is_pass,
          rank_class: g.rank_class
        }));
      }

      this.setData({
        loading: false,
        allSubjects: allSubjects,
        subjectList: subjectList,
        subjectIndex: subjectIndex,
        studentList: studentList,
        myGrades: myGrades
      });

      // 班主任/管理员：加载统计数据
      if (role === 'head_teacher' || role === 'admin') {
        this.loadStats();
      }
    } catch (err) {
      console.error('加载成绩失败:', err);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 加载统计数据
  loadStats: async function () {
    const { classId, currentTerm, currentExamType, currentSubject } = this.data;

    try {
      const statsRes = await wx.cloud.callFunction({
        name: 'gradeManager',
        data: {
          action: 'getStats',
          data: {
            class_id: classId,
            term: currentTerm,
            exam_type: currentExamType,
            subject: currentSubject
          }
        }
      });

      const result = statsRes.result || {};
      if (result.success) {
        this.setData({ stats: result.data });
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 获取某学生某科目的分数（用于表格展示）
  getSubjectScore: function (student, subject) {
    if (!student || !student.subjects) return '';
    const found = student.subjects.find(s => s.subject === subject);
    return found ? found.score : '';
  },

  // 点击学生行跳转详情
  goToStudentDetail: function (e) {
    const studentId = e.currentTarget.dataset.id;
    if (studentId) {
      wx.navigateTo({
        url: `/subPages/student/detail/detail?id=${studentId}`
      });
    }
  },

  // 打开批量导入弹窗
  onImportExcel: function () {
    // 获取当前科目列表用于录入选择
    const importSubjectList = this.data.allSubjects.length > 0
      ? [...this.data.allSubjects]
      : ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];

    this.setData({
      showImportModal: true,
      importText: '',
      importing: false,
      importSubjectList: importSubjectList,
      importSubject: importSubjectList[0],
      importSubjectIndex: 0
    });
  },

  // 导入科目选择变更
  onImportSubjectChange: function (e) {
    const index = e.detail.value;
    this.setData({
      importSubjectIndex: index,
      importSubject: this.data.importSubjectList[index]
    });
  },

  // 导入文本输入
  onImportInput: function (e) {
    this.setData({ importText: e.detail.value });
  },

  // 关闭导入弹窗
  closeImportModal: function () {
    this.setData({ showImportModal: false });
  },

  // 执行批量导入
  doImport: async function () {
    const { importText, importSubject, classId, currentTerm, currentExamType } = this.data;

    if (!importText.trim()) {
      wx.showToast({ title: '请输入成绩数据', icon: 'none' });
      return;
    }

    if (!importSubject) {
      wx.showToast({ title: '请选择科目', icon: 'none' });
      return;
    }

    // 解析文本：支持以下格式
    // 格式1：每行 "学号 分数" 或 "姓名 分数"
    // 格式2：每行 "学号,分数" 或 "姓名,分数"
    const lines = importText.trim().split('\n');
    const grades = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 尝试多种分隔符
      let parts = null;
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else if (line.includes(',')) {
        parts = line.split(',');
      } else if (line.includes('，')) {
        parts = line.split('，');
      } else {
        parts = line.split(/\s+/);
      }

      if (parts.length < 2) {
        errors.push(`第${i + 1}行格式错误: "${line}"`);
        continue;
      }

      const studentId = parts[0].trim();
      const score = parseFloat(parts[1].trim());

      if (!studentId || isNaN(score)) {
        errors.push(`第${i + 1}行数据无效: "${line}"`);
        continue;
      }

      grades.push({
        student_id: studentId,
        subject: importSubject,
        score: score
      });
    }

    if (grades.length === 0) {
      wx.showToast({
        title: '无有效数据，请检查格式',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    this.setData({ importing: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'gradeManager',
        data: {
          action: 'batchInput',
          data: {
            grades: grades,
            class_id: classId,
            term: currentTerm,
            exam_type: currentExamType
          }
        }
      });

      const result = res.result || {};

      if (result.success) {
        const { successCount, failCount } = result.data;
        let msg = `成功录入 ${successCount} 条`;
        if (failCount > 0) {
          msg += `，失败 ${failCount} 条`;
        }
        if (errors.length > 0) {
          msg += `\n解析错误 ${errors.length} 行`;
        }

        wx.showModal({
          title: '导入结果',
          content: msg,
          showCancel: false,
          success: () => {
            this.setData({ showImportModal: false });
            this.loadGrades();
          }
        });
      } else {
        wx.showToast({
          title: result.message || '导入失败',
          icon: 'none',
          duration: 2000
        });
      }
    } catch (err) {
      console.error('批量导入失败:', err);
      wx.showToast({
        title: '导入失败，请重试',
        icon: 'none',
        duration: 2000
      });
    } finally {
      this.setData({ importing: false });
    }
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '成绩管理中心',
      path: '/subPages/grade/grade'
    };
  }
});
