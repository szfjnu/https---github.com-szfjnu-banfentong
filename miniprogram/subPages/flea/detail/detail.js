const app = getApp()

Page({
  data: {
    classId: '',
    itemId: '',
    item: {},
    messages: [],

    // 留言
    showMessageModal: false,
    messageContent: '',

    // 举报
    showReportModal: false,
    reportReason: '',
    reportDetail: '',
    defaultAvatar: '/images/icons/default_avatar.png', 
    defaultItemImg: '/images/icons/default_placeholder.png', 
  },

  onLoad(options) {
    const classId = options.classId || app.globalData.class_id || wx.getStorageSync('class_id') || ''
    const itemId = options.itemId || ''
    this.setData({ classId, itemId })
    if (!classId) {
      this.setData({ loading: false })
      return
    }
    this.loadDetail()
    this.loadMessages()
  },

  // 加载详情
  async loadDetail() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'fleaMarketManager',
        data: {
          action: 'getItemDetail',
          classId: this.data.classId,
          itemId: this.data.itemId
        }
      })
      if (res.result.code === 0) {
        this.setData({ item: res.result.data })
      } else {
        wx.showToast({ title: res.result.msg, icon: 'none' })
      }
    } catch (err) {
      console.error('加载详情失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 加载留言
  async loadMessages() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'fleaMarketManager',
        data: {
          action: 'getMessages',
          classId: this.data.classId,
          itemId: this.data.itemId,
          pageSize: 50
        }
      })
      if (res.result.code === 0) {
        this.setData({ messages: res.result.data })
      }
    } catch (err) {
      console.error('加载留言失败', err)
    }
  },

  // 预览图片
  previewImage(e) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      current: src,
      urls: this.data.item.images
    })
  },

  // 当卖家头像加载失败时触发
  onAvatarError(e) {
    this.setData({
      'item.seller_avatar': this.data.defaultAvatar // 替换为默认图
    });
  },

  
  // 处理轮播图加载失败
  onImageError(e) {
    console.log('图片加载失败', e);
  },

  // 想要/取消
  async toggleWant() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'fleaMarketManager',
        data: {
          action: 'toggleWant',
          classId: this.data.classId,
          itemId: this.data.itemId
        }
      })
      if (res.result.code === 0) {
        const wanted = res.result.data.wanted
        const item = this.data.item
        item.is_wanted = wanted
        item.want_count += wanted ? 1 : -1
        this.setData({ item })
        wx.showToast({ title: wanted ? '已想要' : '已取消', icon: 'success' })
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 我想要
  onWantBuy() {
    this.setData({ showMessageModal: true })
  },

  // ===== 留言 =====
  hideMessageModal() {
    this.setData({ showMessageModal: false })
  },

  onMessageInput(e) {
    this.setData({ messageContent: e.detail.value })
  },

  async sendMessage() {
    const content = this.data.messageContent.trim()
    if (!content) return wx.showToast({ title: '请输入留言', icon: 'none' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'fleaMarketManager',
        data: {
          action: 'addMessage',
          classId: this.data.classId,
          itemId: this.data.itemId,
          content
        }
      })
      if (res.result.code === 0) {
        wx.showToast({ title: '留言成功', icon: 'success' })
        this.setData({ showMessageModal: false, messageContent: '' })
        this.loadMessages()
      }
    } catch (err) {
      wx.showToast({ title: '留言失败', icon: 'none' })
    }
  },

  // ===== 举报 =====
  showReport() {
    this.setData({ showReportModal: true, reportReason: '', reportDetail: '' })
  },

  hideReportModal() {
    this.setData({ showReportModal: false })
  },

  selectReportReason(e) {
    this.setData({ reportReason: e.currentTarget.dataset.reason })
  },

  onReportDetailInput(e) {
    this.setData({ reportDetail: e.detail.value })
  },

  async submitReport() {
    if (!this.data.reportReason) return wx.showToast({ title: '请选择举报原因', icon: 'none' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'fleaMarketManager',
        data: {
          action: 'reportItem',
          classId: this.data.classId,
          itemId: this.data.itemId,
          reason: this.data.reportReason,
          detail: this.data.reportDetail
        }
      })
      if (res.result.code === 0) {
        wx.showToast({ title: '举报已提交', icon: 'success' })
        this.setData({ showReportModal: false })
      }
    } catch (err) {
      wx.showToast({ title: '举报失败', icon: 'none' })
    }
  },

  preventBubble() {},
})
