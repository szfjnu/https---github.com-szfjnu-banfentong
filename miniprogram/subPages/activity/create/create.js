// pages/activity/create/create.js
// 聚光点 - 发布活动
const app = getApp()

Page({
  data: {
    form: {
      title: '',
      category: '体育竞技',
      start_time: '',
      location: '',
      max_people: 0,
      cover_image: ''
    },
    categories: ['体育竞技', '学习交流', '游戏娱乐', '兴趣社交', '其他'],
    categoryIndex: 0,
    date: '',
    time: '',
    maxPeopleStr: '不限',
    submitting: false
  },

  onLoad: function () {
    // 默认时间：明天此时
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const dateStr = this.formatDate(tomorrow)
    const timeStr = this.formatHour(tomorrow)

    this.setData({
      date: dateStr,
      time: timeStr
    })
  },

  formatDate: function (d) {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  formatHour: function (d) {
    const h = d.getHours().toString().padStart(2, '0')
    const min = d.getMinutes().toString().padStart(2, '0')
    return `${h}:${min}`
  },

  // 输入
  onTitleInput: function (e) {
    this.setData({ 'form.title': e.detail.value })
  },

  onCategoryChange: function (e) {
    const index = e.detail.value
    this.setData({
      categoryIndex: index,
      'form.category': this.data.categories[index]
    })
  },

  onDateChange: function (e) {
    this.setData({ date: e.detail.value })
  },

  onTimeChange: function (e) {
    this.setData({ time: e.detail.value })
  },

  onLocationInput: function (e) {
    this.setData({ 'form.location': e.detail.value })
  },

  onMaxPeopleInput: function (e) {
    const val = e.detail.value
    this.setData({
      'form.max_people': Number(val) || 0,
      maxPeopleStr: val ? val : '不限'
    })
  },

  // 上传封面
  onChooseCover: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })

        try {
          const cloudPath = `activity_covers/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempPath
          })
          this.setData({ 'form.cover_image': uploadRes.fileID })
          wx.hideLoading()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '上传失败', icon: 'none' })
        }
      }
    })
  },

  // 删除封面
  onRemoveCover: function () {
    this.setData({ 'form.cover_image': '' })
  },

  // 提交
  onSubmit: function () {
    const { form, date, time } = this.data

    if (!form.title.trim()) {
      wx.showToast({ title: '请输入活动标题', icon: 'none' })
      return
    }
    if (!date || !time) {
      wx.showToast({ title: '请选择活动时间', icon: 'none' })
      return
    }
    if (!form.location.trim()) {
      wx.showToast({ title: '请输入活动地点', icon: 'none' })
      return
    }

    const start_time = new Date(`${date}T${time}`).getTime()
    if (start_time <= Date.now()) {
      wx.showToast({ title: '活动时间需晚于当前', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    wx.cloud.callFunction({
      name: 'campusActivity',
      data: {
        action: 'create',
        title: form.title.trim(),
        category: form.category,
        cover_image: form.cover_image,
        start_time,
        location: form.location.trim(),
        max_people: form.max_people,
        organizer_id: app.globalData.student_id,
        organizer_name: app.globalData.name || '',
        class_id: app.globalData.class_id,
        is_class_committee: app.globalData.position ? true : false
      },
      success: (res) => {
        this.setData({ submitting: false })
        if (res.result && res.result.success) {
          wx.showToast({ title: '发布成功', icon: 'success' })
          setTimeout(() => {
            wx.redirectTo({
              url: `/subPages/activity/detail/detail?id=${res.result.data._id}`
            })
          }, 1500)
        } else {
          wx.showToast({ title: res.result.message || '发布失败', icon: 'none' })
        }
      },
      fail: (err) => {
        this.setData({ submitting: false })
        wx.showToast({ title: '发布失败', icon: 'none' })
      }
    })
  }
})
