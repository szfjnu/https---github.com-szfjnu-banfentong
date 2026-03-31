// pages/join/info/info.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    classId: '',
    classInfo: null,
    studentCount: 0,
    selectedRole: '',
    loading: true
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ classId: options.id });
      this.loadData();
    }
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();

      // 加载班级信息
      const classRes = await db.collection('classes').doc(this.data.classId).get();
      if (classRes.data) {
        const classInfo = classRes.data;
        this.setData({
          classInfo: {
            ...classInfo,
            created_at: classInfo.created_at ? util.formatDate(new Date(classInfo.created_at)) : ''
          }
        });
      }

      // 统计学生人数
      const studentRes = await db.collection('students')
        .where({
          class_id: this.data.classId
        })
        .count();

      this.setData({
        studentCount: studentRes.total,
        loading: false
      });
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 选择身份
  onSelectRole: function (e) {
    const role = e.currentTarget.dataset.role;
    this.setData({ selectedRole: role });
  },

  // 下一步
  onNext: function () {
    if (!this.data.selectedRole) {
      util.showError('请选择身份');
      return;
    }

    if (this.data.selectedRole === 'parent') {
      // 家长/学生身份，跳转到学生绑定页
      wx.navigateTo({
        url: `/pages/join/bind/bind?classId=${this.data.classId}`
      });
    } else {
      // 老师身份，直接跳转到确认页
      wx.navigateTo({
        url: `/pages/join/confirm/confirm?classId=${this.data.classId}&role=teacher`
      });
    }
  }
});
