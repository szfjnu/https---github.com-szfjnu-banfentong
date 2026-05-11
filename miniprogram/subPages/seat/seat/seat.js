const app = getApp()
const seatApi = require('../seatApi')

Page({
  data: {
    classId: '',
    className: '',
    role: '',
    canEdit: false,
    layout: null,
    arrangement: { seat_map: {}, locked_seats: [] },
    highlightSeat: '',
    loading: true,
    hasLayout: false,
    hasArrangement: false,
    exporting: false,
    imagePath: '',
    studentExtraInfo: {}
  },

  onLoad: function () {
    const classId = app.globalData.class_id
    const className = app.globalData.class_name || ''
    const role = app.globalData.role
    const canEdit = role === 'admin' || role === 'head_teacher'

    this.setData({ classId, className, role, canEdit })

    if (role === 'student') {
      const studentId = app.globalData.student_id
      this.setData({ highlightStudentId: studentId })
    }
  },

  onShow: function () {
    this.loadData()
  },

  loadData: async function () {
    this.setData({ loading: true })
    try {
      const layoutRes = await seatApi.getLayout(this.data.classId)
      const layout = layoutRes.data
      this.setData({ hasLayout: !!layout })

      if (layout) {
        const arrRes = await seatApi.getArrangement(this.data.classId)
        const arrangement = arrRes.data || { seat_map: {}, locked_seats: [] }
        const hasArrangement = arrangement.seat_map && Object.keys(arrangement.seat_map).length > 0

        let highlightSeat = ''
        if (this.data.role === 'student' && this.data.highlightStudentId) {
          for (const [key, val] of Object.entries(arrangement.seat_map || {})) {
            if (val.student_id === this.data.highlightStudentId) {
              highlightSeat = key
              break
            }
          }
        }

        this.setData({
          layout,
          arrangement,
          hasArrangement,
          highlightSeat
        })

        this.loadStudentExtraInfo()
      }
    } catch (err) {
      console.error('加载座位数据失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goLayout: function () {
    wx.navigateTo({ url: '/subPages/seat/layout/layout' })
  },

  goArrange: function () {
    wx.navigateTo({ url: '/subPages/seat/arrange/arrange' })
  },

  goRotate: function () {
    wx.navigateTo({ url: '/subPages/seat/rotate/rotate' })
  },

  goHistory: function () {
    wx.navigateTo({ url: '/subPages/seat/history/history' })
  },

  onSeatClick: function (e) {
    const { student_name, is_empty, student_id } = e.detail
    if (!is_empty && student_name) {
      const info = this.data.studentExtraInfo[student_id] || {}
      const scoreText = info.score !== undefined ? `\n积分: ${info.score}分` : ''
      const groupText = info.groupName ? `\n分组: ${info.groupName}` : ''
      wx.showModal({
        title: '座位信息',
        content: `学生: ${student_name}${scoreText}${groupText}`,
        showCancel: false
      })
    }
  },

  loadStudentExtraInfo: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'getScores', data: { class_id: this.data.classId } }
      })
      const scoreMap = {}
      if (res.result && res.result.success && res.result.data) {
        const records = res.result.data.records || res.result.data || []
        for (const r of records) {
          const sid = r.student_id || ''
          if (!sid) continue
          if (!scoreMap[sid]) scoreMap[sid] = 0
          scoreMap[sid] += (r.score || r.score_value || 0)
        }
      }

      const groupRes = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'getGroups', data: { class_id: this.data.classId } }
      })
      const groupMap = {}
      if (groupRes.result && groupRes.result.success && groupRes.result.data) {
        const groups = groupRes.result.data.groups || groupRes.result.data || []
        for (const g of groups) {
          const gName = g.name || g.group_name || ''
          const members = g.members || g.student_ids || []
          for (const m of members) {
            const sid = typeof m === 'string' ? m : (m.student_id || '')
            if (sid) groupMap[sid] = gName
          }
        }
      }

      const extraInfo = {}
      const allIds = new Set([...Object.keys(scoreMap), ...Object.keys(groupMap)])
      for (const sid of allIds) {
        extraInfo[sid] = {
          score: scoreMap[sid] !== undefined ? scoreMap[sid] : null,
          groupName: groupMap[sid] || ''
        }
      }
      this.setData({ studentExtraInfo: extraInfo })
    } catch (err) {
      console.error('加载学生额外信息失败:', err)
    }
  },

  resetSeats: async function () {
    wx.showModal({
      title: '确认重置',
      content: '将清空当前所有座位安排，是否继续？',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '重置中...' })
        try {
          await seatApi.saveLayout(
            this.data.classId,
            this.data.layout.rows,
            this.data.layout.cols,
            this.data.layout.special_positions || [],
            true
          )
          this.setData({
            arrangement: { seat_map: {}, locked_seats: [] },
            hasArrangement: false
          })
          wx.showToast({ title: '重置成功', icon: 'success' })
        } catch (err) {
          wx.showToast({ title: err.message || '重置失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  exportImage: async function () {
    this.setData({ exporting: true })
    try {
      const seatGrid = this.selectComponent('#seatGrid')
      if (!seatGrid) {
        wx.showToast({ title: '组件未就绪', icon: 'none' })
        return
      }

      const filePath = await seatGrid.exportImage()
      this.setData({ imagePath: filePath })

      wx.showActionSheet({
        itemList: ['保存到相册'],
        success: async (res) => {
          if (res.tapIndex === 0) {
            try {
              await wx.saveImageToPhotosAlbum({ filePath: filePath })
              wx.showToast({ title: '已保存', icon: 'success' })
            } catch (saveErr) {
              if (saveErr.errMsg && saveErr.errMsg.includes('auth deny')) {
                wx.showModal({
                  title: '需要相册权限',
                  content: '请在设置中开启相册权限',
                  confirmText: '去设置',
                  success: (modalRes) => {
                    if (modalRes.confirm) wx.openSetting()
                  }
                })
              }
            }
          }
        }
      })
    } catch (err) {
      console.error('导出图片失败:', err)
      wx.showToast({ title: '导出失败', icon: 'none' })
    } finally {
      this.setData({ exporting: false })
    }
  },

  clearLayout: function () {
    wx.showModal({
      title: '确认清除布局',
      content: '清除布局将删除当前所有行列设置、特殊位置和座位安排，且不可恢复，是否继续？',
      confirmText: '确认清除',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '清除中...' })
        try {
          await seatApi.clearLayout(this.data.classId)
          this.setData({
            layout: null,
            arrangement: { seat_map: {}, locked_seats: [] },
            hasLayout: false,
            hasArrangement: false
          })
          wx.hideLoading()
          wx.showToast({ title: '已清除布局', icon: 'success' })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '清除失败，请重试', icon: 'none' })
        }
      }
    })
  }
})
