// pages/score/reset/reset.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    // 班级信息
    classId: '',
    className: '',
    semesterId: '',
    semesterName: '',
    
    // 清零设置
    resetSettings: {
      reset_type: 'none',  // none, semester_start, year_start, manual
      reset_scope: 'all',   // all, partial, archive
      keep_min_score: 60,   // 保留最低积分
      reset_base_only: false, // 仅清零基础分
      carry_over_ratio: 0   // 结转比例
    },
    
    // 清零类型选项
    resetTypes: [
      { value: 'none', label: '不清零', desc: '积分永久有效，不自动清零' },
      { value: 'semester_start', label: '学期初清零', desc: '每学期开始自动清零' },
      { value: 'year_start', label: '学年初清零', desc: '每学年开始自动清零' }
    ],
    resetTypeIndex: 0,
    resetTypeLabel: '不清零',
    
    // 清零范围选项
    resetScopes: [
      { value: 'all', label: '全部清零', desc: '清零所有积分记录' },
      { value: 'partial', label: '部分清零', desc: '按规则部分清零' },
      { value: 'archive', label: '归档保留', desc: '清零前归档历史记录' }
    ],
    resetScopeIndex: 0,
    resetScopeLabel: '全部清零',
    
    // 学生列表（预览）
    students: [],
    affectedCount: 0,
    totalScore: 0,
    
    // 权限
    canManage: false,
    
    // 状态
    loading: true,
    submitting: false,
    showConfirmModal: false,
    
    // 历史记录
    resetHistory: []
  },

  onLoad: function () {
    const role = app.globalData.role;
    const classId = app.globalData.class_id || '';
    const className = app.globalData.currentClassName || '';
    const semesterId = app.globalData.currentSemesterId || '';
    const semesterName = app.globalData.currentSemesterName || '';
    
    this.setData({
      canManage: ['admin', 'head_teacher'].includes(role),
      classId: classId,
      className: className,
      semesterId: semesterId,
      semesterName: semesterName
    });
    
    this.loadSettings();
    this.loadStudents();
    this.loadResetHistory();
  },

  // 加载设置
  loadSettings: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('class_settings')
        .where({ class_id: this.data.classId })
        .get();
      
      if (res.data && res.data.length > 0) {
        const settings = res.data[0].score_reset_settings || {};
        const resetType = settings.reset_type || 'none';
        const resetScope = settings.reset_scope || 'all';
        
        // 找到对应的索引
        const typeIndex = this.data.resetTypes.findIndex(t => t.value === resetType);
        const scopeIndex = this.data.resetScopes.findIndex(s => s.value === resetScope);
        
        this.setData({
          resetSettings: {
            reset_type: resetType,
            reset_scope: resetScope,
            keep_min_score: settings.keep_min_score || 60,
            reset_base_only: settings.reset_base_only || false,
            carry_over_ratio: settings.carry_over_ratio || 0
          },
          resetTypeIndex: typeIndex >= 0 ? typeIndex : 0,
          resetTypeLabel: this.data.resetTypes[typeIndex >= 0 ? typeIndex : 0].label,
          resetScopeIndex: scopeIndex >= 0 ? scopeIndex : 0,
          resetScopeLabel: this.data.resetScopes[scopeIndex >= 0 ? scopeIndex : 0].label
        });
      }
    } catch (err) {
      console.error('加载设置失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  // 加载学生列表
  loadStudents: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({ class_id: this.data.classId })
        .field({ student_id: true, name: true, current_score: true })
        .get();
      
      const students = res.data || [];
      const affectedCount = students.length;
      const totalScore = students.reduce((sum, s) => sum + (s.current_score || 0), 0);
      
      this.setData({
        students: students,
        affectedCount: affectedCount,
        totalScore: totalScore
      });
    } catch (err) {
      console.error('加载学生失败:', err);
    }
  },

  // 加载历史记录
  loadResetHistory: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('score_reset_logs')
        .where({ class_id: this.data.classId })
        .orderBy('executed_at', 'desc')
        .limit(10)
        .get();
      
      this.setData({
        resetHistory: res.data || []
      });
    } catch (err) {
      console.error('加载历史记录失败:', err);
    }
  },

  // 清零类型选择
  onResetTypeChange: function (e) {
    const index = parseInt(e.detail.value);
    const selectedType = this.data.resetTypes[index];
    
    this.setData({
      'resetSettings.reset_type': selectedType.value,
      resetTypeIndex: index,
      resetTypeLabel: selectedType.label
    });
    
    this.saveSettings();
  },

  // 清零范围选择
  onResetScopeChange: function (e) {
    const index = parseInt(e.detail.value);
    const selectedScope = this.data.resetScopes[index];
    
    this.setData({
      'resetSettings.reset_scope': selectedScope.value,
      resetScopeIndex: index,
      resetScopeLabel: selectedScope.label
    });
  },

  // 保留最低积分输入
  onKeepMinScoreInput: function (e) {
    this.setData({
      'resetSettings.keep_min_score': parseInt(e.detail.value) || 0
    });
  },

  // 仅清零基础分开关
  onResetBaseOnlyChange: function (e) {
    this.setData({
      'resetSettings.reset_base_only': e.detail.value
    });
  },

  // 结转比例输入
  onCarryOverRatioInput: function (e) {
    const value = parseFloat(e.detail.value) || 0;
    this.setData({
      'resetSettings.carry_over_ratio': Math.min(Math.max(value, 0), 1)
    });
  },

  // 保存设置
  saveSettings: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: {
          action: 'saveResetSettings',
          data: {
            classId: this.data.classId,
            resetSettings: this.data.resetSettings
          }
        }
      });
      
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '保存失败');
      }
      
      util.showSuccess('设置已保存');
    } catch (err) {
      console.error('保存设置失败:', err);
      util.showError(err.message || '保存失败');
    }
  },

  // 显示确认弹窗
  showConfirmDialog: function () {
    this.setData({ showConfirmModal: true });
  },

  // 隐藏确认弹窗
  hideConfirmDialog: function () {
    this.setData({ showConfirmModal: false });
  },

  // 确认执行清零
  onConfirmReset: async function () {
    this.setData({ submitting: true, showConfirmModal: false });
    
    try {
      // 备份数据
      await this.backupData();
      
      // 执行清零
      await this.executeReset();
      
      // 记录日志
      await this.logReset();
      
      // 刷新数据
      this.loadStudents();
      this.loadResetHistory();
      
      wx.showModal({
        title: '执行成功',
        content: `已成功清零 ${this.data.affectedCount} 名学生的积分，共重置 ${this.data.totalScore} 分`,
        showCancel: false
      });
      
    } catch (err) {
      console.error('清零失败:', err);
      util.showError('清零失败: ' + err.message);
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 备份数据
  backupData: async function () {
    const db = wx.cloud.database();
    const _ = db.command;
    
    // 获取所有学生当前积分快照
    const students = this.data.students;
    const backupData = students.map(s => ({
      student_id: s.student_id,
      name: s.name,
      score_before: s.current_score || 0,
      backup_time: new Date()
    }));
    
    // 这里简化处理，实际应该调用云函数完成备份
    console.log('备份数据:', backupData);
  },

  // 执行清零
  executeReset: async function () {
    const { resetSettings, students, classId, semesterId } = this.data;
    
    const res = await wx.cloud.callFunction({
      name: 'resetStudentScore',
      data: {
        action: 'batchReset',
        data: {
          classId: classId,
          semesterId: semesterId,
          resetSettings: resetSettings,
          students: students.map(s => ({
            _id: s._id,
            student_id: s.student_id,
            current_score: s.current_score || 0
          }))
        }
      }
    });
    
    if (!res.result || !res.result.success) {
      throw new Error(res.result?.message || '清零执行失败');
    }
  },

  // 记录日志
  logReset: async function () {
    const { classId, semesterId, resetSettings, affectedCount, totalScore } = this.data;
    
    const res = await wx.cloud.callFunction({
      name: 'resetStudentScore',
      data: {
        action: 'logReset',
        data: {
          classId: classId,
          semesterId: semesterId,
          resetScope: resetSettings.reset_scope,
          resetRules: {
            keep_min_score: resetSettings.keep_min_score,
            reset_base_only: resetSettings.reset_base_only,
            carry_over_ratio: resetSettings.carry_over_ratio
          },
          affectedCount: affectedCount,
          totalScoreReset: totalScore,
          operatorId: app.globalData.openid,
          operatorName: app.globalData.userName || '管理员',
          operatorRole: app.globalData.role
        }
      }
    });
    
    if (!res.result || !res.result.success) {
      console.error('记录日志失败:', res.result?.message);
    }
  },

  // 查看历史详情
  onViewHistory: function (e) {
    const history = e.currentTarget.dataset.history;
    wx.showModal({
      title: '清零详情',
      content: `时间: ${util.formatDateTime(new Date(history.executed_at))}\n影响人数: ${history.affected_count}\n重置积分: ${history.total_score_reset}`,
      showCancel: false
    });
  },

  preventBubble() {},
});
