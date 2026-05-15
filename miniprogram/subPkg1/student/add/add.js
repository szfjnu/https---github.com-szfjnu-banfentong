// pages/student/add/add.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');
const { ETHNIC_GROUPS } = require('../../utils/ethnic-groups.js');

Page({
  data: {
    isEdit: false,
    studentId: '',
    studentDocId: '',
    loading: false,

    currentClassId: '',
    currentClassName: '',

    formData: {
      name: '',
      student_id: '',
      gender: '男',
      class_name: '',
      class_id: '',
      date_of_birth: '',
      ethnicity: '',
      political_status: '',
      enrollment_date: '',
      phone_number: '',
      parent_phone_number: '',
      home_address: '',
      is_boarding: false,
      dorm_info: {
        building: '',
        room: '',
        bed: ''
      },
      dorm_building_id: '',
      dorm_room_id: '',
      dorm_bed_id: '',
      position: '',
      initial_score: 100,
      current_score: 100
    },

    genderOptions: ['男', '女'],
    genderIndex: 0,
    politicalOptions: ['群众', '共青团员', '中共党员'],
    politicalIndex: 0,
    positionOptions: [],
    positionIndex: 0,

    ethnicityOptions: ETHNIC_GROUPS,
    ethnicityIndex: 0,

    dormLoading: false,
    dormDataLoaded: false,
    dormDataEmpty: false,
    buildingOptions: [],
    roomOptions: [],
    bedOptions: [],
    selectedBuildingIndex: -1,
    selectedRoomIndex: -1,
    selectedBedIndex: -1,
    selectedBuildingId: '',
    selectedRoomId: '',
    selectedBedId: '',
    previousIsBoarding: false
  },

  onLoad: function (options) {
    const currentClassId = app.globalData.class_id;

    if (!currentClassId) {
      wx.showModal({
        title: '提示',
        content: '请先选择一个班级',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    this.checkPermission();
    this.loadCurrentClass(currentClassId);
    this.loadPositionOptions(currentClassId);

    if (options.id) {
      this.setData({
        isEdit: true,
        studentId: options.id
      });
      this.loadStudentData(options.id);
    }
  },

  checkPermission: function () {
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'subject_teacher') {
      wx.showToast({
        title: '无权限操作',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
    }
  },

  loadPositionOptions: async function (classId) {
    const DEFAULT_POSITIONS = ['无', '班长', '班主任助理', '副班长', '学习委员', '纪律委员', '卫生委员', '组织委员', '体育委员', '文艺委员', '生活委员', '心理委员', '课代表'];
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'getClassPositions', data: { class_id: classId } }
      });
      if (res.result && res.result.success && res.result.data && res.result.data.length > 0) {
        this.setData({ positionOptions: res.result.data });
      } else {
        this.setData({ positionOptions: DEFAULT_POSITIONS });
      }
    } catch (err) {
      console.error('加载职位列表失败:', err);
      this.setData({ positionOptions: DEFAULT_POSITIONS });
    }
  },

  loadCurrentClass: async function (classId) {
    try {
      const res = await api.classApi.getClass(classId);
      if (res.data) {
        this.setData({
          currentClassId: classId,
          currentClassName: res.data.class_name,
          'formData.class_id': classId,
          'formData.class_name': res.data.class_name
        });
      }
    } catch (err) {
      console.error('加载班级信息失败:', err);
      util.showError('加载班级信息失败');
    }
  },

  loadStudentData: async function (studentId) {
    this.setData({ loading: true });

    try {
      const res = await api.studentApi.getStudentByStudentId(studentId);
      if (res.data && res.data.length > 0) {
        const student = res.data[0];

        console.log('加载学生数据, _id:', student._id, 'student_id:', student.student_id);

        const dormInfo = (student.dorm_info && typeof student.dorm_info === 'object' && (student.dorm_info.building || student.dorm_info.room || student.dorm_info.bed))
          ? student.dorm_info
          : { building: '', room: '', bed: '' };

        const formData = {
          name: student.name || '',
          student_id: student.student_id || '',
          gender: student.gender || '男',
          class_name: this.data.currentClassName || student.class_name || '',
          class_id: this.data.currentClassId || student.class_id || '',
          date_of_birth: this.formatDate(student.date_of_birth),
          ethnicity: student.ethnicity || '',
          political_status: student.political_status || '',
          enrollment_date: this.formatDate(student.enrollment_date),
          phone_number: student.phone_number || '',
          parent_phone_number: student.parent_phone_number || '',
          home_address: student.home_address || '',
          is_boarding: student.is_boarding || false,
          dorm_info: dormInfo,
          dorm_building_id: student.dorm_building_id || '',
          dorm_room_id: student.dorm_room_id || '',
          dorm_bed_id: student.dorm_bed_id || '',
          position: student.position || '',
          initial_score: student.initial_score || 100,
          current_score: student.current_score || 100
        };

        this.setData({
          studentDocId: student._id,
          formData,
          previousIsBoarding: formData.is_boarding
        });

        const genderIndex = this.data.genderOptions.indexOf(formData.gender);
        const politicalIndex = this.data.politicalOptions.indexOf(formData.political_status);
        let positionIndex = this.data.positionOptions.indexOf(formData.position);
        let finalPositionOptions = this.data.positionOptions;
        if (positionIndex < 0 && formData.position) {
          finalPositionOptions = [...this.data.positionOptions, formData.position];
          positionIndex = finalPositionOptions.length - 1;
        }

        this.setData({
          positionOptions: finalPositionOptions,
          genderIndex: genderIndex >= 0 ? genderIndex : 0,
          politicalIndex: politicalIndex >= 0 ? politicalIndex : 0,
          ethnicityIndex: this.data.ethnicityOptions.indexOf(formData.ethnicity),
          positionIndex: positionIndex >= 0 ? positionIndex : 0,
          loading: false
        });

        if (formData.is_boarding) {
          this.loadBuildings(formData.dorm_building_id, formData.dorm_room_id, formData.dorm_bed_id);
        }
      }
    } catch (err) {
      console.error('加载学生数据失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  formatDate: function (date) {
    if (!date) return '';
    if (typeof date === 'string') return date.split('T')[0];
    const d = new Date(date);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  onGenderChange: function (e) {
    const index = e.detail.value;
    this.setData({
      genderIndex: index,
      'formData.gender': this.data.genderOptions[index]
    });
  },

  onPoliticalChange: function (e) {
    const index = e.detail.value;
    this.setData({
      politicalIndex: index,
      'formData.political_status': this.data.politicalOptions[index]
    });
  },

  onEthnicityChange: function (e) {
    const index = e.detail.value;
    this.setData({
      ethnicityIndex: index,
      'formData.ethnicity': this.data.ethnicityOptions[index]
    });
  },

  onPositionChange: function (e) {
    const index = e.detail.value;
    this.setData({
      positionIndex: index,
      'formData.position': this.data.positionOptions[index]
    });
  },

  onDateChange: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`formData.${field}`]: e.detail.value
    });
  },

  onBoardingChange: function (e) {
    const newIsBoarding = e.detail.value;
    const oldIsBoarding = this.data.formData.is_boarding;

    if (oldIsBoarding && !newIsBoarding) {
      if (this.data.formData.dorm_bed_id) {
        wx.showModal({
          title: '确认退宿',
          content: '关闭住宿生标识将清除住宿信息并释放床位，确定继续？',
          success: (res) => {
            if (res.confirm) {
              this.setData({
                'formData.is_boarding': false
              });
            }
          }
        });
        return;
      }
    }

    this.setData({
      'formData.is_boarding': newIsBoarding
    });

    if (newIsBoarding && !this.data.dormDataLoaded) {
      this.loadBuildings();
    }
  },

  loadBuildings: async function (preSelectBuildingId, preSelectRoomId, preSelectBedId) {
    this.setData({ dormLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: { action: 'getDormCandidates', data: { level: 'buildings' } }
      });

      if (res.result && res.result.success) {
        const buildings = res.result.data || [];
        const buildingOptions = buildings.map(b => ({
          label: b.building_name,
          value: b._id
        }));

        const dormDataEmpty = buildingOptions.length === 0;
        this.setData({
          buildingOptions,
          dormDataEmpty,
          dormDataLoaded: true,
          dormLoading: false
        });

        if (preSelectBuildingId && !dormDataEmpty) {
          const idx = buildingOptions.findIndex(b => b.value === preSelectBuildingId);
          if (idx >= 0) {
            this.setData({ selectedBuildingIndex: idx, selectedBuildingId: preSelectBuildingId });
            await this.loadRooms(preSelectBuildingId, preSelectRoomId, preSelectBedId);
          }
        }
      } else {
        this.setData({ dormLoading: false, dormDataEmpty: true });
      }
    } catch (err) {
      console.error('加载楼栋列表失败:', err);
      this.setData({ dormLoading: false, dormDataEmpty: true });
    }
  },

  onBuildingChange: async function (e) {
    const index = parseInt(e.detail.value);
    if (index < 0 || index >= this.data.buildingOptions.length) return;

    const building = this.data.buildingOptions[index];
    this.setData({
      selectedBuildingIndex: index,
      selectedBuildingId: building.value,
      selectedRoomIndex: -1,
      selectedRoomId: '',
      selectedBedIndex: -1,
      selectedBedId: '',
      roomOptions: [],
      bedOptions: [],
      'formData.dorm_info.building': building.label,
      'formData.dorm_info.room': '',
      'formData.dorm_info.bed': '',
      'formData.dorm_room_id': '',
      'formData.dorm_bed_id': ''
    });

    await this.loadRooms(building.value);
  },

  loadRooms: async function (buildingId, preSelectRoomId, preSelectBedId) {
    this.setData({ dormLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: { action: 'getDormCandidates', data: { level: 'rooms', building_id: buildingId } }
      });

      if (res.result && res.result.success) {
        const rooms = res.result.data || [];
        const roomOptions = rooms.map(r => ({
          label: r.room_number + (r.floor ? ' (' + r.floor + '层)' : ''),
          value: r._id,
          room_number: r.room_number
        }));

        this.setData({ roomOptions, dormLoading: false });

        if (preSelectRoomId) {
          const idx = roomOptions.findIndex(r => r.value === preSelectRoomId);
          if (idx >= 0) {
            this.setData({ selectedRoomIndex: idx, selectedRoomId: preSelectRoomId });
            await this.loadBeds(preSelectRoomId, preSelectBedId);
          }
        }
      } else {
        this.setData({ roomOptions: [], dormLoading: false });
      }
    } catch (err) {
      console.error('加载房间列表失败:', err);
      this.setData({ roomOptions: [], dormLoading: false });
    }
  },

  onRoomChange: async function (e) {
    const index = parseInt(e.detail.value);
    if (index < 0 || index >= this.data.roomOptions.length) return;

    const room = this.data.roomOptions[index];
    this.setData({
      selectedRoomIndex: index,
      selectedRoomId: room.value,
      selectedBedIndex: -1,
      selectedBedId: '',
      bedOptions: [],
      'formData.dorm_info.room': room.room_number,
      'formData.dorm_info.bed': '',
      'formData.dorm_bed_id': ''
    });

    await this.loadBeds(room.value);
  },

  loadBeds: async function (roomId, preSelectBedId) {
    this.setData({ dormLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: { action: 'getDormCandidates', data: { level: 'beds', room_id: roomId } }
      });

      if (res.result && res.result.success) {
        const beds = res.result.data || [];
        const bedOptions = beds.map(b => ({
          label: b.bed_index + (b.occupied ? ' (已入住: ' + (b.student_name || '未知') + ')' : ' (空闲)'),
          value: b._id,
          bed_index: b.bed_index,
          occupied: b.occupied,
          student_id: b.student_id
        }));

        this.setData({ bedOptions, dormLoading: false });

        if (preSelectBedId) {
          const idx = bedOptions.findIndex(b => b.value === preSelectBedId);
          if (idx >= 0) {
            this.setData({ selectedBedIndex: idx, selectedBedId: preSelectBedId });
          }
        }
      } else {
        this.setData({ bedOptions: [], dormLoading: false });
      }
    } catch (err) {
      console.error('加载床位列表失败:', err);
      this.setData({ bedOptions: [], dormLoading: false });
    }
  },

  onBedChange: function (e) {
    const index = parseInt(e.detail.value);
    if (index < 0 || index >= this.data.bedOptions.length) return;

    const bed = this.data.bedOptions[index];

    if (bed.occupied && bed.student_id && bed.student_id !== this.data.studentDocId) {
      wx.showModal({
        title: '床位已被占用',
        content: `该床位已被${bed.label.match(/已入住: ([^)]+)/)?.[1] || '其他学生'}入住，确定要更换吗？`,
        success: (res) => {
          if (res.confirm) {
            this.selectBed(index, bed);
          }
        }
      });
      return;
    }

    this.selectBed(index, bed);
  },

  selectBed: function (index, bed) {
    this.setData({
      selectedBedIndex: index,
      selectedBedId: bed.value,
      'formData.dorm_info.bed': String(bed.bed_index),
      'formData.dorm_bed_id': bed.value
    });
  },

  onSubmit: async function (e) {
    const formData = this.data.formData;

    if (!formData.name.trim()) {
      util.showError('请输入学生姓名');
      return;
    }

    if (!formData.student_id.trim()) {
      util.showError('请输入学号');
      return;
    }

    if (!formData.class_id) {
      util.showError('请选择班级');
      return;
    }

    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const basicData = {
        name: formData.name,
        student_id: formData.student_id,
        gender: formData.gender,
        class_name: formData.class_name,
        class_id: formData.class_id,
        date_of_birth: formData.date_of_birth,
        ethnicity: formData.ethnicity,
        political_status: formData.political_status,
        enrollment_date: formData.enrollment_date,
        phone_number: formData.phone_number,
        parent_phone_number: formData.parent_phone_number,
        home_address: formData.home_address,
        is_boarding: formData.is_boarding,
        position: formData.position,
        initial_score: formData.initial_score,
        current_score: formData.current_score,
        updated_at: new Date().toISOString()
      };

      if (this.data.isEdit) {
        const needRelease = this.data.previousIsBoarding && !formData.is_boarding && this.data.formData.dorm_bed_id;
        const needSync = formData.is_boarding && this.data.selectedBedId;

        if (needRelease) {
          const releaseRes = await wx.cloud.callFunction({
            name: 'dormSyncManager',
            data: { action: 'releaseBed', data: { student_doc_id: this.data.studentDocId } }
          });
          if (!releaseRes.result || !releaseRes.result.success) {
            wx.hideLoading();
            util.showError(releaseRes.result?.message || '退宿失败');
            return;
          }
        }

        const updateRes = await wx.cloud.callFunction({
          name: 'manageUserCenter',
          data: { action: 'updateStudentInfo', data: { _id: this.data.studentDocId, ...basicData } }
        });
        if (!updateRes.result || !updateRes.result.success) {
          this.setData({ loading: false });
          util.showError(updateRes.result?.message || '更新失败');
          return;
        }

        if (needSync) {
          const syncRes = await wx.cloud.callFunction({
            name: 'dormSyncManager',
            data: {
              action: 'syncDormInfo',
              data: {
                student_doc_id: this.data.studentDocId,
                building_id: this.data.selectedBuildingId,
                room_id: this.data.selectedRoomId,
                bed_id: this.data.selectedBedId,
                force_replace: false
              }
            }
          });

          if (!syncRes.result || !syncRes.result.success) {
            if (syncRes.result && syncRes.result.code === 'BED_OCCUPIED') {
              this.setData({ loading: false });
              wx.showModal({
                title: '床位冲突',
                content: syncRes.result.message + '，是否强制替换？',
                success: async (modalRes) => {
                  if (modalRes.confirm) {
                    this.setData({ loading: true });
                    const forceRes = await wx.cloud.callFunction({
                      name: 'dormSyncManager',
                      data: {
                        action: 'syncDormInfo',
                        data: {
                          student_doc_id: this.data.studentDocId,
                          building_id: this.data.selectedBuildingId,
                          room_id: this.data.selectedRoomId,
                          bed_id: this.data.selectedBedId,
                          force_replace: true
                        }
                      }
                    });
                    if (!forceRes.result || !forceRes.result.success) {
                      this.setData({ loading: false });
                      util.showError(forceRes.result?.message || '同步失败');
                      return;
                    }
                    util.showSuccess('更新成功');
                    setTimeout(() => { wx.navigateBack(); }, 1500);
                  }
                }
              });
              return;
            }
            this.setData({ loading: false });
            util.showError(syncRes.result?.message || '住宿信息同步失败');
            return;
          }
        }

        util.showSuccess('更新成功');

      } else {
        basicData.created_at = new Date().toISOString();

        const checkRes = await db.collection('students')
          .where({
            student_id: formData.student_id,
            class_id: formData.class_id
          })
          .count();

        if (checkRes.total > 0) {
          this.setData({ loading: false });
          wx.showModal({
            title: '提示',
            content: '该学号已存在，是否继续添加？',
            success: async (res) => {
              if (res.confirm) {
                const addRes = await api.studentApi.addStudent(basicData);
                const newDocId = addRes && addRes._id ? addRes._id : '';

                if (formData.is_boarding && this.data.selectedBedId && newDocId) {
                  await wx.cloud.callFunction({
                    name: 'dormSyncManager',
                    data: {
                      action: 'syncDormInfo',
                      data: {
                        student_doc_id: newDocId,
                        building_id: this.data.selectedBuildingId,
                        room_id: this.data.selectedRoomId,
                        bed_id: this.data.selectedBedId,
                        force_replace: false
                      }
                    }
                  });
                }

                util.showSuccess('添加成功');
                setTimeout(() => { wx.navigateBack(); }, 1500);
              }
            }
          });
          return;
        }

        const addRes = await api.studentApi.addStudent(basicData);
        const newDocId = addRes && addRes._id ? addRes._id : '';

        if (formData.is_boarding && this.data.selectedBedId && newDocId) {
          await wx.cloud.callFunction({
            name: 'dormSyncManager',
            data: {
              action: 'syncDormInfo',
              data: {
                student_doc_id: newDocId,
                building_id: this.data.selectedBuildingId,
                room_id: this.data.selectedRoomId,
                bed_id: this.data.selectedBedId,
                force_replace: false
              }
            }
          });
        }

        util.showSuccess('添加成功');
      }

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('保存失败:', err);
      this.setData({ loading: false });
      util.showError('保存失败');
    }
  },

  onReset: function () {
    this.setData({
      formData: {
        name: '',
        student_id: '',
        gender: '男',
        class_name: this.data.currentClassName,
        class_id: this.data.currentClassId,
        date_of_birth: '',
        ethnicity: '',
        political_status: '',
        enrollment_date: '',
        phone_number: '',
        parent_phone_number: '',
        home_address: '',
        is_boarding: false,
        dorm_info: {
          building: '',
          room: '',
          bed: ''
        },
        dorm_building_id: '',
        dorm_room_id: '',
        dorm_bed_id: '',
        position: '',
        initial_score: 100,
        current_score: 100
      },
      genderIndex: 0,
      politicalIndex: 0,
      positionIndex: 0,
      buildingOptions: [],
      roomOptions: [],
      bedOptions: [],
      selectedBuildingIndex: -1,
      selectedRoomIndex: -1,
      selectedBedIndex: -1,
      selectedBuildingId: '',
      selectedRoomId: '',
      selectedBedId: '',
      dormDataEmpty: false,
      dormDataLoaded: false,
      previousIsBoarding: false
    });
  }
});
