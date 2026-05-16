Component({
  properties: {
    classId: { type: String, value: '' },
    role: { type: String, value: '' },
    canWrite: { type: Boolean, value: false }
  },

  data: {
    students: [],
    searchKeyword: '',
    selectedSort: 'score_desc',
    sortOptions: [
      { value: 'score_desc', label: '积分降序' },
      { value: 'score_asc', label: '积分升序' },
      { value: 'name_asc', label: '姓名A-Z' },
      { value: 'warning_first', label: '预警优先' }
    ],
    checkedStudentIds: [],
    showBatchBtn: false,
    loading: true,
    generating: false
  },

  lifetimes: {
    attached: function () {
      if (this.properties.classId) {
        this.loadData()
      }
    }
  },

  methods: {
    loadData: async function () {
      if (!this.properties.classId) return
      this.setData({ loading: true })
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: {
            action: 'getStudentGrowthList',
            data: { class_id: this.properties.classId, sort: this.data.selectedSort }
          }
        })
        if (res.result && res.result.success) {
          this.setData({ students: res.result.data.students || [], loading: false })
        } else {
          this.setData({ loading: false })
        }
      } catch (err) {
        console.error('加载学生列表失败:', err)
        this.setData({ loading: false })
      }
    },

    onSearchInput: function (e) {
      this.setData({ searchKeyword: e.detail.value })
    },

    onSortChange: function (e) {
      const idx = e.detail.value
      const sort = this.data.sortOptions[idx].value
      this.setData({ selectedSort: sort })
      this.loadData()
    },

    onStudentClick: function (e) {
      const sid = e.currentTarget.dataset.sid
      this.triggerEvent('studentclick', { studentId: sid })
    },

    onStudentCheckToggle: function (e) {
      const sid = e.currentTarget.dataset.sid
      const ids = this.data.checkedStudentIds.slice()
      const idx = ids.indexOf(sid)
      if (idx >= 0) {
        ids.splice(idx, 1)
      } else {
        ids.push(sid)
      }
      this.setData({ checkedStudentIds: ids, showBatchBtn: ids.length > 0 })
    },

    onCheckAll: function () {
      const ids = this.data.students.map(s => s.student_id)
      this.setData({ checkedStudentIds: ids, showBatchBtn: ids.length > 0 })
    },

    onClearCheck: function () {
      this.setData({ checkedStudentIds: [], showBatchBtn: false })
    },

    onBatchGenerateReport: async function () {
      const ids = this.data.checkedStudentIds
      if (ids.length === 0) return
      this.setData({ generating: true })
      this.triggerEvent('batchreport', { studentIds: ids })
      this.setData({ generating: false })
    },

    refresh: function () {
      this.loadData()
    }
  }
})