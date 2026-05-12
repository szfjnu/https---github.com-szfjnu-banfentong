const app = getApp()
const rp = require('../../../utils/role-permissions')

Page({
  data: {
    loading: true,
    record: null,
    displayRecord: null,
    canApproveFirst: false,
    canApproveFinal: false,
    canDelete: false,
    showRejectModal: false,
    rejectReason: '',
    showDeleteModal: false
  },

  onLoad(options) {
    const role = app.globalData.role || ''
    this.setData({
      canApproveFirst: rp.hasPermission(role, 'skill_cert', 'approve_first'),
      canApproveFinal: rp.hasPermission(role, 'skill_cert', 'approve_final'),
      canDelete: rp.hasPermission(role, 'skill_cert', 'delete')
    })
    if (options.record_id) {
      this.loadDetail(options.record_id)
    }
  },

  async loadDetail(recordId) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'getSkillCertRecordDetail',
          data: { record_id: recordId }
        }
      })
      const result = res.result || {}
      if (result.success) {
        const record = result.data
        const displayRecord = this.formatRecord(record)
        this.setData({ record, displayRecord, loading: false })
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('loadDetail错误:', err)
      this.setData({ loading: false })
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
    const levelLabels = { school: '校级', city: '市级', province: '省级', national: '国家级' }
    const categoryLabels = { vocational: '职业资格类', skill_level: '技能等级类', specialty: '专项能力类', other: '其他类' }

    const displayLog = (record.approval_log || []).map(log => ({
      ...log,
      timeDisplay: log.time ? this.formatTime(log.time) : ''
    }))

    return {
      ...record,
      statusLabel: statusMap[record.approval_status] || '',
      statusColor: statusColorMap[record.approval_status] || '',
      typeLabel: record.type === 'competition' ? '技能比赛' : '技能证书',
      typeIcon: record.type === 'competition' ? '🏆' : '📜',
      levelLabel: levelLabels[record.level] || record.level || '',
      categoryLabel: categoryLabels[record.category] || record.category || '',
      scoreDisplay: record.score_value > 0 ? '+' + record.score_value : '0',
      displayLog,
      showApproveFirst: record.approval_status === 'pending_first' && this.data.canApproveFirst,
      showApproveFinal: record.approval_status === 'pending_final' && this.data.canApproveFinal,
      showReject: (record.approval_status === 'pending_first' && this.data.canApproveFirst) || (record.approval_status === 'pending_final' && this.data.canApproveFinal),
      showDelete: this.data.canDelete
    }
  },

  formatTime(time) {
    if (!time) return ''
    const d = new Date(time)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  },

  async onApproveFirst() {
    await this.doApprove('first_approve')
  },

  async onApproveFinal() {
    await this.doApprove('final_approve')
  },

  onShowRejectModal() {
    this.setData({ showRejectModal: true })
  },

  onCancelReject() {
    this.setData({ showRejectModal: false, rejectReason: '' })
  },

  onInputRejectReason(e) {
    this.setData({ rejectReason: e.detail.value })
  },

  async onConfirmReject() {
    const record = this.data.record
    const action = record.approval_status === 'pending_first' ? 'first_reject' : 'final_reject'
    await this.doApprove(action, this.data.rejectReason)
    this.setData({ showRejectModal: false, rejectReason: '' })
  },

  async doApprove(approveAction, rejectReason) {
    wx.showLoading({ title: '处理中' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'approveSkillCertRecord',
          data: {
            record_id: this.data.record.record_id,
            approve_action: approveAction,
            reject_reason: rejectReason || ''
          }
        }
      })
      const result = res.result || {}
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: '操作成功', icon: 'success' })
        this.loadDetail(this.data.record.record_id)
      } else {
        wx.showToast({ title: result.message || '操作失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onShowDeleteModal() {
    this.setData({ showDeleteModal: true })
  },

  onCancelDelete() {
    this.setData({ showDeleteModal: false })
  },

  async onConfirmDelete() {
    this.setData({ showDeleteModal: false })
    wx.showLoading({ title: '删除中' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'deleteSkillCertRecord',
          data: { record_id: this.data.record.record_id }
        }
      })
      const result = res.result || {}
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: '删除成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: result.message || '删除失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  }
})