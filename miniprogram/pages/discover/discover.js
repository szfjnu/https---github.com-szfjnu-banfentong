// pages/discover/discover.js
// 发现页面 - 成长探索模块入口
const app = getApp()

Page({
  data: {
    role: '',
    featureGroups: []
  },

  onLoad: function () {
    this.setData({ role: app.globalData.role || '' })
  },

  onShow: function () {
    this.loadFeatures()
  },

  // 加载功能模块
  loadFeatures: function () {
    const role = app.globalData.role || this.data.role

    // 学习成长
    const growthFeatures = [
      {
        id: 'grade',
        title: '成绩管理',
        desc: '考试成绩记录与分析',
        icon: '📊',
        color: '#1890ff',
        url: '/subPages/grade/grade'
      },
      {
        id: 'aichat',
        title: '微聊陪伴',
        desc: 'AI 伙伴，温暖倾听',
        icon: '💬',
        color: '#667eea',
        url: '/subPages/aichat/aichat'
      }
    ]

    // 校园生活
    const campusFeatures = [
      {
        id: 'activity',
        title: '聚光点',
        desc: '校园活动，点亮精彩',
        icon: '🎪',
        color: '#667eea',
        url: '/subPages/activity/list/list'
      },
      {
        id: 'treehole',
        title: '心灵树洞',
        desc: '匿名倾诉，温暖回应',
        icon: '🌳',
        color: '#52c41a',
        url: '/subPages/treehole/treehole'
      },
      {
        id: 'hero',
        title: '英雄台',
        desc: '荣誉殿堂，榜样力量',
        icon: '🏆',
        color: '#faad14',
        url: '/subPages/hero/hero'
      },
      {
        id: 'flea',
        title: '校园闲鱼',
        desc: '闲置流转，物尽其用',
        icon: '🏷',
        color: '#fa8c16',
        url: '/subPages/flea/flea'
      }
    ]

    // 工具服务
    const toolFeatures = [
      {
        id: 'volunteer',
        title: '志愿服务',
        desc: '志愿记录，服务社会',
        icon: '🤝',
        color: '#13c2c2',
        url: '/subPages/volunteer/volunteer'
      },
      {
        id: 'duty',
        title: '值日管理',
        desc: '值日安排与检查',
        icon: '🧹',
        color: '#eb2f96',
        url: '/subPages/duty/duty'
      },
      {
        id: 'discipline',
        title: '纪律管理',
        desc: '处分记录与撤销',
        icon: '📋',
        color: '#ff4d4f',
        url: '/subPages/discipline/record/record'
      },
      {
        id: 'approval',
        title: '审批中心',
        desc: '申请审批一站式处理',
        icon: '✅',
        color: '#722ed1',
        url: '/subPages/approval/approval'
      }
    ]

    // 根据角色过滤工具模块
    let filteredToolFeatures = toolFeatures
    if (role === 'student' || role === 'parent') {
      filteredToolFeatures = [
        toolFeatures[0], // 志愿服务
        { ...toolFeatures[1], title: '我的值日', url: '/subPages/duty/myduty/myduty' },
        { ...toolFeatures[2], title: '我的处分', url: '/subPages/discipline/my-discipline/my-discipline' }
      ]
    }

    const featureGroups = [
      { title: '学习成长', subtitle: '成长路上的好帮手', features: growthFeatures },
      { title: '校园生活', subtitle: '丰富多彩的校园体验', features: campusFeatures },
      { title: '工具服务', subtitle: '班级管理实用工具', features: filteredToolFeatures }
    ]

    this.setData({ featureGroups, role })
  },

  // 跳转功能模块
  goToFeature: function (e) {
    const url = e.currentTarget.dataset.url
    if (!url) return

    // tabBar 页面用 switchTab
    const tabBarPages = [
      '/pages/index/index',
      '/pages/student/student',
      '/pages/score/score',
      '/pages/discover/discover',
      '/pages/usercenter/usercenter'
    ]

    if (tabBarPages.includes(url)) {
      wx.switchTab({ url })
    } else {
      wx.navigateTo({
        url: url,
        fail: (err) => {
          console.error('页面跳转失败:', err)
          wx.showToast({ title: '功能开发中', icon: 'none' })
        }
      })
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadFeatures()
    wx.stopPullDownRefresh()
  }
})
