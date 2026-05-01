// app.js
const membership = require('./utils/membership.js');

App({
  // 全局数据
  globalData: {
    userInfo: null,
    openid: null,
    role: null, // admin, head_teacher, subject_teacher, class_cadre, student, parent
    student_id: null, // 学生或家长关联的学号
    class_id: null, // 用户关联的班级ID，用于数据隔离
    currentSemester: null,
    currentSemesterId: null, // 当前学期ID
    currentSemesterName: null, // 当前学期名称
    currentClassName: null, // 当前班级名称
    envId: null,
    // 会员相关
    membership: null, // 会员信息
    membershipPermissions: null // 会员权限
  },

  // 小程序初始化
  onLaunch: function () {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: "cloud1-8gu6objx6e491c6e", // env 参数说明:
        //   env 参数决定接下来小程序发起的云开发调用(wx.cloud.xxx)会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境(第一个创建的环境)
        env: this.getEnvId(),
        traceUser: true,
      });
    }

    // 检查登录状态并恢复数据
    this.checkLoginStatus();

    // 应用字体大小设置
    this.applyFontSize();
  },

  applyFontSize: function () {
    const fontSizeSetting = wx.getStorageSync('display_font_size') || 'medium';
    const fontSizeMap = { small: '24rpx', medium: '28rpx', large: '32rpx' };
    const fontSize = fontSizeMap[fontSizeSetting] || '28rpx';
    const pages = getCurrentPages();
    if (pages.length > 0) {
      pages[0].setData({ _fontSizeBase: fontSize });
    }
  },

  // 获取云开发环境ID
  getEnvId: function () {
    // 从配置文件或环境变量中获取
    // 开发环境可以硬编码,生产环境应该从配置中读取
    return 'cloud1-8gu6objx6e491c6e'; // 请替换为您的云开发环境ID
  },

  // 检查登录状态
  checkLoginStatus: function () {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    const classId = wx.getStorageSync('class_id');
    const role = wx.getStorageSync('role');
    const studentId = wx.getStorageSync('student_id');

    if (userInfo && openid) {
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      console.log('用户已登录:', userInfo.nickName || userInfo.name);
      
      // 恢复班级相关数据
      if (classId) {
        this.globalData.class_id = classId;
        console.log('已恢复班级ID:', classId);
      }
      if (role) {
        this.globalData.role = role;
        console.log('已恢复角色:', role);
      }
      if (studentId) {
        this.globalData.student_id = studentId;
        console.log('已恢复学号:', studentId);
      }
      // 恢复学期ID
      const semesterId = wx.getStorageSync('currentSemesterId');
      if (semesterId) {
        this.globalData.currentSemesterId = semesterId;
        console.log('已恢复学期ID:', semesterId);
      }
      // 异步获取最新学期信息
      this.getCurrentSemester();
    } else {
      console.log('用户未登录');
    }
  },

  // 清除班级相关数据（仅在需要切换班级时调用）
  clearClassData: function () {
    // 清除全局变量
    this.globalData.class_id = null;
    this.globalData.student_id = null;
    this.globalData.role = null;
    
    // 清除本地存储
    wx.removeStorageSync('class_id');
    wx.removeStorageSync('student_id');
    wx.removeStorageSync('role');
    
    console.log('已清除班级数据');
  },

  // 用户登录
  login: function () {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        data: {},
        success: async res => {
          console.log('登录成功:', res);
          this.globalData.openid = res.result.openid;
          wx.setStorageSync('openid', res.result.openid);
          
          // 初始化会员信息
          try {
            await membership.initUserMembership(res.result.openid);
            const membershipInfo = await membership.getUserMembership(res.result.openid);
            this.globalData.membership = membershipInfo;
            this.globalData.membershipPermissions = membershipInfo?.permissions || null;
            console.log('会员信息:', membershipInfo);
          } catch (err) {
            console.error('初始化会员信息失败:', err);
          }
          
          resolve(res.result);
        },
        fail: err => {
          console.error('登录失败:', err);
          reject(err);
        }
      });
    });
  },

  // 检查会员权限
  checkMembershipPermission: async function (featureCode) {
    const openid = this.globalData.openid;
    if (!openid) {
      return { allowed: false, reason: '请先登录' };
    }
    return await membership.checkFeatureAccess(openid, featureCode);
  },

  // 检查创建班级权限
  checkCreateClassPermission: async function () {
    const openid = this.globalData.openid;
    if (!openid) {
      return { allowed: false, reason: '请先登录', remaining: 0 };
    }
    return await membership.checkCreateClassPermission(openid);
  },

  // 获取会员等级名称
  getMembershipLevelName: function () {
    const level = this.globalData.membership?.level || 'free';
    return membership.getMembershipLevelName(level);
  },

  // 获取会员状态名称
  getMembershipStatusName: function () {
    const status = this.globalData.membership?.status || 'active';
    return membership.getMembershipStatusName(status);
  },

  // 刷新会员信息
  refreshMembership: async function () {
    const openid = this.globalData.openid;
    if (!openid) return;
    
    try {
      const membershipInfo = await membership.getUserMembership(openid);
      this.globalData.membership = membershipInfo;
      this.globalData.membershipPermissions = membershipInfo?.permissions || null;
    } catch (err) {
      console.error('刷新会员信息失败:', err);
    }
  },

  // 检查权限
  hasPermission: function (module, action) {
    const role = this.globalData.role;
    if (!role) return false;

    // 权限配置表
    const permissions = {
      admin: {
        all: ['read', 'write', 'delete', 'approve'],
        // 管理员拥有所有权限，数据隔离为全局
      },
      head_teacher: {
        student: ['read', 'write', 'delete'],
        score: ['read', 'write', 'approve'],
        attendance: ['read', 'write'],
        dorm: ['read', 'write'],
        discipline: ['read', 'write'],
        volunteer: ['read', 'write'],
        redemption: ['read', 'write', 'approve'],
        grade: ['read', 'write'],
        duty: ['read', 'write'],
        notification: ['read', 'write'],
        settings: ['read', 'write'],
        // 数据隔离范围：class_id 匹配本班
      },
      subject_teacher: {
        student: ['read'],
        score: ['read', 'write'],
        grade: ['read', 'write'],
        notification: ['read', 'write'],
        settings: ['read'],
        // 数据隔离范围：assigned_classes 中的班级
      },
      class_cadre: {
        score: ['read', 'write'],
        duty: ['read', 'write'],
        attendance: ['read', 'write'],
        notification: ['read'],
        settings: ['read'],
        // 数据隔离范围：本班
      },
      student: {
        profile: ['read'],
        score: ['read'],
        duty: ['read'],
        volunteer: ['read', 'write'],
        redemption: ['read', 'write'],
        notification: ['read'],
        settings: ['read', 'write'],
      },
      parent: {
        profile: ['read'],
        score: ['read'],
        duty: ['read'],
        attendance: ['read'],
        notification: ['read'],
        settings: ['read'],
      }
    };

    // 检查权限
    if (role === 'admin') return true;
    if (permissions[role] && permissions[role][module]) {
      return permissions[role][module].includes(action);
    }
    return false;
  },

  // 构建数据隔离查询条件
  // 用于在查询时自动添加 class_id 或 student_id 过滤条件
  buildDataQuery: function (collectionName, extraQuery = {}) {
    const db = wx.cloud.database();
    const _ = db.command;
    const role = this.globalData.role;
    const classId = this.globalData.class_id;
    const studentId = this.globalData.student_id;

    let query = { ...extraQuery };

    // 根据角色添加数据隔离条件
    if (role === 'admin') {
      // 管理员可查看所有数据，不添加隔离条件
    } else if (role === 'head_teacher' || role === 'subject_teacher' || role === 'class_cadre') {
      // 教师/班委：查看本班数据 + 全局数据（class_id 为空的）
      if (classId) {
        query.class_id = _.in([classId, '', null]);
      }
    } else if (role === 'student' || role === 'parent') {
      // 学生/家长：仅查看自己（或关联学生）的数据
      if (studentId) {
        query.student_id = studentId;
      }
    }

    return query;
  },

  // 检查是否有权操作指定数据
  // 用于在编辑/删除时验证数据归属
  canOperateData: function (data) {
    const role = this.globalData.role;
    const classId = this.globalData.class_id;
    const studentId = this.globalData.student_id;

    // 管理员可操作所有数据
    if (role === 'admin') return true;

    // 教师/班委：检查数据是否属于本班
    if (role === 'head_teacher' || role === 'subject_teacher' || role === 'class_cadre') {
      // 数据属于本班或者是全局数据
      if (!data.class_id || data.class_id === '' || data.class_id === classId) {
        return true;
      }
      return false;
    }

    // 学生/家长：检查数据是否属于自己
    if (role === 'student' || role === 'parent') {
      return data.student_id === studentId;
    }

    return false;
  },

  // 获取当前用户的数据范围描述
  getDataScope: function () {
    const role = this.globalData.role;
    const classId = this.globalData.class_id;
    const studentId = this.globalData.student_id;

    const scopeMap = {
      admin: '全局数据',
      head_teacher: classId ? `本班数据 (${classId})` : '未分配班级',
      subject_teacher: classId ? `授课班级数据 (${classId})` : '未分配班级',
      class_cadre: classId ? `本班数据 (${classId})` : '未分配班级',
      student: studentId ? `个人数据 (${studentId})` : '未关联学号',
      parent: studentId ? `关联学生数据 (${studentId})` : '未关联学生'
    };

    return scopeMap[role] || '未知';
  },

  // 获取当前学期
  getCurrentSemester: function () {
    return new Promise((resolve, reject) => {
      const classId = this.globalData.class_id;
      wx.cloud.callFunction({
        name: 'manageSemester',
        data: {
          action: 'getSemesterConfig',
          data: { class_id: classId || '' }
        },
        success: res => {
          if (res.result && res.result.success && res.result.data) {
            const semester = res.result.data;
            this.globalData.currentSemester = semester;
            this.globalData.currentSemesterId = semester._id || semester.semester_id || '';
            this.globalData.currentSemesterName = semester.semester_name || semester.name || '';
            wx.setStorageSync('currentSemesterId', this.globalData.currentSemesterId);
            console.log('已获取当前学期:', this.globalData.currentSemesterName, 'ID:', this.globalData.currentSemesterId);
            resolve(semester);
          } else {
            console.warn('未找到当前学期');
            resolve(null);
          }
        },
        fail: err => {
          console.error('获取当前学期失败:', err);
          reject(err);
        }
      });
    });
  },

  // 显示加载提示
  showLoading: function (title = '加载中...') {
    wx.showLoading({
      title: title,
      mask: true
    });
  },

  // 隐藏加载提示
  hideLoading: function () {
    wx.hideLoading();
  },

  // 显示成功提示
  showSuccess: function (title) {
    wx.showToast({
      title: title,
      icon: 'success',
      duration: 2000
    });
  },

  // 显示错误提示
  showError: function (title) {
    wx.showToast({
      title: title,
      icon: 'error',
      duration: 2000
    });
  },

  // 显示普通提示
  showInfo: function (title) {
    wx.showToast({
      title: title,
      icon: 'none',
      duration: 2000
    });
  }
});
