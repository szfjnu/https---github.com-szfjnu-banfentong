// pages/dorm/beds/assign/assign.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    bedId: '',
    bedInfo: null,
    roomInfo: null,
    buildingInfo: null,
    classId: '',

    searchKeyword: '',
    students: [],
    loading: false
  },

  onLoad: function (options) {
    const classId = app.globalData.class_id || '';

    console.log('页面加载，检查班级ID:', classId);
    console.log('app.globalData:', app.globalData);

    if (!classId) {
      wx.showModal({
        title: '未选择班级',
        content: '请先选择班级才能分配宿舍',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    if (options.bed_id) {
      this.setData({
        bedId: options.bed_id
      });

      this.loadBed(options.bed_id).then(() => {
        this.loadStudents();
      });
    }
  },

  loadBed: async function (bedId) {
    try {
      const res = await db.collection('dorm_beds').doc(bedId).get();
      const bed = res.data;

      if (bed) {
        this.setData({
          bedInfo: bed
        });

        console.log('床位信息:', bed);

        if (bed.room_id) {
          const roomRes = await db.collection('dorm_rooms').doc(bed.room_id).get();
          if (roomRes.data) {
            this.setData({
              roomInfo: roomRes.data
            });
            console.log('房间信息:', roomRes.data);

            if (roomRes.data.building_id) {
              const buildingRes = await db.collection('dorm_buildings').doc(roomRes.data.building_id).get();
              if (buildingRes.data) {
                this.setData({
                  buildingInfo: buildingRes.data
                });
                console.log('楼栋信息:', buildingRes.data);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('加载床位失败:', err);
    }
  },

  loadStudents: async function () {
    try {
      this.setData({ loading: true });

      const classId = app.globalData.class_id || '';

      console.log('加载学生列表，班级ID:', classId);

      if (!classId) {
        console.error('班级ID为空，无法加载学生');
        this.setData({ loading: false });
        wx.showModal({
          title: '无法加载学生',
          content: '班级ID为空，请确保已登录并选择了班级',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
        return;
      }

      const cfRes = await wx.cloud.callFunction({
        name: 'manageAuthorization',
        data: { action: 'getStudents', data: { class_id: classId } }
      });
      let students = (cfRes.result && cfRes.result.success) ? cfRes.result.data : [];

      if (this.data.searchKeyword.trim()) {
        const keyword = this.data.searchKeyword.trim().toLowerCase();
        students = students.filter(s =>
          (s.name || '').toLowerCase().includes(keyword) ||
          (s.student_id || '').toLowerCase().includes(keyword)
        );
      }

      students.sort((a, b) => (a.student_id || '').localeCompare(b.student_id || ''));

      console.log('学生列表:', students);
      console.log('学生数量:', students.length);

      this.setData({
        students,
        loading: false
      });

      if (students.length === 0) {
        wx.showModal({
          title: '提示',
          content: '当前班级暂无学生数据，请先导入学生信息',
          showCancel: false
        });
      }

    } catch (err) {
      console.error('加载学生失败:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败: ' + err.message,
        icon: 'none'
      });
    }
  },

  onSearchInput: function (e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  onSearch: function () {
    this.loadStudents();
  },

  onSelectStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const student = this.data.students.find(s => s._id === studentId);

    if (!student) return;

    const hasDorm = student.dorm_info &&
      typeof student.dorm_info === 'object' &&
      (student.dorm_info.building || student.dorm_info.room || student.dorm_info.bed);

    if (hasDorm) {
      wx.showModal({
        title: '提示',
        content: `该学生已入住 ${student.dorm_info.building || ''}-${student.dorm_info.room || ''}-${student.dorm_info.bed || ''}，确定要更换床位吗？`,
        success: (res) => {
          if (res.confirm) {
            this.assignBed(studentId);
          }
        }
      });
    } else {
      this.assignBed(studentId);
    }
  },

  assignBed: async function (studentId) {
    const { bedId, bedInfo, roomInfo, buildingInfo } = this.data;

    console.log('开始分配床位');
    console.log('床位ID:', bedId);
    console.log('学生ID:', studentId);

    try {
      wx.showLoading({ title: '分配中...' });

      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: {
          action: 'syncDormInfo',
          data: {
            student_doc_id: studentId,
            building_id: buildingInfo._id,
            room_id: roomInfo._id,
            bed_id: bedId,
            force_replace: true
          }
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({
          title: '分配成功',
          icon: 'success'
        });

        const pages = getCurrentPages();
        if (pages.length >= 2) {
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.loadBeds) {
            console.log('通知上一页刷新床位列表');
            prevPage.loadBeds();
          }
        }

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({
          title: res.result?.message || '分配失败',
          icon: 'none'
        });
      }

    } catch (err) {
      console.error('分配失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '分配失败: ' + err.message,
        icon: 'none'
      });
    }
  }
});
