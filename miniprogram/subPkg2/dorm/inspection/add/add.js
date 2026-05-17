const app = getApp();
const db = wx.cloud.database();
const util = require('/utils/util.js');

Page({
  data: {
    formData: {
      inspection_date: util.formatDate(new Date()),
      typeIndex: 0,
      building: '',
      room: '',
      overall_score: '',
      hygiene_score: '',
      discipline_score: '',
      safety_score: '',
      problems: [],
      remarks: '',
      images: []
    },
    
    typeOptions: ['综合检查', '卫生检查', '纪律检查', '安全检查'],
    severityOptions: ['轻微', '一般', '严重', '重大'],
    
    classId: ''
  },

  onLoad: function () {
    this.setData({
      classId: app.globalData.class_id
    });
  },

  // 日期变化
  onDateChange: function (e) {
    this.setData({
      'formData.inspection_date': e.detail.value
    });
  },

  // 类型变化
  onTypeChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      'formData.typeIndex': index
    });
  },

  // 输入框变化
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 评分变化
  onScoreChange: function (e) {
    const field = e.currentTarget.dataset.field;
    let value = parseInt(e.detail.value) || 0;
    
    // 限制范围 0-100
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 添加问题
  addProblem: function () {
    const problems = this.data.formData.problems;
    problems.push({
      problem_type: '',
      description: '',
      severityIndex: 1,
      severity: '一般',
      responsible_students: []
    });
    this.setData({
      'formData.problems': problems
    });
  },

  // 删除问题
  deleteProblem: function (e) {
    const index = e.currentTarget.dataset.index;
    const problems = this.data.formData.problems;
    problems.splice(index, 1);
    this.setData({
      'formData.problems': problems
    });
  },

  // 问题输入变化
  onProblemChange: function (e) {
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.problems[${index}].${field}`]: value
    });
  },

  // 问题严重程度变化
  onProblemSeverityChange: function (e) {
    const index = e.currentTarget.dataset.index;
    const severityIndex = parseInt(e.detail.value);
    this.setData({
      [`formData.problems[${index}].severityIndex`]: severityIndex,
      [`formData.problems[${index}].severity`]: this.data.severityOptions[severityIndex]
    });
  },

  // 选择责任人
  selectStudent: function (e) {
    const index = e.currentTarget.dataset.index;
    // TODO: 实现学生选择功能
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 选择图片
  chooseImage: function () {
    const count = 9 - this.data.formData.images.length;
    
    wx.chooseImage({
      count: count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const images = [...this.data.formData.images, ...res.tempFilePaths];
        this.setData({
          'formData.images': images
        });
      }
    });
  },

  // 预览图片
  previewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: this.data.formData.images,
      current: url
    });
  },

  // 删除图片
  deleteImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.formData.images;
    images.splice(index, 1);
    this.setData({
      'formData.images': images
    });
  },

  // 提交
  onSubmit: async function () {
    const { formData, classId, typeOptions } = this.data;

    // 验证必填字段
    if (!formData.building.trim()) {
      wx.showToast({ title: '请输入楼栋', icon: 'none' });
      return;
    }
    if (!formData.room.trim()) {
      wx.showToast({ title: '请输入房间号', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '提交中...' });

      // 上传图片
      let imageUrls = [];
      if (formData.images.length > 0) {
        imageUrls = await this.uploadImages(formData.images);
      }

      // 生成检查记录ID
      const inspectionId = 'INS' + Date.now();

      // 查询该房间入住的学生姓名
      let student_names = [];
      try {
        const classId = app.globalData.class_id;
        const buildingName = formData.building.trim();
        const roomName = formData.room.trim();

        const studentsRes = await db.collection('students')
          .where({
            class_id: classId,
            dorm_building: buildingName,
            dorm_room: roomName
          })
          .field({ name: true, student_id: true })
          .get();

        student_names = (studentsRes.data || []).map(s => s.name);
      } catch (err) {
        console.error('查询房间学生失败:', err);
      }

      // 构建数据
      const data = {
        inspection_id: inspectionId,
        class_id: classId,
        inspection_date: formData.inspection_date,
        inspection_type: typeOptions[formData.typeIndex],
        building: formData.building.trim(),
        room: formData.room.trim(),
        student_names: student_names,
        overall_score: parseInt(formData.overall_score) || 0,
        hygiene_score: parseInt(formData.hygiene_score) || 0,
        discipline_score: parseInt(formData.discipline_score) || 0,
        safety_score: parseInt(formData.safety_score) || 0,
        problems: formData.problems.map(p => ({
          problem_type: p.problem_type,
          description: p.description,
          severity: p.severity,
          responsible_students: p.responsible_students
        })),
        remarks: formData.remarks.trim(),
        images: imageUrls,
        inspector_name: app.globalData.userInfo.nickName || '未知',
        inspector_openid: app.globalData.openid,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      // 保存到数据库
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: {
          action: 'addInspectionRecord',
          data: data
        }
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '提交检查记录失败');
      }

      wx.hideLoading();
      wx.showToast({
        title: '提交成功',
        icon: 'success'
      });

      // 返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);

    } catch (err) {
      console.error('提交失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      });
    }
  },

  // 上传图片
  uploadImages: async function (tempFilePaths) {
    const urls = [];
    
    for (let i = 0; i < tempFilePaths.length; i++) {
      const filePath = tempFilePaths[i];
      const cloudPath = `dorm/${Date.now()}-${i}.jpg`;
      
      try {
        const res = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: filePath
        });
        urls.push(res.fileID);
      } catch (err) {
        console.error('上传图片失败:', err);
      }
    }
    
    return urls;
  }
});
