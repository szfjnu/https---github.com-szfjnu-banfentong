const growthApi = require('../../../services/growth-api')

Page({
  data: { loading: true, analysis: null },
  onLoad() { this.loadAnalysis() },
  async loadAnalysis() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.getDeepAnalysis()
      this.setData({ analysis: data, loading: false })
    } catch (e) { this.setData({ loading: false }) }
  },
  async onForceRefresh() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.getDeepAnalysis({ force_refresh: true })
      this.setData({ analysis: data, loading: false })
    } catch (e) { this.setData({ loading: false }) }
  }
})
