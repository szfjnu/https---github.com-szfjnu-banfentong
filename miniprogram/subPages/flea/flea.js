const app = getApp()

Page({
  data: {
    classId: '',
    role: '',
    items: [],
    currentCategory: 'all',
    keyword: '',
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,

    // 发布弹窗
    showPublish: false,
    publishing: false,
    publishForm: {
      title: '',
      description: '',
      categoryIndex: 0,
      conditionIndex: 0,
      price: '',
      originalPrice: '',
      images: [],
      sellerContact: ''
    },
    categoryKeys: ['textbook', 'electronics', 'daily', 'sports', 'clothing', 'other'],
    categoryNames: ['教材书籍', '电子数码', '生活用品', '运动器材', '服饰鞋包', '其他'],
    conditionKeys: ['new', 'like-new', 'good', 'fair', 'poor'],
    conditionNames: ['全新', '几乎全新', '轻微使用痕迹', '明显使用痕迹', '仍可使用'],

    // 我的发布弹窗
    showMyItems: false,
    myItems: []
  },

  onLoad() {
    const classId = wx.getStorageSync('currentClassId') || ''
    const userInfo = wx.getStorageSync('userInfo') || {}
    this.setData({ classId, role: userInfo.role || 'student' })
    this.loadItems()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, items: [], hasMore: true })
    this.loadItems().then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadItems()
    }
  },

  // 加载商品列表
  async loadItems() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'fleaMarketManager',
        data: {
          action: 'getItems',
          classId: this.data.classId,
          category: this.data.currentCategory,
          keyword: this.data.keyword || undefined,
          page: this.data.page,
          pageSize: this.data.pageSize
        }
      })

      const result = res.result
      if (result.code === 0) {
        const items = this.data.items.concat(result.data.items)
        this.setData({
          items,
          hasMore: result.data.hasMore,
          page: this.data.page + 1,
          loading: false
        })
      } else {
        wx.showToast({ title: result.msg, icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('加载商品失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 搜索
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({ page: 1, items: [], hasMore: true })
    this.loadItems()
  },

  // 切换分类
  switchCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({ currentCategory: category, page: 1, items: [], hasMore: true })
    this.loadItems()
  },

  // 跳转详情
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/subPages/flea/detail/detail?itemId=${id}&classId=${this.data.classId}` })
  },

  // ===== 发布弹窗 =====
  showPublishModal() {
    this.setData({
      showPublish: true,
      publishForm: {
        title: '',
        description: '',
        categoryIndex: 0,
        conditionIndex: 0,
        price: '',
        originalPrice: '',
        images: [],
        sellerContact: ''
      }
    })
  },

  hidePublishModal() {
    this.setData({ showPublish: false })
  },

  onPublishInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`publishForm.${field}`]: e.detail.value })
  },

  onCategoryPick(e) {
    this.setData({ 'publishForm.categoryIndex': Number(e.detail.value) })
  },

  onConditionPick(e) {
    this.setData({ 'publishForm.conditionIndex': Number(e.detail.value) })
  },

  // 选择图片
  chooseImage() {
    const remaining = 9 - this.data.publishForm.images.length
    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        // 上传到云存储
        const uploadTasks = res.tempFilePaths.map(filePath => {
          const cloudPath = `flea/${this.data.classId}/${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
          return wx.cloud.uploadFile({ cloudPath, filePath })
        })

        Promise.all(uploadTasks).then(results => {
          const newImages = results.map(r => r.fileID)
          const images = this.data.publishForm.images.concat(newImages)
          this.setData({ 'publishForm.images': images })
        }).catch(err => {
          console.error('上传图片失败', err)
          wx.showToast({ title: '图片上传失败', icon: 'none' })
        })
      }
    })
  },

  removeImage(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.publishForm.images
    images.splice(index, 1)
    this.setData({ 'publishForm.images': images })
  },

  // 提交发布
  async submitPublish() {
    const form = this.data.publishForm
    if (!form.title.trim()) return wx.showToast({ title: '请输入标题', icon: 'none' })
    if (!form.description.trim()) return wx.showToast({ title: '请输入描述', icon: 'none' })
    if (form.price === '') return wx.showToast({ title: '请输入价格', icon: 'none' })

    this.setData({ publishing: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'fleaMarketManager',
        data: {
          action: 'publishItem',
          classId: this.data.classId,
          title: form.title.trim(),
          description: form.description.trim(),
          category: this.data.categoryKeys[form.categoryIndex],
          condition: this.data.conditionKeys[form.conditionIndex],
          price: Number(form.price),
          originalPrice: form.originalPrice ? Number(form.originalPrice) : undefined,
          images: form.images,
          sellerContact: form.sellerContact.trim()
        }
      })

      if (res.result.code === 0) {
        wx.showToast({ title: '发布成功', icon: 'success' })
        this.hidePublishModal()
        this.setData({ page: 1, items: [], hasMore: true })
        this.loadItems()
      } else {
        wx.showToast({ title: res.result.msg, icon: 'none' })
      }
    } catch (err) {
      console.error('发布失败', err)
      wx.showToast({ title: '发布失败', icon: 'none' })
    }

    this.setData({ publishing: false })
  },

  // ===== 我的发布 =====
  async goMyItems() {
    this.setData({ showMyItems: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'fleaMarketManager',
        data: {
          action: 'getMyItems',
          classId: this.data.classId,
          pageSize: 50
        }
      })
      if (res.result.code === 0) {
        this.setData({ myItems: res.result.data.items })
      }
    } catch (err) {
      console.error('加载我的发布失败', err)
    }
  },

  hideMyItems() {
    this.setData({ showMyItems: false })
  },

  // 预留
  async onReserve(e) {
    const item = e.currentTarget.dataset.item
    // 简单弹窗输入预留买家（用prompt模拟）
    wx.showModal({
      title: '预留商品',
      content: `为"${item.title}"预留买家？`,
      editable: true,
      placeholderText: '输入买家备注（选填）',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'fleaMarketManager',
              data: {
                action: 'reserveItem',
                classId: this.data.classId,
                itemId: item._id,
                buyerId: 'reserved_by_seller'
              }
            })
            if (result.result.code === 0) {
              wx.showToast({ title: '已预留', icon: 'success' })
              this.goMyItems()
            }
          } catch (err) {
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 标记成交
  onMarkSold(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: '确认成交',
      content: `确认"${item.title}"已成交？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'fleaMarketManager',
              data: {
                action: 'markSold',
                classId: this.data.classId,
                itemId: item._id
              }
            })
            if (result.result.code === 0) {
              wx.showToast({ title: '已标记成交', icon: 'success' })
              this.goMyItems()
            }
          } catch (err) {
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 删除商品
  onDeleteItem(e) {
    const itemId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后将无法恢复，确认删除？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await wx.cloud.callFunction({
              name: 'fleaMarketManager',
              data: {
                action: 'deleteItem',
                classId: this.data.classId,
                itemId
              }
            })
            if (result.result.code === 0) {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.goMyItems()
            }
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  }
})
