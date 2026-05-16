Component({
  properties: {
    classId: { type: String, value: '' },
    role: { type: String, value: '' },
    canWrite: { type: Boolean, value: false }
  },

  data: {
    periodTabs: ['月度', '学期'],
    selectedPeriod: '月度',
    summary: '',
    dimensions: [],
    highlights: [],
    suggestions: [],
    canEdit: false,
    editing: false,
    editContent: '',
    loading: true,
    generating: false,
    published: false
  },

  lifetimes: {
    attached: function () {
      if (this.properties.classId) {
        this.loadData()
      }
    }
  },

  methods: {
    loadData: async function () {
      if (!this.properties.classId) return
      this.setData({ loading: true })
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: {
            action: 'getAIReview',
            data: { class_id: this.properties.classId, period: this.data.selectedPeriod }
          }
        })
        if (res.result && res.result.success) {
          const d = res.result.data
          this.setData({
            summary: d.summary || '',
            dimensions: d.dimensions || [],
            highlights: d.highlights || [],
            suggestions: d.suggestions || [],
            canEdit: this.properties.canWrite,
            published: d.published || false,
            loading: false
          })
        } else {
          this.setData({ loading: false })
        }
      } catch (err) {
        console.error('加载AI点评失败:', err)
        this.setData({ loading: false })
      }
    },

    onPeriodChange: function (e) {
      const period = e.currentTarget.dataset.period
      this.setData({ selectedPeriod: period })
      this.loadData()
    },

    onRegenerate: async function () {
      if (!this.properties.canWrite) return
      this.setData({ generating: true })
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: {
            action: 'regenerateAIReview',
            data: { class_id: this.properties.classId, period: this.data.selectedPeriod }
          }
        })
        if (res.result && res.result.success) {
          const d = res.result.data
          this.setData({
            summary: d.summary || '',
            dimensions: d.dimensions || [],
            highlights: d.highlights || [],
            suggestions: d.suggestions || [],
            published: false
          })
          wx.showToast({ title: '重新生成成功', icon: 'success' })
        } else {
          wx.showToast({ title: '生成失败', icon: 'none' })
        }
      } catch (err) {
        console.error('重新生成AI点评失败:', err)
        wx.showToast({ title: '网络异常', icon: 'none' })
      } finally {
        this.setData({ generating: false })
      }
    },

    onEdit: function () {
      this.setData({ editing: true, editContent: this.data.summary })
    },

    onSaveEdit: function () {
      this.setData({ summary: this.data.editContent, editing: false })
      this.triggerEvent('contentchange', { summary: this.data.editContent })
    },

    onEditInput: function (e) {
      this.setData({ editContent: e.detail.value })
    },

    onPublish: async function () {
      if (!this.properties.canWrite) return
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: {
            action: 'publishAIReview',
            data: { class_id: this.properties.classId, period: this.data.selectedPeriod, summary: this.data.summary }
          }
        })
        if (res.result && res.result.success) {
          this.setData({ published: true })
          wx.showToast({ title: '发布成功', icon: 'success' })
        } else {
          wx.showToast({ title: '发布失败', icon: 'none' })
        }
      } catch (err) {
        console.error('发布AI点评失败:', err)
        wx.showToast({ title: '网络异常', icon: 'none' })
      }
    },

    refresh: function () {
      this.loadData()
    }
  }
})