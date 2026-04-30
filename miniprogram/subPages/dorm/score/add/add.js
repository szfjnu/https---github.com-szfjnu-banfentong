// pages/dorm/score/add/add.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    // 学期信息
    semesterName: '',
    currentSemesterId: '',

    // 折算比例
    conversionRatio: 0.2,

    // 记录类型
    recordType: 'violation', // violation: 违规扣分, service: 服务加分

    // 选择方式
    selectMode: 'dorm', // dorm: 按宿舍, student: 按学生

    // 宿舍选项
    dormOptions: [],
    selectedDormLabel: '',
    selectedDormMembers: [],
    isAllSelected: false,

    // 学生列表
    students: [],
    filteredStudents: [],
    selectedStudents: [],
    searchKeyword: '',

    // 规则选项
    ruleOptions: [],
    selectedRule: null,
    selectedRuleLabel: '',
    scoreValue: 0,

    // 设置
    linkToPersonal: true,

    // 备注
    remark: '',

    // 预览
    showPreview: false,
    calculatedPersonalScore: 0,
    canSubmit: false
  },

  onLoad: async function () {
    await this.loadSemesterAndRatio();
    await this.loadStudents();
    await this.loadRules();
    this.updateCanSubmit();
  },

  // 加载学期和折算比例
  loadSemesterAndRatio: async function () {
    try {
      // 获取当前学期
      const semesterRes = await db.collection('semesters')
        .where({ is_current: true })
        .limit(1)
        .get();

      let semesterName = '';
      let currentSemesterId = '';

      if (semesterRes.data && semesterRes.data.length > 0) {
        semesterName = semesterRes.data[0].semester_name;
        currentSemesterId = semesterRes.data[0]._id;

        // 获取折算比例
        const conversionRatio = semesterRes.data[0].dorm_conversion_ratio || 0.2;

        this.setData({
          semesterName,
          currentSemesterId,
          conversionRatio
        });
      } else {
        wx.showToast({
          title: '未找到当前学期',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('加载学期失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 加载学生列表
  loadStudents: async function () {
    try {
      const userClassId = app.globalData.classId || '';

      console.log('开始加载数据，班级ID:', userClassId);

      // 加载学生列表
      const studentRes = await db.collection('students')
        .where({
          class_id: _.eq(userClassId)
        })
        .field({
          student_id: true,
          name: true,
          dorm_info: true
        })
        .orderBy('student_id', 'asc')
        .get();

      const students = studentRes.data || [];
      console.log('学生列表:', students);

      // 加载宿舍房间列表
      const roomRes = await db.collection('dorm_rooms')
        .where({
          class_id: _.eq(userClassId)
        })
        .orderBy('room_number', 'asc')
        .get();

      const rooms = roomRes.data || [];
      console.log('房间列表:', rooms);

      if (rooms.length === 0) {
        console.log('没有找到房间数据');
        wx.showToast({
          title: '请先添加房间',
          icon: 'none'
        });
      }

      // 为每个房间加载床位和学生信息
      const dormOptions = await Promise.all(rooms.map(async (room) => {
        try {
          console.log('处理房间:', room);

          // 加载楼栋信息
          let buildingInfo = null;
          if (room.building_id) {
            const buildingRes = await db.collection('dorm_buildings').doc(room.building_id).get();
            buildingInfo = buildingRes.data;
            console.log('楼栋信息:', buildingInfo);
          }

          // 加载床位
          const bedRes = await db.collection('dorm_beds')
            .where({
              room_id: room._id,
              occupied: true
            })
            .get();

          const beds = bedRes.data || [];
          console.log(`房间 ${room.room_number} 的床位:`, beds);

          // 获取每个床位的学生信息
          const members = await Promise.all(beds.map(async (bed) => {
            let student = null;
            if (bed.student_id) {
              try {
                const studentRes = await db.collection('students').doc(bed.student_id).get();
                student = studentRes.data;
                console.log('床位学生信息:', student);
              } catch (err) {
                console.error('获取学生信息失败:', err);
              }
            }

            return student ? {
              ...student,
              selected: false,
              bed_id: bed._id,
              bed_number: bed.bed_number
            } : null;
          }));

          // 过滤掉null的学生
          const validMembers = members.filter(m => m !== null);

          if (validMembers.length > 0) {
            const dormLabel = buildingInfo
              ? `${buildingInfo.campus}-${buildingInfo.building_name}-${room.room_number}`
              : room.room_number;

            console.log('宿舍选项:', {
              label: dormLabel,
              memberCount: validMembers.length,
              room_id: room._id,
              building_id: room.building_id
            });

            return {
              label: dormLabel,
              members: validMembers,
              room_id: room._id,
              building_id: room.building_id
            };
          }

          return null;
        } catch (err) {
          console.error('加载房间信息失败:', err);
          return null;
        }
      }));

      // 过滤掉null的选项
      const validDormOptions = dormOptions.filter(d => d !== null);
      console.log('最终宿舍选项:', validDormOptions);

      this.setData({
        students,
        filteredStudents: students,
        dormOptions: validDormOptions
      });

      if (validDormOptions.length === 0) {
        wx.showToast({
          title: '暂无宿舍数据，请先添加楼栋和房间',
          icon: 'none',
          duration: 3000
        });
      }
    } catch (err) {
      console.error('加载学生失败:', err);
      wx.showToast({
        title: '加载失败: ' + err.message,
        icon: 'none'
      });
    }
  },

  // 加载规则
  loadRules: async function () {
    try {
      const userClassId = app.globalData.classId || '';
      const { currentSemesterId } = this.data;

      const res = await db.collection('dorm_rules')
        .where({
          class_id: _.in([userClassId, '', null]),
          semester_id: _.in([currentSemesterId, '', null]),
          is_enabled: _.neq(false)
        })
        .orderBy('category', 'asc')
        .orderBy('score_value', 'desc')
        .get();

      const rules = res.data || [];

      // 根据记录类型过滤规则
      const filteredRules = rules.filter(rule => {
        if (this.data.recordType === 'violation') {
          return rule.score_value < 0; // 扣分规则
        } else {
          return rule.score_value > 0; // 加分规则
        }
      });

      const ruleOptions = filteredRules.map(rule => ({
        label: `${rule.rule_name} (${rule.score_value > 0 ? '+' : ''}${rule.score_value}分)`,
        value: rule._id,
        data: rule
      }));

      this.setData({
        ruleOptions
      });
    } catch (err) {
      console.error('加载规则失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 选择记录类型
  onSelectType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      recordType: type,
      selectedRule: null,
      selectedRuleLabel: '',
      scoreValue: 0,
      showPreview: false
    });
    this.loadRules();
    this.updateCanSubmit();
  },

  // 选择方式
  onSelectMode: function (e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      selectMode: mode
    });
  },

  // 宿舍选择变化
  onDormChange: function (e) {
    const index = parseInt(e.detail.value);
    const { dormOptions } = this.data;

    if (!dormOptions || dormOptions.length === 0 || index < 0 || index >= dormOptions.length) {
      wx.showToast({
        title: '请先添加宿舍',
        icon: 'none'
      });
      return;
    }

    const dorm = dormOptions[index];

    this.setData({
      selectedDormLabel: dorm.label,
      selectedDormMembers: dorm.members.map(m => ({ ...m, selected: false })),
      isAllSelected: false
    });

    this.updateSelectedStudents();
    this.updateCanSubmit();
  },

  // 全选/取消全选
  onSelectAll: function () {
    const { selectedDormMembers, isAllSelected } = this.data;

    const updatedMembers = selectedDormMembers.map(m => ({
      ...m,
      selected: !isAllSelected
    }));

    this.setData({
      selectedDormMembers: updatedMembers,
      isAllSelected: !isAllSelected
    });

    this.updateSelectedStudents();
    this.updateCanSubmit();
  },

  // 切换成员选择
  onToggleMember: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const { selectedDormMembers } = this.data;

    const updatedMembers = selectedDormMembers.map(m => {
      if (m.student_id === studentId) {
        return { ...m, selected: !m.selected };
      }
      return m;
    });

    const allSelected = updatedMembers.every(m => m.selected);

    this.setData({
      selectedDormMembers: updatedMembers,
      isAllSelected: allSelected
    });

    this.updateSelectedStudents();
    this.updateCanSubmit();
  },

  // 更新选中的学生列表
  updateSelectedStudents: function () {
    const { selectedDormMembers, selectMode } = this.data;

    if (selectMode === 'dorm') {
      const selectedStudents = selectedDormMembers.filter(m => m.selected);

      this.setData({
        selectedStudents
      });
    }
  },

  // 搜索输入
  onSearchInput: function (e) {
    const keyword = e.detail.value.trim().toLowerCase();
    const { students } = this.data;

    const filtered = students.filter(s =>
      s.name.toLowerCase().includes(keyword) ||
      s.student_id.toLowerCase().includes(keyword)
    );

    this.setData({
      searchKeyword: e.detail.value,
      filteredStudents: filtered
    });
  },

  // 选择学生
  onSelectStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const { filteredStudents, selectedStudents, selectMode } = this.data;

    if (selectMode === 'student') {
      const isAlreadySelected = selectedStudents.some(s => s.student_id === studentId);

      if (isAlreadySelected) {
        // 取消选择
        const updated = filteredStudents.map(s => {
          if (s.student_id === studentId) {
            return { ...s, selected: false };
          }
          return s;
        });

        this.setData({
          filteredStudents: updated,
          selectedStudents: selectedStudents.filter(s => s.student_id !== studentId)
        });
      } else {
        // 添加选择
        const updated = filteredStudents.map(s => {
          if (s.student_id === studentId) {
            return { ...s, selected: true };
          }
          return s;
        });

        this.setData({
          filteredStudents: updated,
          selectedStudents: [...selectedStudents, filteredStudents.find(s => s.student_id === studentId)]
        });
      }

      this.updateCanSubmit();
    }
  },

  // 规则选择变化
  onRuleChange: function (e) {
    const index = parseInt(e.detail.value);
    const { ruleOptions } = this.data;

    if (!ruleOptions || ruleOptions.length === 0 || index < 0 || index >= ruleOptions.length) {
      wx.showToast({
        title: '请先添加规则',
        icon: 'none'
      });
      return;
    }

    const rule = ruleOptions[index];

    this.setData({
      selectedRule: rule.data,
      selectedRuleLabel: rule.label,
      scoreValue: rule.data.score_value
    });

    this.updatePreview();
    this.updateCanSubmit();
  },

  // 关联设置变化
  onLinkChange: function (e) {
    this.setData({
      linkToPersonal: e.detail.value
    });
    this.updatePreview();
  },

  // 备注输入
  onRemarkInput: function (e) {
    this.setData({
      remark: e.detail.value
    });
  },

  // 更新预览
  updatePreview: function () {
    const { selectedRule, linkToPersonal, conversionRatio, scoreValue, selectedStudents } = this.data;

    if (selectedRule && selectedStudents.length > 0) {
      const calculatedPersonalScore = linkToPersonal
        ? (Math.abs(scoreValue) * conversionRatio).toFixed(2)
        : 0;

      this.setData({
        showPreview: true,
        calculatedPersonalScore
      });
    } else {
      this.setData({
        showPreview: false
      });
    }
  },

  // 更新是否可以提交
  updateCanSubmit: function () {
    const { selectedRule, selectedStudents } = this.data;

    const canSubmit = selectedRule && selectedStudents.length > 0;

    this.setData({
      canSubmit
    });

    this.updatePreview();
  },

  // 取消
  onCancel: function () {
    wx.navigateBack();
  },

  // 提交
  onSubmit: async function () {
    const {
      selectedRule,
      selectedStudents,
      recordType,
      linkToPersonal,
      conversionRatio,
      remark,
      semesterName,
      currentSemesterId
    } = this.data;

    if (!selectedRule || selectedStudents.length === 0) {
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });

      // 遍历每个选中的学生
      for (const student of selectedStudents) {
        const recordId = `DSR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        // 修复浮点数精度问题：保留两位小数
        const personalScore = linkToPersonal ? Math.round(Math.abs(selectedRule.score_value) * conversionRatio * 100) / 100 : 0;

        // 创建宿舍积分记录
        const dormRecordData = {
          record_id: recordId,
          student_id: student.student_id,
          dorm_info: student.dorm_info,
          rule_id: selectedRule._id,
          rule_name: selectedRule.rule_name,
          rule_category: selectedRule.category,
          record_type: recordType,
          score_value: selectedRule.score_value,
          remark: remark,
          link_to_personal: linkToPersonal,
          personal_score: linkToPersonal ? personalScore : 0,
          recorder_name: app.globalData.userInfo?.nickName || app.globalData.userInfo?.name || '未知',
          recorder_openid: app.globalData.openid,
          semester_id: currentSemesterId,
          class_id: app.globalData.class_id || '',
          record_date: new Date(),
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        };

        await db.collection('dorm_score_records').add({ data: dormRecordData });

        // 更新学生宿舍积分（核心修复：确保 dorm_score 被实时更新）
        try {
          const dormScoreChange = selectedRule.score_value; // 带符号的变化值
          await db.collection('students').where({
            student_id: student.student_id
          }).update({
            data: {
              dorm_score: _.inc(dormScoreChange),
              updated_at: db.serverDate()
            }
          });
          console.log(`学生宿舍积分已更新: ${student.name}, 变化: ${dormScoreChange}`);
        } catch (dormScoreErr) {
          console.error('更新学生宿舍积分失败:', dormScoreErr);
        }

        // 更新或创建宿舍积分账户（用于预警和统计）
        try {
          const accountRes = await db.collection('dorm_score_accounts').where({
            student_id: student.student_id,
            semester_id: currentSemesterId
          }).limit(1).get();

          const dormScoreChange = selectedRule.score_value;

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
                student_id: student.student_id,
                semester_id: currentSemesterId,
                class_id: app.globalData.class_id || '',
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
          console.error('更新宿舍积分账户失败:', accountErr);
        }

        // 如果关联个人积分，创建个人积分记录（保持原有逻辑不变）
        if (linkToPersonal && personalScore > 0) {
          // 格式化宿舍信息为字符串
          const dormInfoStr = student.dorm_info
            ? `${student.dorm_info.building || ''}-${student.dorm_info.room || ''}-${student.dorm_info.bed || ''}`
            : '';

          const scoreRecordData = {
            record_id: `SCR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            student_id: student.student_id,
            item_id: `dorm_${selectedRule._id}`,
            item_name: `宿舍${recordType === 'violation' ? '扣分' : '加分'}: ${selectedRule.rule_name}`,
            rule_name: `宿舍${recordType === 'violation' ? '扣分' : '加分'}: ${selectedRule.rule_name}`,
            rule_category: '宿舍管理',
            rule_code: 'DORM_SCORE',
            score_change: recordType === 'violation' ? -personalScore : personalScore,
            score_value: personalScore,
            reason_detail: `${dormInfoStr} ${selectedRule.rule_name}，${remark ? remark : ''}`,
            date: new Date(),
            recorder_name: dormRecordData.recorder_name,
            recorder_openid: app.globalData.openid,
            semester_id: currentSemesterId,
            class_id: app.globalData.class_id || '',
            source_type: '宿舍管理',
            source_record_id: recordId,
            approval_status: '已通过',
            status: '已确认',
            created_at: db.serverDate()
          };

          await db.collection('score_records').add({ data: scoreRecordData });

          // 更新学生当前积分（使用 where 条件而不是 doc）
          await db.collection('students').where({
            student_id: student.student_id
          }).update({
            data: {
              current_score: _.inc(recordType === 'violation' ? -personalScore : personalScore),
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
