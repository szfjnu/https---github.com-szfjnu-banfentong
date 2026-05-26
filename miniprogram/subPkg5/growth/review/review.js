const app = getApp()
const growthApi = require('../../../services/growth-api')
const growthPermission = require('../../../utils/growth-permission')

Page({
  data: { loading: true, reviews: [], canManage: false, batchLoading: false, batchProgress: null },
  onLoad() { this.setData({ canManage: growthPermission.canManageReview() }); this.loadReviews() },
  async loadReviews() {
    this.setData({ loading: true })
    try {
      const data = await growthApi.getGrowthReviews()
      this.setData({ reviews: data.reviews || [], loading: false })
    } catch (e) { this.setData({ loading: false }) }
  },
  async onConfirmReview(e) {
    const id = e.currentTarget.dataset.id
    try { await growthApi.confirmGrowthReview(id); wx.showToast({ title: '确认成功', icon: 'success' }); this.loadReviews() } catch (e) { wx.showToast({ title: '确认失败', icon: 'none' }) }
  },
  async onBatchGenerate() {
    wx.showModal({ title: '批量生成评语', content: '将为全班学生生成评语，确认继续？', success: async (res) => {
      if (!res.confirm) return
      this.setData({ batchLoading: true })
      try {
        const classId = app.globalData.class_id || app.globalData.classId
        const db = wx.cloud.database()
        const sRes = await db.collection('students').where({ class_id: classId }).limit(100).get()
        const ids = sRes.data.map(s => s.student_id)
        const data = await growthApi.batchGenerateReviews(ids)
        this.setData({ batchLoading: false })
        wx.showToast({ title: `完成${data.completed}条`, icon: 'success' })
        this.loadReviews()
      } catch (e) { this.setData({ batchLoading: false }); wx.showToast({ title: '批量生成失败', icon: 'none' }) }
    }})
  }
})
