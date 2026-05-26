const app = getApp()
const growthApi = require('../../../services/growth-api')
const dimensionRegistry = require('../../../services/dimension-registry')

Page({
  data: { loading: true, dimensions: {}, radar: [], dimensionList: [], studentName: '' },
  onLoad() { this.loadData() },
  onPullDownRefresh() { this.loadData().then(() => wx.stopPullDownRefresh()) },
  async loadData() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.getPersonalGrowth()
      const dimList = dimensionRegistry.getActiveDimensions().map(d => ({
        ...d,
        kpi: data.dimensions[d.key]?.kpi || null,
        trend: data.dimensions[d.key]?.trend || null,
        recordCount: data.dimensions[d.key]?.record_count || 0
      }))
      this.setData({ dimensions: data.dimensions || {}, radar: data.radar || [], dimensionList: dimList, loading: false })
    } catch (e) { this.setData({ loading: false }); wx.showToast({ title: '加载失败', icon: 'none' }) }
  },
  onGoDeepAnalysis() { wx.navigateTo({ url: '/subPkg5/growth/deep-analysis/deep-analysis' }) },
  onGoDevAdvice() { wx.navigateTo({ url: '/subPkg5/growth/dev-advice/dev-advice' }) }
})
