// pages/semester/semester.js
const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    allSemesters: [],
    semesterCount: 0,
    currentSemesterName: '',
    loading: true,
    classId: '',
    // 新建弹窗
    showAddModal: false,
    formData: {
      name: '',
      start_date: '',
      end_date: '',
      initial_score: 100,
      dorm_initial_score: 100,
      dorm_conversion_ratio: 0.3,
      dorm_conversion_ratio_percent: 30,
      dorm_warning_threshold: 60,
      dorm_critical_threshold: 40,
      description: ''
    },
    // 编辑弹窗
    showEditModal: false,
    editFormData: {
      _id: '',
      name: '',
      start_date: '',
      end_date: '',
      initial_score: 100,
      dorm_initial_score: 100,
      dorm_conversion_ratio: 0.3,
      dorm_conversion_ratio_percent: 30,
      dorm_warning_threshold: 60,
      dorm_critical_threshold: 40,
      description: ''
    }
  },

  onLoad: function () {
    this.setData({ classId: app.globalData.class_id || '' });
    this.loadData();
  },

  onShow: function () {
    this.loadData();
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadData();
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      const { classId } = this.data;
      const res = await api.semesterApi.getSemesters(classId);
      const now = new Date();
      const today = util.formatDate(now);

      // 处理学期数据 - 统一字段名映射
      let allSemesters = res.data.map(item => {
        const startDate = new Date(item.start_date);
        const endDate = new Date(item.end_date);
        const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const isEnded = today > util.formatDate(endDate);

        // 字段映射：统一使用 name 和 status
        return {
          ...item,
          _id: item._id,
          name: item.semester_name || item.name, // 兼容两种字段名
          status: item.is_current ? 'active' : (item.status || 'inactive'), // 使用 is_current 判断
          start_date: util.formatDate(startDate),
          end_date: util.formatDate(endDate),
          days: days > 0 ? days : 0,
          isEnded: isEnded,
          initial_score: item.initial_score || 100,
          dorm_initial_score: item.dorm_initial_score || 100,
          dorm_conversion_ratio: item.dorm_conversion_ratio || 0.3,
          dorm_conversion_ratio_percent: Math.round((item.dorm_conversion_ratio || 0.3) * 100),
          dorm_warning_threshold: item.dorm_warning_threshold || 60,
          dorm_critical_threshold: item.dorm_critical_threshold || 40,
          description: item.description || '',
          created_at_text: item.created_at ? util.formatDateTime(new Date(item.created_at)) : ''
        };
      });

      // 检查数据一致性：确保只有一个当前学期
      const activeSemesters = allSemesters.filter(s => s.status === 'active');
      if (activeSemesters.length > 1) {
        // 按开始日期降序排列，保留最新的为当前学期
        const sortedActive = activeSemesters.sort((a, b) => 
          new Date(b.start_date) - new Date(a.start_date)
        );
        const keepActiveId = sortedActive[0]._id;

        // 更新数据库和本地数据
        for (const semester of activeSemesters) {
          if (semester._id !== keepActiveId) {
            // 异步更新数据库（同时更新 is_current 和 status）
            api.semesterApi.updateSemester(semester._id, { 
              is_current: false,
              status: 'inactive' 
            }).catch(err => {
              console.error('更新学期状态失败:', err);
            });
            // 更新本地数据
            const index = allSemesters.findIndex(s => s._id === semester._id);
            if (index !== -1) {
              allSemesters[index].status = 'inactive';
            }
          }
        }
      }

      // 找到当前学期
      const currentSemester = allSemesters.find(s => s.status === 'active');

      // 按开始日期降序排列
      allSemesters.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

      this.setData({
        allSemesters: allSemesters,
        semesterCount: allSemesters.length,
        currentSemesterName: currentSemester ? currentSemester.name : '未设置',
        loading: false
      });

      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
      util.showError('加载失败');
    }
  },

  // ==================== 新建学期 ====================

  // 打开新建弹窗
  onAddSemester: function () {
    this.setData({
      showAddModal: true,
      formData: {
        name: '',
        start_date: '',
        end_date: '',
        initial_score: 100,
        dorm_initial_score: 100,
        dorm_conversion_ratio: 0.3,
        dorm_conversion_ratio_percent: 30,
        dorm_warning_threshold: 60,
        dorm_critical_threshold: 40,
        description: ''
      }
    });
  },

  // 关闭新建弹窗
  onCloseModal: function () {
    this.setData({ showAddModal: false });
  },

  // 表单输入
  onFormInput: function (e) {
    const field = e.currentTarget.dataset.field;
    let value = e.detail.value;

    // 数字字段处理
    if (['initial_score', 'dorm_initial_score', 'dorm_warning_threshold', 'dorm_critical_threshold'].includes(field)) {
      value = value ? parseInt(value) : '';
    }

    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 日期选择
  onDateChange: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`formData.${field}`]: e.detail.value
    });
  },

  // 滑块变化
  onSliderChange: function (e) {
    const percent = e.detail.value;
    this.setData({
      'formData.dorm_conversion_ratio_percent': percent,
      'formData.dorm_conversion_ratio': percent / 100
    });
  },

  // 确认新建
  onConfirmAdd: async function () {
    const { formData, allSemesters } = this.data;

    // 表单验证
    if (!formData.name || !formData.name.trim()) {
      return util.showError('请输入学期名称');
    }
    if (!formData.start_date) {
      return util.showError('请选择开始日期');
    }
    if (!formData.end_date) {
      return util.showError('请选择结束日期');
    }

    // 日期验证：结束日期必须晚于开始日期
    if (new Date(formData.end_date) <= new Date(formData.start_date)) {
      return util.showError('结束日期必须晚于开始日期');
    }

    // 检查时间重叠
    const hasOverlap = this.checkDateOverlap(formData.start_date, formData.end_date, null);
    if (hasOverlap) {
      return util.showError('学期时间与已有学期重叠，请调整日期');
    }

    try {
      wx.showLoading({ title: '创建中...', mask: true });

      // 如果这是第一个学期，设为当前学期
      const isFirstSemester = allSemesters.length === 0;

      await api.semesterApi.addSemester({
        semester_name: formData.name.trim(),
        start_date: new Date(formData.start_date),
        end_date: new Date(formData.end_date),
        status: isFirstSemester ? 'active' : 'pending',
        is_current: isFirstSemester,
        description: formData.description || '',
        initial_score: formData.initial_score || 100,
        dorm_initial_score: formData.dorm_initial_score || 100,
        dorm_conversion_ratio: formData.dorm_conversion_ratio || 0.3,
        dorm_warning_threshold: formData.dorm_warning_threshold || 60,
        dorm_critical_threshold: formData.dorm_critical_threshold || 40,
        is_initialized: false,
        class_id: this.data.classId
      });

      wx.hideLoading();
      this.setData({ showAddModal: false });

      // 立即更新本地数据
      if (isFirstSemester) {
        this.setData({
          semesterCount: 1,
          currentSemesterName: formData.name.trim()
        });
      } else {
        this.setData({
          semesterCount: allSemesters.length + 1
        });
      }

      util.showSuccess('创建成功');

      // 稍后从服务器刷新数据
      setTimeout(() => {
        this.loadData();
      }, 500);
    } catch (err) {
      wx.hideLoading();
      console.error('创建学期失败:', err);
      util.showError('创建失败');
    }
  },

  // ==================== 编辑学期 ====================

  // 打开编辑弹窗
  onEditSemester: function (e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showEditModal: true,
      editFormData: {
        _id: item._id,
        name: item.name,
        start_date: item.start_date,
        end_date: item.end_date,
        initial_score: item.initial_score || 100,
        dorm_initial_score: item.dorm_initial_score || 100,
        dorm_conversion_ratio: item.dorm_conversion_ratio || 0.3,
        dorm_conversion_ratio_percent: Math.round((item.dorm_conversion_ratio || 0.3) * 100),
        dorm_warning_threshold: item.dorm_warning_threshold || 60,
        dorm_critical_threshold: item.dorm_critical_threshold || 40,
        description: item.description || '',
        status: item.status
      }
    });
  },

  // 关闭编辑弹窗
  onCloseEditModal: function () {
    this.setData({ showEditModal: false });
  },

  // 编辑表单输入
  onEditFormInput: function (e) {
    const field = e.currentTarget.dataset.field;
    let value = e.detail.value;

    if (['initial_score', 'dorm_initial_score', 'dorm_warning_threshold', 'dorm_critical_threshold'].includes(field)) {
      value = value ? parseInt(value) : '';
    }

    this.setData({
      [`editFormData.${field}`]: value
    });
  },

  // 编辑日期选择
  onEditDateChange: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`editFormData.${field}`]: e.detail.value
    });
  },

  // 编辑滑块变化
  onEditSliderChange: function (e) {
    const percent = e.detail.value;
    this.setData({
      'editFormData.dorm_conversion_ratio_percent': percent,
      'editFormData.dorm_conversion_ratio': percent / 100
    });
  },

  // 确认编辑
  onConfirmEdit: async function () {
    const { editFormData, allSemesters } = this.data;

    // 表单验证
    if (!editFormData.name || !editFormData.name.trim()) {
      return util.showError('请输入学期名称');
    }
    if (!editFormData.start_date) {
      return util.showError('请选择开始日期');
    }
    if (!editFormData.end_date) {
      return util.showError('请选择结束日期');
    }

    // 日期验证
    if (new Date(editFormData.end_date) <= new Date(editFormData.start_date)) {
      return util.showError('结束日期必须晚于开始日期');
    }

    // 检查时间重叠（排除自身）
    const hasOverlap = this.checkDateOverlap(editFormData.start_date, editFormData.end_date, editFormData._id);
    if (hasOverlap) {
      return util.showError('学期时间与已有学期重叠，请调整日期');
    }

    try {
      wx.showLoading({ title: '保存中...', mask: true });

      const res = await api.semesterApi.updateSemester(editFormData._id, {
        semester_name: editFormData.name.trim(),
        start_date: new Date(editFormData.start_date),
        end_date: new Date(editFormData.end_date),
        initial_score: editFormData.initial_score || 100,
        dorm_initial_score: editFormData.dorm_initial_score || 100,
        dorm_conversion_ratio: editFormData.dorm_conversion_ratio || 0.3,
        dorm_warning_threshold: editFormData.dorm_warning_threshold || 60,
        dorm_critical_threshold: editFormData.dorm_critical_threshold || 40,
        description: editFormData.description || '',
        class_id: this.data.classId
      });

      wx.hideLoading();

      if (res && res.success) {
        this.setData({ showEditModal: false });
        util.showSuccess('保存成功');
        this.loadData();
      } else {
        util.showError((res && res.message) || '保存失败');
      }
    } catch (err) {
      wx.hideLoading();
      console.error('保存学期失败:', err);
      util.showError('保存失败');
    }
  },

  // ==================== 其他操作 ====================

  // 设为当前学期
  onSetCurrent: async function (e) {
    const semesterId = e.currentTarget.dataset.id;
    const semester = this.data.allSemesters.find(s => s._id === semesterId);

    wx.showModal({
      title: '设置当前学期',
      content: `确定要将"${semester.name}"设为当前学期吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '设置中...', mask: true });

            const { classId } = this.data;
            await api.semesterApi.setCurrentSemester(semesterId, classId);

            wx.hideLoading();

            const updatedSemesters = this.data.allSemesters.map(s => ({
              ...s,
              status: s._id === semesterId ? 'active' : 'inactive'
            }));
            this.setData({
              allSemesters: updatedSemesters,
              currentSemesterName: semester.name
            });

            util.showSuccess('设置成功');

            setTimeout(() => {
              this.loadData();
            }, 500);
          } catch (err) {
            wx.hideLoading();
            console.error('设置当前学期失败:', err);
            util.showError('设置失败');
          }
        }
      }
    });
  },

  // 删除学期
  onDeleteSemester: function (e) {
    const semesterId = e.currentTarget.dataset.id;
    const semesterName = e.currentTarget.dataset.name;
    const semesterStatus = e.currentTarget.dataset.status;

    // 不能删除当前学期
    if (semesterStatus === 'active') {
      return wx.showModal({
        title: '无法删除',
        content: '当前学期不能删除，请先设置其他学期为当前学期后再删除',
        showCancel: false,
        confirmText: '我知道了'
      });
    }

    wx.showModal({
      title: '确认删除',
      content: `确定要删除学期"${semesterName}"吗？删除后数据无法恢复。`,
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });
            const result = await api.semesterApi.deleteSemester(semesterId);
            wx.hideLoading();
            if (result && result.success) {
              util.showSuccess('删除成功');
              this.loadData();
            } else {
              util.showError((result && result.message) || '删除失败');
            }
          } catch (err) {
            wx.hideLoading();
            console.error('删除学期失败:', err);
            util.showError('删除失败');
          }
        }
      }
    });
  },

  // 查看详情
  onViewDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    const semester = this.data.allSemesters.find(s => s._id === id);
    if (semester) {
      this.onEditSemester({ currentTarget: { dataset: { item: semester } } });
    }
  },

  // 初始化班级学期配置
  onInitClassSemester: async function () {
    const { classId } = this.data;
    if (!classId) {
      util.showError('请先选择班级');
      return;
    }

    wx.showModal({
      title: '初始化学期配置',
      content: '将为当前班级创建默认学期配置，已有活跃学期则跳过。确定继续？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '初始化中...', mask: true });
            const result = await api.semesterApi.initClassSemester(classId);
            wx.hideLoading();

            if (result.success) {
              util.showSuccess(result.message || '初始化成功');
              this.loadData();
            } else {
              util.showError(result.message || '初始化失败');
            }
          } catch (err) {
            wx.hideLoading();
            console.error('初始化学期失败:', err);
            util.showError('初始化失败');
          }
        }
      }
    });
  },

  // ==================== 工具方法 ====================

  /**
   * 检查日期是否与已有学期重叠
   * @param {string} startDate - 开始日期
   * @param {string} endDate - 结束日期
   * @param {string|null} excludeId - 排除的学期ID（编辑时排除自身）
   * @returns {boolean} - 是否重叠
   */
  checkDateOverlap: function (startDate, endDate, excludeId) {
    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);

    for (const semester of this.data.allSemesters) {
      // 排除自身
      if (excludeId && semester._id === excludeId) {
        continue;
      }

      const existStart = new Date(semester.start_date);
      const existEnd = new Date(semester.end_date);

      // 检查是否重叠：新学期的开始日期在已有学期范围内，或新学期的结束日期在已有学期范围内
      if ((newStart >= existStart && newStart <= existEnd) ||
          (newEnd >= existStart && newEnd <= existEnd) ||
          (newStart <= existStart && newEnd >= existEnd)) {
        return true;
      }
    }

    return false;
  }
});
