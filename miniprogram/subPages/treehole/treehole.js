// pages/treehole/treehole.js
// 心灵树洞 - 匿名情感倾诉与互助社区
const app = getApp();

Page({
  data: {
    loading: true,
    role: '',
    classId: '',
    isAdmin: false,

    // 帖子列表
    posts: [],
    heartMap: {},
    page: 0,
    pageSize: 20,
    hasMore: true,

    // 心情选项
    moodOptions: [
      { value: 'happy', icon: '😊', label: '开心' },
      { value: 'sad', icon: '😢', label: '难过' },
      { value: 'anxious', icon: '😰', label: '焦虑' },
      { value: 'angry', icon: '😤', label: '生气' },
      { value: 'confused', icon: '🤔', label: '困惑' },
      { value: 'peaceful', icon: '😌', label: '平静' }
    ],

    // 发帖弹窗
    showPublishModal: false,
    publishContent: '',
    selectedMood: '',
    isAnonymous: true,
    publishing: false,

    // 举报弹窗
    showReportModal: false,
    reportPostId: '',
    reportReason: '',
    reportDetail: '',
    reportReasons: [
      '包含不当言论',
      '人身攻击',
      '广告或垃圾信息',
      '虚假信息',
      '其他原因'
    ],

    // 管理员操作弹窗
    showAdminModal: false,
    adminPostId: '',
    adminPostStatus: ''
  },

  onLoad: function () {
    this.setData({
      role: app.globalData.role || '',
      classId: app.globalData.class_id || '',
      isAdmin: app.globalData.role === 'head_teacher' || app.globalData.role === 'admin'
    });
    this.loadPosts();
  },

  onShow: function () {
    const newRole = app.globalData.role || '';
    const newClassId = app.globalData.class_id || '';
    if (newRole !== this.data.role || newClassId !== this.data.classId) {
      this.setData({
        role: newRole,
        classId: newClassId,
        isAdmin: newRole === 'head_teacher' || newRole === 'admin'
      });
      this.refreshPosts();
    }
  },

  onPullDownRefresh: function () {
    this.refreshPosts().then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 刷新帖子列表（重置分页）
  refreshPosts: async function () {
    this.setData({ page: 0, hasMore: true, posts: [] });
    await this.loadPosts();
  },

  // 加载帖子列表
  loadPosts: async function () {
    const { classId, page, pageSize, role } = this.data;

    if (!classId) {
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'getPosts',
          data: {
            class_id: classId,
            page: page,
            pageSize: pageSize,
            role: role
          }
        }
      });

      const result = res.result || {};
      if (!result.success) {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const newPosts = result.data.posts || [];
      const heartMap = result.data.heartMap || {};
      const mergedHeartMap = { ...this.data.heartMap, ...heartMap };

      this.setData({
        posts: page === 0 ? newPosts : [...this.data.posts, ...newPosts],
        heartMap: mergedHeartMap,
        hasMore: result.data.hasMore || false,
        loading: false
      });
    } catch (err) {
      console.error('加载帖子失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 加载更多
  loadMore: function () {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 });
    this.loadPosts();
  },

  // 跳转帖子详情
  goToDetail: function (e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/treehole/detail/detail?id=${postId}`
    });
  },

  // 切换鼓励状态
  onToggleHeart: async function (e) {
    const postId = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;

    if (!postId) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'toggleHeart',
          data: {
            post_id: postId,
            class_id: this.data.classId
          }
        }
      });

      const result = res.result || {};
      if (result.success) {
        const hasHearted = result.data.hasHearted;
        const posts = [...this.data.posts];
        posts[index] = { ...posts[index] };
        posts[index].hearts_count = (posts[index].hearts_count || 0) + (hasHearted ? 1 : -1);

        const heartMap = { ...this.data.heartMap };
        if (hasHearted) {
          heartMap[postId] = true;
        } else {
          delete heartMap[postId];
        }

        this.setData({ posts, heartMap });
      }
    } catch (err) {
      console.error('鼓励操作失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // ===== 发帖相关 =====

  // 打开发帖弹窗
  openPublishModal: function () {
    this.setData({
      showPublishModal: true,
      publishContent: '',
      selectedMood: '',
      isAnonymous: true
    });
  },

  // 关闭发帖弹窗
  closePublishModal: function () {
    this.setData({ showPublishModal: false });
  },

  preventBubble: function () {},

  // 选择心情
  onSelectMood: function (e) {
    const mood = e.currentTarget.dataset.mood;
    this.setData({
      selectedMood: this.data.selectedMood === mood ? '' : mood
    });
  },

  // 内容输入
  onPublishInput: function (e) {
    this.setData({ publishContent: e.detail.value });
  },

  // 匿名开关
  onAnonymousChange: function (e) {
    this.setData({ isAnonymous: e.detail.value });
  },

  // 执行发帖
  doPublish: async function () {
    const { publishContent, selectedMood, isAnonymous, classId } = this.data;

    if (!publishContent.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    if (publishContent.trim().length > 500) {
      wx.showToast({ title: '内容不能超过500字', icon: 'none' });
      return;
    }

    this.setData({ publishing: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'publishPost',
          data: {
            class_id: classId,
            content: publishContent.trim(),
            mood: selectedMood,
            is_anonymous: isAnonymous
          }
        }
      });

      const result = res.result || {};
      if (result.success) {
        wx.showToast({ title: '发布成功', icon: 'success' });
        this.setData({ showPublishModal: false });
        this.refreshPosts();
      } else {
        wx.showToast({ title: result.message || '发布失败', icon: 'none' });
      }
    } catch (err) {
      console.error('发帖失败:', err);
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
    } finally {
      this.setData({ publishing: false });
    }
  },

  // ===== 举报相关 =====

  // 打开举报弹窗
  onReport: function (e) {
    const postId = e.currentTarget.dataset.id;
    this.setData({
      showReportModal: true,
      reportPostId: postId,
      reportReason: '',
      reportDetail: ''
    });
  },

  // 关闭举报弹窗
  closeReportModal: function () {
    this.setData({ showReportModal: false });
  },

  // 选择举报原因
  onSelectReportReason: function (e) {
    this.setData({ reportReason: e.currentTarget.dataset.reason });
  },

  // 举报补充说明输入
  onReportDetailInput: function (e) {
    this.setData({ reportDetail: e.detail.value });
  },

  // 执行举报
  doReport: async function () {
    const { reportPostId, reportReason, reportDetail, classId } = this.data;

    if (!reportReason) {
      wx.showToast({ title: '请选择举报原因', icon: 'none' });
      return;
    }

    try {
      const reason = reportDetail ? `${reportReason}：${reportDetail}` : reportReason;
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'reportPost',
          data: {
            post_id: reportPostId,
            class_id: classId,
            reason: reason
          }
        }
      });

      const result = res.result || {};
      if (result.success) {
        wx.showToast({ title: '举报成功', icon: 'success' });
        this.setData({ showReportModal: false });
      } else {
        wx.showToast({ title: result.message || '举报失败', icon: 'none' });
      }
    } catch (err) {
      console.error('举报失败:', err);
      wx.showToast({ title: '举报失败', icon: 'none' });
    }
  },

  // ===== 管理员操作 =====

  // 打开管理员操作弹窗
  onAdminAction: function (e) {
    const postId = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    this.setData({
      showAdminModal: true,
      adminPostId: postId,
      adminPostStatus: status
    });
  },

  // 关闭管理员操作弹窗
  closeAdminModal: function () {
    this.setData({ showAdminModal: false });
  },

  // 隐藏帖子
  onHidePost: async function () {
    const { adminPostId, classId } = this.data;

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'hidePost',
          data: { post_id: adminPostId, class_id: classId, hide: true }
        }
      });

      if (res.result && res.result.success) {
        wx.showToast({ title: '已隐藏', icon: 'success' });
        this.setData({ showAdminModal: false });
        this.refreshPosts();
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('隐藏帖子失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 恢复帖子
  onRestorePost: async function () {
    const { adminPostId, classId } = this.data;

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'hidePost',
          data: { post_id: adminPostId, class_id: classId, hide: false }
        }
      });

      if (res.result && res.result.success) {
        wx.showToast({ title: '已恢复', icon: 'success' });
        this.setData({ showAdminModal: false });
        this.refreshPosts();
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('恢复帖子失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 删除帖子
  onDeletePost: async function () {
    const { adminPostId, classId } = this.data;

    const confirmRes = await new Promise(resolve => {
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复，确定要删除这条帖子吗？',
        confirmColor: '#ff4d4f',
        success: resolve
      });
    });

    if (!confirmRes.confirm) return;

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'deletePost',
          data: { post_id: adminPostId, class_id: classId }
        }
      });

      if (res.result && res.result.success) {
        wx.showToast({ title: '已删除', icon: 'success' });
        this.setData({ showAdminModal: false });
        this.refreshPosts();
      } else {
        wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('删除帖子失败:', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // 分享
  onShareAppMessage: function () {
    return {
      title: '心灵树洞 - 说出你的心事',
      path: '/subPages/treehole/treehole'
    };
  }
});
