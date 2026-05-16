Component({
  properties: {
    classId: { type: String, value: '' },
    role: { type: String, value: '' },
    canWrite: { type: Boolean, value: false }
  },

  data: {
    dimensionCards: [
      { key: 'score', name: '积分', icon: '🏆', coreValue: '-', status: 'normal' },
      { key: 'attendance', name: '考勤', icon: '📅', coreValue: '-', status: 'normal' },
      { key: 'hygiene', name: '卫生', icon: '🧹', coreValue: '-', status: 'normal' },
      { key: 'volunteer', name: '志愿服务', icon: '🤝', coreValue: '-', status: 'normal' },
      { key: 'discipline', name: '处分', icon: '⚠️', coreValue: '-', status: 'normal' },
      { key: 'cert', name: '证书', icon: '📜', coreValue: '-', status: 'normal' }
    ],
    loading: true
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
            action: 'getDimensionSummary',
            data: { class_id: this.properties.classId }
          }
        })
        if (res.result && res.result.success) {
          const d = res.result.data
          this.setData({
            dimensionCards: this.buildDimensionCards(d),
            loading: false
          })
        } else {
          this.setData({ loading: false })
        }
      } catch (err) {
        console.error('加载维度数据失败:', err)
        this.setData({ loading: false })
      }
    },

    buildDimensionCards: function (data) {
      const defaults = [
        { key: 'score', name: '积分', icon: '🏆', coreValue: '-', status: 'normal' },
        { key: 'attendance', name: '考勤', icon: '📅', coreValue: '-', status: 'normal' },
        { key: 'hygiene', name: '卫生', icon: '🧹', coreValue: '-', status: 'normal' },
        { key: 'volunteer', name: '志愿服务', icon: '🤝', coreValue: '-', status: 'normal' },
        { key: 'discipline', name: '处分', icon: '⚠️', coreValue: '-', status: 'normal' },
        { key: 'cert', name: '证书', icon: '📜', coreValue: '-', status: 'normal' }
      ]
      if (!data || !data.dimensions) return defaults
      return defaults.map(card => {
        const dim = data.dimensions.find(d => d.key === card.key)
        if (dim) {
          return {
            ...card,
            coreValue: dim.coreValue || dim.value || '-',
            status: dim.status || 'normal',
            extra: dim.extra || ''
          }
        }
        return card
      })
    },

    onDimensionClick: function (e) {
      const key = e.currentTarget.dataset.key
      this.triggerEvent('dimensionclick', { key })
    },

    refresh: function () {
      this.loadData()
    }
  }
})