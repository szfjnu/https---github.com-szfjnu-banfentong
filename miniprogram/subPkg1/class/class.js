// pages/class/class.js
const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    classes: [],
    searchKeyword: '',
    loading: true,
    showAddButton: false,
    // 当前用户信息
    currentClassId: '',
    currentRole: ''
  },

  onLoad: function () {
    this.checkPermission();
    this.loadClasses();
  },

  onShow: function () {
    // 每次显示页面时重新加载数据
    this.loadClasses();
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    const currentClassId = app.globalData.class_id;
    
    // 判断是否为班主任或管理员
    const canManage = role === 'head_teacher' || role === 'admin' || role === 'subject_teacher';
    
    this.setData({
      showAddButton: canManage,
      currentClassId: currentClassId,
      currentRole: role
    });
  },

  // 加载班级列表 - 根据用户所属班级加载
  loadClasses: async function () {
    this.setData({ loading: true });

    try {
      const openid = app.globalData.openid;
      
      if (!openid) {
        this.setData({ loading: false, classes: [] });
        return;
      }
      // 1. 获取当前全局存储的班级ID（切换后这里已经是新的ID了）
      const currentClassId = app.globalData.class_id || wx.getStorageSync('class_id') || '';

      // 使用新的API获取用户所属的班级
      const res = await api.classApi.getUserClasses(openid);
      let classes = res.data;

      // 搜索过滤
      if (this.data.searchKeyword) {
        classes = classes.filter(c =>
          c.class_name.includes(this.data.searchKeyword) ||
          (c.school && c.school.includes(this.data.searchKeyword))
        );
      }

      // 2. 标记当前班级
      // 遍历所有班级，如果班级ID等于当前全局ID，就加一个标记字段
      const classesWithCurrentFlag = classes.map(cls => {
        return {
          ...cls,
          // 如果该班级ID等于全局保存的ID，则标记为当前
          isCurrent: cls._id === currentClassId
        };
      });

      // 3.获取每个班级的学生数量
      const db = wx.cloud.database();
      const classesWithCount = await Promise.all(
        classes.map(async (cls) => {
          try {
            const countRes = await db.collection('students')
              .where({ class_id: cls._id })
              .count();
            return {
              ...cls,
              // 标记当前班级
              isCurrent: cls._id === currentClassId,
              student_count: countRes.total
            };
          } catch (err) {
            return {
              ...cls,
              // 标记当前班级
              isCurrent: cls._id === currentClassId,
              student_count: 0
            };
          }
        })
      );

      this.setData({
        classes: classesWithCount,
        loading: false
      });
    } catch (err) {
      console.error('加载班级列表失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  // 搜索确认
  onSearch: function () {
    this.loadClasses();
  },

  // 清除搜索
  onClearSearch: function () {
    this.setData({ searchKeyword: '' });
    this.loadClasses();
  },

  // 查看详情
  onViewDetail: function (e) {
    const classItem = e.currentTarget.dataset.item;
    if (classItem) {
      const classId = classItem._id;
      app.globalData.class_id = classId;
      wx.setStorageSync('class_id', classId);
      if (classItem.role) {
        app.globalData.role = classItem.role;
        wx.setStorageSync('role', classItem.role);
      }
      if (classItem.student_id) {
        app.globalData.student_id = classItem.student_id;
        wx.setStorageSync('student_id', classItem.student_id);
      }
    }
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 进入班级（设置为当前班级）
  onEnterClass: function (e) {
    const classItem = e.currentTarget.dataset.item;
    const classId = classItem._id;
    
    // 保存当前班级ID到全局变量
    app.globalData.class_id = classId;
    wx.setStorageSync('class_id', classId);
    
    // 保存当前角色
    if (classItem.role) {
      app.globalData.role = classItem.role;
      wx.setStorageSync('role', classItem.role);
    }
    
    // 如果有学号，保存学号
    if (classItem.student_id) {
      app.globalData.student_id = classItem.student_id;
      wx.setStorageSync('student_id', classItem.student_id);
    }
    
    util.showSuccess('已切换到: ' + classItem.class_name);
    
    // 刷新页面数据
    this.loadClasses();
  },

  // 长按班级卡片 - 显示操作菜单
  onLongPressClass: function (e) {
    const classId = e.currentTarget.dataset.id;
    const className = e.currentTarget.dataset.name;
    const isOwner = e.currentTarget.dataset.isowner;

    // 只有班级创建者和管理员才能编辑删除
    if (!this.data.showAddButton && !isOwner) {
      wx.showToast({
        title: '无操作权限',
        icon: 'none'
      });
      return;
    }

    const menuItems = ['查看详情', '班级设置'];
    if (isOwner || this.data.currentRole === 'admin') {
      menuItems.push('编辑班级信息');
    }
    
    wx.showActionSheet({
      itemList: menuItems,
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.switchTab({
            url: '/pages/index/index'
          });
        } else if (res.tapIndex === 1) {
          // 班级设置
          wx.navigateTo({
            url: `/subPkg1/class/settings/settings?id=${classId}`
          });
        } else if (res.tapIndex === 2 && (isOwner || this.data.currentRole === 'admin')) {
          // 编辑
          wx.navigateTo({
            url: `/subPkg1/class/add/add?id=${classId}`
          });
        }
      }
    });
  },

  // 创建新班级
  onCreateClass: function () {
    wx.navigateTo({
      url: '/subPkg1/class/add/add'
    });
  },

  // 加入班级
  onJoinClass: function () {
    wx.navigateTo({
      url: '/subPkg5/join/join'
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadClasses();
    wx.stopPullDownRefresh();
  }
});
