// pages/usercenter/notification-detail/notification-detail.js
const app = getApp();

Page({
  data: {
    loading: true,
    notification: null,
    isStarred: false,
    notificationId: '',
    userNotificationId: ''
  },

  onLoad: function (options) {
    this.setData({
      notificationId: options.notification_id || '',
      userNotificationId: options.user_notification_id || ''
    });
    this.loadDetail();
  },

  loadDetail: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'getNotificationDetail',
          data: {
            notification_id: this.data.notificationId,
            user_notification_id: this.data.userNotificationId
          }
        }
      });

      if (res.result && res.result.success) {
        const notification = res.result.data;
        this.setData({
          notification,
          isStarred: notification.is_starred || false,
          loading: false
        });
      } else {
        wx.showToast({ title: '通知不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (err) {
      console.error('加载通知详情失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 收藏
  onToggleStar: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'toggleStar',
          data: { user_notification_id: this.data.userNotificationId || this.data.notification.user_notification_id }
        }
      });
      if (res.result && res.result.success) {
        this.setData({ isStarred: res.result.data.is_starred });
        wx.showToast({
          title: res.result.data.is_starred ? '已收藏' : '已取消收藏',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('收藏操作失败:', err);
    }
  },

  // 执行关联动作
  onAction: function () {
    const notification = this.data.notification;
    if (!notification || !notification.action_type) return;

    const actionMap = {
      view_discipline: '/subPkg1/discipline/discipline',
      view_grade: '/subPkg3/grade/grade',
      view_transfer: '/pages/transfer/transfer',
      view_treehole: '/subPkg3/treehole/treehole',
      view_market: '/pages/market/market',
      view_score: '/pages/score/score',
      view_attendance: '/subPkg1/attendance/attendance',
      view_duty: '/subPkg1/duty/duty',
      view_dorm: '/subPkg2/dorm/dorm',
      view_volunteer: '/subPkg1/volunteer/volunteer',
      view_approval: '/subPkg1/approval/approval'
    };

    const url = actionMap[notification.action_type];
    if (url) {
      // 拼接额外参数
      const actionData = notification.action_data || {};
      const params = Object.keys(actionData)
        .map(key => `${key}=${actionData[key]}`)
        .join('&');
      const fullUrl = params ? `${url}?${params}` : url;

      wx.navigateTo({
        url: fullUrl,
        fail: () => {
          wx.showToast({ title: '功能开发中', icon: 'none' });
        }
      });
    } else if (notification.action_type === 'external_link' && notification.action_data.url) {
      wx.setClipboardData({
        data: notification.action_data.url,
        success: () => {
          wx.showToast({ title: '链接已复制', icon: 'success' });
        }
      });
    }
  },

  // 格式化时间
  formatTime: function (date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
});
