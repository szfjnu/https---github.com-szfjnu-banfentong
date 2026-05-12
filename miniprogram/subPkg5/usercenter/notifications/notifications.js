// pages/usercenter/notifications/notifications.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    loading: true,
    activeTab: 'receive', // receive / publish
    openid: '',

    // 接收的通知
    notifications: [],
    receivePage: 0,
    receiveHasMore: true,
    filterType: '', // 按类型筛选
    filterRead: '', // 按已读/未读筛选

    // 发布的通知
    publishedList: [],
    publishPage: 0,
    publishHasMore: true,

    // 通知类型
    notificationTypes: [
      { key: '', label: '全部' },
      { key: 'system', label: '系统', icon: '📢' },
      { key: 'discipline', label: '处分', icon: '⚠️' },
      { key: 'grade', label: '成绩', icon: '📝' },
      { key: 'transfer', label: '转段', icon: '🎓' },
      { key: 'treehole', label: '树洞', icon: '🌳' },
      { key: 'market', label: '市场', icon: '🛒' },
      { key: 'score', label: '积分', icon: '⭐' },
      { key: 'attendance', label: '考勤', icon: '📋' },
      { key: 'duty', label: '值日', icon: '🧹' },
      { key: 'dorm', label: '宿舍', icon: '🏠' },
      { key: 'volunteer', label: '志愿', icon: '🤝' },
      { key: 'approval', label: '审批', icon: '✍️' }
    ],

    // 发布表单
    showPublishModal: false,
    publishForm: {
      type: 'system',
      title: '',
      content: '',
      target_type: 'all_class',
      priority: 'normal'
    },
    submitting: false,

    // 权限
    canPublish: false
  },

  onLoad: function (options) {
    const role = app.globalData.role;
    const canPublish = ['admin', 'head_teacher', 'subject_teacher'].includes(role);

    this.setData({
      openid: app.globalData.openid,
      canPublish,
      activeTab: options.tab === 'publish' && canPublish ? 'publish' : 'receive'
    });

    this.loadNotifications(true);
    if (canPublish) {
      this.loadPublished(true);
    }
  },

  onPullDownRefresh: function () {
    if (this.data.activeTab === 'receive') {
      this.loadNotifications(true);
    } else {
      this.loadPublished(true);
    }
  },

  onReachBottom: function () {
    if (this.data.activeTab === 'receive') {
      this.loadNotifications(false);
    } else {
      this.loadPublished(false);
    }
  },

  // 切换Tab
  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'publish' && this.data.publishedList.length === 0) {
      this.loadPublished(true);
    }
  },

  // 筛选类型
  onFilterType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterType: type, notifications: [], receivePage: 0, receiveHasMore: true });
    this.loadNotifications(true);
  },

  // 筛选已读/未读
  onFilterRead: function (e) {
    const read = e.currentTarget.dataset.read;
    this.setData({ filterRead: read, notifications: [], receivePage: 0, receiveHasMore: true });
    this.loadNotifications(true);
  },

  // 加载接收的通知
  loadNotifications: async function (refresh) {
    if (!refresh && !this.data.receiveHasMore) return;

    const page = refresh ? 0 : this.data.receivePage;
    this.setData({ loading: true });

    try {
      const data = { page, pageSize: 20 };
      if (this.data.filterType) data.type = this.data.filterType;
      if (this.data.filterRead === 'unread') data.is_read = false;
      if (this.data.filterRead === 'read') data.is_read = true;

      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'getNotifications', data }
      });

      if (res.result && res.result.success) {
        const newList = res.result.data.list || [];
        const list = refresh ? newList : [...this.data.notifications, ...newList];

        this.setData({
          notifications: list,
          receivePage: page + 1,
          receiveHasMore: newList.length >= 20,
          loading: false
        });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载通知失败:', err);
      this.setData({ loading: false });
    }

    wx.stopPullDownRefresh();
  },

  // 加载已发布通知
  loadPublished: async function (refresh) {
    if (!refresh && !this.data.publishHasMore) return;

    const page = refresh ? 0 : this.data.publishPage;

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'getPublishedNotifications',
          data: { page, pageSize: 20, class_id: app.globalData.class_id }
        }
      });

      if (res.result && res.result.success) {
        const newList = res.result.data.list || [];
        const list = refresh ? newList : [...this.data.publishedList, ...newList];
        this.setData({
          publishedList: list,
          publishPage: page + 1,
          publishHasMore: newList.length >= 20
        });
      }
    } catch (err) {
      console.error('加载已发布通知失败:', err);
    }
  },

  // 查看通知详情
  onViewNotification: function (e) {
    const { id, user_notification_id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/subPkg5/usercenter/notification-detail/notification-detail?notification_id=${id}&user_notification_id=${user_notification_id || ''}`
    });
  },

  // 标记已读
  onMarkRead: async function (e) {
    const { id } = e.currentTarget.dataset;
    try {
      await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'markAsRead', data: { user_notification_id: id } }
      });
      // 更新本地状态
      const list = this.data.notifications.map(n => {
        if (n.user_notification_id === id) n.is_read = true;
        return n;
      });
      this.setData({ notifications: list });
    } catch (err) {
      console.error('标记已读失败:', err);
    }
  },

  // 全部标记已读
  onMarkAllRead: async function () {
    wx.showLoading({ title: '处理中...' });
    try {
      await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'markAllAsRead', data: {} }
      });
      wx.hideLoading();
      wx.showToast({ title: '已全部标记已读', icon: 'success' });
      this.loadNotifications(true);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 收藏/取消收藏
  onToggleStar: async function (e) {
    const { id } = e.currentTarget.dataset;
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'toggleStar', data: { user_notification_id: id } }
      });
      if (res.result && res.result.success) {
        const list = this.data.notifications.map(n => {
          if (n.user_notification_id === id) n.is_starred = res.result.data.is_starred;
          return n;
        });
        this.setData({ notifications: list });
      }
    } catch (err) {
      console.error('收藏操作失败:', err);
    }
  },

  // ========== 发布通知 ==========

  showPublish: function () {
    this.setData({ showPublishModal: true });
  },

  hidePublish: function () {
    this.setData({ showPublishModal: false });
  },

  onPublishTypeChange: function (e) {
    this.setData({ 'publishForm.type': e.detail.value });
  },

  onPublishTitleInput: function (e) {
    this.setData({ 'publishForm.title': e.detail.value });
  },

  onPublishContentInput: function (e) {
    this.setData({ 'publishForm.content': e.detail.value });
  },

  onPublishTargetChange: function (e) {
    const targetMap = ['all_class', 'all_student', 'all_parent'];
    const idx = Number(e.detail.value);
    this.setData({ 'publishForm.target_type': targetMap[idx] || 'all_class' });
  },

  onPublishPriorityChange: function (e) {
    this.setData({ 'publishForm.priority': e.detail.value });
  },

  submitPublish: async function () {
    const form = this.data.publishForm;
    if (!form.title || !form.content) {
      wx.showToast({ title: '请填写标题和内容', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '发布中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'publishNotification',
          data: {
            ...form,
            class_id: app.globalData.class_id
          }
        }
      });

      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.success) {
        wx.showToast({ title: '发布成功', icon: 'success' });
        this.setData({
          showPublishModal: false,
          publishForm: {
            type: 'system',
            title: '',
            content: '',
            target_type: 'all_class',
            priority: 'normal'
          }
        });
        this.loadPublished(true);
      } else {
        wx.showToast({ title: res.result.message || '发布失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '发布失败', icon: 'none' });
    }
  },

  // 撤回通知
  onRecall: async function (e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认撤回',
      content: '撤回后所有收件人将无法查看此通知，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'manageUserCenter',
              data: { action: 'recallNotification', data: { notification_id: id } }
            });
            if (result.result && result.result.success) {
              wx.showToast({ title: '已撤回', icon: 'success' });
              this.loadPublished(true);
            }
          } catch (err) {
            wx.showToast({ title: '撤回失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 格式化时间
  formatTime: function (date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  preventBubble() {},
});
