const app = getApp()
const seatApi = require('../seatApi')

Page({
  data: {
    classId: '',
    arrangeMode: 'random',
    layout: null,
    arrangement: { seat_map: {}, locked_seats: [] },
    students: [],
    groups: [],
    assignedIds: [],
    manualAssignments: [],
    selectedStudent: null,
    loading: false,
    arranging: false,
    hasLayout: false,
    isDragging: false,
    dragSourceKey: '',
    dragTargetKey: ''
  },

  onLoad: function () {
    const classId = app.globalData.class_id
    this.setData({ classId })
    this.loadData()
  },

  onUnload: async function () {
    if (this._lockHeld) {
      try {
        await seatApi.releaseLock(this.data.classId)
        this._lockHeld = false
      } catch (e) { }
    }
  },

  loadData: async function () {
    this.setData({ loading: true })
    try {
      const [layoutRes, studentsRes] = await Promise.all([
        seatApi.getLayout(this.data.classId),
        seatApi.getStudentsForArrange(this.data.classId)
      ])

      const layout = layoutRes.data
      this.setData({ hasLayout: !!layout })

      if (layout) {
        const arrRes = await seatApi.getArrangement(this.data.classId)
        const arrangement = arrRes.data || { seat_map: {}, locked_seats: [] }
        const assignedIds = Object.values(arrangement.seat_map || {}).map(s => s.student_id)

        this.setData({
          layout,
          arrangement,
          students: studentsRes.data.students || [],
          groups: studentsRes.data.groups || [],
          assignedIds
        })
      }
    } catch (err) {
      console.error('加载数据失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onModeChange: function (e) {
    this.setData({ arrangeMode: e.currentTarget.dataset.mode })
  },

  doRandomArrange: async function () {
    wx.showModal({
      title: '确认',
      content: '将随机安排所有学生座位，已有安排将被覆盖，是否继续？',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ arranging: true })
        try {
          const result = await seatApi.randomArrange(this.data.classId)
          this.setData({
            arrangement: { seat_map: result.data.seat_map, locked_seats: result.data.locked_seats },
            assignedIds: Object.values(result.data.seat_map).map(s => s.student_id)
          })
          wx.showToast({ title: '安排成功', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: err.message || '安排失败', icon: 'none' })
        } finally {
          this.setData({ arranging: false })
        }
      }
    })
  },

  doGroupArrange: async function () {
    if (this.data.groups.length === 0) {
      wx.showToast({ title: '无分组数据，请使用其他模式', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认',
      content: '将按分组区块安排学生座位，是否继续？',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ arranging: true })
        try {
          const result = await seatApi.groupArrange(this.data.classId)
          this.setData({
            arrangement: { seat_map: result.data.seat_map, locked_seats: result.data.locked_seats },
            assignedIds: Object.values(result.data.seat_map).map(s => s.student_id)
          })
          wx.showToast({ title: '安排成功', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: err.message || '安排失败', icon: 'none' })
        } finally {
          this.setData({ arranging: false })
        }
      }
    })
  },

  onStudentSelect: function (e) {
    this.setData({ selectedStudent: e.detail })
  },

  onStudentDeselect: function () {
    this.setData({ selectedStudent: null })
  },

  onSeatClick: function (e) {
    if (this.data.isDragging) return
    const { row, col, is_special, is_empty, student_id, student_name } = e.detail
    if (is_special) return

    if (!this.data.selectedStudent) {
      if (!is_empty) {
        wx.showModal({
          title: '座位已占用',
          content: `${student_name}已在此座位，是否替换？`,
          success: (res) => {
            if (res.confirm) {
              this.setData({ selectedStudent: null })
            }
          }
        })
      }
      return
    }

    const student = this.data.selectedStudent
    const assignments = [{
      row, col,
      student_id: student.student_id,
      student_name: student.student_name,
      gender: student.gender || '',
      height: student.height || ''
    }]

    this.doManualArrange(assignments)
  },

  doManualArrange: async function (assignments) {
    this.setData({ arranging: true })
    try {
      const result = await seatApi.manualArrange(this.data.classId, assignments)
      const newAssignedIds = Object.values(result.data.seat_map).map(s => s.student_id)
      this.setData({
        arrangement: { ...this.data.arrangement, seat_map: result.data.seat_map },
        assignedIds: newAssignedIds,
        selectedStudent: null
      })
      const picker = this.selectComponent('#studentPicker')
      if (picker) picker.clearSelection()
      wx.showToast({ title: '安排成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '安排失败', icon: 'none' })
    } finally {
      this.setData({ arranging: false })
    }
  },

  onDragStart: function (e) {
    const { sourceKey } = e.detail
    this.setData({
      isDragging: true,
      dragSourceKey: sourceKey,
      selectedStudent: null
    })
    const picker = this.selectComponent('#studentPicker')
    if (picker) picker.clearSelection()
  },

  onDragEnd: function (e) {
    const { sourceKey, targetKey, isValid } = e.detail
    this.setData({ isDragging: false, dragSourceKey: '', dragTargetKey: '' })

    if (!isValid || !targetKey || sourceKey === targetKey) {
      wx.showToast({ title: '已取消交换', icon: 'none' })
      return
    }

    this.doSwapSeats(sourceKey, targetKey)
  },

  onDragCancel: function () {
    this.setData({ isDragging: false, dragSourceKey: '', dragTargetKey: '' })
  },

  doSwapSeats: async function (sourceKey, targetKey) {
    this.setData({ arranging: true })
    try {
      const result = await seatApi.swapSeats(this.data.classId, sourceKey, targetKey)
      const newAssignedIds = Object.values(result.data.seat_map).map(s => s.student_id)
      this.setData({
        arrangement: { ...this.data.arrangement, seat_map: result.data.seat_map },
        assignedIds: newAssignedIds
      })
      wx.showToast({ title: '交换成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '交换失败，请重试', icon: 'none' })
    } finally {
      this.setData({ arranging: false })
    }
  }
})
