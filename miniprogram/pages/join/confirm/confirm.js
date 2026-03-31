// pages/join/confirm/confirm.js
const app = getApp();
const util = require('../../../utils/util.js');

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
      const res = await db.collection('students').doc(this.data.studentId).get();

      if (res.data) {
        this.setData({ studentInfo: res.data });
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

    if (this.data.role === 'parent') {
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

  // 确认加入
  onConfirm: async function () {
    if (!this.data.canConfirm) return;

    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();

      // 如果是添加新学生
      let studentId = this.data.studentId;
      if (this.data.addNew && this.data.role === 'parent') {
        // 创建学生记录
        const studentData = {
          name: this.data.formData.student_name.trim(),
          student_id: this.data.formData.student_id.trim(),
          class_id: this.data.classId,
          current_score: 100,
          initial_score: 100,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        };

        const studentRes = await db.collection('students').add({ data: studentData });
        studentId = studentRes._id;
      }

      // 创建 user_class_relation 记录
      const relationData = {
        user_openid: app.globalData.openid,
        class_id: this.data.classId,
        role: this.data.role,
        is_owner: false,
        status: 'joined', // 或 'pending' 需要审核
        join_time: db.serverDate(),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      };

      if (this.data.role === 'parent') {
        relationData.student_id = studentId;
        relationData.apply_info = {
          relation: this.data.selectedRelation
        };
      } else if (this.data.role === 'teacher') {
        relationData.apply_info = {
          name: this.data.formData.teacher_name.trim(),
          subject: this.data.formData.subject
        };
      }

      await db.collection('user_class_relation').add({ data: relationData });

      // 将班级ID保存到全局变量
      app.globalData.class_id = this.data.classId;
      wx.setStorageSync('class_id', this.data.classId);

      // 如果是家长或学生，保存关联的学号
      if (this.data.role === 'parent' && studentId) {
        app.globalData.student_id = studentId;
        wx.setStorageSync('student_id', studentId);
      }

      this.setData({ loading: false });

      // 显示成功提示
      wx.showModal({
        title: '加入成功',
        content: '您已成功加入班级！',
        showCancel: false,
        success: () => {
          // 返回欢迎页
          wx.redirectTo({
            url: '/pages/welcome/welcome'
          });
        }
      });
    } catch (err) {
      console.error('加入班级失败:', err);
      this.setData({ loading: false });
      util.showError('加入失败');
    }
  }
});
