// pages/activity/audit/audit.js
// 聚光点 - 审核管理
const app = getApp()

Page({
  data: {
    list: [],
    loading: true,
    page: 0,
    hasMore: true
  },

  onLoad: function () {
    this.loadAuditList(true)
  },

  // 加载审核列表
  loadAuditList: async function (refresh = false) {
    if (refresh) {
      this.setData({ loading: true, page: 0, hasMore: true })
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'campusActivity',
        data: {
          action: 'auditList',
          role: app.globalData.role,
          class_id: app.globalData.class_id,
          page: this.data.page,
          pageSize: 20
        }
      })

      if (res.result && res.result.success) {
        const list = res.result.data.list.map(item => ({
          ...item,
          timeStr: this.formatTime(item.start_time)
        }))

        this.setData({
          list: refresh ? list : [...this.data.list, ...list],
          hasMore: list.length === 20,
          loading: false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载审核列表失败:', err)
      this.setData({ loading: false })
    }
  },

  formatTime: function (timestamp) {
    if (!timestamp) return ''
    const d = new Date(timestamp)
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  },

  // 通过
  onApprove: function (e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认通过',
      content: '确定通过此活动的审核吗？',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'campusActivity',
            data: {
              action: 'audit',
              activityId: id,
              audit_status: 1,
              auditor_id: app.globalData.user_id || ''
            }
          })
          wx.hideLoading()
          if (result.result && result.result.success) {
            wx.showToast({ title: '已通过', icon: 'success' })
            this.loadAuditList(true)
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // 驳回
  onReject: function (e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '驳回活动',
      content: '请输入驳回理由',
      editable: true,
      placeholderText: '驳回理由',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        try {
          const result = await wx.cloud.callFunction({
            name: 'campusActivity',
            data: {
              action: 'audit',
              activityId: id,
              audit_status: 2,
              reject_reason: res.text || '',
              auditor_id: app.globalData.user_id || ''
            }
          })
          wx.hideLoading()
          if (result.result && result.result.success) {
            wx.showToast({ title: '已驳回', icon: 'success' })
            this.loadAuditList(true)
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  },

  // 查看详情
  onGoDetail: function (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subPages/activity/detail/detail?id=${id}` })
  },

  onPullDownRefresh: function () {
    this.loadAuditList(true)
    wx.stopPullDownRefresh()
  }
})
