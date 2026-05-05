const app = getApp()
const seatApi = require('../seatApi')

Page({
  data: {
    classId: '',
    historyList: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    selectedHistory: null,
    snapshotLayout: null,
    snapshotArrangement: null
  },

  onLoad: function () {
    const classId = app.globalData.class_id
    this.setData({ classId })
    this.loadHistory()
  },

  formatTime: function (ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  },

  formatTypeName: function (type) {
    const map = {
      layout_change: '布局修改',
      arrange: '座位安排',
      manual_adjust: '手动调整',
      rotate: '座位轮换'
    }
    return map[type] || type
  },

  formatHistoryList: function (list) {
    return (list || []).map(item => ({
      ...item,
      timeText: this.formatTime(item.operated_at),
      typeText: this.formatTypeName(item.operation_type)
    }))
  },

  loadHistory: async function () {
    this.setData({ loading: true })
    try {
      const res = await seatApi.getHistoryList(this.data.classId, 1, 20)
      this.setData({
        historyList: this.formatHistoryList(res.data.list),
        page: 1,
        hasMore: res.data.has_more,
        loading: false
      })
    } catch (err) {
      console.error('加载历史失败:', err)
      this.setData({ loading: false })
    }
  },

  loadMore: async function () {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.setData({ loadingMore: true })
    try {
      const nextPage = this.data.page + 1
      const res = await seatApi.getHistoryList(this.data.classId, nextPage, 20)
      const newList = this.formatHistoryList(res.data.list)
      this.setData({
        historyList: [...this.data.historyList, ...newList],
        page: nextPage,
        hasMore: res.data.has_more,
        loadingMore: false
      })
    } catch (err) {
      console.error('加载更多失败:', err)
      this.setData({ loadingMore: false })
    }
  },

  onHistoryTap: async function (e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await seatApi.getHistoryDetail(id)
      const detail = res.data
      this.setData({ selectedHistory: detail })

      const snapshot = detail.snapshot_after || detail.snapshot_before
      if (snapshot && snapshot.seat_map) {
        const layout = this.data.snapshotLayout || { rows: 6, cols: 8, special_positions: [] }
        this.setData({
          snapshotArrangement: { seat_map: snapshot.seat_map, locked_seats: [] }
        })
      }
    } catch (err) {
      wx.showToast({ title: '加载详情失败', icon: 'none' })
    }
  },

  closeDetail: function () {
    this.setData({ selectedHistory: null })
  },

  preventBubble: function () {}
})
