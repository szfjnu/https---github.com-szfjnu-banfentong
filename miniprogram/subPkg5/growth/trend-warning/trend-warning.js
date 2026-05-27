const app = getApp()
const growthApi = require('../../../services/growth-api')
const growthPermission = require('../../../utils/growth-permission')

Page({
  data: { loading: true, warnings: [], stats: {}, canHandle: false },
  onLoad() { this.setData({ canHandle: growthPermission.canHandleWarning() }); this.loadData() },
  onPullDownRefresh() { this.loadData().then(() => wx.stopPullDownRefresh()) },
  async loadData() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.getGrowthWarnings()
      this.setData({ warnings: data.warnings || [], stats: data.stats || {}, loading: false })
    } catch (e) { this.setData({ loading: false }) }
  },
  async onHandleWarning(e) {
    const { id, status } = e.currentTarget.dataset
    try {
      await growthApi.updateGrowthWarningStatus(id, status)
      wx.showToast({ title: '处理 成功', icon: 'success' })
      this.loadData()
    } catch (e) { wx.showToast({ title: '处理失败', icon: 'none' }) }
  },
  async onDetect() {
    wx.showLoading({ title: '检测中...' })
    try {
      const data = await growthApi.detectGrowthWarnings()
      wx.hideLoading()
      wx.showToast({ title: `检测到${data.detected_count || 0}条预警`, icon: 'none' })
      this.loadData()
    } catch (e) { wx.hideLoading() }
  }
})
