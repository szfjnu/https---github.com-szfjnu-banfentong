// pages/activity/detail/detail.js
// 聚光点 - 活动详情
const app = getApp()

Page({
  data: {
    activity: null,
    loading: true,
    isOrganizer: false,
    hasJoined: false,
    canJoin: false,
    canLeave: false,
    canCancel: false,
    canFinish: false,
    isAdmin: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ activityId: options.id })
      this.loadDetail(options.id)
    }
  },

  // 加载详情
  loadDetail: async function (activityId) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'campusActivity',
        data: { action: 'detail', activityId }
      })

      if (res.result && res.result.success) {
        const activity = res.result.data
        activity.timeStr = this.formatTime(activity.start_time)
        activity.statusText = ['招募中', '已满员', '已结束', '已取消'][activity.status] || '未知'
        activity.statusColor = ['#52c41a', '#fa8c16', '#999', '#ff4d4f'][activity.status] || '#999'

        const userId = app.globalData.student_id || ''
        const role = app.globalData.role
        const isAdmin = role === 'admin' || role === 'head_teacher'
        const isOrganizer = activity.organizer.id === userId
        const hasJoined = (activity.joined_list || []).some(j => j.user_id === userId)
        const canJoin = activity.status === 0 && activity.audit.status === 1 && !hasJoined
        const canLeave = hasJoined && activity.status === 0
        const canCancel = isOrganizer && activity.status !== 2 && activity.status !== 3
        const canFinish = (isOrganizer || isAdmin) && activity.status === 0 || activity.status === 1

        this.setData({
          activity,
          loading: false,
          isOrganizer,
          hasJoined,
          canJoin,
          canLeave,
          canCancel,
          canFinish,
          isAdmin
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: '活动不存在', icon: 'none' })
      }
    } catch (err) {
      console.error('加载详情失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  formatTime: function (timestamp) {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    const h = d.getHours().toString().padStart(2, '0')
    const min = d.getMinutes().toString().padStart(2, '0')
    return `${y}年${m}月${day}日 ${h}:${min}`
  },

  // 报名
  onJoin: async function () {
    if (!this.data.canJoin) return

    wx.showLoading({ title: '报名中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'campusActivity',
        data: {
          action: 'join',
          activityId: this.data.activityId,
          user_id: app.globalData.student_id,
          user_name: app.globalData.name || ''
        }
      })

      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '报名成功', icon: 'success' })
        this.loadDetail(this.data.activityId)
      } else {
        wx.showToast({ title: res.result.message || '报名失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '报名失败', icon: 'none' })
    }
  },

  // 取消报名
  onLeave: async function () {
    wx.showModal({
      title: '取消报名',
      content: '确定要取消报名吗？',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '取消中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'campusActivity',
            data: {
              action: 'leave',
              activityId: this.data.activityId,
              user_id: app.globalData.student_id
            }
          })

          wx.hideLoading()
          if (result.result && result.result.success) {
            wx.showToast({ title: '已取消报名', icon: 'success' })
            this.loadDetail(this.data.activityId)
          } else {
            wx.showToast({ title: result.result.message || '取消失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '取消失败', icon: 'none' })
        }
      }
    })
  },

  // 取消活动
  onCancel: function () {
    wx.showModal({
      title: '取消活动',
      content: '确定要取消此活动吗？所有报名者将收到通知。',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '取消中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'campusActivity',
            data: {
              action: 'cancel',
              activityId: this.data.activityId,
              user_id: app.globalData.student_id,
              role: app.globalData.role
            }
          })

          wx.hideLoading()
          if (result.result && result.result.success) {
            wx.showToast({ title: '活动已取消', icon: 'success' })
            this.loadDetail(this.data.activityId)
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // 结束活动
  onFinish: function () {
    wx.showModal({
      title: '结束活动',
      content: '确定要结束此活动吗？',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '处理中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'campusActivity',
            data: {
              action: 'finish',
              activityId: this.data.activityId,
              user_id: app.globalData.student_id,
              role: app.globalData.role
            }
          })

          wx.hideLoading()
          if (result.result && result.result.success) {
            wx.showToast({ title: '活动已结束', icon: 'success' })
            this.loadDetail(this.data.activityId)
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // 分享
  onShareAppMessage: function () {
    const activity = this.data.activity
    return {
      title: activity ? activity.title : '聚光点 - 校园活动',
      path: `/subPkg3/activity/detail/detail?id=${this.data.activityId}`
    }
  }
})
