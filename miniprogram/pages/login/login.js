// pages/login/login.js
const app = getApp();
const util = require('../../utils/util.js');
const api = require('../../utils/api.js');

Page({
  data: {
    loading: false
  },

  onLoad: function () {
    // 检查是否已登录
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus: function () {
    if (app.globalData.userInfo && app.globalData.openid) {
      // 已登录,跳转到欢迎页
      wx.redirectTo({
        url: '/pages/welcome/welcome'
      });
    }
  },

  // 获取用户信息回调
  onGetUserInfo: async function (e) {
    console.log('getUserInfo回调:', e);

    // 用户拒绝授权
    if (e.detail.errMsg !== 'getUserInfo:ok') {
      util.showError('需要授权才能登录');
      return;
    }

    this.setData({ loading: true });
    util.showLoading('登录中...');

    try {
      // 1. 调用云函数登录获取openid
      const loginRes = await app.login();
      const openid = loginRes.openid;

      // 2. 获取用户信息
      const userInfo = e.detail.userInfo;

      // 3. 从数据库获取用户详细信息
      let dbUser = null;
      try {
        const dbUserRes = await api.userApi.getUser(openid);
        if (dbUserRes.data && dbUserRes.data.length > 0) {
          dbUser = dbUserRes.data[0];
          // 合并数据库中的额外信息
          userInfo.name = dbUser.name || userInfo.nickName;
        }
      } catch (dbErr) {
        console.log('获取用户数据库信息失败，使用默认信息:', dbErr);
      }

      // 4. 保存或更新用户信息到数据库(不阻塞登录流程)
      this.saveUserInfo(openid, userInfo, dbUser).catch(err => {
        console.error('保存用户信息失败(不影响登录):', err);
      });

      // 5. 更新全局数据
      app.globalData.userInfo = userInfo;
      app.globalData.openid = openid;
      // 角色信息将在用户选择班级后从user_class_relation表中获取

      // 6. 保存到本地存储
      wx.setStorageSync('userInfo', userInfo);
      wx.setStorageSync('openid', openid);

      util.hideLoading();
      util.showSuccess('登录成功');

      // 7. 跳转到欢迎页
      this.setData({ loading: false });
      wx.redirectTo({
        url: '/pages/welcome/welcome',
        fail: (err) => {
          console.error('跳转失败:', err);
          // 如果跳转失败,尝试使用reLaunch
          wx.reLaunch({
            url: '/pages/welcome/welcome'
          });
        }
      });

    } catch (err) {
      console.error('登录失败:', err);
      util.hideLoading();
      util.showError('登录失败: ' + (err.message || '未知错误'));
      this.setData({ loading: false });
    }
  },

  // 保存用户信息到数据库
  saveUserInfo: async function (openid, userInfo, dbUser) {
    try {
      const db = wx.cloud.database();

      const userData = {
        user_id: openid,
        nickname: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl,
        last_login: db.serverDate(),
        is_active: true,
        updated_at: db.serverDate()
      };

      if (dbUser) {
        // 用户已存在,更新信息
        const userId = dbUser._id;
        try {
          await api.userApi.updateUser(userId, userData);
          console.log('用户信息更新成功');
        } catch (updateErr) {
          console.error('更新用户信息失败(可能是权限问题):', updateErr);
        }
      } else {
        // 新用户,添加记录
        userData.created_at = db.serverDate();
        await api.userApi.addUser(userData);
        console.log('新用户添加成功');
      }
    } catch (err) {
      console.error('保存用户信息失败:', err);
      // 不抛出错误,避免阻塞登录流程
    }
  }
});
