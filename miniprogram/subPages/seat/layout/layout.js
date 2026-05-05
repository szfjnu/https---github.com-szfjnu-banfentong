const app = getApp()
const seatApi = require('../seatApi')

Page({
  data: {
    classId: '',
    rows: 6,
    cols: 8,
    specialPositions: [],
    layout: { rows: 6, cols: 8, special_positions: [] },
    arrangement: { seat_map: {}, locked_seats: [] },
    hasExisting: false,
    saving: false,
    selectedSpecial: '',
    hasPodium: false,
    hasFrontDoor: false,
    hasBackDoor: false
  },

  onLoad: function () {
    const classId = app.globalData.class_id
    this.setData({ classId })
    this.loadLayout()
  },

  loadLayout: async function () {
    try {
      const res = await seatApi.getLayout(this.data.classId)
      if (res.data) {
        this.setData({
          rows: res.data.rows,
          cols: res.data.cols,
          specialPositions: res.data.special_positions || [],
          layout: res.data,
          hasExisting: true
        })
        this.updateSpecialFlags()
      }
    } catch (err) {
      console.error('加载布局失败:', err)
    }
  },

  onRowsChange: function (e) {
    const val = parseInt(e.detail.value) || 6
    this.setData({ rows: val })
    this.updateLayoutPreview()
  },

  onColsChange: function (e) {
    const val = parseInt(e.detail.value) || 8
    this.setData({ cols: val })
    this.updateLayoutPreview()
  },

  updateLayoutPreview: function () {
    const validPositions = (this.data.specialPositions || []).filter(
      p => p.row <= this.data.rows && p.col <= this.data.cols
    )
    this.setData({
      specialPositions: validPositions,
      layout: { rows: this.data.rows, cols: this.data.cols, special_positions: validPositions }
    })
  },

  onCellTap: function (e) {
    const { row, col, is_special, special_type } = e.detail
    if (this.data.selectedSpecial) {
      this.toggleSpecialPosition(row, col)
    }
  },

  onCellLongPress: function (e) {
    const { row, col, is_special } = e.detail
    if (is_special) {
      this.removeSpecialPosition(row, col)
    }
  },

  updateSpecialFlags: function () {
    const positions = this.data.specialPositions
    this.setData({
      hasPodium: positions.some(p => p.type === 'podium'),
      hasFrontDoor: positions.some(p => p.type === 'front_door'),
      hasBackDoor: positions.some(p => p.type === 'back_door')
    })
  },

  onTogglePodium: function (e) {
    const checked = e.detail.value
    let positions = [...this.data.specialPositions]
    if (checked) {
      if (!positions.some(p => p.type === 'podium')) positions.push({ type: 'podium' })
    } else {
      positions = positions.filter(p => p.type !== 'podium')
    }
    this.setData({
      specialPositions: positions,
      layout: { rows: this.data.rows, cols: this.data.cols, special_positions: positions }
    })
    this.updateSpecialFlags()
  },

  onToggleFrontDoor: function (e) {
    const checked = e.detail.value
    let positions = [...this.data.specialPositions]
    if (checked) {
      if (!positions.some(p => p.type === 'front_door')) positions.push({ type: 'front_door' })
    } else {
      positions = positions.filter(p => p.type !== 'front_door')
    }
    this.setData({
      specialPositions: positions,
      layout: { rows: this.data.rows, cols: this.data.cols, special_positions: positions }
    })
    this.updateSpecialFlags()
  },

  onToggleBackDoor: function (e) {
    const checked = e.detail.value
    let positions = [...this.data.specialPositions]
    if (checked) {
      if (!positions.some(p => p.type === 'back_door')) positions.push({ type: 'back_door' })
    } else {
      positions = positions.filter(p => p.type !== 'back_door')
    }
    this.setData({
      specialPositions: positions,
      layout: { rows: this.data.rows, cols: this.data.cols, special_positions: positions }
    })
    this.updateSpecialFlags()
  },

  saveLayout: async function () {
    if (this.data.rows < 2 || this.data.rows > 12) {
      wx.showToast({ title: '行数需在2-12之间', icon: 'none' })
      return
    }
    if (this.data.cols < 2 || this.data.cols > 12) {
      wx.showToast({ title: '列数需在2-12之间', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const res = await seatApi.saveLayout(
        this.data.classId,
        this.data.rows,
        this.data.cols,
        this.data.specialPositions,
        false
      )

      if (res.needConfirm) {
        wx.showModal({
          title: '确认修改',
          content: '已有座位安排，修改布局将清除现有安排，是否继续？',
          success: async (modalRes) => {
            if (modalRes.confirm) {
              try {
                await seatApi.saveLayout(
                  this.data.classId,
                  this.data.rows,
                  this.data.cols,
                  this.data.specialPositions,
                  true
                )
                wx.showToast({ title: '保存成功', icon: 'success' })
                setTimeout(() => wx.navigateBack(), 1500)
              } catch (err) {
                wx.showToast({ title: err.message || '保存失败', icon: 'none' })
              }
            }
          }
        })
      } else {
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      }
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
