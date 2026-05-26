const app = getApp()
const growthApi = require('../../../services/growth-api')
const growthPermission = require('../../../utils/growth-permission')
const dimensionRegistry = require('../../../services/dimension-registry')

Page({
  data: {
    loading: true,
    role: '',
    kpi: {},
    currentDimension: 'score',
    dimensionTrend: null,
    warningSummary: { total: 0, red: 0, yellow: 0, green: 0 },
    hasAIAdvice: false,
    dimensions: [],
    canGenerateAdvice: false,
    canHandleWarning: false
  },

  onLoad: function () {
    const role = app.globalData.role
    if (!growthPermission.canViewDashboard()) {
      wx.redirectTo({ url: '/subPkg5/growth/personal/personal' })
      return
    }

    this.setData({
      role,
      dimensions: dimensionRegistry.getActiveDimensions(),
      canGenerateAdvice: growthPermission.canGenerateAdvice(),
      canHandleWarning: growthPermission.canHandleWarning()
    })

    this.loadDashboard()
  },

  onPullDownRefresh: function () {
    this.loadDashboard().then(() => wx.stopPullDownRefresh())
  },

  async loadDashboard() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.getClassDashboard({ force_refresh: false })
      this.setData({
        kpi: data.kpi || {},
        warningSummary: data.warning_summary || { total: 0, red: 0, yellow: 0, green: 0 },
        hasAIAdvice: data.has_ai_advice || false,
        loading: false
      })
      this.loadDimensionTrend(this.data.currentDimension)
    } catch (e) {
      console.error('仪表盘加载失败:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async loadDimensionTrend(dimension) {
    try {
      const data = await growthApi.getDimensionTrend(dimension)
      this.setData({ dimensionTrend: data })
    } catch (e) {
      console.error('维度趋势加载失败:', e)
    }
  },

  onDimensionChange: function (e) {
    const dimension = e.currentTarget.dataset.key
    this.setData({ currentDimension: dimension })
    this.loadDimensionTrend(dimension)
  },

  onGoTrendWarning: function () {
    wx.navigateTo({ url: '/subPkg5/growth/trend-warning/trend-warning' })
  },

  onGoAIAdvice: function () {
    wx.navigateTo({ url: '/subPkg5/growth/ai-advice/ai-advice' })
  },

  onGoReview: function () {
    wx.navigateTo({ url: '/subPkg5/growth/review/review' })
  },

  onGoPersonal: function () {
    wx.navigateTo({ url: '/subPkg5/growth/personal/personal' })
  }
})
