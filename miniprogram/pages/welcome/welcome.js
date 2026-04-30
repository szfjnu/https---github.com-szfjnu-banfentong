// pages/welcome/welcome.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    userInfo: null,
    myClasses: [],
    pendingClasses: [],
    activeTab: 'joined'
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.loadMyClasses();
  },

  // 检查登录
  checkLogin: function () {
    if (!app.globalData.userInfo || !app.globalData.openid) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return;
    }

    this.setData({
      userInfo: app.globalData.userInfo
    });
  },

  // 加载我的班级（使用云函数绕过数据库安全规则限制）
  loadMyClasses: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: {
          action: 'getUserClasses',
          data: {}
        }
      });

      const result = res.result;

      if (result.success && result.data) {
        const joinedClasses = (result.data.joined || []).map(cls => ({
          ...cls,
          role_label: this.getRoleLabel(cls.role)
        }));
        const pendingClasses = (result.data.pending || []).map(cls => ({
          ...cls,
          role_label: this.getRoleLabel(cls.role)
        }));

        this.setData({ myClasses: joinedClasses, pendingClasses });
      }
    } catch (err) {
      console.error('加载班级失败:', err);
    }
  },

  // 获取班级详情（已弃用，改用云函数）
  getClassDetails: async function (relations) {
    const classes = [];

    for (const relation of relations) {
      try {
        const res = await wx.cloud.callFunction({
          name: 'joinClass',
          data: {
            action: 'getClassDetail',
            data: { classId: relation.class_id }
          }
        });

        if (res.result.success && res.result.data) {
          classes.push({
            ...res.result.data,
            role: relation.role,
            role_label: this.getRoleLabel(relation.role),
            relation_id: relation._id,
            is_owner: relation.is_owner || false,
            student_id: relation.student_id || null
          });
        }
      } catch (err) {
        console.error('获取班级详情失败:', err);
      }
    }

    return classes;
  },

  // 获取角色标签
  getRoleLabel: function (role) {
    const roleMap = {
      'teacher': '老师',
      'parent': '家长',
      'student': '学生'
    };
    return roleMap[role] || '成员';
  },

  // 切换标签
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 进入班级
  onEnterClass: function (e) {
    const classItem = e.currentTarget.dataset.item;
    const classId = classItem._id || classItem.class_id;
    
    // 保存当前班级ID到全局变量
    app.globalData.class_id = classId;
    wx.setStorageSync('class_id', classId);
    
    // 保存当前角色到全局变量
    app.globalData.role = classItem.role;
    wx.setStorageSync('role', classItem.role);
    
    // 如果是学生或家长，保存关联的学号
    if ((classItem.role === 'student' || classItem.role === 'parent') && classItem.student_id) {
      app.globalData.student_id = classItem.student_id;
      wx.setStorageSync('student_id', classItem.student_id);
    }
    
    console.log('进入班级:', classItem.class_name, '角色:', classItem.role);
    
    // 跳转到首页
    wx.switchTab({
      url: '/pages/index/index',
      success: () => {
        console.log('跳转首页成功');
      },
      fail: (err) => {
        console.error('跳转首页失败:', err);
        // 如果switchTab失败，尝试navigateTo到班级详情页
        wx.navigateTo({
          url: `/subPages/class/detail/detail?id=${classId}`
        });
      }
    });
  },

  // 创建班级
  onCreateClass: function () {
    wx.navigateTo({
      url: '/subPages/class/add/add'
    });
  },

  // 加入班级
  onJoinClass: function () {
    wx.navigateTo({
      url: '/pages/join/join'
    });
  }
});
