// pages/activity/list/list.js
// 聚光点 - 活动列表主页
const app = getApp()

Page({
  data: {
    activities: [],
    categories: ['全部', '体育竞技', '学习交流', '游戏娱乐', '兴趣社交', '其他'],
    currentCategory: 0,
    tabs: ['招募中', '已满员', '已结束'],
    currentTab: 0,
    loading: true,
    page: 0,
    pageSize: 10,
    hasMore: true,
    showPublishBtn: false,
    showAuditBtn: false,
    pendingCount: 0
  },

  onLoad: function () {
    this.checkPermission()
  },

  onShow: function () {
    this.loadActivities(true)
    if (this.data.showAuditBtn) {
      this.loadPendingCount()
    }
  },

  // 权限检查
  checkPermission: function () {
    const role = app.globalData.role
    this.setData({
      showPublishBtn: role === 'student' || role === 'admin' || role === 'head_teacher' || role === 'teacher',
      showAuditBtn: role === 'admin' || role === 'head_teacher'
    })
  },

  // 加载待审核数量
  loadPendingCount: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'campusActivity',
        data: {
          action: 'auditList',
          role: app.globalData.role,
          class_id: app.globalData.class_id,
          pageSize: 1
        }
      })
      if (res.result && res.result.success) {
        this.setData({ pendingCount: res.result.data.total })
      }
    } catch (err) {
      console.error('加载待审核数量失败:', err)
    }
  },

  // 加载活动列表
  loadActivities: async function (refresh = false) {
    if (refresh) {
      this.setData({ loading: true, page: 0, hasMore: true })
    }

    try {
      const { currentCategory, categories, currentTab, page, pageSize } = this.data
      const role = app.globalData.role
      const classId = app.globalData.class_id

      const category = currentCategory === 0 ? '' : categories[currentCategory]
      // tab: 0-招募中, 1-已满员, 2-已结束
      const status = currentTab

      const res = await wx.cloud.callFunction({
        name: 'campusActivity',
        data: {
          action: 'list',
          category,
          status,
          page,
          pageSize,
          role,
          class_id: classId
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
          activities: refresh ? list : [...this.data.activities, ...list],
          hasMore: list.length === pageSize,
          page: refresh ? 0 : page,
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载活动失败:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 格式化时间
  formatTime: function (timestamp) {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const hour = d.getHours().toString().padStart(2, '0')
    const min = d.getMinutes().toString().padStart(2, '0')
    return `${month}月${day}日 ${hour}:${min}`
  },

  // 切换分类
  onCategoryChange: function (e) {
    this.setData({ currentCategory: e.currentTarget.dataset.index })
    this.loadActivities(true)
  },

  // 切换 Tab
  onTabChange: function (e) {
    this.setData({ currentTab: e.currentTarget.dataset.index })
    this.loadActivities(true)
  },

  // 查看详情
  onGoDetail: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subPages/activity/detail/detail?id=${id}` })
  },

  // 发布活动
  onPublish: function () {
    wx.navigateTo({ url: '/subPages/activity/create/create' })
  },

  // 去审核
  onGoAudit: function () {
    wx.navigateTo({ url: '/subPages/activity/audit/audit' })
  },

  // 我的活动
  onMyActivities: function () {
    wx.navigateTo({ url: '/subPages/activity/myactivity/myactivity' })
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadActivities(true)
    if (this.data.showAuditBtn) {
      this.loadPendingCount()
    }
    wx.stopPullDownRefresh()
  },

  // 上拉加载
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadActivities(false)
    }
  }
})
