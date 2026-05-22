// pages/usercenter/usercenter.js
const app = getApp();
const util = require('../../utils/util.js');

Page({
  data: {
    loading: true,
    userInfo: null,
    role: '',
    roleLabel: '',
    openid: '',
    classId: '',
    className: '',
    studentId: '',

    // 统计
    unreadCount: 0,
    unreadByType: {},

    // 会员
    membershipLevel: 'free',
    membershipStatus: 'active',

    // 功能菜单
    menuGroups: []
  },

  onLoad: function () {
    this.initPage();
  },

  onShow: function () {
    this.loadUnreadCount();
  },

  // 检查学生是否有审批权限，动态添加审批入口
  checkStudentApprovePermission: async function (menuItems) {
    try {
      const db = wx.cloud.database();
      const studentId = app.globalData.student_id;
      const classId = app.globalData.class_id;
      if (!studentId || !classId) return;

      const res = await db.collection('student_authorizations')
        .where({ class_id: classId, student_id: studentId })
        .limit(1)
        .get();

      if (res.data && res.data.length > 0) {
        const permissions = res.data[0].permissions || {};
        const hasApprove = Object.values(permissions).some(actions =>
          Array.isArray(actions) && actions.includes('approve')
        );
        if (hasApprove) {
          menuItems.push({
            id: 'my_approval',
            title: '待我审批',
            icon: '✅',
            color: '#52c41a',
            url: '/subPkg1/approval/approval'
          });
          // 更新已渲染的菜单
          this.setData({
            menuGroups: this.data.menuGroups.map(group => {
              if (group.title === '我的记录') {
                return { ...group, items: [...menuItems] };
              }
              return group;
            })
          });
        }
      }
    } catch (err) {
      console.error('检查审批权限失败:', err);
    }
  },

  onPullDownRefresh: function () {
    this.initPage();
  },

  initPage: async function () {
    const role = app.globalData.role;
    const userInfo = app.globalData.userInfo;
    const openid = app.globalData.openid;
    const classId = app.globalData.class_id;
    const studentId = app.globalData.student_id;

    if (!openid) {
      wx.redirectTo({ url: '/subPkg5/login/login' });
      return;
    }

    this.setData({
      userInfo,
      role,
      roleLabel: this.getRoleLabel(role),
      openid,
      classId,
      className: app.globalData.currentClassName || '',
      studentId
    });

    this.loadMenuGroups(role);
    this.loadUnreadCount();
    this.loadUserProfile();
    this.setData({ loading: false });
    wx.stopPullDownRefresh();
  },

  getRoleLabel: function (role) {
    const map = {
      'admin': '管理员',
      'head_teacher': '班主任',
      'subject_teacher': '科任老师',
      'class_cadre': '班干部',
      'student': '学生',
      'parent': '家长'
    };
    return map[role] || '未知角色';
  },

  loadUserProfile: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'getUserProfile', data: {} }
      });
      if (res.result && res.result.success) {
        const profile = res.result.data;
        this.setData({
          membershipLevel: profile.membershipLevel || 'free',
          membershipStatus: profile.membershipStatus || 'active'
        });
      }
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  },

  loadUnreadCount: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'getUnreadCount', data: {} }
      });
      if (res.result && res.result.success) {
        this.setData({
          unreadCount: res.result.data.total,
          unreadByType: res.result.data.typeCounts
        });
      }
    } catch (err) {
      console.error('加载未读数失败:', err);
    }
  },

  loadMenuGroups: function (role) {
    let menuGroups = [];

    // 基础功能（所有用户可见）
    menuGroups.push({
      title: '消息中心',
      items: [
        {
          id: 'notifications',
          title: '我的通知',
          icon: '📢',
          color: '#1890ff',
          url: '/subPkg5/usercenter/notifications/notifications',
          badge: this.data.unreadCount || 0
        }
      ]
    });

    // 管理员/教师功能
    if (role === 'admin' || role === 'head_teacher' || role === 'subject_teacher') {
      menuGroups.push({
        title: '管理功能',
        items: [
          {
            id: 'publish_notification',
            title: '发布通知',
            icon: '✉️',
            color: '#722ed1',
            url: '/subPkg5/usercenter/notifications/notifications?tab=publish'
          },
          {
            id: 'discipline',
            title: '处分管理',
            icon: '⚠️',
            color: '#ff4d4f',
            url: '/subPkg1/discipline/record/record'
          },
          {
            id: 'activity_audit',
            title: '活动审核',
            icon: '🎪',
            color: '#667eea',
            url: '/subPkg3/activity/audit/audit'
          }
        ]
      });
    }

    // 管理员/班主任专属功能
    if (role === 'admin' || role === 'head_teacher') {
      menuGroups.push({
        title: '校园服务',
        items: [
          {
            id: 'grade',
            title: '成绩管理',
            icon: '📊',
            color: '#722ed1',
            url: '/subPkg3/grade/grade'
          },
          {
            id: 'aichat',
            title: '微聊陪伴',
            icon: '💬',
            color: '#667eea',
            url: '/subPkg3/aichat/aichat'
          },
          {
            id: 'treehole',
            title: '心灵树洞',
            icon: '🌳',
            color: '#52c41a',
            url: '/subPkg3/treehole/treehole'
          },
          {
            id: 'activity',
            title: '聚光点',
            icon: '🎪',
            color: '#667eea',
            url: '/subPkg3/activity/list/list'
          },
          {
            id: 'hero',
            title: '英雄台',
            icon: '🏆',
            color: '#faad14',
            url: '/subPkg3/hero/hero'
          },
          {
            id: 'flea',
            title: '校园闲鱼',
            icon: '🏷',
            color: '#fa8c16',
            url: '/subPkg3/flea/flea'
          }
        ]
      });
    }

    // 科任老师也能访问部分校园服务
    if (role === 'subject_teacher') {
      menuGroups.push({
        title: '校园服务',
        items: [
          {
            id: 'grade',
            title: '成绩管理',
            icon: '📊',
            color: '#722ed1',
            url: '/subPkg3/grade/grade'
          },
          {
            id: 'activity',
            title: '聚光点',
            icon: '🎪',
            color: '#667eea',
            url: '/subPkg3/activity/list/list'
          },
          {
            id: 'hero',
            title: '英雄台',
            icon: '🏆',
            color: '#faad14',
            url: '/subPkg3/hero/hero'
          }
        ]
      });
    }

    // 管理员/班主任专属功能
    if (role === 'admin' || role === 'head_teacher') {
      menuGroups.push({
        title: '系统管理',
        items: [
          {
            id: 'authorization',
            title: '授权管理',
            icon: '🔐',
            color: '#13c2c2',
            url: '/subPkg4/authorization/authorization'
          }
        ]
      });
    }

    if (role === 'admin') {
      const sysGroup = menuGroups.find(g => g.title === '系统管理');
      if (sysGroup) {
        sysGroup.items.push({
          id: 'user_permission',
          title: '用户权限管理',
          icon: '👥',
          color: '#ff4d4f',
          url: '/subPkg4/admin/users/users'
        });
      }
    }

    // 即将上线功能预告
    const upcomingItems = [];
    if (role === 'admin' || role === 'head_teacher') {
      upcomingItems.push(
        { id: 'transfer', title: '升学转段监控', icon: '🎓', color: '#13c2c2', disabled: true, desc: '转段科目与证书达标监控' },
        { id: 'career', title: '就业推荐', icon: '💼', color: '#1890ff', disabled: true, desc: '企业招聘信息与推荐' }
      );
    }
    if (role === 'subject_teacher') {
      upcomingItems.push(
        { id: 'homework', title: '作业管理', icon: '📝', color: '#722ed1', disabled: true, desc: '在线布置与批改' }
      );
    }
    if (role === 'student' || role === 'class_cadre') {
      upcomingItems.push(
        { id: 'study_plan', title: '学习计划', icon: '📖', color: '#1890ff', disabled: true, desc: '制定与追踪学习目标' },
        { id: 'career', title: '就业推荐', icon: '💼', color: '#13c2c2', disabled: true, desc: '实习与招聘信息' }
      );
    }
    if (role === 'parent') {
      upcomingItems.push(
        { id: 'study_report', title: '成长报告', icon: '📊', color: '#722ed1', disabled: true, desc: '学期成长综合报告' }
      );
    }

    // 学生/家长：已上线的功能入口
    if (role === 'student') {
      const studentMenuItems = [
        {
          id: 'complete_info',
          title: '信息补全',
          icon: '📝',
          color: '#1890ff',
          url: '/subPkg5/usercenter/complete/complete'
        },
        {
          id: 'my_discipline',
          title: '我的处分',
          icon: '⚠️',
          color: '#ff4d4f',
          url: '/subPkg1/discipline/my-discipline/my-discipline'
        },
        {
          id: 'aichat',
          title: '微聊陪伴',
          icon: '💬',
          color: '#667eea',
          url: '/subPkg3/aichat/aichat'
        },
        {
          id: 'treehole',
          title: '心灵树洞',
          icon: '🌳',
          color: '#52c41a',
          url: '/subPkg3/treehole/treehole'
        },
        {
          id: 'activity',
          title: '聚光点',
          icon: '🎪',
          color: '#667eea',
          url: '/subPkg3/activity/list/list'
        },
        {
          id: 'hero',
          title: '英雄台',
          icon: '🏆',
          color: '#faad14',
          url: '/subPkg3/hero/hero'
        },
        {
          id: 'flea',
          title: '校园闲鱼',
          icon: '🏷',
          color: '#fa8c16',
          url: '/subPkg3/flea/flea'
        },
        {
          id: 'grade',
          title: '成绩管理',
          icon: '📊',
          color: '#722ed1',
          url: '/subPkg3/grade/grade'
        },
        {
          id: 'my_duty',
          title: '我的值日',
          icon: '🧹',
          color: '#13c2c2',
          url: '/subPkg1/duty/myduty/myduty'
        }
      ];

      // 检查学生是否有审批权限（异步添加）
      this.checkStudentApprovePermission(studentMenuItems);

      menuGroups.push({
        title: '我的记录',
        items: studentMenuItems
      });
    }
    if (role === 'parent') {
      menuGroups.push({
        title: '孩子信息',
        items: [
          {
            id: 'complete_info',
            title: '信息补全',
            icon: '📝',
            color: '#1890ff',
            url: '/subPkg5/usercenter/complete/complete'
          }
        ]
      });
      menuGroups.push({
        title: '孩子记录',
        items: [
          {
            id: 'child_discipline',
            title: '处分记录',
            icon: '⚠️',
            color: '#ff4d4f',
            url: '/subPkg1/discipline/my-discipline/my-discipline'
          },
          {
            id: 'child_duty',
            title: '值日信息',
            icon: '🧹',
            color: '#13c2c2',
            url: '/subPkg1/duty/myduty/myduty'
          }
        ]
      });
      menuGroups.push({
        title: '校园服务',
        items: [
          {
            id: 'hero',
            title: '英雄台',
            icon: '🏆',
            color: '#faad14',
            url: '/subPkg3/hero/hero'
          },
          {
            id: 'grade',
            title: '成绩管理',
            icon: '📊',
            color: '#722ed1',
            url: '/subPkg3/grade/grade'
          }
        ]
      });
    }

    if (upcomingItems.length > 0) {
      menuGroups.push({
        title: '即将上线',
        items: upcomingItems
      });
    }

    // 设置
    menuGroups.push({
      title: '设置',
      items: [
        { id: 'settings', title: '个人设置', icon: '⚙️', color: '#8c8c8c', url: '/subPkg5/usercenter/settings/settings' },
        { id: 'notification_settings', title: '通知偏好', icon: '🔔', color: '#faad14', url: '/subPkg5/usercenter/settings/settings?tab=notification' },
        { id: 'about', title: '关于', icon: 'ℹ️', color: '#1890ff', url: '' }
      ]
    });

    this.setData({ menuGroups });
  },

  onMenuItemTap: function (e) {
    const { id, url, disabled } = e.currentTarget.dataset;

    if (disabled) {
      wx.showToast({ title: '功能开发中，敬请期待', icon: 'none', duration: 2000 });
      return;
    }

    if (!url) {
      if (id === 'about') {
        wx.showModal({
          title: '关于',
          content: '学生成长管理系统 v2.5\n\n专注于班级积分管理、考勤管理、志愿服务、宿舍管理、值日管理等功能的综合管理平台。\n\nv2.5 新增：成绩管理、微聊陪伴、心灵树洞、英雄台、校园闲鱼、聚光点',
          showCancel: false
        });
      }
      return;
    }

    wx.navigateTo({ url });
  },

  // 退出登录
  onLogout: function () {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录，是否继续？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('openid');
          wx.removeStorageSync('class_id');
          wx.removeStorageSync('role');
          wx.removeStorageSync('student_id');

          // 清除全局数据
          app.globalData.userInfo = null;
          app.globalData.openid = null;
          app.globalData.role = null;
          app.globalData.class_id = null;
          app.globalData.student_id = null;

          wx.redirectTo({ url: '/subPkg5/login/login' });
        }
      }
    });
  }
});
