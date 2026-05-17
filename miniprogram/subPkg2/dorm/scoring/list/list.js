const app = getApp()

Page({
  data: {
    buildingOptions: [],
    buildingIndex: 0,
    selectedBuildingId: '',
    roomOptions: [],
    roomIndex: 0,
    selectedRoomId: '',
    dateRangeStart: '',
    dateRangeEnd: '',
    scoreRecords: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    total: 0,
    canDelete: false,
    classId: ''
  },

  onLoad: function () {
    const role = app.globalData.role
    const canDelete = role === 'admin' || role === 'head_teacher'
    const classId = app.globalData.class_id || app.globalData.classId || ''
    this.setData({ canDelete, classId })
    this.loadBuildings()
  },

  onShow: function () {
    this.loadScores(true)
  },

  loadBuildings: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: { action: 'getDormCandidates', data: { level: 'buildings', class_id: this.data.classId } }
      })
      if (res.result && res.result.success) {
        this.setData({ buildingOptions: res.result.data || [] })
      }
    } catch (err) {
      console.error('加载楼栋失败:', err)
    }
  },

  onBuildingChange: function (e) {
    const idx = parseInt(e.detail.value)
    const building = this.data.buildingOptions[idx]
    if (!building) return
    this.setData({
      buildingIndex: idx,
      selectedBuildingId: building._id,
      roomIndex: 0,
      selectedRoomId: ''
    })
    this.loadRooms(building._id)
    this.loadScores(true)
  },

  loadRooms: async function (buildingId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: { action: 'getDormCandidates', data: { level: 'rooms', building_id: buildingId, class_id: this.data.classId } }
      })
      if (res.result && res.result.success) {
        const rooms = res.result.data || []
        this.setData({
          roomOptions: rooms,
          selectedRoomId: rooms.length > 0 ? rooms[0]._id : ''
        })
      }
    } catch (err) {
      console.error('加载房间失败:', err)
    }
  },

  onRoomChange: function (e) {
    const idx = parseInt(e.detail.value)
    const room = this.data.roomOptions[idx]
    if (!room) return
    this.setData({ roomIndex: idx, selectedRoomId: room._id })
    this.loadScores(true)
  },

  onStartDateChange: function (e) {
    this.setData({ dateRangeStart: e.detail.value })
    this.loadScores(true)
  },

  onEndDateChange: function (e) {
    this.setData({ dateRangeEnd: e.detail.value })
    this.loadScores(true)
  },

  loadScores: async function (refresh = false) {
    if (this.data.loading) return

    try {
      this.setData({ loading: true })
      if (refresh) this.setData({ page: 1 })

      const { selectedRoomId, selectedBuildingId, dateRangeStart, dateRangeEnd, page, pageSize } = this.data

      const queryData = { page, page_size: pageSize }
      if (selectedRoomId) queryData.room_id = selectedRoomId
      if (dateRangeStart) queryData.start_date = dateRangeStart
      if (dateRangeEnd) queryData.end_date = dateRangeEnd
      if (this.data.classId) queryData.class_id = this.data.classId

      const res = await wx.cloud.callFunction({
        name: 'dormScoringManager',
        data: { action: 'getDailyScores', data: queryData }
      })

      if (res.result && res.result.success) {
        const records = res.result.data.records || []
        const total = res.result.data.total || 0
        this.setData({
          scoreRecords: refresh ? records : [...this.data.scoreRecords, ...records],
          total,
          hasMore: records.length >= pageSize
        })
      }
    } catch (err) {
      console.error('加载评分列表失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onDeleteScore: function (e) {
    const scoreId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该评分记录吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })
            const result = await wx.cloud.callFunction({
              name: 'dormScoringManager',
              data: { action: 'deleteDailyScore', data: { score_id: scoreId } }
            })
            wx.hideLoading()
            if (result.result && result.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' })
              this.loadScores(true)
            } else {
              wx.showToast({ title: result.result?.message || '删除失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadScores(false)
    }
  },

  onPullDownRefresh: function () {
    this.loadScores(true).then(() => wx.stopPullDownRefresh())
  }
})
