// pages/debug/debug.js
Page({
  data: {
    result: null,
    loading: false
  },

  onLoad: function () {
    this.debugStudents();
  },

  debugStudents: function () {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'debugStudents',
      data: {}
    }).then(res => {
      console.log('调试结果:', res);
      this.setData({
        result: res.result,
        loading: false
      });
    }).catch(err => {
      console.error('调试失败:', err);
      this.setData({
        result: { success: false, error: err.message },
        loading: false
      });
    });
  }
});
