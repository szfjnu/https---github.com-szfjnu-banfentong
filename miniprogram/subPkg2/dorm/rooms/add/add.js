// pages/dorm/rooms/add/add.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    buildingId: '',
    buildingInfo: null,
    editingRoom: null,

    formData: {
      room_number: '',
      floor: '',
      bed_count: '',
      description: ''
    },

    canSubmit: false,
    currentClassId: ''
  },

  onLoad: function (options) {
    if (options.building_id) {
      this.setData({
        buildingId: options.building_id
      });
      this.loadBuilding(options.building_id);
    }

    const classId = app.globalData.class_id || app.globalData.classId || options.class_id || '';
    this.setData({ currentClassId: classId });

    if (options.id) {
      this.loadRoom(options.id);
    }
  },

  // 加载楼栋信息
  loadBuilding: async function (buildingId) {
    try {
      const res = await db.collection('dorm_buildings').doc(buildingId).get();
      const building = res.data;

      if (building) {
        this.setData({
          buildingInfo: building
        });
      }
    } catch (err) {
      console.error('加载楼栋失败:', err);
    }
  },

  // 加载房间信息
  loadRoom: async function (roomId) {
    try {
      wx.showLoading({ title: '加载中...' });

      const res = await db.collection('dorm_rooms').doc(roomId).get();
      const room = res.data;

      if (room) {
        this.setData({
          editingRoom: room,
          formData: {
            room_number: room.room_number || '',
            floor: room.floor || '',
            bed_count: room.bed_count || '',
            description: room.description || ''
          },
          canSubmit: true
        });

        wx.setNavigationBarTitle({
          title: '编辑房间'
        });
      }

      wx.hideLoading();
    } catch (err) {
      console.error('加载房间失败:', err);
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

    const canSubmit = formData.room_number.trim() &&
                      formData.floor.trim() &&
                      formData.bed_count.trim();

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
    const { formData, editingRoom, buildingId, currentClassId } = this.data;

    if (!editingRoom && !currentClassId) {
      wx.showToast({ 
        title: '缺少班级信息，无法保存', 
        icon: 'none' 
      });
      return;
    }

    if (!formData.room_number.trim()) {
      wx.showToast({
        title: '请输入房间号',
        icon: 'none'
      });
      return;
    }

    if (!formData.floor.trim()) {
      wx.showToast({
        title: '请输入楼层',
        icon: 'none'
      });
      return;
    }

    if (!formData.bed_count.trim()) {
      wx.showToast({
        title: '请输入床位数',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });

      const roomData = {
        room_number: formData.room_number.trim(),
        floor: parseInt(formData.floor),
        bed_count: parseInt(formData.bed_count),
        description: formData.description.trim(),
        class_id: this.data.currentClassId || app.globalData.class_id || app.globalData.classId || '',
        updated_at: new Date().toISOString()
      };

      if (!editingRoom && !roomData.class_id) {
        wx.hideLoading();
        wx.showToast({ title: '请先选择班级', icon: 'none' });
        return;
      }

      if (editingRoom) {
        // 更新房间
        const res = await wx.cloud.callFunction({
          name: 'dormSyncManager',
          data: {
            action: 'updateRoom',
            data: { _id: editingRoom._id, ...roomData }
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '更新房间失败');
        }
      } else {
        // 新增房间和床位
        const buildingInfo = this.data.buildingInfo;

        const res = await wx.cloud.callFunction({
          name: 'dormSyncManager',
          data: {
            action: 'addRoomWithBeds',
            data: {
              room_data: {
                ...roomData,
                building_id: buildingId,
                created_by: app.globalData.openid
              },
              building_info: buildingInfo
            }
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '新增房间失败');
        }
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
