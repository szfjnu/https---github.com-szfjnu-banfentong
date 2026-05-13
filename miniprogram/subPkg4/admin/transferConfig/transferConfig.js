const app = getApp()

const DEFAULT_OPERATIONS = [
  { key: 'importStudent', label: '学生信息导入', desc: '控制学生信息Excel/CSV导入是否需要高级会员', requireAdvanced: false },
  { key: 'importSchedule', label: '课程表导入', desc: '控制课程表导入是否需要高级会员', requireAdvanced: true },
  { key: 'importGrade', label: '成绩导入', desc: '控制成绩导入是否需要高级会员', requireAdvanced: true },
  { key: 'exportStudent', label: '学生信息导出', desc: '控制学生信息导出是否需要高级会员', requireAdvanced: false },
  { key: 'exportScoreRecords', label: '积分记录导出', desc: '控制积分记录导出是否需要高级会员', requireAdvanced: false },
  { key: 'exportAttendance', label: '考勤记录导出', desc: '控制考勤记录导出是否需要高级会员', requireAdvanced: false }
]

Page({
  data: {
    operations: DEFAULT_OPERATIONS.map(o => ({ ...o })),
    saving: false
  },

  onLoad: async function () {
    await this.loadConfig()
  },

  loadConfig: async function () {
    wx.showLoading({ title: '加载中...' })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('system_config')
        .doc('transfer_permissions')
        .get()

      if (res.data && res.data.permissions) {
        const perms = res.data.permissions
        const operations = DEFAULT_OPERATIONS.map(o => ({
          ...o,
          requireAdvanced: perms[o.key] !== undefined ? perms[o.key] : o.requireAdvanced
        }))
        this.setData({ operations })
      }
    } catch (err) {
      console.error('加载权限配置失败:', err)
    }
    wx.hideLoading()
  },

  onToggle: function (e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value
    const operations = this.data.operations.map(o => {
      if (o.key === key) {
        return { ...o, requireAdvanced: value }
      }
      return o
    })
    this.setData({ operations })
  },

  onSave: async function () {
    this.setData({ saving: true })
    try {
      const permissions = {}
      for (const o of this.data.operations) {
        permissions[o.key] = o.requireAdvanced
      }

      const res = await wx.cloud.callFunction({
        name: 'dataTransfer',
        data: {
          action: 'saveTransferConfig',
          data: { permissions }
        }
      })

      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        wx.showToast({ title: res.result.message || '保存失败', icon: 'none' })
      }
    } catch (err) {
      console.error('保存权限配置失败:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
    this.setData({ saving: false })
  }
})