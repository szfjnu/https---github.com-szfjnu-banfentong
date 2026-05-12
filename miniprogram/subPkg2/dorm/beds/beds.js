// pages/dorm/beds/beds.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    roomId: '',
    roomInfo: null,

    totalBeds: 0,
    occupiedBeds: 0,
    availableBeds: 0,

    beds: [],
    loading: false,

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

      const bedsWithStudents = await Promise.all(beds.map(async (bed) => {
        let student = null;

        console.log('处理床位:', bed.bed_number, 'occupied:', bed.occupied, 'student_id:', bed.student_id);

        if (bed.occupied === true && bed.student_id && bed.student_id.trim() !== '') {
          try {
            console.log('获取床位学生的信息，学生ID:', bed.student_id);
            let studentRes = await db.collection('students')
              .where({ _id: bed.student_id })
              .limit(1)
              .get();
            if (!studentRes.data || studentRes.data.length === 0) {
              studentRes = await db.collection('students')
                .where({ student_id: bed.student_id })
                .limit(1)
                .get();
            }
            if (studentRes.data && studentRes.data.length > 0) {
              student = studentRes.data[0];
            }
            console.log('学生信息:', student);
          } catch (err) {
            console.error('获取学生信息失败:', err);
            student = null;
          }
        }

        return {
          ...bed,
          student
        };
      }));

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

  onViewDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    const bed = this.data.beds.find(b => b._id === id);

    if (bed && bed.occupied && bed.student) {
      wx.navigateTo({
        url: `/subPkg1/student/detail/detail?id=${bed.student._id}`
      });
    }
  },

  onAssign: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPkg2/dorm/beds/assign/assign?bed_id=${id}`
    });
  },

  onRelease: function (e) {
    const id = e.currentTarget.dataset.id;
    const bed = this.data.beds.find(b => b._id === id);

    if (bed && bed.occupied && bed.student) {
      wx.showModal({
        title: '确认释放',
        content: `确定要释放床位 ${bed.bed_number} 吗？学生 ${bed.student.name} 将不再居住于此。`,
        success: async (res) => {
          if (res.confirm) {
            await this.releaseBed(bed.student._id);
          }
        }
      });
    }
  },

  releaseBed: async function (studentDocId) {
    try {
      console.log('开始释放床位，学生文档ID:', studentDocId);

      wx.showLoading({ title: '释放中...' });

      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: {
          action: 'releaseBed',
          data: { student_doc_id: studentDocId }
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        const tipMsg = res.result.data && res.result.data.repaired
          ? '释放成功（床位数据异常已自动修复）'
          : '释放成功';
        wx.showToast({
          title: tipMsg,
          icon: 'success'
        });

        setTimeout(() => {
          console.log('重新加载床位列表');
          this.loadBeds();
        }, 500);
      } else {
        wx.showToast({
          title: res.result?.message || '释放失败',
          icon: 'none'
        });
      }

    } catch (err) {
      console.error('释放失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '释放失败: ' + err.message,
        icon: 'none'
      });
    }
  },

  onPullDownRefresh: function () {
    this.loadBeds().then(() => {
      wx.stopPullDownRefresh();
    });
  }
});
