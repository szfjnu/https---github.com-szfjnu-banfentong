// pages/dorm/beds/beds.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    roomId: '',
    roomInfo: null,

    // 统计
    totalBeds: 0,
    occupiedBeds: 0,
    availableBeds: 0,

    // 床位列表
    beds: [],
    loading: false,

    // 权限
    isAdmin: false
  },

  onLoad: function (options) {
    if (options.room_id) {
      this.setData({
        roomId: options.room_id,
        isAdmin: app.globalData.isAdmin || false
      });
      this.loadRoom();
      this.loadBeds();
    }
  },

  // 加载房间信息
  loadRoom: async function () {
    try {
      const res = await db.collection('dorm_rooms').doc(this.data.roomId).get();
      const room = res.data;

      if (room) {
        this.setData({
          roomInfo: room
        });

        wx.setNavigationBarTitle({
          title: `${room.room_number}室 - 床位`
        });
      }
    } catch (err) {
      console.error('加载房间失败:', err);
    }
  },

  // 加载床位列表
  loadBeds: async function () {
    try {
      this.setData({ loading: true });

      const { roomId } = this.data;

      console.log('加载床位列表，房间ID:', roomId);

      const res = await db.collection('dorm_beds')
        .where({ room_id: roomId })
        .orderBy('bed_index', 'asc')
        .get();

      const beds = res.data || [];
      console.log('床位列表:', beds);

      if (beds.length === 0) {
        console.log('没有找到床位数据');
        wx.showToast({
          title: '暂无床位数据',
          icon: 'none'
        });
      }

      // 获取每个床位的学生信息
      const bedsWithStudents = await Promise.all(beds.map(async (bed) => {
        let student = null;

        console.log('处理床位:', bed.bed_number, 'occupied:', bed.occupied, 'student_id:', bed.student_id);

        // 只有当 occupied 为 true 且 student_id 不为空时才获取学生信息
        if (bed.occupied === true && bed.student_id && bed.student_id.trim() !== '') {
          try {
            console.log('获取床位学生的信息，学生ID:', bed.student_id);
            const studentRes = await db.collection('students').doc(bed.student_id).get();
            student = studentRes.data;
            console.log('学生信息:', student);
          } catch (err) {
            console.error('获取学生信息失败:', err);
            // 如果获取学生失败，将床位标记为空闲
            student = null;
          }
        }

        return {
          ...bed,
          student
        };
      }));

      // 计算统计数据
      const totalBeds = bedsWithStudents.length;
      const occupiedBeds = bedsWithStudents.filter(b => b.occupied).length;
      const availableBeds = totalBeds - occupiedBeds;

      console.log('床位统计:', { totalBeds, occupiedBeds, availableBeds });

      this.setData({
        beds: bedsWithStudents,
        totalBeds,
        occupiedBeds,
        availableBeds,
        loading: false
      });

    } catch (err) {
      console.error('加载床位失败:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败: ' + err.message,
        icon: 'none'
      });
    }
  },

  // 查看详情
  onViewDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    const bed = this.data.beds.find(b => b._id === id);

    if (bed && bed.occupied && bed.student) {
      wx.navigateTo({
        url: `/pages/student/detail/detail?id=${bed.student._id}`
      });
    }
  },

  // 分配床位
  onAssign: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/dorm/beds/assign/assign?bed_id=${id}`
    });
  },

  // 释放床位
  onRelease: function (e) {
    const id = e.currentTarget.dataset.id;
    const bed = this.data.beds.find(b => b._id === id);

    if (bed && bed.occupied && bed.student) {
      wx.showModal({
        title: '确认释放',
        content: `确定要释放床位 ${bed.bed_number} 吗？学生 ${bed.student.name} 将不再居住于此。`,
        success: async (res) => {
          if (res.confirm) {
            await this.releaseBed(id, bed.student_id);
          }
        }
      });
    }
  },

  // 释放床位
  releaseBed: async function (bedId, studentId) {
    try {
      console.log('开始释放床位');
      console.log('床位ID:', bedId);
      console.log('学生ID:', studentId);

      wx.showLoading({ title: '释放中...' });

      // 更新床位状态
      console.log('更新床位状态');
      await db.collection('dorm_beds').doc(bedId).update({
        data: {
          occupied: false,
          student_id: '',
          updated_at: db.serverDate()
        }
      });
      console.log('床位状态更新成功');

      // 验证床位状态是否已更新
      const bedCheck = await db.collection('dorm_beds').doc(bedId).get();
      console.log('验证床位状态:', bedCheck.data);

      // 更新学生宿舍信息
      console.log('清空学生宿舍信息');
      await db.collection('students').doc(studentId).update({
        data: {
          is_boarding: false,
          dorm_info: {},
          dorm_building_id: '',
          dorm_room_id: '',
          dorm_bed_id: '',
          updated_at: db.serverDate()
        }
      });
      console.log('学生宿舍信息清空成功');

      wx.hideLoading();
      wx.showToast({
        title: '释放成功',
        icon: 'success'
      });

      // 延迟一下再重新加载，确保数据库更新完成
      setTimeout(() => {
        console.log('重新加载床位列表');
        this.loadBeds();
      }, 500);

    } catch (err) {
      console.error('释放失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '释放失败: ' + err.message,
        icon: 'none'
      });
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadBeds().then(() => {
      wx.stopPullDownRefresh();
    });
  }
});
