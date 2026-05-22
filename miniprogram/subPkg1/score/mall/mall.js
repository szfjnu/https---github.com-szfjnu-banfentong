// pages/score/mall/mall.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');

Page({
  data: {
    items: [],
    myScore: 0,
    loading: true,
    studentId: null,
    activeTab: 'items', // 'items' 商品列表 / 'wishes' 心愿单
    
    // 投标详情弹窗
    showBidModal: false,
    currentItem: null,
    bidList: [],
    bidLoading: false,
    
    // 投标输入弹窗（BUG2修复：新增字段）
    showBidInputDialog: false,
    bidInputItem: null,
    bidInputValue: '',
    bidInputError: '',
    
    // 商品建议弹窗
    showWishModal: false,
    wishForm: {
      name: '',
      description: '',
      expected_score: ''
    },
    
    // 心愿单列表
    wishList: [],
    wishLoading: false,
    
    // 热门商品ID列表
    hotItemIds: []
  },

  onLoad: function () {
    this.checkLogin();
  },

  onShow: function () {
    this.loadData();
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadData();
  },

  // 检查登录状态
  checkLogin: function () {
    if (!app.globalData.userInfo || !app.globalData.openid) {
      wx.redirectTo({
        url: '/subPkg5/login/login'
      });
      return;
    }

    const role = app.globalData.role;
    const isAdminOrTeacher = app.hasPermission('mall', 'manage');
    const isStudentOrParent = ['student', 'parent'].includes(role);

    if (!isStudentOrParent && !isAdminOrTeacher) {
      wx.showToast({
        title: '无权访问积分商城',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
      return;
    }

    this.setData({
      studentId: app.globalData.student_id || '',
      isAdminOrTeacher: isAdminOrTeacher
    });
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      // 获取我的积分和学生信息
      await this.loadMyScore();

      // 获取可兑换物品
      await this.loadItems();

      // 获取热门商品
      await this.loadHotItems();

      // 获取心愿单
      await this.loadWishList();

      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
      util.showError('加载失败');
    }
  },

  // 获取我的积分和学生信息
  loadMyScore: async function () {
    try {
      const studentId = this.data.studentId;
      if (!studentId) return;

      const studentRes = await api.studentApi.getStudentByStudentId(studentId);
      if (studentRes.data && studentRes.data.length > 0) {
        const student = studentRes.data[0];
        const totalScore = student.current_score || 100;
        const initialScore = student.initial_score || 100;

        let redeemedTotal = 0;
        try {
          const db = wx.cloud.database();
          const _ = db.command;
          const redeemRes = await db.collection('redemption_requests')
            .where({
              student_id: studentId,
              status: _.in(['待审批', '待班主任审批', '已通过', '已批准', '已中标', '已发货', '已收货'])
            })
            .get();
          redeemedTotal = (redeemRes.data || []).reduce((sum, r) => sum + (r.bid_score || r.required_score || 0), 0);
        } catch (e) {
          console.error('查询已兑换积分失败:', e);
        }

        const redeemableScore = Math.max(0, totalScore - initialScore - redeemedTotal);

        this.setData({
          myScore: totalScore,
          initialScore: initialScore,
          redeemedTotal: redeemedTotal,
          redeemableScore: redeemableScore,
          studentInfo: student
        });
      }
    } catch (err) {
      console.error('获取积分失败:', err);
    }
  },

  // 获取可兑换物品
  loadItems: async function () {
    try {
      const db = wx.cloud.database();
      const classId = app.globalData.class_id;
      
      const res = await db.collection('redemption_items')
        .where({
          class_id: classId,
          status: '可兑换'
        })
        .orderBy('created_at', 'desc')
        .get();

      // 处理物品数据
      const items = res.data.map(item => {
        return {
          ...item,
          canRedeem: item.required_score <= this.data.redeemableScore && item.quantity > 0,
          statusText: this.getStatusText(item.status, item.quantity)
        };
      });

      this.setData({ items });
    } catch (err) {
      console.error('获取物品失败:', err);
    }
  },

  // 获取热门商品
  loadHotItems: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const classId = app.globalData.class_id;
      
      // 统计每个商品的投标/兑换次数
      const requestsRes = await db.collection('redemption_requests')
        .where({
          class_id: classId
        })
        .get();

      // 统计每个商品的参与人数
      const itemCounts = {};
      (requestsRes.data || []).forEach(req => {
        if (req.item_id) {
          itemCounts[req.item_id] = (itemCounts[req.item_id] || 0) + 1;
        }
      });

      // 找出参与人数 >= 3 的商品作为热门商品
      const hotItemIds = Object.keys(itemCounts).filter(id => itemCounts[id] >= 3);
      
      this.setData({ hotItemIds });
    } catch (err) {
      console.error('获取热门商品失败:', err);
    }
  },

  // 获取状态文本
  getStatusText: function (status, quantity) {
    if (status !== '可兑换') {
      return status;
    }
    if (quantity <= 0) {
      return '已售罄';
    }
    return '可兑换';
  },

  // 切换标签
  onSwitchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 查看投标情况
  onViewBidList: async function (e) {
    const item = e.currentTarget.dataset.item;
    
    this.setData({
      showBidModal: true,
      currentItem: item,
      bidLoading: true,
      bidList: []
    });

    try {
      const db = wx.cloud.database();
      const classId = app.globalData.class_id;
      const res = await db.collection('redemption_requests')
        .where({
          item_id: item.item_id,
          class_id: classId,
          status: db.command.in(['待审批', '已批准', '已中标', '未中标'])
        })
        .orderBy('bid_score', 'desc')
        .limit(100)
        .get();

      // 处理投标列表
      const bidList = (res.data || []).map(bid => ({
        ...bid,
        isMine: bid.student_id === this.data.studentId,
        bidScore: bid.bid_score || bid.required_score,
        studentName: bid.student_name || '匿名',
        bidTime: bid.bid_time ? util.formatTime(new Date(bid.bid_time)) : '',
        // 状态样式类名映射
        statusClass: this.getStatusClass(bid.status)
      }));

      this.setData({
        bidList,
        bidLoading: false
      });
    } catch (err) {
      console.error('获取投标列表失败:', err);
      this.setData({ bidLoading: false });
    }
  },

  // 关闭投标弹窗
  onCloseBidModal: function () {
    this.setData({
      showBidModal: false,
      currentItem: null,
      bidList: []
    });
  },

  // 阻止冒泡
  stopPropagation: function () {},

  // 获取状态样式类名
  getStatusClass: function (status) {
    const statusMap = {
      '待审批': 'pending',
      '已批准': 'approved',
      '已中标': 'winning',
      '未中标': 'lost'
    };
    return statusMap[status] || 'pending';
  },

  // 兑换物品
  onRedeem: function (e) {
    const item = e.currentTarget.dataset.item;

    if (!item.canRedeem) {
      if (item.required_score > this.data.redeemableScore) {
        wx.showToast({
          title: '可兑换积分不足',
          icon: 'none',
          duration: 2000
        });
      } else if (item.quantity <= 0) {
        wx.showToast({
          title: '已售罄',
          icon: 'none',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: '暂不可兑换',
          icon: 'none',
          duration: 2000
        });
      }
      return;
    }

    // 投标模式显示投标输入框
    if (item.redemption_mode === '投标模式') {
      this.showBidInputDialog(item);
    } else {
      // 直接兑换
      wx.showModal({
        title: '确认兑换',
        content: `确定要兑换"${item.name}"吗？需要${item.required_score}积分`,
        success: (res) => {
          if (res.confirm) {
            this.submitRedemption(item, item.required_score);
          }
        }
      });
    }
  },

  // BUG2修复：显示投标输入弹窗（替换wx.showModal为自定义弹窗）
  showBidInputDialog: function (item) {
    this.setData({
      showBidInputDialog: true,
      bidInputItem: item,
      bidInputValue: '',
      bidInputError: ''
    });
  },

  // BUG2修复：关闭投标输入弹窗
  onCloseBidInputModal: function () {
    this.setData({
      showBidInputDialog: false,
      bidInputItem: null,
      bidInputValue: '',
      bidInputError: ''
    });
  },

  // BUG2修复：投标积分输入处理
  onBidScoreInput: function (e) {
    this.setData({
      bidInputValue: e.detail.value,
      bidInputError: ''
    });
  },

  // BUG2修复：确认投标提交（含五步校验）
  onConfirmBidInput: async function () {
    const { bidInputItem, bidInputValue, myScore, studentId } = this.data;

    if (!bidInputItem) return;

    const inputStr = (bidInputValue || '').trim();

    if (!inputStr) {
      this.setData({ bidInputError: '请输入投标积分' });
      return;
    }

    const bidScore = Number(inputStr);
    if (isNaN(bidScore) || !Number.isInteger(bidScore)) {
      this.setData({ bidInputError: '请输入有效的整数积分值' });
      return;
    }

    const minScore = bidInputItem.required_score;
    if (bidScore < minScore) {
      this.setData({ bidInputError: `投标积分不能低于${minScore}` });
      return;
    }

    if (bidScore > myScore && bidScore > this.data.redeemableScore) {
      this.setData({ bidInputError: `投标积分不能超过您的可兑换积分（${this.data.redeemableScore}）` });
      return;
    }

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const existRes = await db.collection('redemption_requests')
        .where({
          item_id: bidInputItem.item_id,
          student_id: studentId,
          status: _.in(['待审批', '已中标'])
        })
        .limit(1)
        .count();

      if (existRes.total > 0) {
        this.setData({ bidInputError: '您已对该商品投过标，不可重复投标' });
        return;
      }
    } catch (err) {
      console.error('查询重复投标失败:', err);
    }

    this.setData({ showBidInputDialog: false });
    this.submitRedemption(bidInputItem, bidScore);
  },

  // 提交兑换申请
  submitRedemption: async function (item, bidScore) {
    try {
      const studentId = this.data.studentId;
      if (!studentId) {
        util.showError('未登录');
        return;
      }

      // 检查可兑换积分是否充足
      if (this.data.redeemableScore < bidScore) {
        wx.showToast({
          title: '可兑换积分不足',
          icon: 'none',
          duration: 2000
        });
        return;
      }

      wx.showLoading({ title: '提交中...', mask: true });

      // BUG2修复：投标模式走云函数双侧校验，直接兑换模式保持原逻辑
      const studentInfo = this.data.studentInfo || {};

      if (item.redemption_mode === '投标模式') {
        const bidRes = await wx.cloud.callFunction({
          name: 'handleBidAuction',
          data: {
            action: 'submitBid',
            data: {
              item_id: item.item_id,
              student_id: studentId,
              bid_score: bidScore,
              class_id: studentInfo.class_id || app.globalData.class_id || ''
            }
          }
        });

        wx.hideLoading();

        if (bidRes.result && bidRes.result.success) {
          wx.showToast({
            title: '投标成功',
            icon: 'success',
            duration: 2000
          });
          setTimeout(() => { this.loadData(); }, 2000);
        } else {
          wx.showToast({
            title: bidRes.result?.message || '投标失败',
            icon: 'none',
            duration: 2000
          });
        }
        return;
      }

      // 直接兑换模式
      const cfRes = await wx.cloud.callFunction({
        name: 'processRedemption',
        data: {
          action: 'submitRedemption',
          data: {
            item_id: item.item_id,
            item_name: item.name,
            student_id: studentId,
            student_name: studentInfo.name || '',
            class_name: studentInfo.class_name || '',
            class_id: studentInfo.class_id || app.globalData.class_id || '',
            required_score: item.required_score,
            redemption_mode: item.redemption_mode,
            bid_score: bidScore
          }
        }
      });

      wx.hideLoading();

      if (!cfRes.result || !cfRes.result.success) {
        wx.showToast({
          title: cfRes.result?.message || '提交失败',
          icon: 'none',
          duration: 2000
        });
        return;
      }
      wx.showToast({
        title: item.redemption_mode === '投标模式' ? '投标成功' : '兑换申请已提交',
        icon: 'success',
        duration: 2000
      });

      // 刷新数据
      setTimeout(() => {
        this.loadData();
      }, 2000);

    } catch (err) {
      wx.hideLoading();
      console.error('提交兑换失败:', err);
      util.showError('提交失败');
    }
  },

  // 显示心愿弹窗
  onShowWishModal: function () {
    this.setData({
      showWishModal: true,
      wishForm: {
        name: '',
        description: '',
        expected_score: ''
      }
    });
  },

  // 关闭心愿弹窗
  onCloseWishModal: function () {
    this.setData({ showWishModal: false });
  },

  // 输入心愿商品名称
  onWishNameInput: function (e) {
    this.setData({ 'wishForm.name': e.detail.value });
  },

  // 输入心愿商品描述
  onWishDescInput: function (e) {
    this.setData({ 'wishForm.description': e.detail.value });
  },

  // 输入期望积分
  onWishScoreInput: function (e) {
    this.setData({ 'wishForm.expected_score': e.detail.value });
  },

  // 提交心愿商品
  onSubmitWish: async function () {
    const { name, description, expected_score } = this.data.wishForm;
    
    if (!name.trim()) {
      wx.showToast({ title: '请输入商品名称', icon: 'none' });
      return;
    }

    if (!expected_score || parseInt(expected_score) <= 0) {
      wx.showToast({ title: '请输入合理的期望积分', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '提交中...', mask: true });

      const studentInfo = this.data.studentInfo || {};
      
      await wx.cloud.callFunction({
        name: 'processRedemption',
        data: {
          action: 'addProductWish',
          data: {
            name: name.trim(),
            description: description.trim(),
            expected_score: parseInt(expected_score),
            student_id: this.data.studentId,
            student_name: studentInfo.name || '',
            class_id: app.globalData.class_id || ''
          }
        }
      });

      wx.hideLoading();
      wx.showToast({
        title: '提交成功',
        icon: 'success'
      });

      this.setData({ showWishModal: false });
      
      // 刷新心愿单
      this.loadWishList();
    } catch (err) {
      wx.hideLoading();
      console.error('提交心愿失败:', err);
      util.showError('提交失败');
    }
  },

  // 加载心愿单
  loadWishList: async function () {
    this.setData({ wishLoading: true });
    
    try {
      const db = wx.cloud.database();
      const classId = app.globalData.class_id;
      
      const res = await db.collection('product_wishes')
        .where({
          class_id: classId,
          status: db.command.in(['pending', 'added'])
        })
        .orderBy('vote_count', 'desc')
        .orderBy('created_at', 'desc')
        .limit(100)
        .get();

      const wishList = (res.data || []).map(wish => ({
        ...wish,
        isVoted: (wish.voters || []).includes(this.data.studentId),
        createdAt: util.formatDate(new Date(wish.created_at))
      }));

      this.setData({
        wishList,
        wishLoading: false
      });
    } catch (err) {
      console.error('加载心愿单失败:', err);
      this.setData({ wishLoading: false });
    }
  },

  // 为心愿投票
  onVoteWish: async function (e) {
    const wish = e.currentTarget.dataset.wish;
    
    if (wish.isVoted) {
      wx.showToast({ title: '您已投过票', icon: 'none' });
      return;
    }

    try {
      await wx.cloud.callFunction({
        name: 'processRedemption',
        data: {
          action: 'voteProductWish',
          data: {
            wishId: wish._id,
            student_id: this.data.studentId
          }
        }
      });

      wx.showToast({ title: '投票成功', icon: 'success' });
      
      // 刷新心愿单
      this.loadWishList();
    } catch (err) {
      console.error('投票失败:', err);
      wx.showToast({ title: '投票失败', icon: 'none' });
    }
  },

  // 查看兑换记录
  onViewRecords: function () {
    wx.navigateTo({
      url: '/subPkg1/score/mall/records/records'
    });
  }
});
