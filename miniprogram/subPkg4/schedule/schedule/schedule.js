const app = getApp()

Page({
  data: {
    classId: '',
    className: '',
    semesterName: '',
    currentWeek: 1,
    totalWeeks: 20,
    courseViewType: 'class',
    viewType: 'week',
    selectedDay: 1,

    weekDays: ['周一', '周二', '周三', '周四', '周五'],
    sections: ['第1节', '第2节', '第3节', '第4节', '第5节', '第6节', '第7节'],

    scheduleGrid: [],
    dayCourses: [],

    loading: true,
    canEdit: false,
    canSwitchView: false,

    isEditing: false,
    editChanges: [],
    scheduleTypeId: 'class_schedule'
  },

  onLoad: function (options) {
    const role = app.globalData.role
    const classId = options.class_id || app.globalData.class_id || app.globalData.classId || ''
    const className = options.class_name ? decodeURIComponent(options.class_name) : (app.globalData.class_name || app.globalData.className || app.globalData.currentClassName || '')
    const semesterName = app.globalData.currentSemesterName || ''

    const canEdit = role === 'admin' || role === 'head_teacher'
    const canSwitchView = role === 'admin' || role === 'head_teacher' || role === 'subject_teacher'

    this.setData({
      classId: classId,
      className: className,
      semesterName: semesterName,
      canEdit: canEdit,
      canSwitchView: canSwitchView,
      courseViewType: 'class'
    })

    if (!classId) {
      this.tryLoadClassFromUser().then(() => {
        this.calculateCurrentWeek()
        this.loadSchedule()
      })
    } else {
      this.calculateCurrentWeek()
      this.loadSchedule()
    }
  },

  tryLoadClassFromUser: async function () {
    try {
      const openid = app.globalData.openid
      if (!openid) return

      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'getUserClasses', data: {} }
      })

      if (res.result && res.result.success && res.result.data) {
        const joinedClasses = res.result.data.joined || res.result.data || []
        if (joinedClasses.length > 0) {
          const cls = joinedClasses[0]
          const classId = cls._id || cls.class_id || ''
          if (classId) {
            this.setData({
              classId,
              className: this.data.className || cls.class_name || ''
            })
            app.globalData.class_id = classId
            app.globalData.currentClassName = cls.class_name || ''
            wx.setStorageSync('class_id', classId)
            if (cls.role) {
              app.globalData.role = cls.role
              wx.setStorageSync('role', cls.role)
            }
            return
          }
        }
      }
      wx.showToast({ title: '请先加入班级', icon: 'none' })
    } catch (e) {
      console.error('从云函数获取班级失败:', e)
      wx.showToast({ title: '获取班级信息失败', icon: 'none' })
    }
  },

  loadClassInfo: async function (classId) {
    if (!classId) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'getClassInfo', data: { class_id: classId, classId: classId } }
      })
      if (res.result && res.result.success && res.result.data) {
        const info = res.result.data
        this.setData({
          className: this.data.className || info.class_name || '',
          semesterName: this.data.semesterName || info.current_semester_name || ''
        })
      }
    } catch (e) {
      console.error('获取班级信息失败:', e)
    }
  },

  calculateCurrentWeek: function () {
    const semester = app.globalData.currentSemester
    if (!semester || !semester.start_date) {
      this.setData({ currentWeek: 1 })
      return
    }

    let startDate
    if (semester.start_date instanceof Date) {
      startDate = semester.start_date
    } else if (typeof semester.start_date === 'string') {
      startDate = new Date(semester.start_date)
    } else {
      startDate = new Date(semester.start_date)
    }

    const now = new Date()
    const diffMs = now.getTime() - startDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    let weekNum = Math.floor(diffDays / 7) + 1
    if (weekNum < 1) weekNum = 1
    if (weekNum > 20) weekNum = 20

    this.setData({ currentWeek: weekNum })
  },

  loadSchedule: async function () {
    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSchedule',
        data: {
          action: 'getSchedule',
          data: {
            class_id: this.data.classId,
            class_name: this.data.className,
            semester_name: this.data.semesterName,
            schedule_type_id: this.data.scheduleTypeId,
            week_number: this.data.currentWeek,
            course_view_type: this.data.courseViewType
          }
        }
      })

      if (res.result && res.result.success) {
        const allCourses = res.result.data || []
        this.buildScheduleGrid(allCourses)
        this.buildDayCourses(allCourses)
      }
    } catch (err) {
      console.error('加载课程表失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  buildScheduleGrid: function (courses) {
    const grid = []
    for (let row = 0; row < 7; row++) {
      const rowData = []
      for (let col = 0; col < 5; col++) {
        const weekDay = col + 1
        const section = row + 1
        const course = courses.find(c => c.week_day === weekDay && c.section === section)
        rowData.push(course || {
          week_day: weekDay,
          section: section,
          course_name: '',
          subject_name: '',
          status: 'empty'
        })
      }
      grid.push(rowData)
    }
    this.setData({ scheduleGrid: grid })
  },

  buildDayCourses: function (courses) {
    const dayCourses = courses
      .filter(c => c.week_day === this.data.selectedDay)
      .sort((a, b) => (a.section || 0) - (b.section || 0))
    this.setData({ dayCourses: dayCourses })
  },

  prevWeek: function () {
    if (this.data.currentWeek <= 1) return
    this.setData({ currentWeek: this.data.currentWeek - 1 })
    this.loadSchedule()
  },

  nextWeek: function () {
    if (this.data.currentWeek >= this.data.totalWeeks) return
    this.setData({ currentWeek: this.data.currentWeek + 1 })
    this.loadSchedule()
  },

  goCurrentWeek: function () {
    this.calculateCurrentWeek()
    this.loadSchedule()
  },

  switchViewType: function () {
    const newType = this.data.viewType === 'week' ? 'day' : 'week'
    this.setData({ viewType: newType })
  },

  switchCourseView: function () {
    const newType = this.data.courseViewType === 'class' ? 'teacher' : 'class'
    this.setData({ courseViewType: newType })
    this.loadSchedule()
  },

  onDayHeaderTap: function (e) {
    const day = e.currentTarget.dataset.day
    this.setData({ selectedDay: day, viewType: 'day' })

    const res = this.data.scheduleGrid
    if (res && res.length > 0) {
      const dayCourses = []
      for (let row = 0; row < 7; row++) {
        const cell = res[row][day - 1]
        if (cell && cell.status !== 'empty') {
          dayCourses.push(cell)
        }
      }
      this.setData({ dayCourses: dayCourses })
    }
  },

  onCellTap: function (e) {
    const { row, col } = e.currentTarget.dataset
    const cell = this.data.scheduleGrid[row] && this.data.scheduleGrid[row][col]
    if (!cell || cell.status === 'empty') return

    if (this.data.isEditing && this.data.canEdit) {
      this.showEditActions(cell, row, col)
      return
    }

    if (cell.course_name || cell.subject_name) {
      const info = [
        cell.course_name || cell.subject_name || '',
        cell.teacher_name ? `教师: ${cell.teacher_name}` : '',
        cell.room ? `教室: ${cell.room}` : '',
        cell.building ? `教学楼: ${cell.building}` : '',
        cell.campus ? `校区: ${cell.campus}` : '',
        cell.time_range ? `时间: ${cell.time_range}` : ''
      ].filter(Boolean).join('\n')

      wx.showModal({
        title: `第${cell.section}节 ${cell.week_day_name || ''}`,
        content: info,
        showCancel: false
      })
    }
  },

  showEditActions: function (cell, row, col) {
    const items = ['调课', '取消课程']
    if (cell.is_override) items.push('恢复基础表')

    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const action = items[res.tapIndex]
        if (action === '调课') this.showModifyForm(cell, row, col)
        else if (action === '取消课程') this.cancelCourse(cell, row, col)
        else if (action === '恢复基础表') this.restoreBase(cell, row, col)
      }
    })
  },

  showModifyForm: function (cell, row, col) {
    wx.showModal({
      title: '调课',
      content: `将"${cell.course_name || cell.subject_name}"调为:`,
      editable: true,
      placeholderText: '输入新课程名',
      success: (res) => {
        if (res.confirm && res.content) {
          const changes = [...this.data.editChanges]
          changes.push({
            row, col, cell,
            override_type: 'modify',
            override_data: { course_name: res.content, subject_name: res.content }
          })
          this.setData({ editChanges: changes })

          const key = `scheduleGrid[${row}][${col}]`
          this.setData({
            [key + '.course_name']: res.content,
            [key + '.subject_name']: res.content,
            [key + '.is_override']: true
          })
        }
      }
    })
  },

  cancelCourse: function (cell, row, col) {
    const changes = [...this.data.editChanges]
    changes.push({
      row, col, cell,
      override_type: 'cancel',
      override_data: { status: 'cancelled' }
    })
    this.setData({ editChanges: changes })

    const key = `scheduleGrid[${row}][${col}]`
    this.setData({
      [key + '.status']: 'cancelled',
      [key + '.is_override']: true
    })
  },

  restoreBase: function (cell, row, col) {
    const changes = [...this.data.editChanges]
    changes.push({
      row, col, cell,
      override_type: 'restore'
    })
    this.setData({ editChanges: changes })
  },

  startEditing: function () {
    this.setData({ isEditing: true, editChanges: [] })
  },

  cancelEditing: function () {
    this.setData({ isEditing: false, editChanges: [] })
    this.loadSchedule()
  },

  saveEditing: async function () {
    if (this.data.editChanges.length === 0) {
      wx.showToast({ title: '无变更', icon: 'none' })
      this.setData({ isEditing: false })
      return
    }

    wx.showModal({
      title: '确认保存',
      content: `确认保存该周${this.data.editChanges.length}项微调？`,
      success: async (res) => {
        if (!res.confirm) return

        const overrides = this.data.editChanges
          .filter(c => c.override_type !== 'restore')
          .map(c => ({
            schedule_id: c.cell.schedule_id || '',
            week_day: c.cell.week_day,
            section: c.cell.section,
            ...c.override_data
          }))

        const restoreIds = this.data.editChanges
          .filter(c => c.override_type === 'restore' && c.cell.is_override)
          .map(c => c.cell._id)

        try {
          if (overrides.length > 0) {
            await wx.cloud.callFunction({
              name: 'manageSchedule',
              data: {
                action: 'updateSchedule',
                data: {
                  class_id: this.data.classId,
                  class_name: this.data.className,
                  semester_name: this.data.semesterName,
                  override_week: this.data.currentWeek,
                  overrides: overrides
                }
              }
            })
          }

          for (const oid of restoreIds) {
            await wx.cloud.callFunction({
              name: 'manageSchedule',
              data: {
                action: 'deleteSchedule',
                data: { type: 'override', override_id: oid }
              }
            })
          }

          wx.showToast({ title: '保存成功', icon: 'success' })
          this.setData({ isEditing: false, editChanges: [] })
          this.loadSchedule()
        } catch (err) {
          console.error('保存微调失败:', err)
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  onScheduleTypeSwitch: function (e) {
    const typeId = e.currentTarget.dataset.type
    if (typeId === this.data.scheduleTypeId) return
    this.setData({ scheduleTypeId: typeId })
    this.loadSchedule()
  },

  goToImport: function () {
    wx.navigateTo({
      url: `/subPkg4/schedule/import/import?class_id=${this.data.classId}&class_name=${encodeURIComponent(this.data.className)}&semester_name=${encodeURIComponent(this.data.semesterName)}&semester_id=${this.data.semesterId || app.globalData.currentSemesterId || ''}`
    })
  }
})
