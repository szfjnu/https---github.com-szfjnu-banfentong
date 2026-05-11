const app = getApp()
const rp = require('../../../utils/role-permissions')

Page({
  data: {
    loading: true,
    records: [],
    total: 0,
    page: 1,
    pageSize: 20,
    filterType: '',
    filterStatus: '',
    canAdd: false,
    canApprove: false,
    canDelete: false,
    canConfig: false,
    statusOptions: [
      { value: '', label: '全部状态' },
      { value: 'pending_first', label: '待初审' },
      { value: 'pending_final', label: '待终审' },
      { value: 'approved', label: '已生效' },
      { value: 'rejected', label: '已驳回' }
    ],
    typeOptions: [
      { value: '', label: '全部类型' },
      { value: 'competition', label: '技能比赛' },
      { value: 'certificate', label: '技能证书' }
    ],
    displayRecords: []
  },

  onLoad() {
    const role = app.globalData.role || ''
    this.setData({
      canAdd: rp.hasPermission(role, 'skill_cert', 'add'),
      canApprove: rp.hasPermission(role, 'skill_cert', 'approve_first') || rp.hasPermission(role, 'skill_cert', 'approve_final'),
      canDelete: rp.hasPermission(role, 'skill_cert', 'delete'),
      canConfig: rp.hasPermission(role, 'skill_cert', 'config_score')
    })
    this.loadRecords()
  },

  onShow() {
    if (!this.data.loading) {
      this.setData({ page: 1 })
      this.loadRecords()
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1 })
    this.loadRecords().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.records.length < this.data.total) {
      this.setData({ page: this.data.page + 1 })
      this.loadRecords(true)
    }
  },

  async loadRecords(append) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'getSkillCertRecords',
          data: {
            type: this.data.filterType || undefined,
            approval_status: this.data.filterStatus || undefined,
            page: this.data.page,
            pageSize: this.data.pageSize
          }
        }
      })
      const result = res.result || {}
      if (result.success) {
        const newRecords = result.data || []
        const records = append ? this.data.records.concat(newRecords) : newRecords
        const displayRecords = records.map(r => this.formatRecord(r))
        this.setData({
          records,
          displayRecords,
          total: result.total || 0,
          loading: false
        })
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('loadRecords错误:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  formatRecord(record) {
    const statusMap = {
      'pending_first': '待初审',
      'pending_final': '待终审',
      'approved': '已生效',
      'rejected': '已驳回'
    }
    const statusColorMap = {
      'pending_first': 'var(--warning-color)',
      'pending_final': 'var(--primary-color)',
      'approved': 'var(--success-color)',
      'rejected': 'var(--text-color-light)'
    }
    const typeLabel = record.type === 'competition' ? '比赛' : '证书'
    const typeIcon = record.type === 'competition' ? '🏆' : '📜'
    return {
      ...record,
      statusLabel: statusMap[record.approval_status] || record.approval_status,
      statusColor: statusColorMap[record.approval_status] || 'var(--text-color-light)',
      typeLabel,
      typeIcon,
      eventDateDisplay: record.event_date || '',
      scoreDisplay: record.score_value > 0 ? '+' + record.score_value : '0'
    }
  },

  onFilterType(e) {
    const idx = e.detail.value
    const filterType = this.data.typeOptions[idx].value
    this.setData({ filterType, page: 1 })
    this.loadRecords()
  },

  onFilterStatus(e) {
    const idx = e.detail.value
    const filterStatus = this.data.statusOptions[idx].value
    this.setData({ filterStatus, page: 1 })
    this.loadRecords()
  },

  onItemClick(e) {
    const recordId = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/subPages/skill-cert/detail/detail?record_id=' + recordId })
  },

  onAdd() {
    wx.navigateTo({ url: '/subPages/skill-cert/add/add' })
  },

  onApprove() {
    wx.navigateTo({ url: '/subPages/skill-cert/approve/approve' })
  },

  onConfig() {
    wx.navigateTo({ url: '/subPages/skill-cert/score-rules/score-rules' })
  }
})