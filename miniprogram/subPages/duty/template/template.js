// pages/duty/template/template.js - 任务模板管理
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    loading: true,
    classId: '',
    templates: [],
    categories: ['地面', '桌面', '黑板', '垃圾', '门窗', '走廊', '其他'],
    showAddModal: false,
    editingTemplate: null,
    // 表单数据
    formData: {
      name: '',
      description: '',
      category: '其他',
      icon: '🧹',
      default_score: 2,
      deduction_score: -2,
      requires_inspection: true,
      sort_order: 0
    },
    iconOptions: ['🧹', '🗑️', '🪟', '🧽', '🪣', '🧻', '📐', '🧹‍♂️']
  },

  onLoad: function () {
    this.setData({ classId: app.globalData.class_id });
    this.loadTemplates();
  },

  onShow: function () {
    this.loadTemplates();
  },

  loadTemplates: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getTemplates',
          data: { class_id: this.data.classId }
        }
      });

      if (res.result && res.result.success) {
        this.setData({ templates: res.result.data || [] });
      }
    } catch (err) {
      console.error('加载模板失败:', err);
      util.showError('加载失败');
    }
    this.setData({ loading: false });
  },

  // 显示添加弹窗
  onShowAdd: function () {
    this.setData({
      showAddModal: true,
      editingTemplate: null,
      formData: {
        name: '',
        description: '',
        category: '其他',
        icon: '🧹',
        default_score: 2,
        deduction_score: -2,
        requires_inspection: true,
        sort_order: 0
      }
    });
  },

  // 编辑模板
  onEdit: function (e) {
    const template = e.currentTarget.dataset.template;
    this.setData({
      showAddModal: true,
      editingTemplate: template,
      formData: {
        name: template.name,
        description: template.description || '',
        category: template.category || '其他',
        icon: template.icon || '🧹',
        default_score: template.default_score || 2,
        deduction_score: template.deduction_score || -2,
        requires_inspection: template.requires_inspection !== false,
        sort_order: template.sort_order || 0
      }
    });
  },

  // 隐藏弹窗
  onHideModal: function () {
    this.setData({ showAddModal: false });
  },

  // 表单输入
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`formData.${field}`]: e.detail.value });
  },

  onCategoryChange: function (e) {
    const idx = e.detail.value;
    this.setData({ ['formData.category']: this.data.categories[idx] });
  },

  onIconSelect: function (e) {
    const icon = e.currentTarget.dataset.icon;
    this.setData({ ['formData.icon']: icon });
  },

  onInspectionChange: function (e) {
    this.setData({ ['formData.requires_inspection']: e.detail.value });
  },

  // 保存模板
  onSave: async function () {
    const { formData, editingTemplate, classId } = this.data;

    if (!formData.name.trim()) {
      wx.showToast({ title: '请输入任务名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      let res;
      if (editingTemplate) {
        // 更新
        res = await wx.cloud.callFunction({
          name: 'manageDuty',
          data: {
            action: 'updateTemplate',
            data: { _id: editingTemplate._id, ...formData }
          }
        });
      } else {
        // 新增
        res = await wx.cloud.callFunction({
          name: 'manageDuty',
          data: {
            action: 'addTemplate',
            data: { class_id: classId, ...formData }
          }
        });
      }

      wx.hideLoading();
      if (res.result && res.result.success) {
        util.showSuccess(editingTemplate ? '更新成功' : '添加成功');
        this.onHideModal();
        this.loadTemplates();
      } else {
        util.showError(res.result.message || '保存失败');
      }
    } catch (err) {
      wx.hideLoading();
      console.error('保存模板失败:', err);
      util.showError('保存失败');
    }
  },

  // 删除模板
  onDelete: function (e) {
    const template = e.currentTarget.dataset.template;
    wx.showModal({
      title: '确认删除',
      content: `确定删除任务模板「${template.name}」吗？`,
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true });
          try {
            await wx.cloud.callFunction({
              name: 'manageDuty',
              data: {
                action: 'deleteTemplate',
                data: { _id: template._id }
              }
            });
            wx.hideLoading();
            util.showSuccess('删除成功');
            this.loadTemplates();
          } catch (err) {
            wx.hideLoading();
            util.showError('删除失败');
          }
        }
      }
    });
  },

  // 阻止冒泡
  preventBubble: function () {}
});
