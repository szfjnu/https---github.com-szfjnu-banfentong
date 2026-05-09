// pages/dorm/rooms/rooms.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    buildingId: '',
    buildingInfo: null,

    // 统计
    totalRooms: 0,
    totalBeds: 0,
    occupiedBeds: 0,

    // 楼层筛选
    floors: [],
    selectedFloor: 'all',

    // 房间列表
    rooms: [],
    loading: false,

    // 权限
    isAdmin: false
  },

  onLoad: function (options) {
    if (options.building_id) {
      this.setData({
        buildingId: options.building_id,
        isAdmin: app.globalData.isAdmin || false
      });
      this.loadBuilding();
      this.loadRooms();
    }
  },

  // 加载楼栋信息
  loadBuilding: async function () {
    try {
      const res = await db.collection('dorm_buildings').doc(this.data.buildingId).get();
      const building = res.data;

      if (building) {
        this.setData({
          buildingInfo: building
        });

        wx.setNavigationBarTitle({
          title: `${building.building_name} - 房间`
        });
      }
    } catch (err) {
      console.error('加载楼栋失败:', err);
    }
  },

  // 加载房间列表
  loadRooms: async function () {
    try {
      this.setData({ loading: true });

      const { buildingId, selectedFloor } = this.data;

      console.log('加载房间列表，楼栋ID:', buildingId, '楼层:', selectedFloor);

      // 先检查楼栋是否存在
      try {
        const buildingRes = await db.collection('dorm_buildings').doc(buildingId).get();
        console.log('楼栋信息:', buildingRes.data);
      } catch (err) {
        console.error('楼栋不存在:', err);
        this.setData({ loading: false });
        wx.showToast({
          title: '楼栋不存在',
          icon: 'none'
        });
        return;
      }

      // 构建查询条件
      let query = {
        building_id: buildingId
      };

      if (selectedFloor !== 'all') {
        query.floor = parseInt(selectedFloor);
      }

      console.log('查询条件:', query);

      const res = await db.collection('dorm_rooms')
        .where(query)
        .orderBy('floor', 'asc')
        .orderBy('room_number', 'asc')
        .get();

      const rooms = res.data || [];
      console.log('房间列表:', rooms);

      if (rooms.length === 0) {
        console.log('没有找到房间数据');

        // 查询所有房间，检查class_id是否匹配
        const allRoomsRes = await db.collection('dorm_rooms')
          .where({ class_id: app.globalData.classId || '' })
          .get();

        console.log('所有房间数据（不限制楼栋）:', allRoomsRes.data);

        wx.showModal({
          title: '提示',
          content: '该楼栋暂无房间，是否立即添加？',
          success: (res) => {
            if (res.confirm) {
              this.onAdd();
            }
          }
        });
      }

      // 获取每个房间的床位信息
      const roomsWithBeds = await Promise.all(rooms.map(async (room) => {
        try {
          console.log('处理房间:', room);

          const bedsRes = await db.collection('dorm_beds')
            .where({ room_id: room._id })
            .orderBy('bed_number', 'asc')
            .get();

          const beds = bedsRes.data || [];
          console.log(`房间 ${room.room_number} 的床位:`, beds);

          const bedsInfo = await Promise.all(beds.map(async (bed) => {
            let student_name = '';
            if (bed.occupied && bed.student_id && bed.student_id.trim() !== '') {
              try {
                const studentRes = await db.collection('students')
                  .where({ student_id: bed.student_id })
                  .field({ name: true })
                  .limit(1)
                  .get();
                if (studentRes.data && studentRes.data.length > 0) {
                  student_name = studentRes.data[0].name || '';
                }
              } catch (err) {
                console.error('获取床位学生姓名失败:', err);
              }
            }
            return { ...bed, student_name };
          }));

          const occupiedCount = bedsInfo.filter(b => b.occupied).length;
          const occupancyRate = bedsInfo.length > 0 ? occupiedCount / bedsInfo.length : 0;

          return {
            ...room,
            bed_count: bedsInfo.length,
            occupied_count: occupiedCount,
            occupancy_rate: occupancyRate,
            beds: bedsInfo
          };
        } catch (err) {
          console.error('获取床位信息失败:', err);
          return {
            ...room,
            bed_count: 0,
            occupied_count: 0,
            occupancy_rate: 0,
            beds: []
          };
        }
      }));

      // 计算统计数据
      const totalRooms = roomsWithBeds.length;
      const totalBeds = roomsWithBeds.reduce((sum, r) => sum + r.bed_count, 0);
      const occupiedBeds = roomsWithBeds.reduce((sum, r) => sum + r.occupied_count, 0);

      // 获取所有楼层
      const floors = [...new Set(roomsWithBeds.map(r => r.floor))].sort((a, b) => a - b);

      console.log('房间统计:', { totalRooms, totalBeds, occupiedBeds, floors });

      this.setData({
        rooms: roomsWithBeds,
        totalRooms,
        totalBeds,
        occupiedBeds,
        floors,
        loading: false
      });

    } catch (err) {
      console.error('加载房间失败:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败: ' + err.message,
        icon: 'none'
      });
    }
  },

  // 楼层变化
  onFloorChange: function (e) {
    const floor = e.currentTarget.dataset.floor;
    this.setData({
      selectedFloor: floor
    });
    this.loadRooms();
  },

  // 查看详情
  onViewDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/dorm/beds/beds?room_id=${id}`
    });
  },

  // 编辑房间
  onEdit: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/dorm/rooms/add/add?id=${id}&building_id=${this.data.buildingId}`
    });
  },

  // 删除房间
  onDelete: function (e) {
    const id = e.currentTarget.dataset.id;
    const room = this.data.rooms.find(r => r._id === id);

    wx.showModal({
      title: '确认删除',
      content: `确定要删除房间 ${room.room_number} 吗？删除后将无法恢复。`,
      success: async (res) => {
        if (res.confirm) {
          await this.deleteRoom(id);
        }
      }
    });
  },

  // 删除房间
  deleteRoom: async function (roomId) {
    try {
      wx.showLoading({ title: '删除中...' });

      const room = this.data.rooms.find(r => r._id === roomId);

      // 检查是否有学生入住
      if (room.occupied_count > 0) {
        wx.hideLoading();
        wx.showToast({
          title: '该房间还有学生居住，无法删除',
          icon: 'none'
        });
        return;
      }

      // 删除该房间的所有床位
      const bedsRes = await db.collection('dorm_beds')
        .where({ room_id: roomId })
        .get();

      for (const bed of bedsRes.data) {
        await db.collection('dorm_beds').doc(bed._id).remove();
      }

      // 删除房间
      await db.collection('dorm_rooms').doc(roomId).remove();

      wx.hideLoading();
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });

      // 重新加载
      this.loadRooms();

    } catch (err) {
      console.error('删除失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  // 添加房间
  onAdd: function () {
    wx.navigateTo({
      url: `/subPages/dorm/rooms/add/add?building_id=${this.data.buildingId}`
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadRooms().then(() => {
      wx.stopPullDownRefresh();
    });
  }
});
