const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    loading: true,
    rules: [],
    addRules: [],
    deductRules: [],
    currentRules: [],
    activeTab: 'deduct', // deduct 或 add

    // 类别筛选
    categories: ['卫生', '纪律', '安全', '作息', '公物', '其他'],
    categoryOptions: ['全部类别', '卫生', '纪律', '安全', '作息', '公物', '其他'],
    selectedCategory: '全部类别',
    selectedCategoryIndex: 0,

    // 学期筛选
    semesters: [],
    semesterOptions: ['全部学期'],
    selectedSemester: '全部学期',
    selectedSemesterIndex: 0,

    // 分页
    page: 0,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,

    // 弹窗
    showModal: false,
    editingRule: null,

    // 表单数据
    formData: {
      rule_name: '',
      categoryIndex: 0,
      score_value: 0,
      severityIndex: 1,
      standard: '',
      description: '',
      requires_proof: false,
      semesterIndex: 0
    },

    // 严重程度选项
    severityOptions: ['轻微', '一般', '严重', '重大'],

    userRole: '',
    classId: '',
    currentSemesterId: ''
  },

  onLoad: function () {
    this.setData({
      userRole: app.globalData.role,
      classId: app.globalData.class_id,
      currentSemesterId: app.globalData.currentSemesterId || ''
    });
    this.loadSemesters();
    this.loadRules();
  },

  onPullDownRefresh: function () {
    this.setData({ page: 0, hasMore: true });
    this.loadRules().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载学期列表
  loadSemesters: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const { classId } = this.data;
      const query = classId ? { class_id: _.in([classId, '', null]) } : {};
      const res = await db.collection('semesters')
        .where(query)
        .orderBy('created_at', 'desc')
        .get();

      const semesters = res.data || [];
      const semesterOptions = ['全部学期', ...semesters.map(s => s.semester_name)];

      this.setData({
        semesters,
        semesterOptions
      });
    } catch (err) {
      console.error('加载学期失败:', err);
    }
  },

  // 加载规则
  loadRules: async function (refresh = true) {
    if (refresh) {
      this.setData({ loading: true, page: 0, hasMore: true });
    } else {
      this.setData({ loadingMore: true });
    }

    try {
      const { classId, selectedCategory, selectedSemester, page, pageSize, semesters } = this.data;
      const skip = refresh ? 0 : page * pageSize;

      // 构建查询条件
      let query = {
        class_id: _.in([classId, '', null]),
        is_enabled: _.neq(false)
      };

      // 类别筛选
      if (selectedCategory !== '全部类别') {
        query.category = selectedCategory;
      }

      // 学期筛选
      if (selectedSemester !== '全部学期' && semesters.length > 0) {
        const semester = semesters.find(s => s.semester_name === selectedSemester);
        if (semester) {
          query.semester_id = _.in([semester._id, '', null]);
        }
      }

      const res = await db.collection('dorm_rules')
        .where(query)
        .orderBy('created_at', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get();

      const newRules = res.data.map(rule => ({
        ...rule,
        severityClass: this.getSeverityClass(rule.severity)
      }));

      const rules = refresh ? newRules : [...this.data.rules, ...newRules];

      // 分类
      const addRules = rules.filter(r => r.score_value > 0);
      const deductRules = rules.filter(r => r.score_value < 0);

      this.setData({
        rules,
        addRules,
        deductRules,
        currentRules: this.data.activeTab === 'add' ? addRules : deductRules,
        loading: false,
        loadingMore: false,
        hasMore: newRules.length === pageSize,
        page: refresh ? 0 : page
      });

    } catch (err) {
      console.error('加载规则失败:', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 获取严重程度对应的样式类名
  getSeverityClass: function(severity) {
    const severityMap = {
      '轻微': 'minor',
      '一般': 'general',
      '严重': 'serious',
      '重大': 'critical'
    };
    return severityMap[severity] || 'general';
  },

  // 类别筛选变化
  onCategoryChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      selectedCategoryIndex: index,
      selectedCategory: this.data.categoryOptions[index]
    });
    this.loadRules(true);
  },

  // 学期筛选变化
  onSemesterChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      selectedSemesterIndex: index,
      selectedSemester: this.data.semesterOptions[index]
    });
    this.loadRules(true);
  },

  // 标签切换
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab,
      currentRules: tab === 'add' ? this.data.addRules : this.data.deductRules
    });
  },

  // 加载更多
  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadRules(false);
    }
  },

  // 添加规则
  onAddRule: function () {
    this.setData({
      showModal: true,
      editingRule: null,
      formData: {
        rule_name: '',
        categoryIndex: 0,
        score_value: this.data.activeTab === 'add' ? 1 : -1,
        severityIndex: 1,
        standard: '',
        description: '',
        requires_proof: false
      }
    });
  },

  // 编辑规则
  onEditRule: function (e) {
    const id = e.currentTarget.dataset.id;
    const rule = this.data.rules.find(r => r._id === id);
    
    if (!rule) return;

    this.setData({
      showModal: true,
      editingRule: rule,
      formData: {
        rule_name: rule.rule_name,
        categoryIndex: this.data.categories.indexOf(rule.category),
        score_value: rule.score_value,
        severityIndex: this.data.severityOptions.indexOf(rule.severity || '一般'),
        standard: rule.standard || '',
        description: rule.description || '',
        requires_proof: rule.requires_proof || false
      }
    });
  },

  // 切换规则状态
  onToggleStatus: async function (e) {
    const id = e.currentTarget.dataset.id;
    const rule = this.data.rules.find(r => r._id === id);
    
    if (!rule) return;

    try {
      const newStatus = !rule.is_enabled;
      
      const res = await wx.cloud.callFunction({
        name: 'importDormRules',
        data: {
          action: 'toggleRuleStatus',
          data: { rule_id: id, is_enabled: newStatus }
        }
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '操作失败');
      }

      const index = this.data.rules.findIndex(r => r._id === id);
      if (index !== -1) {
        this.data.rules[index].is_enabled = newStatus;
        this.setData({ rules: this.data.rules });
      }

      wx.showToast({
        title: newStatus ? '已启用' : '已禁用',
        icon: 'success'
      });

    } catch (err) {
      console.error('切换状态失败:', err);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  // 关闭弹窗
  onCloseModal: function () {
    this.setData({ showModal: false });
  },

  // 阻止冒泡
  stopPropagation: function () {},

  // 输入框变化
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 类别选择器变化
  onCategoryPickerChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      'formData.categoryIndex': index
    });
  },

  // 严重程度选择器变化
  onSeverityPickerChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      'formData.severityIndex': index
    });
  },

  // 学期选择器变化
  onSemesterPickerChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      'formData.semesterIndex': index
    });
  },

  // 开关变化
  onSwitchChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 提交表单
  onSubmitForm: async function () {
    const { formData, editingRule, classId, semesters, currentSemesterId } = this.data;

    // 验证必填字段
    if (!formData.rule_name.trim()) {
      wx.showToast({
        title: '请输入规则名称',
        icon: 'none'
      });
      return;
    }

    if (!formData.score_value || formData.score_value === 0) {
      wx.showToast({
        title: '请输入分值',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });

      // 获取学期ID
      let semesterId = currentSemesterId;
      if (formData.semesterIndex > 0 && semesters.length > 0) {
        semesterId = semesters[formData.semesterIndex - 1]._id;
      }

      const ruleData = {
        rule_name: formData.rule_name.trim(),
        category: this.data.categories[formData.categoryIndex],
        score_value: parseFloat(formData.score_value),
        severity: this.data.severityOptions[formData.severityIndex],
        standard: formData.standard.trim(),
        description: formData.description.trim(),
        requires_proof: formData.requires_proof,
        class_id: classId,
        semester_id: semesterId
      };

      if (editingRule) {
        // 更新
        const res = await wx.cloud.callFunction({
          name: 'importDormRules',
          data: {
            action: 'updateRule',
            data: { _id: editingRule._id, ...ruleData }
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '更新规则失败');
        }
      } else {
        // 新增
        ruleData.is_enabled = true;
        ruleData.created_by = app.globalData.openid;

        const res = await wx.cloud.callFunction({
          name: 'importDormRules',
          data: {
            action: 'addRule',
            data: ruleData
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '新增规则失败');
        }
      }

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      this.onCloseModal();
      this.loadRules(true);

    } catch (err) {
      console.error('保存规则失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  }
});
