Page({
  data: {
    loading: true,
    pendingFirstList: [],
    pendingFinalList: [],
    displayFirstList: [],
    displayFinalList: [],
    activeTab: 'first'
  },

  onLoad() {
    this.loadAllLists()
  },

  onShow() {
    this.loadAllLists()
  },

  onPullDownRefresh() {
    this.loadAllLists().then(() => wx.stopPullDownRefresh())
  },

  async loadAllLists() {
    this.setData({ loading: true })
    try {
      const [firstRes, finalRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'growthManager',
          data: { action: 'getSkillCertRecords', data: { approval_status: 'pending_first', pageSize: 100 } }
        }),
        wx.cloud.callFunction({
          name: 'growthManager',
          data: { action: 'getSkillCertRecords', data: { approval_status: 'pending_final', pageSize: 100 } }
        })
      ])
      const firstResult = firstRes.result || {}
      const finalResult = finalRes.result || {}
      const pendingFirstList = firstResult.data || []
      const pendingFinalList = finalResult.data || []
      this.setData({
        pendingFirstList,
        pendingFinalList,
        displayFirstList: pendingFirstList.map(r => this.formatRecord(r)),
        displayFinalList: pendingFinalList.map(r => this.formatRecord(r)),
        loading: false
      })
    } catch (err) {
      console.error('loadAllLists错误:', err)
      this.setData({ loading: false })
    }
  },

  formatRecord(record) {
    const typeLabel = record.type === 'competition' ? '比赛' : '证书'
    const typeIcon = record.type === 'competition' ? '🏆' : '📜'
    return { ...record, typeLabel, typeIcon }
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  onItemClick(e) {
    const recordId = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/subPages/skill-cert/detail/detail?record_id=' + recordId })
  }
})