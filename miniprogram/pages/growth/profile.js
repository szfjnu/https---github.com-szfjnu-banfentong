const app = getApp()

function initChart(canvas, ctx, width, height, echarts) {
  const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: wx.getSystemInfoSync().pixelRatio })
  canvas.setChart(chart)
  return chart
}

Page({
  data: {
    loading: true,
    classLoading: true,
    noClass: false,
    classList: [],
    showClassPicker: false,
    refreshing: false,
    generatingReport: false,
    generatingComment: false,
    generatingRec: false,
    profileData: null,
    aiSummary: '',
    reportContent: '',
    commentContent: '',
    recommendations: null,
    warnings: [],
    role: '',
    canWrite: false,
    studentName: '',
    selectedTab: 'overview',
    chartOption: null,
    ec: {
      onInit: initChart
    },
    gradeTrend: [],
    scoreSummary: null,
    attendanceSummary: null,
    volunteerInfo: null,
    disciplineList: [],
    certList: [],
    activityList: [],
    commentStyle: 'objective',
    scoreTrendEc: { onInit: null },
    scoreTrendOption: null,
    flatScoreTrend: null,
    reportSections: [],
    commentId: '',
    aiCommentContent: '',
    isCommentModified: false,
    selectedStudentId: '',
    selectedStudentName: '',
    classListStudents: [],
    checkedStudentIds: [],
    checkedStudentMap: {},
    batchReportResults: [],
    batchCommentResults: [],
    warningRules: [],
    canConfigWarning: false,
    showStudentPicker: false,
    studentCount: 0,
    className: '',
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
          this.setData({ classLoading: false, noClass: true, loading: false })
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
          this.loadProfile()
        } else {
          this.setData({ classLoading: false, classList, showClassPicker: true, loading: false })
        }
      } else {
        this.setData({ classLoading: false, noClass: true, loading: false })
      }
    } catch (err) {
      console.error('加载班级信息失败:', err)
      this.setData({ classLoading: false, noClass: true, loading: false })
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
      currentClassName: cls.class_name,
      loading: true
    })
    this.loadProfile()
  },

  onStudentPick: function (e) {
    const sid = e.currentTarget.dataset.sid
    if (!sid) {
      wx.showToast({ title: '学生信息异常，请重试', icon: 'none' })
      return
    }
    const classStudents = this.data.classListStudents || []
    const student = classStudents.find(s => s.student_id === sid)
    const studentName = student ? (student.student_name || student.name || '') : ''
    this.setData({
      showStudentPicker: false,
      loading: true,
      selectedStudentId: sid,
      selectedStudentName: studentName
    })
    this.loadProfileForStudent(sid)
  },

  loadProfileForStudent: async function (studentId) {
    if (!studentId) {
      wx.showToast({ title: '学生信息异常，请重试', icon: 'none' })
      this.setData({ loading: false })
      return
    }
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'getProfile',
          data: { student_id: studentId, class_id: this.data.currentClassId }
        }
      })
      if (res.result && res.result.success) {
        const d = res.result.data
        this.setData({
          profileData: d,
          aiSummary: d.ai_summary || '',
          loading: false,
          selectedStudentId: studentId,
          selectedStudentName: d.student_name || this.data.selectedStudentName
        })
        if (d.data) {
          this.processData(d.data)
        }
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载学生档案失败:', err)
      wx.showToast({ title: '网络异常', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  onPullDownRefresh: function () {
    this.setData({ refreshing: true })
    this.loadProfile(true).finally(() => {
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  loadProfile: async function (forceRefresh) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'getProfile',
          data: { force_refresh: !!forceRefresh, class_id: this.data.currentClassId }
        }
      })

      if (res.result && res.result.success) {
        const d = res.result.data

        if (d.is_class_overview) {
          this.setData({
            loading: false,
            showStudentPicker: true,
            classListStudents: d.students || [],
            studentCount: d.student_count || 0,
            className: d.class_name || ''
          })
          return
        }

        this.setData({
          profileData: d,
          aiSummary: d.ai_summary || '',
          role: d.role || this.data.role,
          canWrite: d.canWrite || this.data.canWrite,
          loading: false
        })

        if (d.data) {
          this.processData(d.data)
        }

        if (this.data.canWrite && this.data.classListStudents.length === 0) {
          this.loadClassListStudents()
        }
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载成长档案失败:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  processData: function (data) {
    if (data.grades && data.grades.length > 0) {
      this.buildGradeChart(data.grades)
    }

    if (data.score_summary) {
      this.setData({ scoreSummary: data.score_summary })
    }

    if (data.scores && data.scores.length > 0) {
      this.buildScoreTrendChart(data.scores)
    }

    if (data.attendance_summary) {
      this.setData({ attendanceSummary: data.attendance_summary })
    }

    if (data.volunteer_hours !== undefined) {
      this.setData({
        volunteerInfo: {
          hours: data.volunteer_hours,
          count: data.volunteer_count || 0
        }
      })
    }

    if (data.disciplines) {
      this.setData({ disciplineList: data.disciplines })
    }

    if (data.certificates) {
      this.setData({ certList: data.certificates })
    }

    if (data.activities) {
      this.setData({ activityList: data.activities })
    }
  },

  buildGradeChart: function (grades) {
    const termSet = new Set()
    const subjectMap = {}
    for (const g of grades) {
      if (!g.subject || !g.term) continue
      termSet.add(g.term)
      if (!subjectMap[g.subject]) subjectMap[g.subject] = {}
      subjectMap[g.subject][g.term] = g.score
    }

    const terms = [...termSet].sort()
    const subjects = Object.keys(subjectMap)
    const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4']

    const series = subjects.map((subj, idx) => ({
      name: subj,
      type: 'line',
      data: terms.map(t => subjectMap[subj][t] || null),
      smooth: true,
      lineStyle: { width: 2 },
      itemStyle: { color: colors[idx % colors.length] }
    }))

    const option = {
      tooltip: { trigger: 'axis' },
      legend: { data: subjects, bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: terms, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { fontSize: 10 } },
      series: series
    }

    const ec = this.data.ec
    ec.onInit = function (canvas, ctx, width, height, echarts) {
      const chart = initChart(canvas, ctx, width, height, echarts)
      chart.setOption(option)
      return chart
    }

    this.setData({ ec, chartOption: option })
  },

  buildScoreTrendChart: function (scoreRecords) {
    const monthMap = {}
    for (const r of scoreRecords) {
      const ts = r.created_at || r.date || r._createTime || 0
      if (!ts) continue
      const d = new Date(ts)
      const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      if (!monthMap[monthKey]) monthMap[monthKey] = 0
      monthMap[monthKey] += (r.score || r.score_value || 0)
    }

    const months = Object.keys(monthMap).sort()
    if (months.length === 0) return

    const values = months.map(m => monthMap[m])
    const option = {
      tooltip: { trigger: 'axis', formatter: '{b}: {c}分' },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: months, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: [{
        type: 'line',
        data: values,
        smooth: true,
        lineStyle: { width: 2, color: '#667eea' },
        itemStyle: { color: '#667eea' },
        areaStyle: { color: 'rgba(102,126,234,0.15)' }
      }]
    }

    const scoreTrendEc = { onInit: null }
    scoreTrendEc.onInit = function (canvas, ctx, width, height, echarts) {
      const chart = initChart(canvas, ctx, width, height, echarts)
      chart.setOption(option)
      return chart
    }

    this.setData({
      scoreTrendEc,
      scoreTrendOption: option,
      flatScoreTrend: { xAxis: months, seriesData: values }
    })
  },

  onTabChange: function (e) {
    this.setData({ selectedTab: e.currentTarget.dataset.tab })
  },

  generateReport: async function () {
    const ids = this.data.checkedStudentIds
    if (!ids || ids.length === 0) {
      wx.showToast({ title: '请先选择至少一名学生', icon: 'none' })
      return
    }
    this.setData({ generatingReport: true, batchReportResults: [] })
    const results = []
    for (let i = 0; i < ids.length; i++) {
      const sid = ids[i]
      const sname = this.data.checkedStudentMap[sid] || ''
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: { action: 'generateReport', data: { student_id: sid } }
        })
        if (res.result && res.result.success) {
          const content = res.result.data.report_content
          results.push({ student_id: sid, student_name: sname, content, success: true })
        } else {
          results.push({ student_id: sid, student_name: sname, content: '', success: false, error: (res.result && res.result.message) || '生成失败' })
        }
      } catch (err) {
        console.error('生成报告失败:', sid, err)
        results.push({ student_id: sid, student_name: sname, content: '', success: false, error: '网络异常' })
      }
    }
    this.setData({ generatingReport: false, batchReportResults: results })
    if (results.length > 0 && results[0].success) {
      const sections = this.parseChartPlaceholders(results[0].content)
      this.setData({ reportContent: results[0].content, reportSections: sections })
    }
  },

  parseChartPlaceholders: function (content) {
    if (!content) return []
    const sections = []
    const regex = /\[CHART:(\w+):(\w+)\]/g
    let lastIndex = 0
    let match
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        sections.push({ type: 'text', content: content.substring(lastIndex, match.index) })
      }
      sections.push({ type: 'chart', chartType: match[1], dataKey: match[2] })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < content.length) {
      sections.push({ type: 'text', content: content.substring(lastIndex) })
    }
    return sections
  },

  generateComment: async function () {
    const ids = this.data.checkedStudentIds
    if (!ids || ids.length === 0) {
      wx.showToast({ title: '请先选择至少一名学生', icon: 'none' })
      return
    }
    this.setData({ generatingComment: true, batchCommentResults: [] })
    const results = []
    for (let i = 0; i < ids.length; i++) {
      const sid = ids[i]
      const sname = this.data.checkedStudentMap[sid] || ''
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: {
            action: 'generateComment',
            data: { style: this.data.commentStyle, student_id: sid }
          }
        })
        if (res.result && res.result.success) {
          results.push({
            student_id: sid,
            student_name: sname,
            comment: res.result.data.comment,
            comment_id: res.result.data.comment_id || '',
            success: true
          })
        } else {
          results.push({ student_id: sid, student_name: sname, comment: '', success: false, error: (res.result && res.result.message) || '生成失败' })
        }
      } catch (err) {
        console.error('生成评语失败:', sid, err)
        results.push({ student_id: sid, student_name: sname, comment: '', success: false, error: '网络异常' })
      }
    }
    this.setData({ generatingComment: false, batchCommentResults: results })
    if (results.length > 0 && results[0].success) {
      this.setData({
        commentContent: results[0].comment,
        commentId: results[0].comment_id || '',
        aiCommentContent: results[0].comment
      })
    }
  },

  onCommentStyleChange: function (e) {
    this.setData({ commentStyle: e.currentTarget.dataset.style })
  },

  onStudentCheckToggle: function (e) {
    const sid = e.currentTarget.dataset.sid
    if (!sid) return
    const ids = this.data.checkedStudentIds.slice()
    const map = Object.assign({}, this.data.checkedStudentMap)
    const idx = ids.indexOf(sid)
    if (idx >= 0) {
      ids.splice(idx, 1)
      delete map[sid]
    } else {
      ids.push(sid)
      const classStudents = this.data.classListStudents || []
      const student = classStudents.find(s => s.student_id === sid)
      map[sid] = student ? (student.student_name || student.name || '') : ''
    }
    this.setData({ checkedStudentIds: ids, checkedStudentMap: map })
  },

  onCheckAllStudents: function () {
    const classStudents = this.data.classListStudents || []
    const ids = []
    const map = {}
    for (const s of classStudents) {
      const sid = s.student_id
      if (!sid) continue
      ids.push(sid)
      map[sid] = s.student_name || s.name || ''
    }
    this.setData({ checkedStudentIds: ids, checkedStudentMap: map })
  },

  onClearCheckAll: function () {
    this.setData({ checkedStudentIds: [], checkedStudentMap: {} })
  },

  onCommentEdit: function (e) {
    this.setData({ commentContent: e.detail.value })
  },

  saveComment: async function () {
    if (!this.data.commentId) return
    if (!this.data.commentContent || !this.data.commentContent.trim()) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' })
      return
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'saveComment',
          data: { comment_id: this.data.commentId, content: this.data.commentContent }
        }
      })
      if (res.result && res.result.success) {
        this.setData({ isCommentModified: true })
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      console.error('保存评语失败:', err)
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  },

  loadRecommendations: async function () {
    this.setData({ generatingRec: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: 'getRecommendations', data: {} }
      })
      if (res.result && res.result.success) {
        this.setData({ recommendations: res.result.data.recommendations })
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '获取失败', icon: 'none' })
      }
    } catch (err) {
      console.error('获取推荐失败:', err)
      wx.showToast({ title: '网络异常', icon: 'none' })
    } finally {
      this.setData({ generatingRec: false })
    }
  },

  onRecFeedback: function (e) {
    const itemName = e.currentTarget.dataset.name
    const feedbackType = e.currentTarget.dataset.type
    const recs = this.data.recommendations
    if (!recs) return

    for (const key of ['activity_recs', 'resource_recs', 'volunteer_recs']) {
      if (recs[key]) {
        recs[key] = recs[key].filter(r => r.name !== itemName)
      }
    }
    this.setData({ recommendations: recs })

    wx.cloud.callFunction({
      name: 'growthManager',
      data: { action: 'submitFeedback', data: { item_name: itemName, feedback_type: feedbackType } }
    }).catch(err => console.error('提交反馈失败:', err))
  },

  loadWarnings: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: 'getWarnings', data: {} }
      })
      if (res.result && res.result.success) {
        this.setData({
          warnings: res.result.data.warnings || [],
          warningRules: res.result.data.warning_rules || []
        })
      }
    } catch (err) {
      console.error('获取预警失败:', err)
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  },

  onDetectWarnings: async function () {
    wx.showLoading({ title: '检测中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: 'detectWarnings', data: {} }
      })
      if (res.result && res.result.success) {
        this.setData({ warnings: res.result.data.warnings || [] })
        wx.showToast({ title: `检测到${res.result.data.total || 0}条预警`, icon: 'none' })
      }
    } catch (err) {
      console.error('检测预警失败:', err)
      wx.showToast({ title: '网络异常', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onWarningConfirm: async function (e) {
    const wid = e.currentTarget.dataset.wid
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: 'updateWarningStatus', data: { warning_id: wid, status: 'confirmed' } }
      })
      if (res.result && res.result.success) {
        const warnings = this.data.warnings.map(w => w._id === wid ? { ...w, status: 'confirmed' } : w)
        this.setData({ warnings })
      }
    } catch (err) { console.error('确认预警失败:', err) }
  },

  onWarningResolve: async function (e) {
    const wid = e.currentTarget.dataset.wid
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: 'updateWarningStatus', data: { warning_id: wid, status: 'resolved' } }
      })
      if (res.result && res.result.success) {
        const warnings = this.data.warnings.map(w => w._id === wid ? { ...w, status: 'resolved' } : w)
        this.setData({ warnings })
      }
    } catch (err) { console.error('处理预警失败:', err) }
  },

  onWarningConfig: function () {
    wx.navigateTo({ url: '/subPages/growth/warning-config/warning-config' })
  },

  loadClassSummary: function () {
    wx.navigateTo({ url: '/subPages/growth/summary/summary' })
  },

  loadClassListStudents: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: 'getProfile', data: { class_id: this.data.currentClassId } }
      })
      if (res.result && res.result.success) {
        const d = res.result.data
        if (d.is_class_overview) {
          this.setData({
            classListStudents: d.students || [],
            studentCount: d.student_count || 0,
            className: d.class_name || ''
          })
        }
      }
    } catch (err) {
      console.error('加载班级学生列表失败:', err)
    }
  },

  preventBubble: function () {}
})
