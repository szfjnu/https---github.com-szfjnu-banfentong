// pages/score/rules/rules.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');

const db = wx.cloud.database();
const _ = db.command; // 【关键】必须加上这一行

Page({
  data: {
    loading: true,
    rules: [],
    addRules: [],
    deductRules: [],
    activeTab: 'add', // add 或 deduct
    showAddModal: false,
    editingRule: null,
    formData: {
      rule_name: '',
      rule_code: '',
      score_value: 0,
      rule_category: '学习',
      categoryIndex: 0,
      description: '',
      is_enabled: true,
      class_id: '',
      classIndex: 0,
      semester_id: '',
      effective_date: '',
      expiry_date: ''
    },
    categories: ['学习', '纪律', '卫生', '活动', '志愿服务', '其他'],
    classes: [],       // 班级列表
    classNames: [],    // 班级名称列表
    userRole: '',
    userClassId: '',
    currentSemesterId: '',
    currentSemester: null
  },

  onLoad: function () {
    const role = app.globalData.role;
    const classId = app.globalData.class_id || '';
    const semesterId = app.globalData.currentSemesterId || '';
    
    this.setData({ 
      userRole: role,
      userClassId: classId,
      currentSemesterId: semesterId,
      'formData.class_id': classId,
      'formData.semester_id': semesterId,
      'formData.effective_date': this.formatDate(new Date())
    });
    
    this.checkPermission();
    this.loadCurrentSemester();
    this.loadClasses();
    this.loadCategories();
    this.loadRules();
  },
  
  // 加载当前学期信息
  loadCurrentSemester: async function () {
    try {
      const app = getApp();
      const classId = app.globalData.class_id;
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'getSemesterConfig', data: { class_id: classId || '' } }
      });

      if (res.result && res.result.success && res.result.data) {
        const semester = res.result.data;
        this.setData({
          currentSemester: semester,
          currentSemesterId: semester._id || semester.semester_id,
          'formData.semester_id': semester._id || semester.semester_id
        });
      }
    } catch (err) {
      console.error('加载当前学期失败:', err);
    }
  },
  
  // 加载积分类别（从score_categories集合）
  loadCategories: async function () {
    try {
      const { userClassId } = this.data;
      
      const cfRes = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'getScoreCategories',
          data: { classId: userClassId || '' }
        }
      });

      const result = cfRes.result || {};
      if (result.success && result.data && result.data.length > 0) {
        const categories = result.data.map(c => c.category_name);
        const categoryMap = {};
        result.data.forEach(c => {
          categoryMap[c.category_name] = c;
        });
        
        this.setData({ 
          categories,
          categoryMap
        });
      }
    } catch (err) {
      console.error('加载积分类别失败:', err);
    }
  },
  
  // 加载班级列表
  loadClasses: async function () {
    try {
      // 如果是班主任，只加载当前班级
      if (this.data.userRole === 'head_teacher') {
        const res = await api.classApi.getClass(this.data.userClassId);
        if (res.data) {
          this.setData({ 
            classes: [res.data],
            classNames: ['全局规则（所有班级）', res.data.class_name]
          });
        }
      } else {
        // 管理员可以看所有班级
        const res = await api.classApi.getClasses();
        const classes = res.data || [];
        const classNames = ['全局规则（所有班级）', ...classes.map(c => c.class_name)];
        
        this.setData({ 
          classes,
          classNames 
        });
      }
    } catch (err) {
      console.error('加载班级列表失败:', err);
    }
  },

  onShow: function () {
    this.loadRules();
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'subject_teacher') {
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  // 加载积分规则
  loadRules: async function () {
    this.setData({ loading: true });

    try {
      const { userRole, userClassId, currentSemesterId } = this.data;
      
      // 使用云函数查询，突破小程序端20条限制
      const cfRes = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'getScoreItems',
          data: {
            classId: (userRole === 'head_teacher' && userClassId) ? userClassId : '',
            semesterId: currentSemesterId || ''
          }
        }
      });

      const res = cfRes.result || {};
      if (!res.success) {
        console.error('云函数获取积分规则失败:', res.message);
        this.setData({ loading: false });
        return;
      }
      
      const now = new Date();
      
      // 获取学期映射表
      const semesterMap = await this.loadSemesterMap();
      
      // 过滤出有效的规则（在有效期内）并添加学期名称
      const rules = (res.data || []).filter(rule => {
        // 检查是否启用
        if (rule.is_enabled === false) return false;
        
        // 检查生效日期
        if (rule.effective_date) {
          const effectiveDate = new Date(rule.effective_date);
          if (now < effectiveDate) return false;
        }
        
        // 检查失效日期
        if (rule.expiry_date) {
          const expiryDate = new Date(rule.expiry_date);
          if (now > expiryDate) return false;
        }
        
        return true;
      }).map(rule => {
        // 添加学期名称
        if (rule.semester_id && semesterMap[rule.semester_id]) {
          rule.semester_name = semesterMap[rule.semester_id];
        }
        
        // 格式化生效日期和失效日期
        if (rule.effective_date) {
          rule.effective_date_formatted = this.formatDate(rule.effective_date);
        }
        if (rule.expiry_date) {
          rule.expiry_date_formatted = this.formatDate(rule.expiry_date);
        }
        
        return rule;
      });
      
      const addRules = rules.filter(item => (item.score_value || 0) > 0);
      const deductRules = rules.filter(item => (item.score_value || 0) < 0);

      this.setData({
        rules,
        addRules,
        deductRules,
        loading: false
      });
      
      console.log('加载积分规则成功, 共', rules.length, '条');
    } catch (err) {
      console.error('加载积分规则失败:', err);
      this.setData({ loading: false });
      // 集合不存在时显示空列表
      if (err.errCode === -502005) {
        this.setData({
          rules: [],
          addRules: [],
          deductRules: []
        });
      }
    }
  },

  // 加载学期映射表
  loadSemesterMap: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const app = getApp();
      const classId = app.globalData.class_id;
      const query = classId ? { class_id: _.in([classId, '', null]) } : {};
      const res = await db.collection('semesters')
        .where(query)
        .field({
          _id: true,
          semester_id: true,
          name: true,
          semester_name: true
        })
        .get();
      
      const semesterMap = {};
      res.data.forEach(semester => {
        // 支持 _id 和 semester_id 两种格式
        semesterMap[semester._id] = semester.name || semester.semester_name;
        if (semester.semester_id) {
          semesterMap[semester.semester_id] = semester.name || semester.semester_name;
        }
      });
      
      return semesterMap;
    } catch (err) {
      console.error('加载学期映射表失败:', err);
      return {};
    }
  },

  // 切换标签
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 显示添加弹窗
  onShowAddModal: function () {
    const defaultCategoryIndex = 0;
    const defaultClassIndex = 0; // 默认全局规则
    
    this.setData({
      showAddModal: true,
      editingRule: null,
      formData: {
        rule_name: '',
        rule_code: '',
        score_value: this.data.activeTab === 'add' ? 5 : -5,
        rule_category: '学习',
        categoryIndex: defaultCategoryIndex,
        description: '',
        is_enabled: true,
        class_id: '',
        classIndex: defaultClassIndex
      }
    });
  },

  // 编辑规则
  onEditRule: function (e) {
    const rule = e.currentTarget.dataset.rule;
    const ruleCategory = rule.rule_category || rule.category || '学习';
    const categoryIndex = this.data.categories.indexOf(ruleCategory);
    
    // 查找班级索引
    let classIndex = 0;
    if (rule.class_id) {
      const idx = this.data.classes.findIndex(c => c._id === rule.class_id);
      if (idx >= 0) {
        classIndex = idx + 1; // 因为第一项是"全局规则"
      }
    }
    
    this.setData({
      showAddModal: true,
      editingRule: rule,
      formData: {
        rule_name: rule.rule_name || rule.name || rule.item_name || '',
        rule_code: rule.rule_code || '',
        score_value: rule.score_value || rule.score || rule.default_score || 0,
        rule_category: ruleCategory,
        categoryIndex: categoryIndex >= 0 ? categoryIndex : 0,
        description: rule.description || '',
        is_enabled: rule.is_enabled !== false,
        class_id: rule.class_id || '',
        classIndex: classIndex
      }
    });
  },

  // 阻止冒泡（空函数）
  preventBubble: function () {},

  // 关闭弹窗
  onCloseModal: function () {
    this.setData({ showAddModal: false, editingRule: null });
  },

  // 表单输入
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    let value = e.detail.value;

    if (field === 'score_value') {
      value = parseInt(value) || 0;
      if (this.data.activeTab === 'deduct' && value > 0) {
        value = -value;
      }
    }

    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 分类选择
  onCategoryChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      'formData.categoryIndex': index,
      'formData.rule_category': this.data.categories[index]
    });
  },
  
  // 班级选择
  onClassChange: function (e) {
    const index = parseInt(e.detail.value);
    const classId = index === 0 ? '' : (this.data.classes[index - 1]?._id || '');
    this.setData({
      'formData.classIndex': index,
      'formData.class_id': classId
    });
  },

  // 切换启用状态
  onToggleEnabled: function (e) {
    this.setData({
      'formData.is_enabled': e.detail.value
    });
  },

  // 保存规则
  onSaveRule: async function () {
    const { formData, editingRule, activeTab, currentSemesterId, userClassId, userRole } = this.data;

    // 验证
    if (!formData.rule_name.trim()) {
      util.showError('请输入规则名称');
      return;
    }

    if (!formData.score_value || formData.score_value === 0) {
      util.showError('请输入有效的积分值');
      return;
    }

    // 强制验证：规则必须关联学期ID
    if (!currentSemesterId && !formData.semester_id) {
      util.showError('规则必须关联学期ID');
      return;
    }

    // 班主任权限校验：只能管理本班规则
    if (userRole === 'head_teacher' && formData.class_id && formData.class_id !== userClassId) {
      util.showError('您只能管理本班的规则');
      return;
    }

    // 验证生效日期和失效日期
    const effectiveDate = formData.effective_date ? new Date(formData.effective_date) : new Date();
    const expiryDate = formData.expiry_date ? new Date(formData.expiry_date) : null;
    
    if (expiryDate && effectiveDate >= expiryDate) {
      util.showError('失效日期必须晚于生效日期');
      return;
    }

    // 外键约束验证：验证class_id是否存在
    if (formData.class_id) {
      const classValid = await this.validateClassExists(formData.class_id);
      if (!classValid) {
        util.showError('所选班级不存在');
        return;
      }
    }

    // 外键约束验证：验证semester_id是否存在
    const semesterId = formData.semester_id || currentSemesterId;
    const semesterValid = await this.validateSemesterExists(semesterId);
    if (!semesterValid) {
      util.showError('所选学期不存在');
      return;
    }

    // 外键约束验证：验证category_id是否存在（如果使用了score_categories）
    if (this.data.categoryMap && this.data.categoryMap[formData.rule_category]) {
      const categoryValid = await this.validateCategoryExists(formData.rule_category);
      if (!categoryValid) {
        util.showError('所选积分类别不存在');
        return;
      }
    }

    // 确保积分值符号正确
    let scoreValue = Math.abs(formData.score_value);
    if (activeTab === 'deduct') {
      scoreValue = -scoreValue;
    }

    try {
      wx.showLoading({ title: '保存中...', mask: true });

      const db = wx.cloud.database();
      const _ = db.command;
      
      const data = {
        record_type: 'rule',           // 标识为规则记录
        record_id: editingRule?.record_id || `RULE-${Date.now()}`,
        rule_name: formData.rule_name.trim(),
        rule_code: formData.rule_code.trim(),
        score_value: scoreValue,
        rule_category: formData.rule_category,
        category: formData.rule_category, // 兼容字段
        category_id: this.data.categoryMap?.[formData.rule_category]?.category_id || '',
        description: formData.description.trim(),
        is_enabled: formData.is_enabled,
        class_id: formData.class_id || userClassId,   // 班级归属（强制绑定）
        semester_id: semesterId,                      // 学期ID（强制绑定）
        effective_date: effectiveDate,                // 生效时间戳
        expiry_date: expiryDate,                      // 失效时间戳
        icon_name: 'star',
        priority: 1,
        created_at: editingRule ? editingRule.created_at : new Date(),
        updated_at: new Date(),
        created_by: app.globalData.openid || '',
        updated_by: app.globalData.openid || ''
      };

      if (editingRule && editingRule._id) {
        // 更新 - 创建版本快照
        await this.createVersionSnapshot(editingRule, data);
        // 更新 - 创建版本快照
        await this.createVersionSnapshot(editingRule, data);
        
        // 更新规则
        await db.collection('score_items').doc(editingRule._id).update({ data });
        util.showSuccess('更新成功');
      } else {
        // 新增 - 创建初始版本
        data.created_at = new Date();
        const addRes = await db.collection('score_items').add({ data });
        
        // 创建初始版本快照
        if (addRes._id) {
          await this.createInitialVersion(data, addRes._id);
        }
        util.showSuccess('添加成功');
      }

      this.setData({ showAddModal: false, editingRule: null });
      this.loadRules();

    } catch (err) {
      console.error('保存规则失败:', err);
      util.showError('保存失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 创建版本快照
  createVersionSnapshot: async function (oldRule, newRule) {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 获取当前活跃版本
      const versionsRes = await db.collection('score_rule_versions')
        .where({
          rule_id: oldRule.record_id,
          is_active: true
        })
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
      
      const currentVersion = versionsRes.data[0];
      
      // 计算变更字段
      const changedFields = this.getChangedFields(oldRule, newRule);
      
      if (changedFields.length === 0) {
        console.log('没有字段变更,跳过版本创建');
        return;
      }
      
      // 生成新版本号
      const newVersionNumber = this.incrementVersion(currentVersion?.version_number || '0.0.0');
      
      // 创建新版本
      const versionData = {
        version_id: `VER-${Date.now()}`,
        rule_id: oldRule.record_id,
        version_number: newVersionNumber,
        rule_name: newRule.rule_name,
        rule_code: newRule.rule_code,
        score_value: newRule.score_value,
        category_id: newRule.rule_category,
        description: newRule.description,
        conditions: {
          min_value: null,
          max_value: null,
          bonus_rules: []
        },
        change_description: this.generateChangeDescription(changedFields),
        changed_fields: changedFields,
        previous_version: currentVersion?.version_id || null,
        is_stable: true,
        is_active: true,
        class_id: newRule.class_id,
        semester_id: app.globalData.current_semester_id || '',
        created_by: app.globalData.openid || '',
        created_by_name: app.globalData.name || '未知用户',
        created_at: new Date(),
        activated_at: new Date(),
        deprecated_at: null
      };
      
      // 将旧版本设为非活跃
      if (currentVersion) {
        await db.collection('score_rule_versions').doc(currentVersion._id).update({
          data: {
            is_active: false,
            deprecated_at: new Date()
          }
        });
      }
      
      // 添加新版本
      await db.collection('score_rule_versions').add({ data: versionData });
      
      console.log('版本快照创建成功:', newVersionNumber);
    } catch (err) {
      console.error('创建版本快照失败:', err);
      // 不中断主流程
    }
  },

  // 创建初始版本
  createInitialVersion: async function (rule, ruleDocId) {
    try {
      const db = wx.cloud.database();
      
      const versionData = {
        version_id: `VER-${Date.now()}`,
        rule_id: rule.record_id,
        version_number: '1.0.0',
        rule_name: rule.rule_name,
        rule_code: rule.rule_code,
        score_value: rule.score_value,
        category_id: rule.rule_category,
        description: rule.description,
        conditions: {
          min_value: null,
          max_value: null,
          bonus_rules: []
        },
        change_description: '初始版本',
        changed_fields: [],
        previous_version: null,
        is_stable: true,
        is_active: true,
        class_id: rule.class_id,
        semester_id: app.globalData.current_semester_id || '',
        created_by: app.globalData.openid || '',
        created_by_name: app.globalData.name || '未知用户',
        created_at: new Date(),
        activated_at: new Date(),
        deprecated_at: null
      };
      
      await db.collection('score_rule_versions').add({ data: versionData });
      console.log('初始版本创建成功: 1.0.0');
    } catch (err) {
      console.error('创建初始版本失败:', err);
    }
  },

  // 获取变更字段
  getChangedFields: function (oldRule, newRule) {
    const fields = [];
    const compareFields = [
      { key: 'rule_name', label: '规则名称' },
      { key: 'rule_code', label: '规则编码' },
      { key: 'score_value', label: '积分值' },
      { key: 'rule_category', label: '分类' },
      { key: 'description', label: '描述' },
      { key: 'is_enabled', label: '启用状态' },
      { key: 'class_id', label: '班级归属' }
    ];
    
    compareFields.forEach(field => {
      const oldValue = oldRule[field.key];
      const newValue = newRule[field.key];
      
      if (oldValue !== newValue) {
        fields.push({
          field: field.key,
          label: field.label,
          old_value: oldValue,
          new_value: newValue
        });
      }
    });
    
    return fields;
  },

  // 生成变更描述
  generateChangeDescription: function (changedFields) {
    if (changedFields.length === 0) return '无变更';
    
    const descriptions = changedFields.map(field => {
      return `${field.label}: "${field.old_value || '空'}" → "${field.new_value || '空'}"`;
    });
    
    return descriptions.join('; ');
  },

  // 版本号递增
  incrementVersion: function (versionNumber) {
    if (!versionNumber) return '1.0.0';
    
    const parts = versionNumber.split('.');
    if (parts.length !== 3) return '1.0.0';
    
    let [major, minor, patch] = parts.map(Number);
    
    // 这里简化处理,每次更新增加修订号
    // 实际应用中可以根据变更类型决定增加哪一位
    patch++;
    
    return `${major}.${minor}.${patch}`;
  },

  // ==================== 外键约束验证函数 ====================

  // 验证班级是否存在
  validateClassExists: async function (classId) {
    if (!classId) return true; // 空表示全局规则，不需要验证
    
    try {
      const db = wx.cloud.database();
      const res = await db.collection('classes')
        .where({
          _id: classId
        })
        .limit(1)
        .get();
      
      return res.data.length > 0;
    } catch (err) {
      console.error('验证班级存在失败:', err);
      return false;
    }
  },

  // 验证学期是否存在
  validateSemesterExists: async function (semesterId) {
    if (!semesterId) return false; // 学期ID必须存在
    
    try {
      const db = wx.cloud.database();
      const res = await db.collection('semesters')
        .where(_.or([
          { _id: semesterId },
          { semester_id: semesterId }
        ]))
        .limit(1)
        .get();
      
      return res.data.length > 0;
    } catch (err) {
      console.error('验证学期存在失败:', err);
      return false;
    }
  },

  // 验证积分类别是否存在
  validateCategoryExists: async function (categoryName) {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      const res = await db.collection('score_categories')
        .where(_.or([
          { category_name: categoryName },
          { category_id: categoryName }
        ]))
        .where({
          is_active: true
        })
        .limit(1)
        .get();
      
      return res.data.length > 0;
    } catch (err) {
      console.error('验证积分类别存在失败:', err);
      // 如果集合不存在，允许使用默认类别
      return true;
    }
  },

  // 验证宿舍扣分项是否存在（用于宿舍管理）
  validateDormItemExists: async function (itemId) {
    if (!itemId) return true;
    
    try {
      const db = wx.cloud.database();
      const res = await db.collection('dorm_deduction_items')
        .where({
          _id: itemId
        })
        .limit(1)
        .get();
      
      return res.data.length > 0;
    } catch (err) {
      console.error('验证宿舍扣分项存在失败:', err);
      return false;
    }
  },

  // ==================== 辅助函数 ====================

  // 日期格式化
  formatDate: function (date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 日期选择器变化
  onDateChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 学期选择
  onSemesterChange: function (e) {
    const index = parseInt(e.detail.value);
    const semesterId = this.data.semesters[index]?._id || '';
    this.setData({
      'formData.semester_id': semesterId,
      semesterIndex: index
    });
  },

  // 删除规则
  onDeleteRule: function (e) {
    const rule = e.currentTarget.dataset.rule;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除规则"${rule.rule_name || rule.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...', mask: true });
            const db = wx.cloud.database();
            await db.collection('score_items').doc(rule._id).remove();
            util.showSuccess('删除成功');
            this.loadRules();
          } catch (err) {
            console.error('删除规则失败:', err);
            util.showError('删除失败');
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 切换规则状态
  onToggleStatus: async function (e) {
    const rule = e.currentTarget.dataset.rule;
    const newStatus = !rule.is_enabled;

    try {
      const db = wx.cloud.database();
      await db.collection('score_items').doc(rule._id).update({
        data: { is_enabled: newStatus, updated_at: new Date() }
      });
      util.showSuccess(newStatus ? '已启用' : '已禁用');
      this.loadRules();
    } catch (err) {
      console.error('更新状态失败:', err);
      util.showError('操作失败');
    }
  },

  // 查看版本历史
  onViewVersions: function (e) {
    const rule = e.currentTarget.dataset.rule;
    
    wx.navigateTo({
      url: `/subPages/score/rules/version?rule_id=${rule.record_id}&rule_name=${encodeURIComponent(rule.rule_name || rule.name || '规则')}`
    });
  },

  // 积分类别管理
  onManageCategories: function () {
    wx.navigateTo({
      url: '/subPages/score/categories/categories'
    });
  }
});
