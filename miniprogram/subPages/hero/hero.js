// pages/hero/hero.js
// 英雄台 - 荣誉展示与榜样墙
const app = getApp();

Page({
  data: {
    loading: true,
    role: '',
    classId: '',
    isAdmin: false,

    // 荣誉列表
    honors: [],
    cheerMap: {},
    page: 0,
    pageSize: 20,
    hasMore: true,
    currentType: '',

    // 统计数据
    stats: null,

    // 荣誉类型选项
    typeOptions: [
      { value: 'academic', label: '🏆 学业之星' },
      { value: 'behavior', label: '⭐ 行为模范' },
      { value: 'volunteer', label: '💖 志愿先锋' },
      { value: 'progress', label: '🚀 进步达人' },
      { value: 'special', label: '👑 特殊荣誉' }
    ],
    typeIndex: 0,

    // 颁发荣誉弹窗
    showAwardModal: false,
    awarding: false,
    awardTitle: '',
    awardType: 'academic',
    awardDesc: '',
    awardPeriod: '',
    awardIcon: 'trophy',
    selectedStudents: [],
    templates: [],
    templateTitles: [],
    templateIndex: 0,

    // 学生选择弹窗
    showStudentPicker: false,
    allStudents: [],
    filteredStudents: [],
    searchKeyword: '',
    tempSelectedStudents: [],

    // 管理操作弹窗
    showAdminModal: false,
    adminHonorId: '',
    adminPostPinned: false
  },

  onLoad: function () {
    this.setData({
      role: app.globalData.role || '',
      classId: app.globalData.class_id || '',
      isAdmin: app.globalData.role === 'head_teacher' || app.globalData.role === 'admin'
    });
    this.loadStats();
    this.loadHonors();
    if (this.data.isAdmin) {
      this.loadTemplates();
      this.loadStudents();
    }
  },

  onShow: function () {
    const newRole = app.globalData.role || '';
    const newClassId = app.globalData.class_id || '';
    if (newRole !== this.data.role || newClassId !== this.data.classId) {
      this.setData({
        role: newRole,
        classId: newClassId,
        isAdmin: newRole === 'head_teacher' || newRole === 'admin'
      });
      this.refreshHonors();
    }
  },

  onPullDownRefresh: function () {
    this.refreshHonors().then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 刷新
  refreshHonors: async function () {
    this.setData({ page: 0, hasMore: true, honors: [] });
    await Promise.all([this.loadStats(), this.loadHonors()]);
  },

  // 加载统计数据
  loadStats: async function () {
    const { classId } = this.data;
    if (!classId) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'heroManager',
        data: {
          action: 'getHonorStats',
          data: { class_id: classId }
        }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ stats: result.data });
      }
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 加载荣誉列表
  loadHonors: async function () {
    const { classId, page, pageSize, currentType } = this.data;
    if (!classId) {
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'heroManager',
        data: {
          action: 'getHonorWall',
          data: {
            class_id: classId,
            honor_type: currentType || '',
            page: page,
            pageSize: pageSize
          }
        }
      });

      const result = res.result || {};
      if (!result.success) {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const newHonors = result.data.honors || [];
      const cheerMap = result.data.cheerMap || {};
      const mergedCheerMap = { ...this.data.cheerMap, ...cheerMap };

      this.setData({
        honors: page === 0 ? newHonors : [...this.data.honors, ...newHonors],
        cheerMap: mergedCheerMap,
        hasMore: result.data.hasMore || false,
        loading: false
      });
    } catch (err) {
      console.error('加载荣誉失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 切换类型
  switchType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      currentType: type,
      page: 0,
      hasMore: true,
      honors: []
    });
    this.loadHonors();
  },

  // 加载更多
  loadMore: function () {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 });
    this.loadHonors();
  },

  // 喝彩切换
  onToggleCheer: async function (e) {
    const honorId = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;

    try {
      const res = await wx.cloud.callFunction({
        name: 'heroManager',
        data: {
          action: 'toggleCheer',
          data: { honor_id: honorId, class_id: this.data.classId }
        }
      });

      const result = res.result || {};
      if (result.success) {
        const hasCheered = result.data.hasCheered;
        const honors = [...this.data.honors];
        honors[index] = { ...honors[index] };
        honors[index].cheers_count = (honors[index].cheers_count || 0) + (hasCheered ? 1 : -1);

        const cheerMap = { ...this.data.cheerMap };
        if (hasCheered) {
          cheerMap[honorId] = true;
        } else {
          delete cheerMap[honorId];
        }

        this.setData({ honors, cheerMap });
      }
    } catch (err) {
      console.error('喝彩失败:', err);
    }
  },

  // ===== 模板加载 =====

  loadTemplates: async function () {
    const { classId } = this.data;
    try {
      const res = await wx.cloud.callFunction({
        name: 'heroManager',
        data: {
          action: 'getTemplates',
          data: { class_id: classId }
        }
      });
      const result = res.result || {};
      if (result.success) {
        const templates = result.data.templates || [];
        const titles = templates.map(t => t.title);
        this.setData({
          templates: templates,
          templateTitles: titles,
          templateIndex: 0
        });
      }
    } catch (err) {
      console.error('加载模板失败:', err);
    }
  },

  // ===== 学生列表 =====

  loadStudents: async function () {
    const { classId } = this.data;
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageAuthorization',
        data: { action: 'getStudents', data: { class_id: classId } }
      });

      const students = ((res.result && res.result.success ? res.result.data : []) || []).map(s => ({
        student_id: s.student_id,
        student_name: s.name || s.student_name || ''
      }));

      this.setData({
        allStudents: students,
        filteredStudents: students
      });
    } catch (err) {
      console.error('加载学生列表失败:', err);
    }
  },

  // ===== 颁发荣誉 =====

  openAwardModal: function () {
    this.setData({
      showAwardModal: true,
      awardTitle: '',
      awardType: 'academic',
      awardDesc: '',
      awardPeriod: '',
      awardIcon: 'trophy',
      selectedStudents: [],
      typeIndex: 0,
      templateIndex: 0
    });
  },

  closeAwardModal: function () {
    this.setData({ showAwardModal: false });
  },

  preventBubble: function () {},

  onTemplateChange: function (e) {
    const index = e.detail.value;
    const template = this.data.templates[index];
    if (template) {
      this.setData({
        templateIndex: index,
        awardTitle: template.title,
        awardType: template.honor_type,
        awardDesc: template.description || '',
        awardIcon: template.icon || 'medal',
        typeIndex: this.data.typeOptions.findIndex(t => t.value === template.honor_type)
      });
    }
  },

  onAwardTitleInput: function (e) {
    this.setData({ awardTitle: e.detail.value });
  },

  onTypeChange: function (e) {
    const index = e.detail.value;
    const type = this.data.typeOptions[index];
    const iconMap = {
      academic: 'trophy', behavior: 'star',
      volunteer: 'heart', progress: 'rocket', special: 'crown'
    };
    this.setData({
      typeIndex: index,
      awardType: type.value,
      awardIcon: iconMap[type.value] || 'medal'
    });
  },

  onAwardDescInput: function (e) {
    this.setData({ awardDesc: e.detail.value });
  },

  onPeriodInput: function (e) {
    this.setData({ awardPeriod: e.detail.value });
  },

  // 学生选择器
  openStudentPicker: function () {
    this.setData({
      showStudentPicker: true,
      searchKeyword: '',
      filteredStudents: this.data.allStudents,
      tempSelectedStudents: [...this.data.selectedStudents]
    });
  },

  closeStudentPicker: function () {
    this.setData({ showStudentPicker: false });
  },

  onSearchStudent: function (e) {
    const keyword = e.detail.value.trim().toLowerCase();
    const filtered = keyword
      ? this.data.allStudents.filter(s =>
          (s.student_name || '').toLowerCase().includes(keyword) ||
          (s.student_id || '').toLowerCase().includes(keyword)
        )
      : this.data.allStudents;
    this.setData({
      searchKeyword: keyword,
      filteredStudents: filtered
    });
  },

  isStudentSelected: function (studentId) {
    return this.data.tempSelectedStudents.some(s => s.student_id === studentId);
  },

  toggleStudentSelect: function (e) {
    const student = e.currentTarget.dataset.student;
    const tempSelected = [...this.data.tempSelectedStudents];
    const existIndex = tempSelected.findIndex(s => s.student_id === student.student_id);

    if (existIndex >= 0) {
      tempSelected.splice(existIndex, 1);
    } else {
      tempSelected.push({
        student_id: student.student_id,
        student_name: student.student_name
      });
    }

    this.setData({ tempSelectedStudents: tempSelected });
  },

  removeStudent: function (e) {
    const index = e.currentTarget.dataset.index;
    const selected = [...this.data.selectedStudents];
    selected.splice(index, 1);
    this.setData({ selectedStudents: selected });
  },

  confirmStudentSelect: function () {
    this.setData({
      selectedStudents: [...this.data.tempSelectedStudents],
      showStudentPicker: false
    });
  },

  // 执行颁发
  doAward: async function () {
    const { awardTitle, awardType, awardDesc, awardPeriod, awardIcon, selectedStudents, classId } = this.data;

    if (!awardTitle.trim()) {
      wx.showToast({ title: '请填写荣誉标题', icon: 'none' });
      return;
    }
    if (selectedStudents.length === 0) {
      wx.showToast({ title: '请选择获奖学生', icon: 'none' });
      return;
    }

    this.setData({ awarding: true });

    try {
      const studentIds = selectedStudents.map(s => s.student_id).join(',');
      const studentNames = selectedStudents.map(s => s.student_name).join(',');

      const res = await wx.cloud.callFunction({
        name: 'heroManager',
        data: {
          action: 'awardHonor',
          data: {
            class_id: classId,
            student_id: studentIds,
            student_name: studentNames,
            honor_type: awardType,
            title: awardTitle.trim(),
            description: awardDesc.trim(),
            icon: awardIcon,
            period: awardPeriod.trim(),
            awarded_by_name: app.globalData.userName || ''
          }
        }
      });

      const result = res.result || {};
      if (result.success) {
        const { successCount, failCount } = result.data;
        let msg = `成功颁发 ${successCount} 项荣誉`;
        if (failCount > 0) {
          msg += `，失败 ${failCount} 项`;
        }
        wx.showToast({ title: msg, icon: 'success', duration: 2000 });
        this.setData({ showAwardModal: false });
        this.refreshHonors();
      } else {
        wx.showToast({ title: result.message || '颁发失败', icon: 'none' });
      }
    } catch (err) {
      console.error('颁发荣誉失败:', err);
      wx.showToast({ title: '颁发失败，请重试', icon: 'none' });
    } finally {
      this.setData({ awarding: false });
    }
  },

  // ===== 管理操作 =====

  onAdminAction: function (e) {
    const honorId = e.currentTarget.dataset.id;
    const pinned = e.currentTarget.dataset.pinned;
    this.setData({
      showAdminModal: true,
      adminHonorId: honorId,
      adminPostPinned: !!pinned
    });
  },

  closeAdminModal: function () {
    this.setData({ showAdminModal: false });
  },

  onPinHonor: async function () {
    const { adminHonorId, classId } = this.data;
    try {
      const res = await wx.cloud.callFunction({
        name: 'heroManager',
        data: {
          action: 'pinHonor',
          data: { honor_id: adminHonorId, class_id: classId, pin: true }
        }
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: '已置顶', icon: 'success' });
        this.setData({ showAdminModal: false });
        this.refreshHonors();
      }
    } catch (err) {
      console.error('置顶失败:', err);
    }
  },

  onUnpinHonor: async function () {
    const { adminHonorId, classId } = this.data;
    try {
      const res = await wx.cloud.callFunction({
        name: 'heroManager',
        data: {
          action: 'pinHonor',
          data: { honor_id: adminHonorId, class_id: classId, pin: false }
        }
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: '已取消置顶', icon: 'success' });
        this.setData({ showAdminModal: false });
        this.refreshHonors();
      }
    } catch (err) {
      console.error('取消置顶失败:', err);
    }
  },

  onRevokeHonor: async function () {
    const { adminHonorId, classId } = this.data;
    const confirmRes = await new Promise(resolve => {
      wx.showModal({
        title: '确认撤销',
        content: '撤销后该荣誉将不再显示，确定吗？',
        confirmColor: '#ff4d4f',
        success: resolve
      });
    });

    if (!confirmRes.confirm) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'heroManager',
        data: {
          action: 'revokeHonor',
          data: { honor_id: adminHonorId, class_id: classId }
        }
      });
      if (res.result && res.result.success) {
        wx.showToast({ title: '已撤销', icon: 'success' });
        this.setData({ showAdminModal: false });
        this.refreshHonors();
      }
    } catch (err) {
      console.error('撤销失败:', err);
    }
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '英雄台 - 榜样的力量',
      path: '/subPages/hero/hero'
    };
  }
});
