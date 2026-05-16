const app = getApp()

Page({
  data: {
    classLoading: true,
    noClass: false,
    classList: [],
    showClassPicker: false,
    role: '',
    canWrite: false,
    currentClassId: '',
    currentClassName: ''
  },

  onLoad: function () {
    this.setData({ classLoading: true, noClass: false })
    this.loadClassInfo()
  },

  loadClassInfo: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: 'getProfile', data: { fetch_class_only: true } }
      })
      if (res.result && res.result.success) {
        const classList = res.result.data.class_list || []
        if (classList.length === 0) {
          this.setData({ classLoading: false, noClass: true })
          return
        }
        if (classList.length === 1) {
          const cls = classList[0]
          app.globalData.classId = cls.class_id
          app.globalData.role = cls.role
          const canWrite = ['admin', 'head_teacher', 'subject_teacher'].includes(cls.role)
          this.setData({
            classLoading: false,
            role: cls.role,
            canWrite,
            currentClassId: cls.class_id,
            currentClassName: cls.class_name,
            classList
          })
        } else {
          this.setData({ classLoading: false, classList, showClassPicker: true })
        }
      } else {
        this.setData({ classLoading: false, noClass: true })
      }
    } catch (err) {
      console.error('加载班级信息失败:', err)
      this.setData({ classLoading: false, noClass: true })
    }
  },

  onClassSelect: function (e) {
    const idx = e.currentTarget.dataset.index
    const cls = this.data.classList[idx]
    if (!cls) return
    app.globalData.classId = cls.class_id
    app.globalData.role = cls.role
    const canWrite = ['admin', 'head_teacher', 'subject_teacher'].includes(cls.role)
    this.setData({
      showClassPicker: false,
      role: cls.role,
      canWrite,
      currentClassId: cls.class_id,
      currentClassName: cls.class_name
    })
  },

  onPullDownRefresh: function () {
    const componentNames = ['overview', 'aiReview', 'studentList', 'dimensions', 'warnings']
    componentNames.forEach(name => {
      const comp = this.selectComponent('#' + name)
      if (comp && comp.refresh) {
        comp.refresh()
      }
    })
    wx.stopPullDownRefresh()
  },

  onBatchGenerateReport: function (e) {
    const studentIds = e.detail.studentIds || []
    if (studentIds.length === 0) return
    this.triggerEvent('batchreport', { studentIds })
  },

  onStudentClick: function (e) {
    const studentId = e.detail.studentId
    if (!studentId) return
    wx.navigateTo({
      url: '/subPkg5/growth/growth/profile?studentId=' + studentId
    })
  },

  loadClassSummary: function () {
    wx.navigateTo({ url: '/subPkg5/growth/summary/summary?classId=' + this.data.currentClassId })
  },

  onDimensionClick: function (e) {
    const key = e.detail.key
    const comp = this.selectComponent('#overview')
    if (comp) {
      comp.setData({ selectedDimension: key === 'score' ? '积分' : key === 'attendance' ? '考勤' : key === 'hygiene' ? '卫生' : '积分' })
      comp.loadData()
    }
  },

  onWarningClick: function () {
    wx.pageScrollTo({
      selector: '#warnings',
      duration: 300
    })
  }
})