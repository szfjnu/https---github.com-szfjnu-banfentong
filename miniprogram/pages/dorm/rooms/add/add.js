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

    canSubmit: false
  },

  onLoad: function (options) {
    if (options.building_id) {
      this.setData({
        buildingId: options.building_id
      });
      this.loadBuilding(options.building_id);
    }

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
    const { formData, editingRoom, buildingId } = this.data;

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
        class_id: app.globalData.classId || '',
        updated_at: db.serverDate()
      };

      if (editingRoom) {
        // 更新房间
        await db.collection('dorm_rooms').doc(editingRoom._id).update({
          data: roomData
        });
      } else {
        // 新增房间
        roomData.building_id = buildingId;
        roomData.created_at = db.serverDate();
        roomData.created_by = app.globalData.openid;

        const roomRes = await db.collection('dorm_rooms').add({
          data: roomData
        });

        // 自动创建床位
        const bedCount = parseInt(formData.bed_count);
        const buildingInfo = this.data.buildingInfo;
        const bedPrefix = `${buildingInfo.campus}-${buildingInfo.building_name}-${formData.room_number}`;

        for (let i = 1; i <= bedCount; i++) {
          const bedData = {
            building_id: buildingId,
            room_id: roomRes._id,
            bed_number: `${bedPrefix}-${i}`,
            bed_index: i,
            occupied: false,
            student_id: '',
            class_id: app.globalData.classId || '',
            created_at: db.serverDate(),
            updated_at: db.serverDate()
          };

          await db.collection('dorm_beds').add({
            data: bedData
          });
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
