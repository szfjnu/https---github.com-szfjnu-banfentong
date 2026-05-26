const growthApi = require('../../../services/growth-api')

Page({
  data: { loading: false, suggestion: null, generatedByAI: false },
  onLoad() {},
  async onGenerate() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.generateDevAdvice()
      this.setData({ suggestion: data, generatedByAI: data.generated_by_ai !== false, loading: false })
    } catch (e) { this.setData({ loading: false }); wx.showToast({ title: '生成失败', icon: 'none' }) }
  }
})
