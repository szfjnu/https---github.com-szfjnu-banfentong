const app = getApp()
const seatApi = require('../seatApi')

Page({
  data: {
    classId: '',
    layout: null,
    arrangement: { seat_map: {}, locked_seats: [] },
    direction: 'left_right',
    period: 'weekly',
    step: 1,
    rotating: false,
    saving: false,
    hasLayout: false,
    hasArrangement: false,
    directionOptions: [
      { value: 'left_right', label: '左右平移' },
      { value: 'front_back', label: '前后平移' },
      { value: 'clockwise', label: '整体旋转' }
    ],
    periodOptions: [
      { value: 'weekly', label: '每周' },
      { value: 'biweekly', label: '每两周' },
      { value: 'monthly', label: '每月' }
    ]
  },

  onLoad: function () {
    const classId = app.globalData.class_id
    this.setData({ classId })
    this.loadData()
  },

  updatePickerLabels: function () {
    const dirOpt = this.data.directionOptions
    const perOpt = this.data.periodOptions
    const dirIdx = dirOpt.findIndex(d => d.value === this.data.direction)
    const perIdx = perOpt.findIndex(p => p.value === this.data.period)
    this.setData({
      directionIndex: dirIdx >= 0 ? dirIdx : 0,
      periodIndex: perIdx >= 0 ? perIdx : 0,
      directionLabel: dirOpt[dirIdx >= 0 ? dirIdx : 0].label,
      periodLabel: perOpt[perIdx >= 0 ? perIdx : 0].label
    })
  },

  loadData: async function () {
    try {
      const layoutRes = await seatApi.getLayout(this.data.classId)
      const layout = layoutRes.data
      this.setData({ hasLayout: !!layout })

      if (layout) {
        const arrRes = await seatApi.getArrangement(this.data.classId)
        const arrangement = arrRes.data || { seat_map: {}, locked_seats: [] }
        const hasArrangement = arrangement.seat_map && Object.keys(arrangement.seat_map).length > 0

        const rotateConfig = arrangement.rotate_config || {}
        this.setData({
          layout,
          arrangement,
          hasArrangement,
          direction: rotateConfig.direction || 'left_right',
          period: rotateConfig.period || 'weekly',
          step: rotateConfig.step || 1
        })
        this.updatePickerLabels()
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    }
  },

  onDirectionChange: function (e) {
    const idx = e.detail.value
    this.setData({ direction: this.data.directionOptions[idx].value })
    this.updatePickerLabels()
  },

  onPeriodChange: function (e) {
    const idx = e.detail.value
    this.setData({ period: this.data.periodOptions[idx].value })
    this.updatePickerLabels()
  },

  onStepChange: function (e) {
    const val = parseInt(e.detail.value) || 1
    this.setData({ step: val < 1 ? 1 : val })
  },

  saveConfig: async function () {
    this.setData({ saving: true })
    try {
      const res = await seatApi.saveRotateConfig(this.data.classId, this.data.direction, this.data.period, this.data.step)
      this.setData({
        direction: res.data.direction,
        period: res.data.period,
        step: res.data.step
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  executeRotate: async function () {
    if (!this.data.hasArrangement) {
      wx.showToast({ title: '请先安排座位', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认轮换',
      content: `将执行${this.data.directionOptions.find(d => d.value === this.data.direction).label}${this.data.step}步，是否继续？`,
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ rotating: true })
        try {
          const result = await seatApi.executeRotate(this.data.classId, this.data.direction, this.data.step)
          this.setData({
            arrangement: { seat_map: result.data.seat_map, locked_seats: result.data.locked_seats }
          })
          wx.showToast({ title: '轮换成功', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: err.message || '轮换失败', icon: 'none' })
        } finally {
          this.setData({ rotating: false })
        }
      }
    })
  },

  onSeatLongPress: function (e) {
    const { row, col, student_id, student_name, is_locked, is_empty } = e.detail
    if (is_empty || !student_id) return

    const items = is_locked ? ['解锁座位'] : ['锁定座位']
    wx.showActionSheet({
      itemList: items,
      success: async (res) => {
        try {
          if (is_locked) {
            const result = await seatApi.unlockSeat(this.data.classId, row, col)
            this.setData({ 'arrangement.locked_seats': result.data.locked_seats })
          } else {
            const result = await seatApi.lockSeat(this.data.classId, row, col, student_id, student_name)
            this.setData({ 'arrangement.locked_seats': result.data.locked_seats })
          }
          wx.showToast({ title: is_locked ? '已解锁' : '已锁定', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      }
    })
  }
})
