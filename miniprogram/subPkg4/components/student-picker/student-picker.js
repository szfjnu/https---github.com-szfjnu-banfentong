Component({
  properties: {
    students: {
      type: Array,
      value: []
    },
    assignedIds: {
      type: Array,
      value: []
    },
    showGroup: {
      type: Boolean,
      value: false
    },
    groups: {
      type: Array,
      value: []
    },
    title: {
      type: String,
      value: '选择学生'
    }
  },

  data: {
    filteredList: [],
    searchText: '',
    selectedId: '',
    selectedName: '',
    currentGroup: ''
  },

  observers: {
    'students, assignedIds, searchText, currentGroup': function () {
      this.filterList()
    }
  },

  methods: {
    filterList: function () {
      const { students, assignedIds, searchText, currentGroup, showGroup, groups } = this.data
      const assignedSet = new Set(assignedIds)
      let list = students.filter(s => !assignedSet.has(s.student_id))

      if (searchText) {
        const keyword = searchText.toLowerCase()
        list = list.filter(s => (s.student_name || '').toLowerCase().includes(keyword))
      }

      if (showGroup && currentGroup) {
        const group = groups.find(g => g.group_name === currentGroup)
        if (group) {
          const memberIds = new Set((group.members || []).map(m => m.student_id || m._id || m))
          list = list.filter(s => memberIds.has(s.student_id))
        }
      }

      this.setData({ filteredList: list })
    },

    onSearchInput: function (e) {
      this.setData({ searchText: e.detail.value })
    },

    onGroupChange: function (e) {
      this.setData({ currentGroup: e.detail.value })
    },

    onStudentTap: function (e) {
      const { id, name, gender, height } = e.currentTarget.dataset
      if (this.data.selectedId === id) {
        this.setData({ selectedId: '', selectedName: '' })
        this.triggerEvent('deselect', { student_id: id, student_name: name })
      } else {
        this.setData({ selectedId: id, selectedName: name })
        this.triggerEvent('select', { student_id: id, student_name: name, gender: gender || '', height: height || '' })
      }
    },

    getSelected: function () {
      return { student_id: this.data.selectedId, student_name: this.data.selectedName }
    },

    clearSelection: function () {
      this.setData({ selectedId: '', selectedName: '' })
    }
  }
})
