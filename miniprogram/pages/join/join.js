// pages/join/join.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    activeMethod: 'code',
    inputValue: '',
    agreed: false,
    canSearch: false
  },

  // 切换加入方式
  onMethodChange: function (e) {
    const method = e.currentTarget.dataset.method;
    this.setData({
      activeMethod: method,
      inputValue: '',
      canSearch: false
    });
  },

  // 输入变化
  onInputChange: function (e) {
    const value = e.detail.value;
    this.setData({
      inputValue: value,
      canSearch: this.checkCanSearch(value)
    });
  },

  // 检查是否可以搜索
  checkCanSearch: function (value) {
    if (!this.data.agreed) return false;

    if (this.data.activeMethod === 'code') {
      return value.length >= 4;
    } else {
      return /^1[3-9]\d{9}$/.test(value);
    }
  },

  // 切换协议同意
  onToggleAgreement: function () {
    const agreed = !this.data.agreed;
    this.setData({
      agreed,
      canSearch: this.checkCanSearch(this.data.inputValue)
    });
  },

  // 显示帮助
  onShowHelp: function () {
    wx.showModal({
      title: '如何获取班级码？',
      content: '1. 联系班主任或老师获取\n2. 查看班级群公告\n3. 查看学校通知',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  // 显示隐私协议
  onShowPrivacy: function () {
    wx.showModal({
      title: '数据安全和隐私保障规则',
      content: '我们承诺保护您的个人信息安全，仅用于班级管理目的，不会泄露给第三方。',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  // 查找班级
  onSearch: async function () {
    if (!this.data.canSearch) return;

    wx.showLoading({ title: '查找中...', mask: true });

    try {
      const db = wx.cloud.database();
      let query = {};

      if (this.data.activeMethod === 'code') {
        query = { class_code: this.data.inputValue };
      } else {
        query = { creator_phone: this.data.inputValue };
      }

      const res = await db.collection('classes')
        .where(query)
        .limit(1)
        .get();

      wx.hideLoading();

      if (res.data && res.data.length > 0) {
        // 找到班级，跳转到班级信息页
        wx.navigateTo({
          url: `/pages/join/info/info?id=${res.data[0]._id}`
        });
      } else {
        util.showError('未找到班级，请检查输入');
      }
    } catch (err) {
      console.error('查找班级失败:', err);
      wx.hideLoading();
      util.showError('查找失败');
    }
  }
});
