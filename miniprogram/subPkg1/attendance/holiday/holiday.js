const app = getApp();

Page({
  data: {
    classId: '',
    loading: true,
    adjustments: [],
    showAddModal: false,
    adjustDate: '',
    adjustType: 'makeup',
    targetWeekDay: 1,
    description: '',
    weekDayNames: ['周一', '周二', '周三', '周四', '周五']
  },

  onLoad(options) {
    this.setData({ classId: options.classId || app.globalData.class_id || '' });
    this.loadAdjustments();
  },

  loadAdjustments: async function () {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: { action: 'getHolidayAdjustments', data: { class_id: this.data.classId } }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ adjustments: result.data.adjustments, loading: false });
      } else {
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载调休规则失败:', err);
      this.setData({ loading: false });
    }
  },

  onShowAddModal: function () {
    this.setData({ showAddModal: true, adjustDate: '', adjustType: 'makeup', targetWeekDay: 1, description: '' });
  },

  onDateChange: function (e) {
    this.setData({ adjustDate: e.detail.value });
  },

  onTypeChange: function (e) {
    this.setData({ adjustType: e.detail.value });
  },

  onWeekDayChange: function (e) {
    this.setData({ targetWeekDay: Number(e.detail.value) + 1 });
  },

  onDescInput: function (e) {
    this.setData({ description: e.detail.value });
  },

  onSaveAdjustment: async function () {
    const { classId, adjustDate, adjustType, targetWeekDay, description } = this.data;
    if (!adjustDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'attendanceWarning',
        data: {
          action: 'saveHolidayAdjustment',
          data: { class_id: classId, adjust_date: adjustDate, adjust_type: adjustType, target_week_day: adjustType === 'makeup' ? targetWeekDay : null, description }
        }
      });
      const result = res.result || {};
      if (result.success) {
        this.setData({ showAddModal: false });
        this.loadAdjustments();
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        wx.showToast({ title: result.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      console.error('保存调休规则失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onDeleteAdjustment: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后该日将恢复常规作息，是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await wx.cloud.callFunction({
            name: 'attendanceWarning',
            data: { action: 'deleteHolidayAdjustment', data: { adjustment_id: id } }
          });
          this.loadAdjustments();
          wx.showToast({ title: '删除成功', icon: 'success' });
        } catch (err) {
          console.error('删除失败:', err);
        }
      }
    });
  },

  closeModal: function () {
    this.setData({ showAddModal: false });
  },

  preventBubble() {}
});
