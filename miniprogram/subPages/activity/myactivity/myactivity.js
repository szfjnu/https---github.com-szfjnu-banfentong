// pages/activity/myactivity/myactivity.js
// 聚光点 - 我的活动
const app = getApp()

Page({
  data: {
    tabs: ['我参与的', '我发起的'],
    currentTab: 0,
    list: [],
    loading: true,
    page: 0,
    hasMore: true
  },

  onLoad: function () {
    this.loadMyActivities(true)
  },

  onTabChange: function (e) {
    this.setData({ currentTab: e.currentTarget.dataset.index })
    this.loadMyActivities(true)
  },

  loadMyActivities: async function (refresh = false) {
    if (refresh) {
      this.setData({ loading: true, page: 0, hasMore: true })
    }

    try {
      const type = this.data.currentTab === 0 ? 'joined' : 'organized'
      const res = await wx.cloud.callFunction({
        name: 'campusActivity',
        data: {
          action: 'myActivities',
          type,
          user_id: app.globalData.student_id,
          page: this.data.page,
          pageSize: 10
        }
      })

      if (res.result && res.result.success) {
        const list = res.result.data.list.map(item => ({
          ...item,
          timeStr: this.formatTime(item.start_time),
          statusText: ['招募中', '已满员', '已结束', '已取消'][item.status] || '未知',
          statusColor: ['#52c41a', '#fa8c16', '#999', '#ff4d4f'][item.status] || '#999'
        }))

        this.setData({
          list: refresh ? list : [...this.data.list, ...list],
          hasMore: list.length === 10,
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载失败:', err)
      this.setData({ loading: false })
    }
  },

  formatTime: function (ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  },

  onGoDetail: function (e) {
    wx.navigateTo({ url: `/subPages/activity/detail/detail?id=${e.currentTarget.dataset.id}` })
  },

  onPullDownRefresh: function () {
    this.loadMyActivities(true)
    wx.stopPullDownRefresh()
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadMyActivities(false)
    }
  }
})
