Page({
  data: {
    loading: true,
    error: false,
    errorMsg: '',
    summaryData: null
  },

  onLoad: function (options) {
    const classId = options.classId || ''
    if (!classId) {
      this.setData({ loading: false, error: true, errorMsg: '缺少班级信息' })
      return
    }
    this.setData({ classId })
    this.loadSummary(classId)
  },

  loadSummary: async function (classId) {
    this.setData({ loading: true, error: false })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'getClassSummary',
          data: { class_id: classId }
        }
      })
      if (res.result && res.result.success) {
        this.setData({
          summaryData: res.result.data,
          loading: false
        })
      } else {
        this.setData({
          loading: false,
          error: true,
          errorMsg: (res.result && res.result.message) || '加载失败'
        })
      }
    } catch (err) {
      console.error('加载班级汇总失败:', err)
      this.setData({ loading: false, error: true, errorMsg: '网络异常' })
    }
  },

  onPullDownRefresh: function () {
    if (this.data.classId) {
      this.loadSummary(this.data.classId).finally(() => {
        wx.stopPullDownRefresh()
      })
    }
  }
})