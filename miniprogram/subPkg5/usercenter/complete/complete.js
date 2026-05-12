const app = getApp();

Page({
  data: {
    loading: true,
    studentDocId: '',
    studentName: '',
    enrollment_date: '',
    date_of_birth: '',
    political_status: '',
    is_boarding: false,
    dorm_building: '',
    dorm_room: '',
    dorm_bed: '',
    ethnicity: '',
    phone_number: '',
    parent_phone_number: '',
    home_address: '',

    politicalOptions: ['群众', '共青团员', '中共预备党员', '中共党员'],
    showPoliticalPicker: false,

    ethnicityOptions: ['汉族', '蒙古族', '回族', '藏族', '维吾尔族', '苗族', '彝族', '壮族', '布依族', '朝鲜族', '满族', '侗族', '瑶族', '白族', '土家族', '哈尼族', '哈萨克族', '傣族', '黎族', '傈僳族', '佤族', '畲族', '拉祜族', '水族', '东乡族', '纳西族', '景颇族', '柯尔克孜族', '土族', '达斡尔族', '仫佬族', '羌族', '布朗族', '撒拉族', '毛南族', '仡佬族', '锡伯族', '阿昌族', '普米族', '塔吉克族', '怒族', '乌孜别克族', '俄罗斯族', '鄂温克族', '德昂族', '保安族', '裕固族', '京族', '塔塔尔族', '独龙族', '鄂伦春族', '赫哲族', '门巴族', '珞巴族', '基诺族', '其他'],
    showEthnicityPicker: false,

    incompleteCount: 0
  },

  onLoad: function () {
    this.loadStudentInfo();
  },

  loadStudentInfo: async function () {
    const studentId = app.globalData.student_id;
    if (!studentId) {
      wx.showToast({ title: '未找到学生信息', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    try {
      const db = wx.cloud.database();
      let res = await db.collection('students')
        .where({ student_id: studentId })
        .limit(1)
        .get();

      if (!res.data || res.data.length === 0) {
        res = await db.collection('students')
          .where({ _openid: app.globalData.openid })
          .limit(1)
          .get();
      }

      if (!res.data || res.data.length === 0) {
        wx.showToast({ title: '未找到学生记录', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const student = res.data[0];
      const dormInfo = student.dorm_info || {};

      this.setData({
        studentDocId: student._id,
        studentName: student.name || '',
        enrollment_date: student.enrollment_date || '',
        date_of_birth: student.date_of_birth || '',
        political_status: student.political_status || '',
        is_boarding: student.is_boarding || false,
        dorm_building: dormInfo.building || '',
        dorm_room: dormInfo.room || '',
        dorm_bed: dormInfo.bed || '',
        ethnicity: student.ethnicity || '',
        phone_number: student.phone_number || '',
        parent_phone_number: student.parent_phone_number || '',
        home_address: student.home_address || '',
        previousIsBoarding: student.is_boarding || false,
        previousDormBedId: student.dorm_bed_id || '',
        loading: false
      });

      this.calcIncompleteCount();
    } catch (err) {
      console.error('加载学生信息失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  calcIncompleteCount: function () {
    const d = this.data;
    const fields = [
      d.enrollment_date, d.date_of_birth, d.political_status,
      d.is_boarding ? 'yes' : '',
      d.is_boarding && d.dorm_building ? d.dorm_building : (!d.is_boarding ? 'skip' : ''),
      d.is_boarding && d.dorm_room ? d.dorm_room : (!d.is_boarding ? 'skip' : ''),
      d.is_boarding && d.dorm_bed ? d.dorm_bed : (!d.is_boarding ? 'skip' : ''),
      d.ethnicity, d.phone_number, d.parent_phone_number, d.home_address
    ];
    let count = 0;
    fields.forEach(f => {
      if (f === '' || f === undefined || f === null) count++;
    });
    this.setData({ incompleteCount: count });
  },

  onEnrollmentDateChange: function (e) {
    this.setData({ enrollment_date: e.detail.value });
  },

  onDateOfBirthChange: function (e) {
    this.setData({ date_of_birth: e.detail.value });
  },

  onPoliticalTap: function () {
    this.setData({ showPoliticalPicker: true });
  },

  onPoliticalConfirm: function (e) {
    const idx = e.detail.value;
    this.setData({
      political_status: this.data.politicalOptions[idx],
      showPoliticalPicker: false
    });
  },

  onPoliticalCancel: function () {
    this.setData({ showPoliticalPicker: false });
  },

  onBoardingChange: function (e) {
    this.setData({ is_boarding: e.detail.value });
  },

  onDormBuildingInput: function (e) {
    this.setData({ dorm_building: e.detail.value });
  },

  onDormRoomInput: function (e) {
    this.setData({ dorm_room: e.detail.value });
  },

  onDormBedInput: function (e) {
    this.setData({ dorm_bed: e.detail.value });
  },

  onEthnicityTap: function () {
    this.setData({ showEthnicityPicker: true });
  },

  onEthnicityConfirm: function (e) {
    const idx = e.detail.value;
    this.setData({
      ethnicity: this.data.ethnicityOptions[idx],
      showEthnicityPicker: false
    });
  },

  onEthnicityCancel: function () {
    this.setData({ showEthnicityPicker: false });
  },

  onPhoneNumberInput: function (e) {
    this.setData({ phone_number: e.detail.value });
  },

  onParentPhoneInput: function (e) {
    this.setData({ parent_phone_number: e.detail.value });
  },

  onHomeAddressInput: function (e) {
    this.setData({ home_address: e.detail.value });
  },

  onSave: async function () {
    const d = this.data;
    if (!d.studentDocId) {
      wx.showToast({ title: '无学生记录', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const needRelease = d.previousIsBoarding && !d.is_boarding && d.previousDormBedId;

      if (d.is_boarding && d.dorm_building && d.dorm_room && d.dorm_bed) {
        const buildingsRes = await wx.cloud.callFunction({
          name: 'dormSyncManager',
          data: { action: 'getDormCandidates', data: { level: 'buildings' } }
        });

        if (buildingsRes.result && buildingsRes.result.success) {
          const buildings = buildingsRes.result.data || [];
          const matchedBuilding = buildings.find(b => b.building_name === d.dorm_building);

          if (matchedBuilding) {
            const roomsRes = await wx.cloud.callFunction({
              name: 'dormSyncManager',
              data: { action: 'getDormCandidates', data: { level: 'rooms', building_id: matchedBuilding._id } }
            });

            if (roomsRes.result && roomsRes.result.success) {
              const rooms = roomsRes.result.data || [];
              const matchedRoom = rooms.find(r => r.room_number === d.dorm_room);

              if (matchedRoom) {
                const bedsRes = await wx.cloud.callFunction({
                  name: 'dormSyncManager',
                  data: { action: 'getDormCandidates', data: { level: 'beds', room_id: matchedRoom._id } }
                });

                if (bedsRes.result && bedsRes.result.success) {
                  const beds = bedsRes.result.data || [];
                  const matchedBed = beds.find(b => String(b.bed_index) === String(d.dorm_bed));

                  if (matchedBed) {
                    wx.showLoading({ title: '保存中...' });

                    const syncRes = await wx.cloud.callFunction({
                      name: 'dormSyncManager',
                      data: {
                        action: 'syncDormInfo',
                        data: {
                          student_doc_id: d.studentDocId,
                          building_id: matchedBuilding._id,
                          room_id: matchedRoom._id,
                          bed_id: matchedBed._id,
                          force_replace: false
                        }
                      }
                    });

                    if (!syncRes.result || !syncRes.result.success) {
                      wx.hideLoading();
                      this.setData({ loading: false });
                      wx.showToast({
                        title: syncRes.result?.message || '住宿信息同步失败',
                        icon: 'none'
                      });
                      return;
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (needRelease) {
        wx.showLoading({ title: '保存中...' });
        const releaseRes = await wx.cloud.callFunction({
          name: 'dormSyncManager',
          data: { action: 'releaseBed', data: { student_doc_id: d.studentDocId } }
        });
        if (!releaseRes.result || !releaseRes.result.success) {
          wx.hideLoading();
          this.setData({ loading: false });
          wx.showToast({ title: releaseRes.result?.message || '退宿失败', icon: 'none' });
          return;
        }
      }

      const updateData = {
        _id: d.studentDocId,
        enrollment_date: d.enrollment_date,
        date_of_birth: d.date_of_birth,
        political_status: d.political_status,
        is_boarding: d.is_boarding,
        ethnicity: d.ethnicity,
        phone_number: d.phone_number,
        parent_phone_number: d.parent_phone_number,
        home_address: d.home_address
      };

      wx.showLoading({ title: '保存中...' });
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'updateStudentInfo',
          data: {
            ...updateData,
            operation_type: 'info_completion'
          }
        }
      });

      wx.hideLoading();
      this.setData({ loading: false });

      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ loading: false });
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  }
});
