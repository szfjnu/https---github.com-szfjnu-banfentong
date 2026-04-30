// pages/dorm/buildings/add/add.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    editingBuilding: null,

    formData: {
      campus: '',
      building_name: '',
      building_code: '',
      floor_count: '',
      description: ''
    },

    canSubmit: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.loadBuilding(options.id);
    }
  },

  // 加载楼栋信息
  loadBuilding: async function (id) {
    try {
      wx.showLoading({ title: '加载中...' });

      const res = await db.collection('dorm_buildings').doc(id).get();
      const building = res.data;

      if (building) {
        this.setData({
          editingBuilding: building,
          formData: {
            campus: building.campus || '',
            building_name: building.building_name || '',
            building_code: building.building_code || '',
            floor_count: building.floor_count || '',
            description: building.description || ''
          },
          canSubmit: true
        });

        wx.setNavigationBarTitle({
          title: '编辑楼栋'
        });
      }

      wx.hideLoading();
    } catch (err) {
      console.error('加载楼栋失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 输入变化
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;

    this.setData({
      [`formData.${field}`]: value
    });

    this.validateForm();
  },

  // 验证表单
  validateForm: function () {
    const { formData } = this.data;

    const canSubmit = formData.campus.trim() && formData.building_name.trim() && formData.building_code.trim();

    this.setData({
      canSubmit
    });
  },

  // 取消
  onCancel: function () {
    wx.navigateBack();
  },

  // 提交
  onSubmit: async function () {
    const { formData, editingBuilding } = this.data;

    if (!formData.campus.trim()) {
      wx.showToast({
        title: '请输入所属校区',
        icon: 'none'
      });
      return;
    }

    if (!formData.building_name.trim()) {
      wx.showToast({
        title: '请输入楼栋名称',
        icon: 'none'
      });
      return;
    }

    if (!formData.building_code.trim()) {
      wx.showToast({
        title: '请输入楼栋编号',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });

      const buildingData = {
        campus: formData.campus.trim(),
        building_name: formData.building_name.trim(),
        building_code: formData.building_code.trim(),
        floor_count: parseInt(formData.floor_count) || 0,
        description: formData.description.trim(),
        class_id: app.globalData.classId || '',
        updated_at: db.serverDate()
      };

      if (editingBuilding) {
        // 更新
        await db.collection('dorm_buildings').doc(editingBuilding._id).update({
          data: buildingData
        });
      } else {
        // 新增
        buildingData.created_at = db.serverDate();
        buildingData.created_by = app.globalData.openid;

        await db.collection('dorm_buildings').add({
          data: buildingData
        });
      }

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);

    } catch (err) {
      console.error('保存失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  }
});
