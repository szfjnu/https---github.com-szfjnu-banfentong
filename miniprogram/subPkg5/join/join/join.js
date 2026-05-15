// pages/join/join.js
const app = getApp();
const util = require('../../../utils/util.js');
const api = require('../../../utils/api.js');

Page({
  data: {
    activeMethod: 'code',
    inputValue: '',
    agreed: false,
    canSearch: false,
    searchResults: [],   // 手机号查询结果列表
    showResults: false    // 是否显示结果列表
  },

  // 切换加入方式
  onMethodChange: function (e) {
    const method = e.currentTarget.dataset.method;
    this.setData({
      activeMethod: method,
      inputValue: '',
      canSearch: false,
      searchResults: [],
      showResults: false
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
  checkCanSearch: function (value, agreed) {
    const isAgreed = agreed !== undefined ? agreed : this.data.agreed;
    if (!isAgreed) return false;

    if (this.data.activeMethod === 'code') {
      return value.length >= 4;
    } else {
      return /^1[3-9]\d{9}$/.test(value);
    }
  },

  onToggleAgreement: function () {
    const agreed = !this.data.agreed;
    this.setData({
      agreed,
      canSearch: this.checkCanSearch(this.data.inputValue, agreed)
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

  // 查找班级（使用云函数绕过数据库安全规则限制）
  onSearch: async function () {
    if (!this.data.canSearch) return;

    wx.showLoading({ title: '查找中...', mask: true });

    try {
      if (this.data.activeMethod === 'code') {
        // 通过班级码查找 - 使用云函数
        const classCode = this.data.inputValue.toUpperCase().trim();
        console.log('正在按班级码查找:', classCode);
        
        const res = await wx.cloud.callFunction({
          name: 'joinClass',
          data: {
            action: 'searchByCode',
            data: { classCode }
          }
        });

        const result = res.result;
        wx.hideLoading();

        if (result.success && result.data && result.data.length > 0) {
          console.log('找到班级:', result.data[0].class_name);
          this.setData({ searchResults: [], showResults: false });
          wx.navigateTo({
            url: `/subPkg5/join/info/info?id=${result.data[0]._id}`
          });
        } else {
          console.log('未找到班级码:', classCode);
          util.showError('未找到班级，请检查班级码是否正确');
        }
      } else {
        // 通过老师手机号查找 - 使用云函数
        const phone = this.data.inputValue.trim();
        console.log('正在按手机号查找:', phone);
        
        const res = await wx.cloud.callFunction({
          name: 'joinClass',
          data: {
            action: 'searchByPhone',
            data: { phone }
          }
        });

        const result = res.result;
        wx.hideLoading();

        if (result.success && result.data && result.data.length > 0) {
          console.log('找到班级数量:', result.data.length);
          if (result.data.length === 1) {
            this.setData({ searchResults: [], showResults: false });
            wx.navigateTo({
              url: `/subPkg5/join/info/info?id=${result.data[0]._id}`
            });
          } else {
            this.setData({
              searchResults: result.data,
              showResults: true
            });
          }
        } else {
          console.log('未找到手机号:', phone);
          util.showError('未找到该老师创建的班级');
        }
      }
    } catch (err) {
      console.error('查找班级失败:', err);
      wx.hideLoading();
      util.showError('查找失败: ' + (err.message || '未知错误'));
    }
  },

  // 选择搜索结果中的班级
  onSelectResult: function (e) {
    const classId = e.currentTarget.dataset.id;
    this.setData({ searchResults: [], showResults: false });
    wx.navigateTo({
      url: `/subPkg5/join/info/info?id=${classId}`
    });
  }
});
