Component({
  properties: {
    classId: { type: String, value: '' },
    role: { type: String, value: '' },
    canWrite: { type: Boolean, value: false }
  },

  data: {
    visible: true,
    canOperate: false,
    warnings: [],
    pendingCount: 0,
    loading: true,
    detecting: false
  },

  lifetimes: {
    attached: function () {
      if (this.properties.classId) {
        this.setData({ canOperate: this.properties.canWrite })
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
            action: 'getWarnings',
            data: { class_id: this.properties.classId }
          }
        })
        if (res.result && res.result.success) {
          const warnings = res.result.data.warnings || []
          const pendingCount = warnings.filter(w => w.status === 'pending').length
          this.setData({ warnings, pendingCount, loading: false })
        } else {
          this.setData({ loading: false })
        }
      } catch (err) {
        console.error('加载预警数据失败:', err)
        this.setData({ loading: false })
      }
    },

    onWarningConfirm: async function (e) {
      const wid = e.currentTarget.dataset.wid
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: { action: 'updateWarningStatus', data: { warning_id: wid, status: 'confirmed' } }
        })
        if (res.result && res.result.success) {
          const warnings = this.data.warnings.map(w => w._id === wid ? { ...w, status: 'confirmed' } : w)
          const pendingCount = warnings.filter(w => w.status === 'pending').length
          this.setData({ warnings, pendingCount })
        }
      } catch (err) {
        console.error('确认预警失败:', err)
      }
    },

    onWarningResolve: async function (e) {
      const wid = e.currentTarget.dataset.wid
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: { action: 'updateWarningStatus', data: { warning_id: wid, status: 'resolved' } }
        })
        if (res.result && res.result.success) {
          const warnings = this.data.warnings.map(w => w._id === wid ? { ...w, status: 'resolved' } : w)
          const pendingCount = warnings.filter(w => w.status === 'pending').length
          this.setData({ warnings, pendingCount })
        }
      } catch (err) {
        console.error('处理预警失败:', err)
      }
    },

    onDetectWarnings: async function () {
      this.setData({ detecting: true })
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: { action: 'detectWarnings', data: { class_id: this.properties.classId } }
        })
        if (res.result && res.result.success) {
          this.setData({ warnings: res.result.data.warnings || [] })
          wx.showToast({ title: '检测到' + (res.result.data.total || 0) + '条预警', icon: 'none' })
        }
      } catch (err) {
        console.error('检测预警失败:', err)
        wx.showToast({ title: '网络异常', icon: 'none' })
      } finally {
        this.setData({ detecting: false })
      }
    },

    onWarningConfig: function () {
      wx.navigateTo({ url: '/subPkg5/growth/warning-config/warning-config' })
    },

    refresh: function () {
      this.loadData()
    }
  }
})