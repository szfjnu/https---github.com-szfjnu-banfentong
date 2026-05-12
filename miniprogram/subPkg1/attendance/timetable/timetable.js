const app = getApp();

Page({
  data: {
    classId: '',
    loading: true,
    currentDay: 1,
    dayNames: ['周一', '周二', '周三', '周四', '周五'],
    timetables: {},
    currentDaySections: [],
    editingSection: null,
    showEditModal: false,
    editSectionName: '',
    editStartTime: '',
    editEndTime: '',
    editSectionType: 'class',
    sectionTypes: ['class', 'break', 'lunch'],
    sectionTypeNames: { class: '上课', break: '课间', lunch: '午休' }
  },

  onLoad(options) {
    this.setData({ classId: options.classId || app.globalData.class_id || '' });
    this.loadTimetable();
  },

  loadTimetable: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'getTimetableConfig', data: { class_id: this.data.classId } }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ timetables: result.data.timetables, loading: false });
        this.syncCurrentDaySections();
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载作息时间表失败:', err);
      this.setData({ loading: false });
    }
  },

  switchDay: function (e) {
    this.setData({ currentDay: e.currentTarget.dataset.day });
    this.syncCurrentDaySections();
  },

  syncCurrentDaySections: function () {
    const sections = this.data.timetables[this.data.currentDay] || [];
    this.setData({ currentDaySections: sections });
  },

  onAddSection: function () {
    const sections = this.data.timetables[this.data.currentDay] || [];
    this.setData({
      showEditModal: true,
      editingSection: null,
      editSectionName: `第${sections.filter(s => s.section_type === 'class').length + 1}节`,
      editStartTime: '',
      editEndTime: '',
      editSectionType: 'class'
    });
  },

  onEditSection: function (e) {
    const idx = e.currentTarget.dataset.index;
    const sections = this.data.timetables[this.data.currentDay] || [];
    const section = sections[idx];
    this.setData({
      showEditModal: true,
      editingSection: idx,
      editSectionName: section.section_name,
      editStartTime: section.start_time,
      editEndTime: section.end_time,
      editSectionType: section.section_type
    });
  },

  onDeleteSection: function (e) {
    const idx = e.currentTarget.dataset.index;
    const day = this.data.currentDay;
    const sections = [...(this.data.timetables[day] || [])];
    sections.splice(idx, 1);
    this.saveDayTimetable(day, sections);
  },

  onSaveSection: function () {
    const { editingSection, editSectionName, editStartTime, editEndTime, editSectionType, currentDay } = this.data;
    if (!editSectionName || !editStartTime || !editEndTime) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }

    const sections = [...(this.data.timetables[currentDay] || [])];
    const newSection = {
      section_id: editingSection !== null ? sections[editingSection].section_id : Date.now(),
      section_name: editSectionName,
      section_type: editSectionType,
      start_time: editStartTime,
      end_time: editEndTime
    };

    if (editingSection !== null) {
      sections[editingSection] = newSection;
    } else {
      sections.push(newSection);
    }

    this.setData({ showEditModal: false });
    this.saveDayTimetable(currentDay, sections);
  },

  saveDayTimetable: async function (weekDay, sections) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: {
          action: 'saveTimetableConfig',
          data: { class_id: this.data.classId, week_day: weekDay, sections }
        }
      });
      const result = res.result || {};
      if (result.success) {
        const timetables = { ...this.data.timetables };
        timetables[weekDay] = sections;
        this.setData({ timetables });
        this.syncCurrentDaySections();
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: result.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      console.error('保存作息失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onResetDefault: async function () {
    wx.showModal({
      title: '确认重置',
      content: '将恢复系统默认作息时间表，是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const result = await wx.cloud.callFunction({
            name: 'attendanceWarning',
            data: { action: 'resetTimetableConfig', data: { class_id: this.data.classId } }
          });
          const data = result.result || {};
          if (data.success) {
            this.setData({ timetables: data.data.timetables });
            this.syncCurrentDaySections();
            wx.showToast({ title: '已恢复默认', icon: 'success' });
          }
        } catch (err) {
          console.error('重置失败:', err);
        }
      }
    });
  },

  onEditInput: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onTypeChange: function (e) {
    this.setData({ editSectionType: this.data.sectionTypes[e.detail.value] });
  },

  closeModal: function () {
    this.setData({ showEditModal: false });
  },

  preventBubble() {}
});
