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

  // 加载我的班级
  loadMyClasses: async function () {
    try {
      const db = wx.cloud.database();

      // 查询已加入的班级
      const joinedRes = await db.collection('user_class_relation')
        .where({
          user_openid: app.globalData.openid,
          status: 'joined'
        })
        .get();

      // 查询待审核的班级
      const pendingRes = await db.collection('user_class_relation')
        .where({
          user_openid: app.globalData.openid,
          status: 'pending'
        })
        .get();

      // 获取班级详情
      const myClasses = await this.getClassDetails(joinedRes.data);
      const pendingClasses = await this.getClassDetails(pendingRes.data);

      this.setData({ myClasses, pendingClasses });
    } catch (err) {
      console.error('加载班级失败:', err);
    }
  },

  // 获取班级详情
  getClassDetails: async function (relations) {
    const db = wx.cloud.database();
    const classes = [];

    for (const relation of relations) {
      try {
        const res = await db.collection('classes').doc(relation.class_id).get();
        if (res.data) {
          classes.push({
            ...res.data,
            role: relation.role, // 从关系表中获取角色
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
          url: `/pages/class/detail/detail?id=${classId}`
        });
      }
    });
  },

  // 创建班级
  onCreateClass: function () {
    wx.navigateTo({
      url: '/pages/class/add/add'
    });
  },

  // 加入班级
  onJoinClass: function () {
    wx.navigateTo({
      url: '/pages/join/join'
    });
  }
});
