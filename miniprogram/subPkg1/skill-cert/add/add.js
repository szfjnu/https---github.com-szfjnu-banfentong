const app = getApp()

const COMPETITION_LEVELS = [
  { value: 'school', label: '校级' },
  { value: 'city', label: '市级' },
  { value: 'province', label: '省级' },
  { value: 'national', label: '国家级' }
]

const CERTIFICATE_CATEGORIES = [
  { value: 'vocational', label: '职业资格类' },
  { value: 'skill_level', label: '技能等级类' },
  { value: 'specialty', label: '专项能力类' },
  { value: 'other', label: '其他类' }
]

Page({
  data: {
    submitting: false,
    formType: 'competition',
    typeOptions: [
      { value: 'competition', label: '技能比赛' },
      { value: 'certificate', label: '技能证书' }
    ],
    levelOptions: COMPETITION_LEVELS,
    categoryOptions: CERTIFICATE_CATEGORIES,
    formData: {
      name: '',
      level: '',
      category: '',
      award: '',
      issuer: '',
      eventDate: '',
      remark: ''
    },
    selectedStudent: null,
    students: [],
    filteredStudents: [],
    searchKeyword: '',
    showStudentPicker: false,
    dateVisible: false,
    isStudentRole: false
  },

  onLoad() {
    const role = app.globalData.role || ''
    const isStudentRole = role === 'student'
    this.setData({ isStudentRole })

    if (isStudentRole) {
      const studentId = app.globalData.studentId || ''
      const studentName = app.globalData.studentName || ''
      this.setData({
        selectedStudent: { student_id: studentId, student_name: studentName }
      })
    } else {
      this.loadStudents()
    }
  },

  async loadStudents() {
    try {
      const classId = app.globalData.classId || ''
      const db = wx.cloud.database()
      const res = await db.collection('students')
        .where({ class_id: classId, status: db.command.neq('graduated') })
        .field({ student_id: true, student_name: true, name: true })
        .limit(200)
        .get()
      const students = (res.data || []).map(s => ({
        student_id: s.student_id,
        student_name: s.student_name || s.name || ''
      }))
      this.setData({ students, filteredStudents: students })
    } catch (err) {
      console.error('loadStudents错误:', err)
    }
  },

  onSwitchType(e) {
    const idx = e.detail.value
    const formType = this.data.typeOptions[idx].value
    this.setData({
      formType,
      'formData.level': '',
      'formData.category': '',
      'formData.award': '',
      'formData.issuer': ''
    })
  },

  onInputName(e) { this.setData({ 'formData.name': e.detail.value }) },
  onInputAward(e) { this.setData({ 'formData.award': e.detail.value }) },
  onInputIssuer(e) { this.setData({ 'formData.issuer': e.detail.value }) },
  onInputRemark(e) { this.setData({ 'formData.remark': e.detail.value }) },

  onSelectLevel(e) {
    const idx = e.detail.value
    this.setData({ 'formData.level': this.data.levelOptions[idx].value })
  },

  onSelectCategory(e) {
    const idx = e.detail.value
    this.setData({ 'formData.category': this.data.categoryOptions[idx].value })
  },

  onDateChange(e) {
    this.setData({ 'formData.eventDate': e.detail.value })
  },

  onSearchStudent(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })
    this.applyStudentFilter()
  },

  applyStudentFilter() {
    const keyword = this.data.searchKeyword.toLowerCase()
    const students = this.data.students
    if (!keyword) {
      this.setData({ filteredStudents: students })
      return
    }
    const filtered = students.filter(s => s.student_name.toLowerCase().indexOf(keyword) >= 0)
    this.setData({ filteredStudents: filtered })
  },

  onSelectStudent(e) {
    const idx = e.currentTarget.dataset.idx
    const student = this.data.filteredStudents[idx]
    this.setData({
      selectedStudent: student,
      showStudentPicker: false
    })
  },

  onToggleStudentPicker() {
    this.setData({ showStudentPicker: !this.data.showStudentPicker })
  },

  async onSubmit() {
    const { formType, formData, selectedStudent } = this.data
    if (!selectedStudent || !selectedStudent.student_id) {
      wx.showToast({ title: '请选择学生', icon: 'none' })
      return
    }
    if (!formData.name.trim()) {
      wx.showToast({ title: '名称不能为空', icon: 'none' })
      return
    }
    if (formType === 'competition' && !formData.level) {
      wx.showToast({ title: '请选择比赛级别', icon: 'none' })
      return
    }
    if (formType === 'certificate' && !formData.category) {
      wx.showToast({ title: '请选择证书类别', icon: 'none' })
      return
    }
    if (!formData.eventDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'addSkillCertRecord',
          data: {
            type: formType,
            student_id: selectedStudent.student_id,
            class_id: app.globalData.classId || '',
            name: formData.name.trim(),
            level: formData.level,
            category: formData.category,
            award: formData.award,
            issuer: formData.issuer,
            event_date: formData.eventDate,
            remark: formData.remark
          }
        }
      })
      const result = res.result || {}
      if (result.success) {
        wx.showToast({ title: '提交成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        wx.showToast({ title: result.message || '提交失败', icon: 'none' })
      }
    } catch (err) {
      console.error('onSubmit错误:', err)
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
    this.setData({ submitting: false })
  }
})