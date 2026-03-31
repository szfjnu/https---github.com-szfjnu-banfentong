// pages/attendance/settings/settings.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    classId: '',
    
    // 考勤类别列表
    categories: [],
    
    // 弹窗显示状态
    showCategoryModal: false,
    editingCategory: null, // 正在编辑的类别
    
    // 表单数据
    categoryForm: {
      category_name: '',
      score_deduction: 0,
      description: '',
      color: '#fa8c16',
      icon: '📌',
      sort_order: 0
    },
    
    // 预设颜色
    presetColors: [
      '#52c41a', '#1890ff', '#fa8c16', '#faad14', '#ff4d4f',
      '#722ed1', '#13c2c2', '#eb2f96', '#2f54eb', '#f5222d'
    ],
    
    // 预设图标
    presetIcons: ['🏥', '📝', '⏰', '🏃', '❌', '📌', '⚠️', '🚫', '✓', '📋'],
    
    // 加载状态
    loading: true,
    saving: false
  },

  onLoad: function (options) {
    const classId = options.class_id || app.globalData.class_id;
    this.setData({ classId: classId });
    this.loadCategories();
  },

  // 加载考勤类别
  loadCategories: async function () {
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      const res = await db.collection('attendance_categories')
        .where({
          class_id: this.data.classId
        })
        .orderBy('sort_order', 'asc')
        .get();
      
      let categories = res.data || [];
      
      // 如果没有类别，初始化默认类别
      if (categories.length === 0) {
        categories = this.getDefaultCategories();
        // 保存默认类别到数据库
        for (const category of categories) {
          await this.saveCategoryToDB(category);
        }
      }
      
      this.setData({
        categories: categories,
        loading: false
      });
    } catch (err) {
      console.error('加载考勤类别失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 获取默认考勤类别
  getDefaultCategories: function () {
    return [
      {
        category_id: `CAT${Date.now()}1`,
        class_id: this.data.classId,
        category_name: '病假',
        category_code: 'sick_leave',
        score_deduction: 0,
        description: '因病请假',
        color: '#52c41a',
        icon: '🏥',
        sort_order: 1,
        is_system: true,
        is_active: true
      },
      {
        category_id: `CAT${Date.now()}2`,
        class_id: this.data.classId,
        category_name: '事假',
        category_code: 'personal_leave',
        score_deduction: 0,
        description: '因事请假',
        color: '#1890ff',
        icon: '📝',
        sort_order: 2,
        is_system: true,
        is_active: true
      },
      {
        category_id: `CAT${Date.now()}3`,
        class_id: this.data.classId,
        category_name: '迟到',
        category_code: 'late',
        score_deduction: -1,
        description: '上课迟到',
        color: '#fa8c16',
        icon: '⏰',
        sort_order: 3,
        is_system: true,
        is_active: true
      },
      {
        category_id: `CAT${Date.now()}4`,
        class_id: this.data.classId,
        category_name: '早退',
        category_code: 'early_leave',
        score_deduction: -1,
        description: '提前离开',
        color: '#faad14',
        icon: '🏃',
        sort_order: 4,
        is_system: true,
        is_active: true
      },
      {
        category_id: `CAT${Date.now()}5`,
        class_id: this.data.classId,
        category_name: '旷课',
        category_code: 'absent',
        score_deduction: -5,
        description: '无故缺席',
        color: '#ff4d4f',
        icon: '❌',
        sort_order: 5,
        is_system: true,
        is_active: true
      }
    ];
  },

  // 显示添加类别弹窗
  onAddCategory: function () {
    this.setData({
      showCategoryModal: true,
      editingCategory: null,
      categoryForm: {
        category_name: '',
        score_deduction: 0,
        description: '',
        color: '#fa8c16',
        icon: '📌',
        sort_order: this.data.categories.length + 1
      }
    });
  },

  // 编辑类别
  onEditCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    
    this.setData({
      showCategoryModal: true,
      editingCategory: category,
      categoryForm: {
        category_name: category.category_name,
        score_deduction: category.score_deduction || 0,
        description: category.description || '',
        color: category.color || '#fa8c16',
        icon: category.icon || '📌',
        sort_order: category.sort_order || 0
      }
    });
  },

  // 删除类别
  onDeleteCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    
    if (category.is_system) {
      util.showError('系统内置类别不能删除');
      return;
    }
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除考勤类别"${category.category_name}"吗？删除后无法恢复。`,
      success: async (res) => {
        if (res.confirm) {
          await this.doDeleteCategory(category);
        }
      }
    });
  },

  // 执行删除类别
  doDeleteCategory: async function (category) {
    wx.showLoading({ title: '删除中...' });
    
    try {
      const db = wx.cloud.database();
      await db.collection('attendance_categories').doc(category._id).remove();
      
      wx.hideLoading();
      util.showSuccess('删除成功');
      
      this.loadCategories();
    } catch (err) {
      console.error('删除失败:', err);
      wx.hideLoading();
      util.showError('删除失败');
    }
  },

  // 切换类别启用状态
  onToggleCategory: async function (e) {
    const category = e.currentTarget.dataset.category;
    
    try {
      const db = wx.cloud.database();
      await db.collection('attendance_categories')
        .doc(category._id)
        .update({
          data: {
            is_active: !category.is_active,
            updated_at: db.serverDate()
          }
        });
      
      util.showSuccess('更新成功');
      this.loadCategories();
    } catch (err) {
      console.error('更新失败:', err);
      util.showError('更新失败');
    }
  },

  // 输入类别名称
  onNameInput: function (e) {
    this.setData({ 'categoryForm.category_name': e.detail.value });
  },

  // 输入积分扣减值
  onScoreInput: function (e) {
    const value = parseInt(e.detail.value) || 0;
    this.setData({ 'categoryForm.score_deduction': value });
  },

  // 输入描述
  onDescInput: function (e) {
    this.setData({ 'categoryForm.description': e.detail.value });
  },

  // 选择颜色
  onSelectColor: function (e) {
    const color = e.currentTarget.dataset.color;
    this.setData({ 'categoryForm.color': color });
  },

  // 选择图标
  onSelectIcon: function (e) {
    const icon = e.currentTarget.dataset.icon;
    this.setData({ 'categoryForm.icon': icon });
  },

  // 关闭弹窗
  onCloseModal: function () {
    this.setData({ showCategoryModal: false });
  },

  // 保存类别
  onSaveCategory: async function () {
    const { category_name, score_deduction, description, color, icon, sort_order } = this.data.categoryForm;
    
    if (!category_name || !category_name.trim()) {
      util.showError('请输入类别名称');
      return;
    }
    
    this.setData({ saving: true });
    
    try {
      const db = wx.cloud.database();
      const editingCategory = this.data.editingCategory;
      
      const categoryData = {
        category_name: category_name.trim(),
        score_deduction: score_deduction,
        description: description,
        color: color,
        icon: icon,
        sort_order: sort_order,
        is_active: true
      };
      
      if (editingCategory) {
        // 更新
        await db.collection('attendance_categories')
          .doc(editingCategory._id)
          .update({
            data: {
              ...categoryData,
              updated_at: db.serverDate()
            }
          });
      } else {
        // 新增
        const categoryId = `CAT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
        await this.saveCategoryToDB({
          ...categoryData,
          category_id: categoryId,
          class_id: this.data.classId,
          is_system: false,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        });
      }
      
      this.setData({ 
        showCategoryModal: false,
        saving: false
      });
      
      util.showSuccess('保存成功');
      this.loadCategories();
      
    } catch (err) {
      console.error('保存失败:', err);
      this.setData({ saving: false });
      util.showError('保存失败');
    }
  },

  // 保存类别到数据库
  saveCategoryToDB: async function (category) {
    try {
      const db = wx.cloud.database();
      await db.collection('attendance_categories').add({ data: category });
    } catch (err) {
      console.error('保存类别失败:', err);
      throw err;
    }
  },

  // 拖拽排序相关
  onCategoryMove: function (e) {
    // TODO: 实现拖拽排序
  }
});