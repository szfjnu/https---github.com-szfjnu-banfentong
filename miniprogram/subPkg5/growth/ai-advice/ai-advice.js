const app = getApp()
const growthApi = require('../../../services/growth-api')

Page({
  data: { loading: false, advice: null, fromCache: false, generatedByAI: false },
  onLoad() { this.loadAdvice() },
  async loadAdvice() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.generateManagementAdvice(false)
      this.setData({ advice: data, fromCache: !!data.from_cache, generatedByAI: data.generated_by_ai !== false, loading: false })
    } catch (e) { this.setData({ loading: false }) }
  },
  async onRefresh() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.generateManagementAdvice(true)
      this.setData({ advice: data, fromCache: false, generatedByAI: data.generated_by_ai !== false, loading: false })
    } catch (e) { this.setData({ loading: false }) }
  }
})
