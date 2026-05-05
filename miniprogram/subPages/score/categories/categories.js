// pages/score/categories/categories.js
const app = getApp();
const util = require('../../../utils/util.js');
const batchQuery = require('../../../utils/batchQuery.js');

Page({
  data: {
    loading: true,
    categories: [],
    showAddModal: false,
    editingCategory: null,
    formData: {
      category_name: '',
      category_code: '',
      icon: '📋',
      color: '#1890ff',
      description: '',
      applicable_roles: ['student'],
      is_active: true,
      is_dorm_related: false,
      class_id: '',
      semester_id: ''
    },
    // 图标选项
    iconOptions: ['📚', '📝', '🤝', '👥', '🙏', '⚠️', '⭐', '🧹', '🏆', '🎯', '🏠', '🛏️', '📋', '💡', '🎯'],
    selectedIconIndex: 0,
    // 颜色选项
    colorOptions: ['#1890ff', '#52c41a', '#722ed1', '#fa8c16', '#13c2c2', '#f5222d', '#eb2f96', '#a0d911', '#2f54eb', '#faad14'],
    selectedColorIndex: 0,
    // 权限
    userRole: '',
    currentClassId: '',
    currentSemesterId: ''
  },

  onLoad: function () {
    const role = app.globalData.role;
    const classId = app.globalData.class_id || '';
    const semesterId = app.globalData.currentSemesterId || '';
    
    this.setData({
      userRole: role,
      currentClassId: classId,
      currentSemesterId: semesterId,
      'formData.class_id': classId,
      'formData.semester_id': semesterId
    });
    
    this.checkPermission();
    this.loadCategories();
  },

  onShow: function () {
    this.loadCategories();
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher') {
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

  // 加载积分类别
  loadCategories: async function () {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 查询当前班级和全局的积分类别
      const categories = await batchQuery.getAllRecords('score_categories', {
        is_active: _.neq(false),
        class_id: _.in([this.data.currentClassId, '', null])
      }, 'sort_order', 'asc');
      
      this.setData({
        categories,
        loading: false
      });
      
      console.log('加载积分类别成功, 共', categories.length, '条');
    } catch (err) {
      console.error('加载积分类别失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 显示添加弹窗
  onShowAddModal: function () {
    this.setData({
      showAddModal: true,
      editingCategory: null,
      formData: {
        category_name: '',
        category_code: '',
        icon: '📋',
        color: '#1890ff',
        description: '',
        applicable_roles: ['student'],
        is_active: true,
        is_dorm_related: false,
        class_id: this.data.currentClassId,
        semester_id: this.data.currentSemesterId
      },
      selectedIconIndex: 0,
      selectedColorIndex: 0
    });
  },

  // 编辑类别
  onEditCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    
    if (category.is_system) {
      util.showError('系统内置类别不可编辑');
      return;
    }
    
    const iconIndex = this.data.iconOptions.indexOf(category.icon);
    const colorIndex = this.data.colorOptions.indexOf(category.color);
    
    this.setData({
      showAddModal: true,
      editingCategory: category,
      formData: {
        category_name: category.category_name,
        category_code: category.category_code,
        icon: category.icon,
        color: category.color,
        description: category.description || '',
        applicable_roles: category.applicable_roles || ['student'],
        is_active: category.is_active !== false,
        is_dorm_related: category.is_dorm_related || false,
        class_id: category.class_id || this.data.currentClassId,
        semester_id: category.semester_id || this.data.currentSemesterId
      },
      selectedIconIndex: iconIndex >= 0 ? iconIndex : 0,
      selectedColorIndex: colorIndex >= 0 ? colorIndex : 0
    });
  },

  // 停用类别
  onToggleStatus: async function (e) {
    const category = e.currentTarget.dataset.category;
    const newStatus = category.is_active !== false; // 切换状态
    const action = newStatus ? '停用' : '启用';
    
    // 系统内置类别可以停用，但需要额外提示
    if (category.is_system && newStatus) {
      wx.showModal({
        title: '确认操作',
        content: `系统内置类别"${category.category_name}"停用后将不再显示在选项中，但历史记录不受影响。确定要${action}吗?`,
        success: async (res) => {
          if (res.confirm) {
            await this.doToggleStatus(category, !newStatus);
          }
        }
      });
      return;
    }

    wx.showModal({
      title: '确认操作',
      content: `确定要${action}类别"${category.category_name}"吗?`,
      success: async (res) => {
        if (res.confirm) {
          await this.doToggleStatus(category, !newStatus);
        }
      }
    });
  },

  // 执行状态切换
  doToggleStatus: async function (category, newStatus) {
    try {
      const db = wx.cloud.database();
      await db.collection('score_categories').doc(category._id).update({
        data: {
          is_active: newStatus,
          updated_at: new Date()
        }
      });
      
      util.showSuccess(newStatus ? '已启用' : '已停用');
      this.loadCategories();
    } catch (err) {
      console.error('更新类别状态失败:', err);
      util.showError('操作失败');
    }
  },

  // 关闭弹窗
  onCloseModal: function () {
    this.setData({ showAddModal: false, editingCategory: null });
  },

  preventBubble: function () {},

  // 表单输入
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 图标选择
  onIconChange: function (e) {
    const index = parseInt(e.detail.value);
    const icon = this.data.iconOptions[index];
    
    this.setData({
      selectedIconIndex: index,
      'formData.icon': icon
    });
  },

  // 颜色选择
  onColorChange: function (e) {
    const index = parseInt(e.detail.value);
    const color = this.data.colorOptions[index];
    
    this.setData({
      selectedColorIndex: index,
      'formData.color': color
    });
  },

  // 切换宿舍相关
  onToggleDormRelated: function (e) {
    this.setData({
      'formData.is_dorm_related': e.detail.value
    });
  },

  // 切换启用状态
  onToggleEnabled: function (e) {
    this.setData({
      'formData.is_active': e.detail.value
    });
  },

  // 保存类别
  onSaveCategory: async function () {
    const { formData, editingCategory } = this.data;
    
    // 验证
    if (!formData.category_name.trim()) {
      util.showError('请输入类别名称');
      return;
    }
    
    if (!formData.category_code.trim()) {
      util.showError('请输入类别代码');
      return;
    }
    
    // 校验学期和班级
    if (!formData.class_id && this.data.userRole !== 'admin') {
      util.showError('必须绑定班级');
      return;
    }
    
    if (!formData.semester_id) {
      util.showError('必须绑定学期');
      return;
    }
    
    try {
      wx.showLoading({ title: '保存中...', mask: true });
      
      const db = wx.cloud.database();
      
      const data = {
        category_id: editingCategory?.category_id || `CAT-${Date.now()}`,
        category_name: formData.category_name.trim(),
        category_code: formData.category_code.trim().toUpperCase(),
        icon: formData.icon,
        color: formData.color,
        description: formData.description.trim(),
        applicable_roles: formData.applicable_roles,
        is_active: formData.is_active,
        is_dorm_related: formData.is_dorm_related,
        is_system: false,
        class_id: formData.class_id,
        semester_id: formData.semester_id,
        sort_order: editingCategory?.sort_order || 99,
        applicable_grades: [],
        updated_at: new Date()
      };
      
      if (editingCategory && editingCategory._id) {
        // 更新
        await db.collection('score_categories').doc(editingCategory._id).update({ data });
        util.showSuccess('更新成功');
      } else {
        // 新增
        data.created_at = new Date();
        await db.collection('score_categories').add({ data });
        util.showSuccess('添加成功');
      }
      
      this.setData({ showAddModal: false, editingCategory: null });
      this.loadCategories();
      
    } catch (err) {
      console.error('保存类别失败:', err);
      util.showError('保存失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 初始化基础类别
  onInitBaseCategories: async function () {
    if (this.data.userRole !== 'admin') {
      util.showError('仅管理员可执行此操作');
      return;
    }
    
    wx.showModal({
      title: '初始化基础类别',
      content: '确定要初始化系统预设的基础积分类别吗?如果已有数据将不会重复添加。',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '初始化中...', mask: true });
            
            const result = await wx.cloud.callFunction({
              name: 'initScoreCategories'
            });
            
            wx.hideLoading();
            
            if (result.result.success) {
              util.showSuccess(`初始化成功,共${result.result.count}个类别`);
              this.loadCategories();
            } else {
              util.showError(result.result.message || '初始化失败');
            }
          } catch (err) {
            console.error('初始化失败:', err);
            wx.hideLoading();
            util.showError('初始化失败: ' + err.message);
          }
        }
      }
    });
  }
});