// pages/join/confirm/confirm.js
const app = getApp();
const util = require('../../../utils/util.js');
const api = require('../../../utils/api.js');

Page({
  data: {
    classId: '',
    role: '', // parent 或 teacher
    studentId: '',
    studentInfo: null,
    addNew: false,

    formData: {
      student_name: '',
      student_id: '',
      teacher_name: '',
      subject: ''
    },

    relations: ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '其他'],
    selectedRelation: '',

    subjects: ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '体育', '音乐', '美术', '其他'],
    subjectIndex: 12,

    agreed: false,
    canConfirm: false,
    loading: false
  },

  onLoad: function (options) {
    this.setData({
      classId: options.classId,
      role: options.role,
      studentId: options.studentId || '',
      addNew: options.addNew === 'true'
    });

    if (this.data.studentId) {
      this.loadStudentInfo();
    }
  },

  // 加载学生信息
  loadStudentInfo: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({ student_id: this.data.studentId })
        .limit(1)
        .get();

      if (res.data && res.data.length > 0) {
        this.setData({ studentInfo: res.data[0] });
      }
    } catch (err) {
      console.error('加载学生信息失败:', err);
    }
  },

  // 输入变化
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
    this.checkCanConfirm();
  },

  // 选择关系
  onSelectRelation: function (e) {
    const relation = e.currentTarget.dataset.relation;
    this.setData({ selectedRelation: relation });
    this.checkCanConfirm();
  },

  // 选择科目
  onSubjectChange: function (e) {
    const index = e.detail.value;
    this.setData({
      subjectIndex: index,
      'formData.subject': this.data.subjects[index]
    });
  },

  // 切换协议同意
  onToggleAgreement: function () {
    const agreed = !this.data.agreed;
    this.setData({ agreed });
    this.checkCanConfirm();
  },

  // 显示隐私协议
  onShowPrivacy: function () {
    wx.showModal({
      title: '用户协议',
      content: '我们承诺保护您的个人信息安全，仅用于班级管理目的，不会泄露给第三方。',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  // 检查是否可以确认
  checkCanConfirm: function () {
    let canConfirm = this.data.agreed;

    if (this.data.role === 'student') {
      // 学生身份：必须填写姓名和学号
      canConfirm = canConfirm &&
        this.data.formData.student_name.trim() &&
        this.data.formData.student_id.trim();
    } else if (this.data.role === 'parent') {
      if (this.data.addNew) {
        canConfirm = canConfirm &&
          this.data.formData.student_name.trim() &&
          this.data.formData.student_id.trim() &&
          this.data.selectedRelation;
      } else {
        canConfirm = canConfirm && this.data.selectedRelation;
      }
    } else if (this.data.role === 'teacher') {
      canConfirm = canConfirm && this.data.formData.teacher_name.trim();
    }

    this.setData({ canConfirm });
  },

  // 确认加入（使用云函数绕过数据库安全规则限制）
  onConfirm: async function () {
    if (!this.data.canConfirm) return;

    this.setData({ loading: true });

    try {
      const openid = app.globalData.openid;

      // 构建表单数据
      const formData = {};
      if (this.data.role === 'student') {
        formData.student_name = this.data.formData.student_name.trim();
        formData.student_id = this.data.formData.student_id.trim();
      } else if (this.data.role === 'parent') {
        if (this.data.addNew) {
          formData.student_name = this.data.formData.student_name.trim();
          formData.student_id = this.data.formData.student_id.trim();
        }
        formData.relation = this.data.selectedRelation;
      } else if (this.data.role === 'teacher') {
        formData.teacher_name = this.data.formData.teacher_name.trim();
        formData.subject = this.data.formData.subject;
      }

      // 调用云函数完成加入操作
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: {
          action: 'joinClass',
          data: {
            classId: this.data.classId,
            role: this.data.role,
            studentId: this.data.studentId || '',
            addNew: this.data.addNew,
            formData: formData
          }
        }
      });

      const result = res.result;
      this.setData({ loading: false });

      if (result.success) {
        // 将班级ID保存到全局变量
        app.globalData.class_id = this.data.classId;
        wx.setStorageSync('class_id', this.data.classId);

        // 如果是家长或学生，保存关联的学号
        if (result.data && result.data.studentId) {
          app.globalData.student_id = result.data.studentId;
          wx.setStorageSync('student_id', result.data.studentId);
        }

        // 显示成功提示
        wx.showModal({
          title: '加入成功',
          content: '您已成功加入班级！',
          showCancel: false,
          success: () => {
            wx.redirectTo({
              url: '/subPkg5/welcome/welcome'
            });
          }
        });
      } else if (result.alreadyJoined) {
        wx.showModal({
          title: '提示',
          content: '您已经加入了该班级，无需重复加入',
          showCancel: false,
          success: () => {
            wx.redirectTo({
              url: '/subPkg5/welcome/welcome'
            });
          }
        });
      } else {
        util.showError(result.error || '加入失败');
      }
    } catch (err) {
      console.error('加入班级失败:', err);
      this.setData({ loading: false });
      util.showError('加入失败');
    }
  }
});
