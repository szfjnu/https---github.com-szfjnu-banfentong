// pages/score/appeal/appeal.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    // 原积分记录信息
    recordId: '',
    recordInfo: null,
    
    // 学生信息
    studentId: '',
    studentName: '',
    
    // 表单数据
    formData: {
      appeal_type: 'score_error',
      appeal_reason: '',
      requested_score: 0,
      evidence_urls: []
    },
    
    // 申诉类型选项
    appealTypes: [
      { value: 'score_error', label: '积分计算错误' },
      { value: 'rule_dispute', label: '规则适用争议' },
      { value: 'other', label: '其他问题' }
    ],
    
    // 原积分
    originalScore: 0,
    
    // 提交状态
    submitting: false,
    
    // 权限
    canSubmit: false
  },

  onLoad: function (options) {
    const recordId = options.recordId || '';
    const studentId = options.studentId || app.globalData.student_id || '';
    
    this.setData({
      recordId: recordId,
      studentId: studentId,
      canSubmit: ['student', 'parent'].includes(app.globalData.role)
    });
    
    if (recordId) {
      this.loadRecordInfo(recordId);
    }
    
    if (studentId) {
      this.loadStudentInfo(studentId);
    }
  },

  // 加载积分记录信息
  loadRecordInfo: async function (recordId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('score_records').doc(recordId).get();
      
      if (res.data) {
        const record = res.data;
        this.setData({
          recordInfo: record,
          studentId: record.student_id,
          originalScore: record.score_change || record.score_value || 0,
          'formData.requested_score': record.score_change || record.score_value || 0
        });
        
        // 加载学生姓名
        this.loadStudentInfo(record.student_id);
      }
    } catch (err) {
      console.error('加载记录失败:', err);
      util.showError('加载记录失败');
    }
  },

  // 加载学生信息
  loadStudentInfo: async function (studentId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({ student_id: studentId })
        .limit(1)
        .get();
      
      if (res.data && res.data.length > 0) {
        this.setData({
          studentName: res.data[0].name
        });
      }
    } catch (err) {
      console.error('加载学生信息失败:', err);
    }
  },

  // 申诉类型选择
  onAppealTypeChange: function (e) {
    const index = e.detail.value;
    this.setData({
      'formData.appeal_type': this.data.appealTypes[index].value
    });
  },

  // 申诉理由输入
  onReasonInput: function (e) {
    this.setData({
      'formData.appeal_reason': e.detail.value
    });
  },

  // 期望积分输入
  onRequestedScoreInput: function (e) {
    this.setData({
      'formData.requested_score': parseInt(e.detail.value) || 0
    });
  },

  // 选择证据图片
  onChooseEvidence: function () {
    const that = this;
    wx.chooseMedia({
      count: 3 - this.data.formData.evidence_urls.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...', mask: true });
        
        const uploadPromises = res.tempFiles.map(file => 
          that.uploadEvidence(file.tempFilePath)
        );
        
        try {
          const urls = await Promise.all(uploadPromises);
          that.setData({
            'formData.evidence_urls': [...that.data.formData.evidence_urls, ...urls]
          });
          wx.hideLoading();
        } catch (err) {
          wx.hideLoading();
          util.showError('上传失败');
        }
      }
    });
  },

  // 上传证据图片
  uploadEvidence: function (filePath) {
    return new Promise((resolve, reject) => {
      const cloudPath = `appeals/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.jpg`;
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: res => resolve(res.fileID),
        fail: err => reject(err)
      });
    });
  },

  // 删除证据图片
  onRemoveEvidence: function (e) {
    const index = e.currentTarget.dataset.index;
    const urls = this.data.formData.evidence_urls;
    urls.splice(index, 1);
    this.setData({
      'formData.evidence_urls': urls
    });
  },

  // 预览图片
  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.formData.evidence_urls
    });
  },

  // 提交申诉
  onSubmit: async function () {
    const { formData, recordId, studentId, studentName, originalScore } = this.data;
    
    // 验证
    if (!formData.appeal_reason.trim()) {
      util.showError('请填写申诉理由');
      return;
    }
    
    if (formData.appeal_type === 'score_error' && formData.requested_score === originalScore) {
      util.showError('期望积分与原积分相同，无需申诉');
      return;
    }
    
    this.setData({ submitting: true });
    
    try {
      const now = new Date();
      const deadline = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      
      const appealData = {
        record_id: recordId,
        student_id: studentId,
        student_name: studentName,
        class_id: app.globalData.class_id,
        appeal_type: formData.appeal_type,
        appeal_reason: formData.appeal_reason,
        original_score: originalScore,
        requested_score: formData.requested_score,
        evidence_urls: formData.evidence_urls,
        deadline: deadline.toISOString()
      };
      
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'submitAppeal',
          data: appealData
        }
      });
      
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '提交失败');
      }
      
      // 通知相关审核人
      this.notifyReviewers(appealData);
      
      wx.showModal({
        title: '提交成功',
        content: '您的申诉已提交，将在48小时内完成审核。审核结果将同步通知至家长端。',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      
    } catch (err) {
      console.error('提交申诉失败:', err);
      util.showError(err.message || '提交失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 通知审核人
  notifyReviewers: async function (appealData) {
    // TODO: 实现消息推送逻辑
    // 可以通过云函数发送模板消息
    console.log('通知审核人:', appealData);
  }
});
