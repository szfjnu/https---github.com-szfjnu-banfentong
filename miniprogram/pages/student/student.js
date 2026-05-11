// pages/student/student.js
const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    students: [],
    searchKeyword: '',
    loading: true,
    showAddButton: false,
    showClassNav: true,
    page: 0,
    pageSize: 20,
    hasMore: true,
    // 筛选选项
    classOptions: [
      { value: '', label: '全部班级' }
    ],
    boardingOptions: [
      { value: '', label: '全部' },
      { value: 'true', label: '住宿生' },
      { value: 'false', label: '非住宿' }
    ],
    positionOptions: [
      { value: '', label: '全部' },
      { value: '班长', label: '班长' },
      { value: '班主任助理', label: '班主任助理' },
      { value: '学习委员', label: '学习委员' },
      { value: '团支部书记', label: '团支书' },
      { value: '卫生委员', label: '卫生委员' },
      { value: '体育委员', label: '体育委员' },
      { value: '生活委员', label: '生活委员' },
      { value: '心理委员', label: '心理委员' },
      { value: '电教管理员', label: '电教管理员' },
      { value: '安全委员', label: '安全委员' },
      { value: '组织委员', label: '组织委员' },
      { value: '积分委员', label: '积分委员' },
      { value: '课代表', label: '课代表' },
      { value: '班干部', label: '无' }
    ],
    // 当前筛选值
    selectedClass: '',
    selectedClassLabel: '全部班级',
    selectedBoarding: '',
    selectedBoardingLabel: '住宿状态',
    selectedPosition: '',
    selectedPositionLabel: '班干部'
  },

  onLoad: function () {
    this.checkPermission();
    this.loadClasses();
    this.loadStudents();
  },

  onShow: function () {
    this.loadStudents();
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    const canWrite = app.hasPermission('student', 'write');
    this.setData({
      showAddButton: canWrite || role === 'admin' || role === 'head_teacher',
      showClassNav: role === 'admin' || role === 'head_teacher' || role === 'teacher'
    });
  },

  // 班级功能导航
  onNavAttendance: function () {
    wx.navigateTo({ url: '/subPages/attendance/attendance' });
  },
  onNavDuty: function () {
    wx.navigateTo({ url: '/subPages/duty/duty' });
  },
  onNavDorm: function () {
    wx.navigateTo({ url: '/subPages/dorm/dorm' });
  },
  onNavDiscipline: function () {
    wx.navigateTo({ url: '/subPages/discipline/record/record' });
  },
  onNavGroup: function () {
    wx.navigateTo({ url: '/subPages/group/group' });
  },

  // 加载班级列表
  loadClasses: async function () {
    try {
      const res = await api.classApi.getClasses();
      const classOptions = [
        { value: '', label: '全部班级' },
        ...res.data.map(item => ({
          value: item.class_name,
          label: item.class_name
        }))
      ];
      this.setData({ classOptions });
    } catch (err) {
      console.error('加载班级列表失败:', err);
    }
  },

  // 加载学生列表
  loadStudents: async function (refresh = true) {
    if (refresh) {
      this.setData({ loading: true, page: 0, hasMore: true });
    }

    try {
      const { page, pageSize, searchKeyword, selectedClass, selectedBoarding, selectedPosition } = this.data;
      const skip = refresh ? 0 : page * pageSize;
      const role = app.globalData.role;
      const studentId = app.globalData.student_id;

      // 家长/学生端：仅展示本人或本人子女的信息，不走API批量查询
      if ((role === 'student' || role === 'parent') && studentId) {
        await this.loadOwnStudentInfo(studentId);
        return;
      }

      // 1. 优先获取当前用户的班级ID
      let targetClassId = app.globalData.class_id; 
      console.log('当前班级ID (targetClassId):', targetClassId);      
      
      if (role !== 'admin' && !targetClassId) {
         this.setData({ students: [], loading: false });
         return;
      }

      // 3. 准备查询参数
      let queryParam = {
        limit: pageSize,
        skip: skip,
        search: searchKeyword,
        class_id: targetClassId 
      };

      console.log('传给 API 的参数:', queryParam);
      const res = await api.studentApi.getStudents(queryParam);
      console.log('API 返回的数据数量:', res.data.length);

      let students = res.data;

      // 前端筛选住宿状态
      if (selectedBoarding !== '') {
        const isBoarding = selectedBoarding === 'true';
        students = students.filter(s => s.is_boarding === isBoarding);
      }

      // 前端筛选班干部
      if (selectedPosition !== '') {
        students = students.filter(s => s.position === selectedPosition);
      }

      // 处理学生数据
      students = students.map(student => ({
        ...student,
        scoreLevel: util.getScoreLevel(student.current_score || 100),
        scoreColor: util.getScoreColor(student.current_score || 100)
      }));

      this.setData({
        students: refresh ? students : [...this.data.students, ...students],
        loading: false,
        hasMore: students.length === pageSize,
        page: refresh ? 0 : page + 1
      });
    } catch (err) {
      console.error('加载学生列表失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 家长/学生端：仅加载本人/子女信息
  loadOwnStudentInfo: async function (studentId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({ student_id: studentId })
        .limit(1)
        .get();

      let students = (res.data || []).map(student => ({
        ...student,
        name: student.name || student.student_name || '',
        scoreLevel: util.getScoreLevel(student.current_score || 100),
        scoreColor: util.getScoreColor(student.current_score || 100)
      }));

      this.setData({
        students,
        loading: false,
        hasMore: false
      });
    } catch (err) {
      console.error('加载本人信息失败:', err);
      this.setData({ students: [], loading: false });
    }
  },

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  // 搜索确认
  onSearch: function () {
    this.loadStudents(true);
  },

  // 清除搜索
  onClearSearch: function () {
    this.setData({ searchKeyword: '' });
    this.loadStudents(true);
  },

  // 班级筛选
  onClassChange: function (e) {
    const index = e.detail.value;
    const selectedClass = this.data.classOptions[index];
    this.setData({
      selectedClass: selectedClass.value,
      selectedClassLabel: selectedClass.label
    });
    this.loadStudents(true);
  },

  // 住宿状态筛选
  onBoardingChange: function (e) {
    const index = e.detail.value;
    const selectedBoarding = this.data.boardingOptions[index];
    this.setData({
      selectedBoarding: selectedBoarding.value,
      selectedBoardingLabel: selectedBoarding.label
    });
    this.loadStudents(true);
  },

  // 班干部筛选
  onPositionChange: function (e) {
    const index = e.detail.value;
    const selectedPosition = this.data.positionOptions[index];
    this.setData({
      selectedPosition: selectedPosition.value,
      selectedPositionLabel: selectedPosition.label
    });
    this.loadStudents(true);
  },

  // 查看详情
  onViewDetail: function (e) {
    const studentId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/student/detail/detail?id=${studentId}`
    });
  },

  // 长按学生卡片 - 显示操作菜单
  onLongPressStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const studentName = e.currentTarget.dataset.name;

    // 检查权限
    if (!this.data.showAddButton) {
      wx.showToast({
        title: '无操作权限',
        icon: 'none'
      });
      return;
    }

    wx.showActionSheet({
      itemList: ['编辑学生信息', '删除学生'],
      itemColor: ['#1890ff', '#ff4d4f'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 编辑
          this.onEditStudent({ currentTarget: { dataset: { id: studentId } } });
        } else if (res.tapIndex === 1) {
          // 删除
          this.onDeleteStudent({ currentTarget: { dataset: { id: studentId, name: studentName } } });
        }
      }
    });
  },

  // 编辑学生
  onEditStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/student/add/add?id=${studentId}`
    });
  },

  // 删除学生
  onDeleteStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const studentName = e.currentTarget.dataset.name;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除学生"${studentName}"吗？此操作不可恢复。`,
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...', mask: true });
            
            // 获取学生记录的 _id
            const studentRes = await api.studentApi.getStudentByStudentId(studentId);
            if (studentRes.data && studentRes.data.length > 0) {
              await api.studentApi.deleteStudent(studentRes.data[0]._id);
              util.showSuccess('删除成功');
              this.loadStudents(true);
            } else {
              util.showError('未找到学生记录');
            }
            
            wx.hideLoading();
          } catch (err) {
            console.error('删除学生失败:', err);
            wx.hideLoading();
            util.showError('删除失败');
          }
        }
      }
    });
  },

  // 添加学生
  onAddStudent: function () {
    wx.navigateTo({
      url: '/subPages/student/add/add'
    });
  },

  // 批量导入学生
  onImportStudents: function () {
    wx.navigateTo({
      url: '/subPages/student/import/import'
    });
  },

  // 积分重置
  onResetScores: function () {
    const role = app.globalData.role;
    const classId = app.globalData.class_id;
    const semesterId = app.globalData.currentSemesterId;
    
    // 权限检查
    if (role !== 'admin' && role !== 'head_teacher') {
      wx.showToast({
        title: '无权限操作',
        icon: 'none'
      });
      return;
    }
    
    wx.showModal({
      title: '积分重置',
      content: '确定要将当前班级所有学生的积分重置为100分吗？此操作不可撤销！',
      confirmText: '确认重置',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          this.doResetScores(classId, semesterId);
        }
      }
    });
  },

  // 执行积分重置
  doResetScores: async function (classId, semesterId) {
    wx.showLoading({ title: '重置中...', mask: true });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'resetStudentScore',
        data: {
          classId: classId,
          initialScore: 100,
          semesterId: semesterId
        }
      });
      
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        wx.showModal({
          title: '重置成功',
          content: `已重置 ${res.result.data.count} 名学生的积分为 ${res.result.data.initialScore} 分`,
          showCancel: false,
          success: () => {
            // 刷新学生列表
            this.loadStudents();
          }
        });
      } else {
        util.showError(res.result?.message || '重置失败');
      }
      
    } catch (err) {
      console.error('积分重置失败:', err);
      wx.hideLoading();
      util.showError('重置失败');
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadStudents(true);
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadStudents(false);
    }
  }
});
