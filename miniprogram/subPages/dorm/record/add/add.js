// pages/dorm/record/add/add.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    loading: true,

    // 学期信息
    semesterId: '',
    semesterName: '',
    conversionRatio: 0, // 折算比例

    // 记录类型
    recordType: 'violation', // violation: 违规扣分, service: 服务加分

    // 选择方式
    selectMode: 'dorm', // dorm: 按宿舍, student: 按学生

    // 宿舍相关
    dormOptions: [],
    selectedDorm: '',
    selectedDormLabel: '',
    selectedDormMembers: [],
    isAllSelected: false,

    // 学生相关
    allStudents: [],
    filteredStudents: [],
    selectedStudents: [],
    searchKeyword: '',

    // 违规项目
    violationOptions: [
      { label: '晚归', value: 'late_return', defaultScore: -5 },
      { label: '未归', value: 'not_return', defaultScore: -10 },
      { label: '违规用电', value: 'illegal_electricity', defaultScore: -15 },
      { label: '卫生不合格', value: 'poor_hygiene', defaultScore: -3 },
      { label: '吵闹扰民', value: 'noise', defaultScore: -5 },
      { label: '其他违规', value: 'other', defaultScore: -5 }
    ],
    selectedViolation: '',
    selectedViolationLabel: '',

    // 服务项目
    serviceOptions: [
      { label: '卫生优秀', value: 'excellent_hygiene', defaultScore: 3 },
      { label: '文明宿舍', value: 'civilized_dorm', defaultScore: 5 },
      { label: '志愿服务', value: 'volunteer_service', defaultScore: 5 },
      { label: '帮助他人', value: 'help_others', defaultScore: 3 },
      { label: '其他服务', value: 'other', defaultScore: 3 }
    ],
    selectedService: '',
    selectedServiceLabel: '',

    // 积分值
    scoreValue: '',

    // 关联设置
    linkToPersonal: true,

    // 备注
    remark: '',

    // 预览
    showPreview: false,
    calculatedPersonalScore: 0,

    // 提交按钮状态
    canSubmit: false
  },

  onLoad: function (options) {
    this.initPage();
  },

  // 初始化页面
  initPage: async function () {
    try {
      // 获取当前学期
      await this.loadCurrentSemester();

      // 加载宿舍选项
      await this.loadDormOptions();

      // 加载住宿生列表
      await this.loadStudents();

      this.setData({ loading: false });
    } catch (err) {
      console.error('初始化页面失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  // 加载当前学期
  loadCurrentSemester: async function () {
    try {
      const res = await db.collection('semesters')
        .where({ is_current: true })
        .get();

      if (res.data && res.data.length > 0) {
        const semester = res.data[0];
        this.setData({
          semesterId: semester._id,
          semesterName: semester.semester_name,
          conversionRatio: semester.dorm_conversion_ratio || 0.2
        });
      } else {
        wx.showToast({
          title: '未找到当前学期',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('加载学期失败:', err);
    }
  },

  // 加载宿舍选项
  loadDormOptions: async function () {
    try {
      const classId = app.globalData.class_id;

      // 获取所有住宿生
      const studentsRes = await db.collection('students')
        .where({
          class_id: classId,
          is_boarding: true
        })
        .field({
          dorm_building: true,
          dorm_room: true
        })
        .get();

      // 提取唯一的宿舍
      const dormMap = new Map();
      studentsRes.data.forEach(student => {
        const building = student.dorm_building || '';
        const room = student.dorm_room || '';
        if (building && room) {
          const key = `${building}-${room}`;
          if (!dormMap.has(key)) {
            dormMap.set(key, {
              label: `${building}${room}室`,
              value: key,
              building: building,
              room: room
            });
          }
        }
      });

      // 转换为数组并排序
      const dormOptions = Array.from(dormMap.values()).sort((a, b) => {
        return a.label.localeCompare(b.label, 'zh-CN');
      });

      this.setData({ dormOptions });
    } catch (err) {
      console.error('加载宿舍选项失败:', err);
    }
  },

  // 加载学生列表
  loadStudents: async function () {
    try {
      const classId = app.globalData.class_id;

      const res = await db.collection('students')
        .where({
          class_id: classId,
          is_boarding: true
        })
        .field({
          student_id: true,
          name: true,
          dorm_building: true,
          dorm_room: true
        })
        .get();

      const students = res.data.map(student => ({
        ...student,
        dorm_info: `${student.dorm_building || ''}${student.dorm_room || ''}室`,
        selected: false
      }));

      this.setData({
        allStudents: students,
        filteredStudents: students
      });
    } catch (err) {
      console.error('加载学生列表失败:', err);
    }
  },

  // 选择记录类型
  onSelectType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      recordType: type,
      selectedViolation: '',
      selectedViolationLabel: '',
      selectedService: '',
      selectedServiceLabel: '',
      scoreValue: '',
      showPreview: false
    });
    this.checkCanSubmit();
  },

  // 选择选择方式
  onSelectMode: function (e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      selectMode: mode,
      selectedDorm: '',
      selectedDormLabel: '',
      selectedDormMembers: [],
      selectedStudents: []
    });
    this.checkCanSubmit();
  },

  // 选择宿舍
  onDormChange: function (e) {
    const index = e.detail.value;
    const selected = this.data.dormOptions[index];

    this.setData({
      selectedDorm: selected.value,
      selectedDormLabel: selected.label
    });

    // 加载宿舍成员
    this.loadDormMembers(selected.building, selected.room);
  },

  // 加载宿舍成员
  loadDormMembers: async function (building, room) {
    try {
      const classId = app.globalData.class_id;

      const res = await db.collection('students')
        .where({
          class_id: classId,
          dorm_building: building,
          dorm_room: room
        })
        .field({
          student_id: true,
          name: true
        })
        .get();

      const members = res.data.map(student => ({
        ...student,
        selected: true
      }));

      const selectedStudents = members.map(m => m.student_id);

      this.setData({
        selectedDormMembers: members,
        isAllSelected: true,
        selectedStudents: selectedStudents
      });

      this.checkCanSubmit();
    } catch (err) {
      console.error('加载宿舍成员失败:', err);
    }
  },

  // 全选/取消全选
  onSelectAll: function () {
    const { isAllSelected, selectedDormMembers } = this.data;
    const newSelected = !isAllSelected;

    const members = selectedDormMembers.map(member => ({
      ...member,
      selected: newSelected
    }));

    const selectedStudents = newSelected
      ? members.map(m => m.student_id)
      : [];

    this.setData({
      selectedDormMembers: members,
      isAllSelected: newSelected,
      selectedStudents: selectedStudents
    });

    this.checkCanSubmit();
  },

  // 切换成员选择
  onToggleMember: function (e) {
    const id = e.currentTarget.dataset.id;
    const { selectedDormMembers } = this.data;

    const members = selectedDormMembers.map(member => {
      if (member.student_id === id) {
        return { ...member, selected: !member.selected };
      }
      return member;
    });

    const selectedStudents = members
      .filter(m => m.selected)
      .map(m => m.student_id);

    const isAllSelected = members.every(m => m.selected);

    this.setData({
      selectedDormMembers: members,
      selectedStudents: selectedStudents,
      isAllSelected: isAllSelected
    });

    this.checkCanSubmit();
  },

  // 搜索学生
  onSearchInput: function (e) {
    const keyword = e.detail.value.toLowerCase();
    this.setData({ searchKeyword: keyword });

    const { allStudents } = this.data;

    const filtered = allStudents.filter(student => {
      const name = student.name.toLowerCase();
      const id = student.student_id.toLowerCase();
      const dorm = student.dorm_info.toLowerCase();
      return name.includes(keyword) || id.includes(keyword) || dorm.includes(keyword);
    });

    this.setData({ filteredStudents: filtered });
  },

  // 选择学生
  onSelectStudent: function (e) {
    const id = e.currentTarget.dataset.id;
    const { filteredStudents, selectedStudents } = this.data;

    const index = selectedStudents.indexOf(id);
    let newSelected;

    if (index > -1) {
      // 已选中，取消选择
      newSelected = selectedStudents.filter(s => s !== id);
    } else {
      // 未选中，添加选择
      newSelected = [...selectedStudents, id];
    }

    const students = filteredStudents.map(student => ({
      ...student,
      selected: newSelected.includes(student.student_id)
    }));

    this.setData({
      filteredStudents: students,
      selectedStudents: newSelected
    });

    this.checkCanSubmit();
  },

  // 选择违规项目
  onViolationChange: function (e) {
    const index = e.detail.value;
    const selected = this.data.violationOptions[index];

    this.setData({
      selectedViolation: selected.value,
      selectedViolationLabel: selected.label,
      scoreValue: Math.abs(selected.defaultScore).toString()
    });

    this.updatePreview();
    this.checkCanSubmit();
  },

  // 选择服务项目
  onServiceChange: function (e) {
    const index = e.detail.value;
    const selected = this.data.serviceOptions[index];

    this.setData({
      selectedService: selected.value,
      selectedServiceLabel: selected.label,
      scoreValue: selected.defaultScore.toString()
    });

    this.updatePreview();
    this.checkCanSubmit();
  },

  // 输入积分值
  onScoreInput: function (e) {
    const value = e.detail.value;
    this.setData({ scoreValue: value });

    this.updatePreview();
    this.checkCanSubmit();
  },

  // 切换关联设置
  onLinkChange: function (e) {
    this.setData({
      linkToPersonal: e.detail.value
    });

    this.updatePreview();
  },

  // 输入备注
  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },

  // 更新预览
  updatePreview: function () {
    const { scoreValue, conversionRatio, linkToPersonal, recordType } = this.data;

    if (!scoreValue) {
      this.setData({ showPreview: false });
      return;
    }

    const score = parseFloat(scoreValue);
    const calculatedPersonalScore = (score * conversionRatio).toFixed(2);

    this.setData({
      showPreview: true,
      calculatedPersonalScore: calculatedPersonalScore
    });
  },

  // 检查是否可以提交
  checkCanSubmit: function () {
    const {
      recordType,
      selectMode,
      selectedStudents,
      selectedViolation,
      selectedService,
      scoreValue
    } = this.data;

    let canSubmit = false;

    if (selectedStudents.length === 0) {
      canSubmit = false;
    } else if (recordType === 'violation') {
      canSubmit = !!selectedViolation && !!scoreValue;
    } else if (recordType === 'service') {
      canSubmit = !!selectedService && !!scoreValue;
    }

    this.setData({ canSubmit });
  },

  // 取消
  onCancel: function () {
    wx.navigateBack();
  },

  // 提交
  onSubmit: async function () {
    if (!this.data.canSubmit) return;

    const {
      semesterId,
      recordType,
      selectMode,
      selectedStudents,
      selectedDorm,
      selectedViolation,
      selectedService,
      scoreValue,
      linkToPersonal,
      conversionRatio,
      remark,
      classId
    } = this.data;

    try {
      wx.showLoading({ title: '保存中...', mask: true });

      const db = wx.cloud.database();
      const classId = app.globalData.class_id;

      // 计算个人积分
      const dormScore = parseFloat(scoreValue);
      const personalScore = linkToPersonal ? (dormScore * conversionRatio).toFixed(2) : 0;

      // 创建宿舍积分记录
      const dormRecord = {
        class_id: classId,
        semester_id: semesterId,
        record_type: recordType,
        select_mode: selectMode,
        dorm_info: selectMode === 'dorm' ? selectedDorm : '',
        item_id: recordType === 'violation' ? selectedViolation : selectedService,
        item_name: recordType === 'violation' ? this.data.selectedViolationLabel : this.data.selectedServiceLabel,
        dorm_score: dormScore,
        conversion_ratio: conversionRatio,
        personal_score: parseFloat(personalScore),
        link_to_personal: linkToPersonal,
        affected_students: selectedStudents,
        student_count: selectedStudents.length,
        remark: remark,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      };

      const dormRes = await db.collection('dorm_score_records').add({
        data: dormRecord
      });

      const dormRecordId = dormRes._id;

      // 计算带符号的宿舍积分变化值
      const dormScoreChange = recordType === 'violation' ? -dormScore : dormScore;

      // 更新每个受影响学生的宿舍积分
      for (const studentId of selectedStudents) {
        try {
          await db.collection('students').where({
            student_id: studentId
          }).update({
            data: {
              dorm_score: _.inc(dormScoreChange),
              updated_at: db.serverDate()
            }
          });
        } catch (err) {
          console.error(`更新学生 ${studentId} 宿舍积分失败:`, err);
        }

        // 更新或创建宿舍积分账户
        try {
          const accountRes = await db.collection('dorm_score_accounts').where({
            student_id: studentId,
            semester_id: semesterId
          }).limit(1).get();

          if (accountRes.data.length > 0) {
            await db.collection('dorm_score_accounts').doc(accountRes.data[0]._id).update({
              data: {
                original_score: _.inc(dormScoreChange),
                current_score: _.inc(dormScoreChange),
                updated_at: db.serverDate()
              }
            });
          } else {
            await db.collection('dorm_score_accounts').add({
              data: {
                student_id: studentId,
                semester_id: semesterId,
                class_id: classId,
                original_score: 100 + dormScoreChange,
                current_score: 100 + dormScoreChange,
                converted_score: 0,
                conversion_ratio: conversionRatio,
                warning_count: 0,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
              }
            });
          }
        } catch (accountErr) {
          console.error(`更新学生 ${studentId} 宿舍积分账户失败:`, accountErr);
        }
      }

      // 如果关联到个人积分，创建个人积分记录（保持原有逻辑不变）
      if (linkToPersonal) {
        const personalRecords = selectedStudents.map(studentId => ({
          class_id: classId,
          semester_id: semesterId,
          student_id: studentId,
          category: 'dorm',
          score_change: parseFloat(personalScore),
          score_value: parseFloat(personalScore),
          item_name: recordType === 'violation' ? this.data.selectedViolationLabel : this.data.selectedServiceLabel,
          description: `${this.data.selectedViolationLabel || this.data.selectedServiceLabel}（宿舍积分${dormScore}分）`,
          related_dorm_record_id: dormRecordId,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }));

        // 批量创建个人积分记录
        for (const record of personalRecords) {
          await db.collection('score_records').add({ data: record });
        }

        // 更新学生个人积分
        for (const studentId of selectedStudents) {
          await db.collection('students').doc(studentId).update({
            data: {
              current_score: _.inc(parseFloat(personalScore)),
              updated_at: db.serverDate()
            }
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
