const app = getApp()
const excelTransfer = require('../../utils/excelTransfer.js')

const REQUIRED_FIELDS = ['schedule_id', 'class_name', 'week_day', 'section']

Page({
  data: {
    classId: '',
    className: '',
    semesterId: '',
    semesterName: '',
    jsonText: '',
    validated: false,
    validating: false,
    importing: false,
    fixing: false,
    previewCount: 0,
    validateErrors: [],
    importResult: null,
    importMethod: 'json',
    scheduleTypeId: 'class_schedule',
    canUseExcel: false,
    excelPreviewData: null,
    excelPreviewCount: 0,
    excelFileID: '',
    excelImporting: false
  },

  onLoad: function (options) {
    const classId = options.class_id || app.globalData.class_id || app.globalData.classId || ''
    const className = options.class_name ? decodeURIComponent(options.class_name) : (app.globalData.currentClassName || app.globalData.className || app.globalData.class_name || '')
    const semesterId = options.semester_id || app.globalData.currentSemesterId || app.globalData.semester_id || ''
    const semesterName = options.semester_name ? decodeURIComponent(options.semester_name) : (app.globalData.currentSemesterName || '')

    this.setData({ classId, className, semesterId, semesterName })

    if (!classId) {
      this.tryLoadClassFromUser().then(() => {
        if (!this.data.className || !this.data.semesterName) {
          this.loadClassInfo(this.data.classId)
        }
      })
    } else if (!className || !semesterName) {
      this.loadClassInfo(classId)
    }

    this.checkExcelPermission()
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
      if (!this.data.semesterName && this.data.semesterId) {
        try {
          const db = wx.cloud.database()
          const semRes = await db.collection('semesters').doc(this.data.semesterId).get()
          if (semRes.data) {
            this.setData({ semesterName: semRes.data.semester_name || semRes.data.name || '' })
          }
        } catch (se) {
          console.error('查询学期信息失败:', se)
        }
      }
    } catch (e) {
      console.error('获取班级信息失败:', e)
    }
  },

  checkExcelPermission: async function () {
    try {
      const perm = await excelTransfer.checkScheduleExcelPermission()
      this.setData({ canUseExcel: perm.allowed })
    } catch (e) {
      console.error('checkExcelPermission failed:', e)
      this.setData({ canUseExcel: false })
    }
  },

  onMethodChange: function (e) {
    const method = e.currentTarget.dataset.method
    this.setData({ importMethod: method })
  },

  onScheduleTypeChange: function (e) {
    const typeId = e.currentTarget.dataset.type
    this.setData({ scheduleTypeId: typeId })
  },

  onChooseExcel: async function () {
    try {
      const fileInfo = await excelTransfer.chooseExcelFile()
      wx.showLoading({ title: '上传文件中...', mask: true })

      const uploadRes = await excelTransfer.uploadToCloud(fileInfo.path)
      wx.hideLoading()

      if (!uploadRes.fileID) {
        wx.showToast({ title: '上传失败', icon: 'none' })
        return
      }

      this.setData({ excelFileID: uploadRes.fileID })

      wx.showLoading({ title: '解析Excel中...', mask: true })
      const result = await excelTransfer.callDataTransfer('importSchedule', {
        fileID: uploadRes.fileID,
        classId: this.data.classId,
        className: this.data.className,
        semesterName: this.data.semesterName,
        semesterId: this.data.semesterId,
        scheduleTypeId: this.data.scheduleTypeId,
        confirm: false
      })
      wx.hideLoading()

      this.setData({
        excelPreviewData: result.data.rows,
        excelPreviewCount: result.data.validCount,
        validateErrors: result.data.errors || [],
        validated: result.data.invalidCount === 0 && result.data.validCount > 0,
        previewCount: result.data.validCount
      })

      if (result.data.validCount > 0 && result.data.invalidCount === 0) {
        wx.showToast({ title: `解析成功，${result.data.validCount}条数据`, icon: 'success' })
      } else if (result.data.invalidCount > 0) {
        wx.showToast({ title: `有效${result.data.validCount}条，无效${result.data.invalidCount}条`, icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('Excel导入失败:', err)
      wx.showToast({ title: err.message || 'Excel导入失败', icon: 'none' })
    }
  },

  doExcelImport: async function () {
    if (!this.data.excelPreviewData || this.data.excelPreviewCount === 0) {
      wx.showToast({ title: '请先选择并解析Excel文件', icon: 'none' })
      return
    }

    this.setData({ excelImporting: true, importResult: null })

    try {
      const result = await excelTransfer.callDataTransfer('importSchedule', {
        fileID: this.data.excelFileID,
        classId: this.data.classId,
        className: this.data.className,
        semesterName: this.data.semesterName,
        semesterId: this.data.semesterId,
        scheduleTypeId: this.data.scheduleTypeId,
        confirm: true,
        previewData: this.data.excelPreviewData
      })

      this.setData({ importResult: result.data })
      if (result.data.failCount === 0 && result.data.skipCount === 0) {
        wx.showToast({ title: '导入全部成功', icon: 'success' })
      } else {
        wx.showToast({ title: `成功${result.data.successCount}条，跳过${result.data.skipCount}条，失败${result.data.failCount}条`, icon: 'none' })
      }
    } catch (err) {
      console.error('Excel导入写入失败:', err)
      wx.showToast({ title: err.message || '导入失败', icon: 'none' })
    } finally {
      this.setData({ excelImporting: false })
    }
  },

  onInputChange: function (e) {
    this.setData({
      jsonText: e.detail.value,
      validated: false,
      validateErrors: [],
      importResult: null
    })
  },

  validateData: function () {
    this.setData({ validating: true, validateErrors: [], importResult: null })

    const text = this.data.jsonText.trim()
    if (!text) {
      this.setData({ validating: false, validateErrors: ['请输入JSON数据'] })
      return
    }

    let records
    try {
      records = JSON.parse(text)
    } catch (e) {
      this.setData({ validating: false, validateErrors: ['JSON格式错误，请检查数据格式'] })
      return
    }

    if (!Array.isArray(records)) {
      this.setData({ validating: false, validateErrors: ['数据必须是JSON数组格式'] })
      return
    }

    if (records.length === 0) {
      this.setData({ validating: false, validateErrors: ['导入数据为空'] })
      return
    }

    const errors = []
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const recordErrors = this.validateRecord(record, i + 1)
      errors.push(...recordErrors)
    }

    this.setData({
      validating: false,
      validateErrors: errors,
      previewCount: records.length,
      validated: errors.length === 0
    })

    if (errors.length === 0) {
      wx.showToast({ title: `校验通过，${records.length}条数据`, icon: 'success' })
    }
  },

  validateRecord: function (record, index) {
    const errors = []
    const prefix = `第${index}条`

    for (const field of REQUIRED_FIELDS) {
      if (record[field] === undefined || record[field] === null || record[field] === '') {
        errors.push(`${prefix}: 字段${field}缺失`)
      }
    }

    if (!record.course_name && !record.subject_name) {
      errors.push(`${prefix}: course_name/subject_name字段缺失`)
    }

    if (record.week_day !== undefined && (record.week_day < 1 || record.week_day > 5)) {
      errors.push(`${prefix}: week_day超出范围1-5`)
    }

    if (record.section !== undefined && (record.section < 1 || record.section > 7)) {
      errors.push(`${prefix}: section超出范围1-7`)
    }

    return errors
  },

  doImport: async function () {
    if (!this.data.validated) {
      wx.showToast({ title: '请先校验数据', icon: 'none' })
      return
    }

    this.setData({ importing: true, importResult: null })

    try {
      const records = JSON.parse(this.data.jsonText.trim())

      const res = await wx.cloud.callFunction({
        name: 'manageSchedule',
        data: {
          action: 'importSchedule',
          data: {
            records: records,
            semester_name: this.data.semesterName,
            semester_id: this.data.semesterId,
            schedule_type_id: this.data.scheduleTypeId,
            is_base: true,
            class_id: this.data.classId
          }
        }
      })

      if (res.result && res.result.success) {
        this.setData({ importResult: res.result.data })
        if (res.result.data.failed === 0) {
          wx.showToast({ title: '导入全部成功', icon: 'success' })
        } else {
          wx.showToast({ title: `成功${res.result.data.success}条，失败${res.result.data.failed}条`, icon: 'none' })
        }
      } else {
        wx.showToast({ title: res.result.message || '导入失败', icon: 'none' })
      }
    } catch (err) {
      console.error('导入失败:', err)
      wx.showToast({ title: '导入失败', icon: 'none' })
    } finally {
      this.setData({ importing: false })
    }
  },

  goBack: function () {
    wx.navigateBack()
  },

  fixExistingData: async function () {
    this.setData({ fixing: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSchedule',
        data: {
          action: 'fixMissingIsBase',
          data: { class_id: this.data.classId }
        }
      })
      if (res.result && res.result.success) {
        const d = res.result.data
        wx.showToast({ title: `修复完成，共${d.total}条，修复${d.fixed}项`, icon: 'success' })
      } else {
        wx.showToast({ title: res.result.message || '修复失败', icon: 'none' })
      }
    } catch (err) {
      console.error('修复历史数据失败:', err)
      wx.showToast({ title: '修复失败', icon: 'none' })
    } finally {
      this.setData({ fixing: false })
    }
  },

  useSampleData: function () {
    const sample = [
      {
        schedule_id: 'SCH-DEMO-001',
        class_name: this.data.className || '示例班级',
        course_name: '语文',
        week_day: 1,
        section: 1,
        start_time: '08:00',
        end_time: '08:45',
        room: 'A101',
        building: '1栋',
        campus: '主校区',
        teacher_name: '张老师',
        schedule_type: '课程'
      },
      {
        schedule_id: 'SCH-DEMO-002',
        class_name: this.data.className || '示例班级',
        course_name: '数学',
        week_day: 1,
        section: 2,
        start_time: '08:55',
        end_time: '09:40',
        room: 'A101',
        building: '1栋',
        campus: '主校区',
        teacher_name: '李老师',
        schedule_type: '课程'
      }
    ]
    this.setData({ jsonText: JSON.stringify(sample, null, 2) })
  }
})
