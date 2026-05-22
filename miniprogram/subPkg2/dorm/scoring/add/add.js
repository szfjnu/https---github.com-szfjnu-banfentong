const app = getApp()

Page({
  data: {
    buildingOptions: [],
    buildingIndex: 0,
    selectedBuildingId: '',
    selectedBuildingName: '',
    roomOptions: [],
    roomIndex: 0,
    selectedRoomId: '',
    selectedRoomNumber: '',
    scoreDate: '',
    scoreValue: '',
    remark: '',
    isDormLeader: false,
    dormLeaderRoomId: '',
    canInput: false,
    isSubmitting: false,
    semesterId: '',
    classId: ''
  },

  onLoad: function () {
    const today = new Date()
    const dateStr = this.formatDate(today)
    const role = app.globalData.role
    const classId = app.globalData.class_id || app.globalData.classId || ''
    const isAdmin = role === 'admin'
    const isHeadTeacher = role === 'head_teacher'
    const isDormLeader = role === 'dorm_leader'
    const canInput = app.hasPermission('dorm_score', 'write')

    this.setData({
      scoreDate: dateStr,
      classId,
      isDormLeader,
      canInput
    })

    this.loadSemesterAndBuildings()

    if (isDormLeader && app.globalData.studentId) {
      this.loadDormLeaderRoom()
    }
  },

  onShow: function () {
    const canInput = app.hasPermission('dorm_score', 'write')
    this.setData({ canInput })
  },

  loadSemesterAndBuildings: async function () {
    try {
      const classId = this.data.classId
      const semesterRes = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'getSemesterConfig', data: { class_id: classId } }
      })
      if (semesterRes.result && semesterRes.result.success && semesterRes.result.data) {
        const semester = semesterRes.result.data
        this.setData({ semesterId: semester._id || '' })
      }

      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: { action: 'getDormCandidates', data: { level: 'buildings', class_id: classId } }
      })

      if (res.result && res.result.success) {
        const buildings = res.result.data || []
        this.setData({ buildingOptions: buildings })
        if (buildings.length > 0 && !this.data.isDormLeader) {
          this.setData({
            selectedBuildingId: buildings[0]._id,
            selectedBuildingName: buildings[0].building_name
          })
          this.loadRooms(buildings[0]._id)
        }
      }
    } catch (err) {
      console.error('加载楼栋失败:', err)
      wx.showToast({ title: '加载楼栋失败', icon: 'none' })
    }
  },

  loadDormLeaderRoom: async function () {
    try {
      const studentId = app.globalData.studentId
      if (!studentId) return
      const db = wx.cloud.database()
      const res = await db.collection('students').where({ student_id: studentId }).field({ dorm_room_id: true, dorm_building_id: true }).limit(1).get()
      if (res.data && res.data.length > 0) {
        const student = res.data[0]
        if (student.dorm_room_id) {
          this.setData({ dormLeaderRoomId: student.dorm_room_id })
          const roomRes = await db.collection('dorm_rooms').doc(student.dorm_room_id).get()
          if (roomRes.data) {
            const room = roomRes.data
            this.setData({
              selectedRoomId: room._id,
              selectedRoomNumber: room.room_number,
              selectedBuildingId: room.building_id || ''
            })
            const buildingRes = await db.collection('dorm_buildings').doc(room.building_id).get()
            if (buildingRes.data) {
              this.setData({ selectedBuildingName: buildingRes.data.building_name })
            }
            this.setData({
              roomOptions: [{ _id: room._id, room_number: room.room_number }],
              roomIndex: 0
            })
          }
        }
      }
    } catch (err) {
      console.error('加载宿舍长房间失败:', err)
    }
  },

  loadRooms: async function (buildingId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: { action: 'getDormCandidates', data: { level: 'rooms', building_id: buildingId, class_id: this.data.classId } }
      })

      if (res.result && res.result.success) {
        const rooms = res.result.data || []
        this.setData({
          roomOptions: rooms,
          roomIndex: 0,
          selectedRoomId: rooms.length > 0 ? rooms[0]._id : '',
          selectedRoomNumber: rooms.length > 0 ? rooms[0].room_number : ''
        })
      }
    } catch (err) {
      console.error('加载房间失败:', err)
      wx.showToast({ title: '加载房间失败', icon: 'none' })
    }
  },

  onBuildingChange: function (e) {
    const idx = parseInt(e.detail.value)
    const building = this.data.buildingOptions[idx]
    if (!building) return
    this.setData({
      buildingIndex: idx,
      selectedBuildingId: building._id,
      selectedBuildingName: building.building_name
    })
    this.loadRooms(building._id)
  },

  onRoomChange: function (e) {
    const idx = parseInt(e.detail.value)
    const room = this.data.roomOptions[idx]
    if (!room) return
    this.setData({
      roomIndex: idx,
      selectedRoomId: room._id,
      selectedRoomNumber: room.room_number
    })
  },

  onDateChange: function (e) {
    this.setData({ scoreDate: e.detail.value })
  },

  onScoreInput: function (e) {
    this.setData({ scoreValue: e.detail.value })
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value })
  },

  onSubmit: async function () {
    const { selectedBuildingId, selectedBuildingName, selectedRoomId, selectedRoomNumber, scoreDate, scoreValue, remark, classId, semesterId } = this.data

    if (!selectedRoomId) {
      wx.showToast({ title: '请选择房间', icon: 'none' })
      return
    }
    if (!scoreDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }

    const score = parseFloat(scoreValue)
    if (isNaN(score) || score < 0 || score > 100) {
      wx.showToast({ title: '评分范围为0-100', icon: 'none' })
      return
    }
    if (!/^\d+(\.\d)?$/.test(scoreValue)) {
      wx.showToast({ title: '最多保留一位小数', icon: 'none' })
      return
    }

    this.setData({ isSubmitting: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'dormScoringManager',
        data: {
          action: 'addDailyScore',
          data: {
            building_id: selectedBuildingId,
            building_name: selectedBuildingName,
            room_id: selectedRoomId,
            room_number: selectedRoomNumber,
            score_date: scoreDate,
            score,
            remark,
            class_id: classId,
            semester_id: semesterId
          }
        }
      })

      if (res.result && res.result.success) {
        wx.showToast({ title: '录入成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: res.result?.message || '录入失败', icon: 'none' })
      }
    } catch (err) {
      console.error('提交评分失败:', err)
      wx.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      this.setData({ isSubmitting: false })
    }
  },

  formatDate: function (date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
})
