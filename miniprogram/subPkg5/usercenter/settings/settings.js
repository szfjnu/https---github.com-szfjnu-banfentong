// pages/usercenter/settings/settings.js
const app = getApp();

const ROLE_MAP = {
  'admin': '管理员',
  'head_teacher': '班主任',
  'subject_teacher': '科任教师',
  'class_cadre': '班干部',
  'student': '学生',
  'parent': '家长',
  'new_user': '新用户'
};

Page({
  data: {
    loading: true,
    activeTab: 'profile',

    userInfo: null,
    nickname: '',
    phone: '',
    email: '',
    role: '',
    roleLabel: '',
    className: '',

    notificationPreferences: {},

    privacySettings: {
      show_score_to_parent: true,
      show_attendance_to_parent: true,
      show_dorm_to_parent: true,
      show_volunteer_to_parent: true
    },

    displaySettings: {
      dark_mode: false,
      font_size: 'medium',
      language: 'zh-CN'
    },

    notificationTypes: [
      { key: 'system', label: '系统通知', icon: '📢' },
      { key: 'discipline', label: '处分通知', icon: '⚠️' },
      { key: 'discipline_revoke', label: '撤销处分', icon: '✅' },
      { key: 'grade', label: '成绩通知', icon: '📝' },
      { key: 'transfer', label: '转段监控', icon: '🎓' },
      { key: 'treehole', label: '树洞消息', icon: '🌳' },
      { key: 'market', label: '咸鱼市场', icon: '🛒' },
      { key: 'score', label: '积分变动', icon: '⭐' },
      { key: 'attendance', label: '考勤提醒', icon: '📋' },
      { key: 'duty', label: '值日提醒', icon: '🧹' },
      { key: 'dorm', label: '宿舍通知', icon: '🏠' },
      { key: 'volunteer', label: '志愿服务', icon: '🤝' },
      { key: 'approval', label: '审批通知', icon: '✍️' },
      { key: 'birthday', label: '生日祝福', icon: '🎂' },
      { key: 'weather', label: '天气提醒', icon: '🌤️' },
      { key: 'semester', label: '学期通知', icon: '📅' }
    ],

    fontSizeOptions: [
      { value: 'small', label: '小' },
      { value: 'medium', label: '中' },
      { value: 'large', label: '大' }
    ]
  },

  onLoad: function (options) {
    if (options.tab) {
      this.setData({ activeTab: options.tab });
    }
    this.loadSettings();
  },

  onShow: function () {
    this.loadSettings();
  },

  loadSettings: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'getUserSettings', data: {} }
      });

      if (res.result && res.result.success) {
        const settings = res.result.data;
        this.setData({
          notificationPreferences: settings.notification_preferences || {},
          privacySettings: settings.privacy_settings || this.data.privacySettings,
          displaySettings: settings.display_settings || this.data.displaySettings
        });
        if (settings.display_settings && settings.display_settings.font_size) {
          wx.setStorageSync('display_font_size', settings.display_settings.font_size);
        }
      }

      const profileRes = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'getUserProfile', data: {} }
      });

      if (profileRes.result && profileRes.result.success) {
        const profile = profileRes.result.data;
        const role = profile.role || app.globalData.role || '';
        const className = profile.class_name || app.globalData.currentClassName || '';
        const autoPhone = profile.phone || app.globalData.phone || (app.globalData.userInfo && app.globalData.userInfo.phone) || '';
        const nickname = profile.nickname || profile.nickName || (app.globalData.userInfo && (app.globalData.userInfo.nickName || app.globalData.userInfo.nickname)) || '';
        const avatarUrl = profile.avatarUrl || (app.globalData.userInfo && app.globalData.userInfo.avatarUrl) || '';

        this.setData({
          userInfo: { ...profile, role, class_name: className, avatarUrl },
          nickname,
          phone: autoPhone,
          email: profile.email || '',
          role,
          roleLabel: ROLE_MAP[role] || role || '未设置',
          className: className || '未分配',
          membershipLevel: profile.membershipLevel || (profile.membership && profile.membership.level) || 'free'
        });

        if (autoPhone && !profile.phone) {
          app.globalData.phone = autoPhone;
        }
        if (role && !app.globalData.role) {
          app.globalData.role = role;
          wx.setStorageSync('role', role);
        }
        if (className && !app.globalData.currentClassName) {
          app.globalData.currentClassName = className;
        }
      } else {
        this._loadFromGlobalData();
      }

      this.setData({ loading: false });
    } catch (err) {
      console.error('加载设置失败:', err);
      this._loadFromGlobalData();
      this.setData({ loading: false });
    }
  },

  _loadFromGlobalData: function () {
    const role = app.globalData.role || '';
    const className = app.globalData.currentClassName || '';
    const phone = app.globalData.phone || (app.globalData.userInfo && app.globalData.userInfo.phone) || '';
    const nickname = (app.globalData.userInfo && (app.globalData.userInfo.nickName || app.globalData.userInfo.nickname)) || '';
    const avatarUrl = (app.globalData.userInfo && app.globalData.userInfo.avatarUrl) || '';

    this.setData({
      userInfo: {
        role,
        class_name: className,
        avatarUrl,
        phone
      },
      nickname,
      phone,
      role,
      roleLabel: ROLE_MAP[role] || role || '未设置',
      className: className || '未分配'
    });
  },

  // 切换Tab
  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 修改个人信息
  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value });
  },

  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value });
  },

  onEmailInput: function (e) {
    this.setData({ email: e.detail.value });
  },

  saveProfile: async function () {
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'updateUserProfile',
          data: {
            nickname: this.data.nickname,
            phone: this.data.phone,
            email: this.data.email
          }
        }
      });

      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.setData({
          'userInfo.nickname': this.data.nickname,
          'userInfo.phone': this.data.phone,
          'userInfo.email': this.data.email
        });
        if (this.data.phone) {
          app.globalData.phone = this.data.phone;
          wx.setStorageSync('phone', this.data.phone);
        }
        if (app.globalData.userInfo) {
          app.globalData.userInfo.nickname = this.data.nickname;
          app.globalData.userInfo.nickName = this.data.nickname;
          app.globalData.userInfo.phone = this.data.phone;
          app.globalData.userInfo.email = this.data.email;
          wx.setStorageSync('userInfo', app.globalData.userInfo);
        }
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 通知偏好开关
  onNotificationToggle: async function (e) {
    const type = e.currentTarget.dataset.type;
    const field = e.currentTarget.dataset.field; // enabled / push
    const prefs = { ...this.data.notificationPreferences };

    if (!prefs[type]) prefs[type] = { enabled: true, push: true };
    prefs[type][field] = e.detail.value;

    this.setData({ notificationPreferences: prefs });

    try {
      await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'updateNotificationPreference',
          data: { type, [field]: e.detail.value }
        }
      });
    } catch (err) {
      console.error('更新通知偏好失败:', err);
    }
  },

  // 隐私设置开关
  onPrivacyToggle: async function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const privacySettings = { ...this.data.privacySettings };
    privacySettings[field] = value;
    this.setData({ privacySettings });

    try {
      await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'updateUserSettings',
          data: { privacy_settings: privacySettings }
        }
      });
    } catch (err) {
      console.error('更新隐私设置失败:', err);
    }
  },

  // 字体大小选择
  onFontSizeChange: async function (e) {
    const value = e.currentTarget.dataset.value;
    const displaySettings = { ...this.data.displaySettings };
    displaySettings.font_size = value;
    this.setData({ displaySettings });

    wx.setStorageSync('display_font_size', value);

    try {
      await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'updateUserSettings',
          data: { display_settings: displaySettings }
        }
      });

      wx.showToast({ title: '字体大小已更新，重启后生效', icon: 'none', duration: 2000 });
    } catch (err) {
      console.error('更新显示设置失败:', err);
    }
  },

  // 选择头像
  onChooseAvatar: function () {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中...' });
        try {
          const cloudPath = `avatars/${app.globalData.openid}_${Date.now()}.jpg`;
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath
          });

          await wx.cloud.callFunction({
            name: 'manageUserCenter',
            data: {
              action: 'updateUserProfile',
              data: { avatarUrl: uploadRes.fileID }
            }
          });

          if (app.globalData.userInfo) {
            app.globalData.userInfo.avatarUrl = uploadRes.fileID;
            wx.setStorageSync('userInfo', app.globalData.userInfo);
          }

          this.setData({ 'userInfo.avatarUrl': uploadRes.fileID });
          wx.hideLoading();
          wx.showToast({ title: '头像更新成功', icon: 'success' });
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      }
    });
  }
});
