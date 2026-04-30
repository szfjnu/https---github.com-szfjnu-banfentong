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

  // 加载数据（使用云函数绕过数据库安全规则限制）
  loadData: async function () {
    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: {
          action: 'getClassDetail',
          data: { classId: this.data.classId }
        }
      });

      const result = res.result;

      if (result.success && result.data) {
        const classInfo = result.data;
        this.setData({
          classInfo: {
            ...classInfo,
            created_at: classInfo.created_at ? util.formatDate(new Date(classInfo.created_at)) : ''
          },
          studentCount: classInfo.studentCount || 0,
          loading: false
        });
      } else {
        this.setData({ loading: false });
        util.showError('加载失败');
      }
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

    if (this.data.selectedRole === 'student') {
      // 学生身份，直接跳转到确认页（录入基本信息后以学生身份加入）
      wx.navigateTo({
        url: `/subPages/join/confirm/confirm?classId=${this.data.classId}&role=student&addNew=true`
      });
    } else if (this.data.selectedRole === 'parent') {
      // 家长身份，跳转到学生绑定页
      wx.navigateTo({
        url: `/subPages/join/bind/bind?classId=${this.data.classId}`
      });
    } else {
      // 老师身份，直接跳转到确认页
      wx.navigateTo({
        url: `/subPages/join/confirm/confirm?classId=${this.data.classId}&role=teacher`
      });
    }
  }
});
