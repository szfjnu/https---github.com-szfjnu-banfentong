// pages/treehole/detail/detail.js
// 树洞帖子详情页
const app = getApp();

Page({
  data: {
    loading: true,
    postId: '',
    classId: '',
    post: null,
    replies: [],
    hasHearted: false,

    // 回复相关
    replyContent: '',
    replyAnonymous: true,
    replying: false,
    canSend: false
  },

  onLoad: function (options) {
    const postId = options.id || '';
    this.setData({
      postId: postId,
      classId: app.globalData.class_id || ''
    });
    this.loadDetail();
  },

  // 加载帖子详情
  loadDetail: async function () {
    const { postId, classId } = this.data;

    if (!postId || !classId) {
      wx.showToast({ title: '参数缺失', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'getPostDetail',
          data: {
            post_id: postId,
            class_id: classId
          }
        }
      });

      const result = res.result || {};
      if (!result.success) {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      this.setData({
        post: result.data.post,
        replies: result.data.replies || [],
        hasHearted: result.data.hasHearted || false,
        loading: false
      });
    } catch (err) {
      console.error('加载详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 切换鼓励状态
  onToggleHeart: async function () {
    const { postId, classId, hasHearted, post } = this.data;

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'toggleHeart',
          data: {
            post_id: postId,
            class_id: classId
          }
        }
      });

      const result = res.result || {};
      if (result.success) {
        const newHearted = result.data.hasHearted;
        this.setData({
          hasHearted: newHearted,
          post: { ...post, hearts_count: (post.hearts_count || 0) + (newHearted ? 1 : -1) }
        });
      }
    } catch (err) {
      console.error('鼓励操作失败:', err);
    }
  },

  // 回复内容输入
  onReplyInput: function (e) {
    var val = e.detail.value || '';
    this.setData({
      replyContent: val,
      canSend: val.trim().length > 0
    });
  },

  // 匿名开关
  onReplyAnonChange: function (e) {
    this.setData({ replyAnonymous: e.detail.value });
  },

  // 发送回复
  doReply: async function () {
    const { replyContent, replyAnonymous, postId, classId } = this.data;

    if (!replyContent.trim()) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' });
      return;
    }

    if (replyContent.trim().length > 200) {
      wx.showToast({ title: '回复不能超过200字', icon: 'none' });
      return;
    }

    this.setData({ replying: true, canSend: false });

    try {
      const res = await wx.cloud.callFunction({
        name: 'treeHoleManager',
        data: {
          action: 'replyPost',
          data: {
            post_id: postId,
            class_id: classId,
            content: replyContent.trim(),
            is_anonymous: replyAnonymous
          }
        }
      });

      const result = res.result || {};
      if (result.success) {
        wx.showToast({ title: '回复成功', icon: 'success' });
        this.setData({ replyContent: '', canSend: false });
        this.loadDetail();
      } else {
        wx.showToast({ title: result.message || '回复失败', icon: 'none' });
      }
    } catch (err) {
      console.error('回复失败:', err);
      wx.showToast({ title: '回复失败', icon: 'none' });
    } finally {
      this.setData({ replying: false });
    }
  }
});
