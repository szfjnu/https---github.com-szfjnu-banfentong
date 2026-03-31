// pages/volunteer/add/add.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');

Page({
  data: {
    loading: false,
    currentClassId: '',
    currentSemesterId: '',
    
    // 表单数据
    formData: {
      activity_name: '',
      organization: '',
      service_date: '',
      duration: '',
      location: '',
      service_type: '',
      description: '',
      proof_images: []
    },
    
    // 选中的学生
    selectedStudents: [],
    
    // 服务类型选项
    serviceTypes: ['社区服务', '环保活动', '助老助残', '文化教育', '公共服务', '其他'],
    serviceTypeIndex: 0,
    currentDate: '',
    
    // 学生列表
    allStudents: [],
    selectedStudentIds: [],
    
    // 弹窗控制
    showStudentPicker: false,
    searchKeyword: '',
    
    // 积分计算
    earnedScore: 0,
    
    // 积分规则：每小时积分数
    scorePerHour: 2
  },

  onLoad: function (options) {
    const classId = app.globalData.class_id;
    
    // 设置当前日期
    const today = new Date();
    const currentDate = util.formatDate(today);
    
    if (!classId) {
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
    
    this.setData({ 
      currentClassId: classId,
      currentDate: currentDate
    });
    this.loadCurrentSemester();
    this.loadStudents();
    this.loadScoreRule();
  },

  // 加载当前学期
  loadCurrentSemester: async function () {
    try {
      const res = await api.semesterApi.getCurrentSemester();
      if (res.data && res.data.length > 0) {
        this.setData({ currentSemesterId: res.data[0]._id });
      }
    } catch (err) {
      console.error('加载学期失败:', err);
    }
  },

  // 加载学生列表
  loadStudents: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({
          class_id: this.data.currentClassId,
          status: db.command.neq('graduated')
        })
        .orderBy('name', 'asc')
        .get();

      // 为每个学生添加 student_name 字段（兼容显示）
      const students = (res.data || []).map(s => ({
        ...s,
        student_name: s.name || ''
      }));

      this.setData({ allStudents: students });

    } catch (err) {
      console.error('加载学生列表失败:', err);
    }
  },

  // 加载积分规则
  loadScoreRule: async function () {
    try {
      const db = wx.cloud.database();
      
      // 优先从 class_settings 中获取志愿服务积分规则（与规则配置页面一致）
      const settingsRes = await db.collection('class_settings')
        .where({
          class_id: this.data.currentClassId
        })
        .field({
          volunteer_score_per_hour: true
        })
        .get();
      
      if (settingsRes.data && settingsRes.data.length > 0 && settingsRes.data[0].volunteer_score_per_hour) {
        this.setData({
          scorePerHour: settingsRes.data[0].volunteer_score_per_hour
        });
        console.log('从class_settings加载积分规则:', settingsRes.data[0].volunteer_score_per_hour);
        return;
      }
      
      // 如果 class_settings 中没有，尝试从 score_items 获取（兼容旧数据）
      const res = await db.collection('score_items')
        .where({
          item_id: 'volunteer_service'
        })
        .limit(1)
        .get();
      
      if (res.data && res.data.length > 0) {
        const rule = res.data[0];
        this.setData({
          scorePerHour: rule.score_per_hour || 2
        });
        console.log('从score_items加载积分规则:', rule.score_per_hour);
      }
    } catch (err) {
      console.error('加载积分规则失败:', err);
      // 使用默认值
    }
  },

  // 显示学生选择器
  showStudentPicker: function () {
    this.setData({
      showStudentPicker: true,
      searchKeyword: ''
    });
  },

  // 关闭学生选择器
  hideStudentPicker: function () {
    this.setData({
      showStudentPicker: false,
      searchKeyword: ''
    });
  },

  // 阻止冒泡
  preventBubble: function () {},

  // 搜索学生
  onSearchInput: function (e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 切换学生选择
  toggleStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const student = this.data.allStudents.find(s => s.student_id === studentId);
    
    if (!student) return;

    const selectedIds = [...this.data.selectedStudentIds];
    const selectedStudents = [...this.data.selectedStudents];
    const index = selectedIds.indexOf(studentId);

    if (index > -1) {
      // 取消选择
      selectedIds.splice(index, 1);
      const newSelectedStudents = selectedStudents.filter(s => s.student_id !== studentId);
      this.setData({
        selectedStudentIds: selectedIds,
        selectedStudents: newSelectedStudents
      });
    } else {
      // 添加选择
      selectedIds.push(studentId);
      selectedStudents.push({
        student_id: student.student_id,
        student_name: student.student_name
      });
      this.setData({
        selectedStudentIds: selectedIds,
        selectedStudents: selectedStudents
      });
    }
  },

  // 移除已选学生
  removeStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const selectedIds = this.data.selectedStudentIds.filter(id => id !== studentId);
    const selectedStudents = this.data.selectedStudents.filter(s => s.student_id !== studentId);
    
    this.setData({
      selectedStudentIds: selectedIds,
      selectedStudents: selectedStudents
    });
  },

  // 服务类型选择
  onServiceTypeChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      serviceTypeIndex: index,
      'formData.service_type': this.data.serviceTypes[index]
    });
  },

  // 日期选择
  onDateChange: function (e) {
    this.setData({
      'formData.service_date': e.detail.value
    });
  },

  // 输入框变化
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`formData.${field}`]: value
    });
    
    // 计算积分
    if (field === 'duration') {
      this.calculateScore();
    }
  },

  // 计算积分
  calculateScore: function () {
    const hours = parseFloat(this.data.formData.duration) || 0;
    const score = Math.round(hours * this.data.scorePerHour);
    this.setData({ earnedScore: score });
  },

  // 选择图片
  onChooseImage: function () {
    const that = this;
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles.map(file => file.tempFilePath);
        that.setData({
          'formData.proof_images': [...that.data.formData.proof_images, ...tempFiles]
        });
      }
    });
  },

  // 删除图片
  onDeleteImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.formData.proof_images;
    images.splice(index, 1);
    this.setData({
      'formData.proof_images': images
    });
  },

  // 提交表单
  onSubmit: async function () {
    const { formData, earnedScore, currentClassId, currentSemesterId, selectedStudents } = this.data;
    
    // 验证必填字段
    if (selectedStudents.length === 0) {
      util.showError('请选择至少一名学生');
      return;
    }
    if (!formData.activity_name.trim()) {
      util.showError('请输入活动名称');
      return;
    }
    if (!formData.service_date) {
      util.showError('请选择服务日期');
      return;
    }
    if (!formData.duration || parseFloat(formData.duration) <= 0) {
      util.showError('请输入有效的服务时长');
      return;
    }
    
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      const userRole = app.globalData.role || '';
      
      // 判断审批状态
      const isTeacher = userRole === 'head_teacher' || userRole === 'subject_teacher' || userRole === 'admin';
      const isVerified = isTeacher;
      const approvalStatus = isTeacher ? '已通过' : '待审批';
      
      // 上传图片
      let proofUrls = [];
      if (formData.proof_images.length > 0) {
        wx.showLoading({ title: '上传图片...', mask: true });
        for (const path of formData.proof_images) {
          try {
            const ext = path.split('.').pop();
            const cloudPath = `volunteer/${currentClassId}/${Date.now()}-${Math.random().toString(36).substr(2)}.${ext}`;
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: path
            });
            proofUrls.push(uploadRes.fileID);
          } catch (err) {
            console.error('上传图片失败:', err);
          }
        }
      }
      
      wx.showLoading({ title: '提交中...', mask: true });
      
      // 为每个选中的学生创建志愿服务记录
      const createdRecords = [];
      for (const student of selectedStudents) {
        const recordId = `VOL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        
        const volunteerData = {
          record_id: recordId,
          student_id: student.student_id,
          student_name: student.student_name,
          activity_name: formData.activity_name.trim(),
          organization: formData.organization.trim(),
          date: new Date(formData.service_date),
          duration: parseFloat(formData.duration),
          earned_score: earnedScore,
          description: formData.description.trim(),
          location: formData.location.trim(),
          service_type: formData.service_type,
          proof_images: proofUrls,
          recorder_name: app.globalData.userInfo?.nickName || app.globalData.userInfo?.name || '未知',
          recorder_openid: app.globalData.openid,
          recorder_role: userRole,
          semester_id: currentSemesterId,
          class_id: currentClassId,
          is_verified: isVerified,
          approval_status: approvalStatus,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        };
        
        if (isVerified) {
          volunteerData.verified_at = db.serverDate();
          volunteerData.verifier_openid = app.globalData.openid;
          volunteerData.verifier_name = volunteerData.recorder_name;
        }
        
        await db.collection('volunteer_records').add({ data: volunteerData });
        
        // 创建积分记录并更新学生积分
        if (isVerified && earnedScore > 0) {
          const scoreRecordData = {
            record_id: `SCR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            student_id: student.student_id,
            item_id: 'volunteer_service',
            item_name: `志愿服务: ${formData.activity_name}`,
            // 添加规则相关字段（解决"未知项目"问题）
            rule_name: `志愿服务: ${formData.activity_name}`,
            rule_category: '志愿服务',
            rule_code: 'VOLUNTEER_SERVICE',
            score_change: earnedScore,
            score_value: earnedScore,
            reason_detail: `参与${formData.activity_name}，服务时长${formData.duration}小时`,
            date: new Date(formData.service_date),
            recorder_name: volunteerData.recorder_name,
            recorder_openid: app.globalData.openid,
            semester_id: currentSemesterId,
            class_id: currentClassId,
            source_type: '志愿服务',
            source_record_id: recordId,
            approval_status: '已通过',
            status: '已确认',  // 添加兼容字段
            created_at: db.serverDate()
          };
          
          await db.collection('score_records').add({ data: scoreRecordData });
          
          // 更新学生积分
          await db.collection('students')
            .where({ student_id: student.student_id, class_id: currentClassId })
            .update({
              data: {
                current_score: db.command.inc(earnedScore),
                updated_at: db.serverDate()
              }
            });
        }
        
        createdRecords.push(recordId);
      }
      
      wx.hideLoading();
      
      const message = isVerified 
        ? `已为${selectedStudents.length}名学生登记成功` 
        : `已为${selectedStudents.length}名学生提交登记，等待班主任审核`;
      
      util.showSuccess(message);
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      
    } catch (err) {
      console.error('登记失败:', err);
      wx.hideLoading();
      this.setData({ loading: false });
      util.showError('登记失败');
    }
  },

  // 取消
  onCancel: function () {
    wx.navigateBack();
  }
});
