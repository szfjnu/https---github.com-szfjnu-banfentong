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
    // 首先检查班级ID
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

      // 先加载床位信息
      this.loadBed(options.bed_id).then(() => {
        // 床位信息加载完成后再加载学生列表
        this.loadStudents();
      });
    }
  },

  // 加载床位信息
  loadBed: async function (bedId) {
    try {
      const res = await db.collection('dorm_beds').doc(bedId).get();
      const bed = res.data;

      if (bed) {
        this.setData({
          bedInfo: bed
        });

        console.log('床位信息:', bed);

        // 加载房间信息
        if (bed.room_id) {
          const roomRes = await db.collection('dorm_rooms').doc(bed.room_id).get();
          if (roomRes.data) {
            this.setData({
              roomInfo: roomRes.data
            });
            console.log('房间信息:', roomRes.data);

            // 加载楼栋信息
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

  // 加载学生列表
  loadStudents: async function () {
    try {
      this.setData({ loading: true });

      // 直接从全局变量获取班级ID
      const classId = app.globalData.class_id || '';

      console.log('加载学生列表，班级ID:', classId);
      console.log('app.globalData.class_id:', app.globalData.class_id);
      console.log('app.globalData.userInfo:', app.globalData.userInfo);
      console.log('app.globalData.classId:', app.globalData.classId);

      if (!classId) {
        console.error('班级ID为空，无法加载学生');
        console.error('请检查是否已登录并选择班级');
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

      let query = db.collection('students').where({
        class_id: classId
      });

      // 搜索
      if (this.data.searchKeyword.trim()) {
        const keyword = this.data.searchKeyword.trim();
        query = query.where(_.or([
          { name: db.RegExp({ regexp: keyword, options: 'i' }) },
          { student_id: db.RegExp({ regexp: keyword, options: 'i' }) }
        ]));
      }

      const res = await query
        .orderBy('student_id', 'asc')
        .limit(50)
        .get();

      const students = res.data || [];
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

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 搜索
  onSearch: function () {
    this.loadStudents();
  },

  // 选择学生
  onSelectStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const student = this.data.students.find(s => s._id === studentId);

    if (!student) return;

    // 检查学生是否已入住
    if (student.dorm_info) {
      wx.showModal({
        title: '提示',
        content: `该学生已入住 ${student.dorm_info}，确定要更换床位吗？`,
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

  // 分配床位
  assignBed: async function (studentId) {
    const { bedId, bedInfo, roomInfo, buildingInfo } = this.data;

    console.log('开始分配床位');
    console.log('床位ID:', bedId);
    console.log('床位信息:', bedInfo);
    console.log('房间信息:', roomInfo);
    console.log('楼栋信息:', buildingInfo);
    console.log('学生ID:', studentId);

    try {
      wx.showLoading({ title: '分配中...' });

      // 如果学生之前有床位，先释放
      const student = this.data.students.find(s => s._id === studentId);
      if (student && student.dorm_bed_id) {
        console.log('学生之前有床位，需要先释放:', student.dorm_bed_id);
        await db.collection('dorm_beds').doc(student.dorm_bed_id).update({
          data: {
            occupied: false,
            student_id: '',
            updated_at: db.serverDate()
          }
        });
        console.log('旧床位释放成功');
      }

      // 更新床位状态
      console.log('更新床位状态');
      await db.collection('dorm_beds').doc(bedId).update({
        data: {
          occupied: true,
          student_id: studentId,
          updated_at: db.serverDate()
        }
      });
      console.log('床位状态更新成功');

      // 验证床位状态是否已更新
      const bedCheck = await db.collection('dorm_beds').doc(bedId).get();
      console.log('验证床位状态:', bedCheck.data);

      // 更新学生宿舍信息
      console.log('更新学生宿舍信息');

      // 从床位号中提取床位编号（例如："大坦沙-8C栋-301-1" 提取 "1"）
      const bedNumber = bedInfo.bed_number.split('-').pop();

      await db.collection('students').doc(studentId).update({
        data: {
          is_boarding: true,
          dorm_info: {
            building: buildingInfo.building_name,
            room: roomInfo.room_number,
            bed: bedNumber
          },
          dorm_building_id: buildingInfo._id,
          dorm_room_id: roomInfo._id,
          dorm_bed_id: bedId,
          updated_at: db.serverDate()
        }
      });
      console.log('学生宿舍信息更新成功');

      wx.hideLoading();
      wx.showToast({
        title: '分配成功',
        icon: 'success'
      });

      // 通知上一页刷新
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
