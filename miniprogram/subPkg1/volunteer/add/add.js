// pages/volunteer/add/add.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');
const batchQuery = require('../../utils/batchQuery.js');

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
    filteredStudents: [],
    selectedStudentIds: [],
    
    // 弹窗控制
    showStudentPicker: false,
    searchKeyword: '',
    
    // 积分计算
    earnedScore: 0,
    
    // 积分规则：每小时积分数
    scorePerHour: app.globalData.volunteerScorePerHour || 2
  },

  onLoad: function (options) {
    const classId = app.globalData.class_id;
    const role = app.globalData.role;
    const studentId = app.globalData.student_id;
    
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
    
    // 学生/家长身份：自动绑定本人/子女，不允许选择其他学生
    const isStudentOrParent = role === 'student' || role === 'parent';
    
    this.setData({ 
      currentClassId: classId,
      currentDate: currentDate,
      isStudentOrParent: isStudentOrParent
    });
    this.loadCurrentSemester();
    this.loadScoreRule();
    
    if (isStudentOrParent && studentId) {
      // 学生/家长自动绑定，不需要加载全部学生列表
      this.autoBindStudent(studentId);
    } else {
      this.loadStudents();
    }
  },

  // 自动绑定学生（学生/家长身份）
  autoBindStudent: async function (studentId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: {
          action: 'getStudents',
          data: { classId: this.data.currentClassId }
        }
      });

      if (res.result.success && res.result.data) {
        const student = res.result.data.find(s => s.student_id === studentId || s._id === studentId);
        if (student) {
          this.setData({
            selectedStudents: [{
              student_id: student.student_id,
              student_name: student.name || student.student_name
            }],
            selectedStudentIds: [student.student_id],
            allStudents: [student] // 仅包含自己
          });
        }
      }
    } catch (err) {
      console.error('自动绑定学生失败:', err);
    }
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
      const _ = wx.cloud.database().command;
      const studentsData = await batchQuery.getAllRecords('students', {
        class_id: this.data.currentClassId,
        status: _.neq('graduated')
      }, 'name', 'asc');

      const students = (studentsData || []).map(s => ({
        ...s,
        student_name: s.name || ''
      }));

      this.setData({ allStudents: students });
      this.applyStudentFilter();

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
    this.setData({ searchKeyword: e.detail.value });
    this.applyStudentFilter();
  },

  applyStudentFilter: function () {
    const { allStudents, searchKeyword } = this.data;
    let filtered = allStudents;
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      filtered = filtered.filter(s =>
        (s.student_name && s.student_name.toLowerCase().includes(kw)) ||
        (s.name && s.name.toLowerCase().includes(kw)) ||
        (s.student_id && String(s.student_id).includes(kw))
      );
    }
    const selectedIds = this.data.selectedStudentIds;
    filtered = filtered.map(s => ({
      ...s,
      selected: selectedIds.indexOf(s.student_id) > -1
    }));
    this.setData({ filteredStudents: filtered });
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
    this.applyStudentFilter();
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
    const { formData, earnedScore, currentClassId, currentSemesterId, selectedStudents, isStudentOrParent } = this.data;
    
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
      
      // 判断审批状态（整合审批工作流）
      const isTeacher = userRole === 'head_teacher' || userRole === 'subject_teacher' || userRole === 'admin';
      const isCadre = userRole === 'class_cadre';
      // 学生/家长/班委提交需要审批，班主任/管理员直接通过
      const needsApproval = isStudentOrParent || isCadre;
      
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
        
        // 确定审批状态
        let approvalStatus, isVerified;
        if (isTeacher) {
          approvalStatus = '已通过';
          isVerified = true;
        } else if (isCadre) {
          approvalStatus = '待班主任审核';
          isVerified = false;
        } else {
          // 学生/家长
          approvalStatus = '待班委审核';
          isVerified = false;
        }
        
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
          approval_status: approvalStatus
        };
        
        if (isVerified) {
          volunteerData.verifier_openid = app.globalData.openid;
          volunteerData.verifier_name = volunteerData.recorder_name;
        }
        
        const volRes = await wx.cloud.callFunction({
          name: 'scoreManager',
          data: {
            action: 'addVolunteerRecord',
            data: volunteerData
          }
        });

        if (!volRes.result || !volRes.result.success) {
          console.error('创建志愿服务记录失败:', volRes.result?.message);
          continue;
        }

        const volRecordId = volRes.result.data?._id || '';
        
        // 班主任/管理员直接通过，创建积分记录并更新积分
        if (isTeacher && earnedScore > 0) {
          try {
            await wx.cloud.callFunction({
              name: 'scoreManager',
              data: {
                action: 'applyScoreChange',
                data: {
                  student_id: student.student_id,
                  class_id: currentClassId,
                  semester_id: currentSemesterId,
                  score_change: earnedScore,
                  source_type: '志愿服务',
                  item_id: 'volunteer_service',
                  item_name: `志愿服务: ${formData.activity_name}`,
                  rule_name: `志愿服务: ${formData.activity_name}`,
                  rule_code: 'VOLUNTEER_SERVICE',
                  reason_detail: `参与${formData.activity_name}，服务时长${formData.duration}小时`,
                  recorder_openid: app.globalData.openid,
                  recorder_name: volunteerData.recorder_name,
                  date: formData.service_date
                }
              }
            });
          } catch (scoreErr) {
            console.error('志愿积分同步失败:', scoreErr);
          }
        }
        
        // 学生/家长/班委提交审批流程
        if (needsApproval) {
          try {
            await wx.cloud.callFunction({
              name: 'approvalWorkflow',
              data: {
                action: 'submitApproval',
                data: {
                  businessType: 'volunteer',
                  businessId: volRecordId,
                  classId: currentClassId,
                  studentId: student.student_id,
                  submitNote: `${userRole === 'class_cadre' ? '班委' : (userRole === 'student' ? '学生' : '家长')}提交志愿服务: ${formData.activity_name}`
                }
              }
            });
          } catch (approvalErr) {
            console.error('提交审批失败(不影响记录):', approvalErr);
          }
        }
        
        createdRecords.push(recordId);
      }
      
      wx.hideLoading();
      
      let message;
      if (isTeacher) {
        message = `已为${selectedStudents.length}名学生登记成功`;
      } else if (isCadre) {
        message = `已提交，等待班主任审核`;
      } else {
        message = `已提交，等待班委审核后推送班主任`;
      }
      
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
