// pages/discipline/record/add/add.js - 添加处分记录
const app = getApp();

Page({
  data: {
    loading: true,
    classId: '',
    levelConfigs: [],
    selectedLevelIndex: 0,
    students: [],
    selectedStudentIndex: 0,
    form: {
      student_id: '',
      student_name: '',
      level_config_id: '',
      level_name: '',
      reason: '',
      issue_date: '',
      issuer: '',
      document_id: '',
      score_deduction: 0,
      probation_months: 0,
      thought_reports_required: 0,
      service_hours_required: 0,
      affects_excellence_award: true
    },
    submitting: false
  },

  onLoad: function () {
    const today = this.formatDate(new Date());
    this.setData({
      classId: app.globalData.class_id,
      'form.issue_date': today,
      'form.issuer': app.globalData.userInfo ? app.globalData.userInfo.nickName || '' : ''
    });
    this.loadData();
  },

  loadData: async function () {
    this.setData({ loading: true });
    try {
      await Promise.all([this.loadLevelConfigs(), this.loadStudents()]);
    } catch (err) {
      console.error('加载数据失败:', err);
    }
    this.setData({ loading: false });
  },

  loadLevelConfigs: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: { action: 'getLevelConfigs', data: { class_id: this.data.classId } }
      });
      if (res.result && res.result.success) {
        const levels = res.result.data;
        this.setData({ levelConfigs: levels });
        if (levels.length > 0) {
          this.onLevelChange({ detail: { value: 0 } });
        }
      }
    } catch (err) {
      console.error('加载级别配置失败:', err);
    }
  },

  loadStudents: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({
          class_id: this.data.classId,
          status: db.command.neq('graduated')
        })
        .orderBy('name', 'asc')
        .limit(200)
        .get();

      const students = (res.data || []).map(s => ({
        ...s,
        name: s.name || s.student_name || ''
      }));
      this.setData({ students });
    } catch (err) {
      console.error('加载学生列表失败:', err);
      this.setData({ students: [] });
    }
  },

  onStudentChange: function (e) {
    const idx = Number(e.detail.value);
    const student = this.data.students[idx];
    if (student) {
      this.setData({
        selectedStudentIndex: idx,
        'form.student_id': student.student_id,
        'form.student_name': student.name
      });
    }
  },

  onLevelChange: function (e) {
    const idx = Number(e.detail.value);
    const level = this.data.levelConfigs[idx];
    if (level) {
      this.setData({
        selectedLevelIndex: idx,
        'form.level_config_id': level.config_id || '',
        'form.level_name': level.level_name,
        'form.score_deduction': level.score_deduction,
        'form.probation_months': level.probation_months,
        'form.thought_reports_required': level.thought_reports,
        'form.service_hours_required': level.service_hours
      });
    }
  },

  onInput: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const numericFields = ['score_deduction', 'probation_months', 'thought_reports_required', 'service_hours_required'];
    this.setData({ [`form.${field}`]: numericFields.includes(field) ? Number(value) : value });
  },

  onSwitchChange: function (e) {
    this.setData({ 'form.affects_excellence_award': e.detail.value });
  },

  formatDate: function (date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  onDateChange: function (e) {
    this.setData({ 'form.issue_date': e.detail.value });
  },

  onSubmit: async function () {
    const { form, classId } = this.data;
    if (!form.student_id) { wx.showToast({ title: '请选择学生', icon: 'none' }); return; }
    if (!form.level_name) { wx.showToast({ title: '请选择处分级别', icon: 'none' }); return; }
    if (!form.reason) { wx.showToast({ title: '请填写处分原因', icon: 'none' }); return; }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: {
          action: 'addDisciplineRecord',
          data: {
            class_id: classId,
            student_id: form.student_id,
            student_name: form.student_name,
            level_config_id: form.level_config_id,
            level_name: form.level_name,
            reason: form.reason,
            issue_date: form.issue_date,
            issuer: form.issuer,
            document_id: form.document_id,
            score_deduction: form.score_deduction,
            probation_months: form.probation_months,
            thought_reports_required: form.thought_reports_required,
            service_hours_required: form.service_hours_required,
            affects_excellence_award: form.affects_excellence_award,
            semester_id: app.globalData.currentSemesterId || ''
          }
        }
      });

      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '处分记录添加成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.result.message || '添加失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
    this.setData({ submitting: false });
  }
});
