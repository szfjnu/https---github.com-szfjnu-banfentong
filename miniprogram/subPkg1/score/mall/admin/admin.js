// pages/score/mall/admin/admin.js
const app = getApp();
const api = require('../../../../utils/api.js');
const util = require('../../../../utils/util.js');

Page({
  data: {
    loading: true,
    mainTab: 'requests', // requests, items
    activeTab: 'pending', // pending, approved, rejected
    
    // 兑换审批相关
    pendingRequests: [],
    approvedRequests: [],
    rejectedRequests: [],
    selectedRequest: null,
    showDetailModal: false,
    searchKeyword: '',
    
    // 商品管理相关
    items: [],
    showItemModal: false,
    editingItem: null,
    itemForm: {
      name: '',
      required_score: '',
      quantity: '',
      redemption_mode: '直接兑换',
      modeIndex: 0,
      description: '',
      image_url: '',
      bid_end_time: '',
      status: '可兑换'
    },
    modeOptions: ['直接兑换', '投标模式']
  },

  onLoad: function () {
    this.checkPermission();
    this.loadData();
  },

  onShow: function () {
    this.loadData();
  },

  onPullDownRefresh: function () {
    this.loadData();
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'subject_teacher') {
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      await Promise.all([
        this.loadRequests(),
        this.loadItems()
      ]);

      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  // 加载兑换请求
  loadRequests: async function () {
    try {
      const db = wx.cloud.database();
      const classId = app.globalData.class_id;
      
      // 严格执行班级维度权限隔离，所有角色都必须按班级过滤
      if (!classId) {
        this.setData({ pendingRequests: [], approvedRequests: [], rejectedRequests: [] });
        return;
      }
      let query = { class_id: classId };
      
      const res = await db.collection('redemption_requests')
        .where(query)
        .orderBy('created_at', 'desc')
        .get();
      
      const requests = res.data.map(item => ({
        ...item,
        created_at_text: item.created_at ? util.formatDateTime(new Date(item.created_at)) : ''
      }));

      const pendingRequests = requests.filter(r => r.status === '待审批' || r.status === 'pending');
      const approvedRequests = requests.filter(r => r.status === '已通过' || r.status === 'approved');
      const rejectedRequests = requests.filter(r => r.status === '已拒绝' || r.status === 'rejected');

      this.setData({
        pendingRequests,
        approvedRequests,
        rejectedRequests
      });
    } catch (err) {
      console.error('加载兑换请求失败:', err);
    }
  },

  // 加载商品列表
  loadItems: async function () {
    try {
      const db = wx.cloud.database();
      const classId = app.globalData.class_id;
      
      // 严格执行班级维度权限隔离
      if (!classId) {
        this.setData({ items: [] });
        return;
      }
      let query = { class_id: classId };
      
      const res = await db.collection('redemption_items')
        .where(query)
        .orderBy('created_at', 'desc')
        .get();
      
      this.setData({ items: res.data || [] });
    } catch (err) {
      console.error('加载商品失败:', err);
      this.setData({ items: [] });
    }
  },

  // ====== 主标签切换 ======
  onMainTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ mainTab: tab });
  },

  // ====== 兑换审批功能 ======
  
  // 切换标签
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  // 查看详情
  onViewDetail: function (e) {
    const request = e.currentTarget.dataset.request;
    this.setData({
      selectedRequest: request,
      showDetailModal: true
    });
  },

  // 阻止冒泡（空函数）
  preventBubble: function () {},

  // 关闭详情弹窗
  onCloseDetailModal: function () {
    this.setData({ showDetailModal: false, selectedRequest: null });
  },

  // 批准兑换
  onApprove: async function (e) {
    const request = e.currentTarget.dataset.request || this.data.selectedRequest;
    
    try {
      wx.showLoading({ title: '处理中...', mask: true });
      
      const res = await wx.cloud.callFunction({
        name: 'processRedemption',
        data: {
          action: 'approveRedemption',
          data: {
            requestId: request._id,
            studentId: request.student_id,
            classId: request.class_id,
            itemId: request.item_id,
            score: request.bid_score || request.required_score || 0,
            approver: app.globalData.userInfo?.nickName || '管理员'
          }
        }
      });
      
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '批准失败');
      }
      
      wx.hideLoading();
      util.showSuccess('批准成功');
      this.onCloseDetailModal();
      this.loadRequests();
      
    } catch (err) {
      console.error('批准失败:', err);
      wx.hideLoading();
      util.showError(err.message || '操作失败');
    }
  },

  // 拒绝兑换
  onReject: async function (e) {
    const request = e.currentTarget.dataset.request || this.data.selectedRequest;
    
    wx.showModal({
      title: '确认拒绝',
      content: '确定要拒绝该兑换申请吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...', mask: true });
            
            const cfRes = await wx.cloud.callFunction({
              name: 'processRedemption',
              data: {
                action: 'rejectRedemption',
                data: {
                  requestId: request._id,
                  approver: app.globalData.userInfo?.nickName || '管理员'
                }
              }
            });
            
            if (!cfRes.result || !cfRes.result.success) {
              throw new Error(cfRes.result?.message || '拒绝失败');
            }
            
            wx.hideLoading();
            util.showSuccess('已拒绝');
            this.onCloseDetailModal();
            this.loadRequests();
            
          } catch (err) {
            console.error('拒绝失败:', err);
            wx.hideLoading();
            util.showError(err.message || '操作失败');
          }
        }
      }
    });
  },

  // 批量批准
  onBatchApprove: async function () {
    const pendingRequests = this.data.pendingRequests;
    
    wx.showModal({
      title: '批量批准',
      content: `确定要批准所有 ${pendingRequests.length} 个待审批请求吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true });
          
          for (const request of pendingRequests) {
            try {
              await this.processApprove(request);
            } catch (err) {
              console.error('批准失败:', request._id, err);
            }
          }
          
          wx.hideLoading();
          util.showSuccess('批量批准完成');
          this.loadRequests();
        }
      }
    });
  },

  // 处理批准逻辑
  processApprove: async function (request) {
    const res = await wx.cloud.callFunction({
      name: 'processRedemption',
      data: {
        action: 'approveRedemption',
        data: {
          requestId: request._id,
          studentId: request.student_id,
          classId: request.class_id,
          itemId: request.item_id,
          score: request.bid_score || request.required_score || 0,
          approver: app.globalData.userInfo?.nickName || '管理员'
        }
      }
    });
    
    if (!res.result || !res.result.success) {
      throw new Error(res.result?.message || '批准失败');
    }
  },

  // ====== 商品管理功能 ======
  
  // 显示添加商品弹窗
  onShowAddItemModal: function () {
    this.setData({
      showItemModal: true,
      editingItem: null,
      itemForm: {
        name: '',
        required_score: '',
        quantity: '',
        redemption_mode: '直接兑换',
        modeIndex: 0,
        description: '',
        image_url: '',
        bid_end_time: '',
        status: '可兑换'
      }
    });
  },

  // 编辑商品
  onEditItem: function (e) {
    const item = e.currentTarget.dataset.item;
    
    this.setData({
      showItemModal: true,
      editingItem: item,
      itemForm: {
        name: item.name || '',
        required_score: item.required_score || '',
        quantity: item.quantity || '',
        redemption_mode: item.redemption_mode || '直接兑换',
        modeIndex: item.redemption_mode === '投标模式' ? 1 : 0,
        description: item.description || '',
        image_url: item.image_url || '',
        bid_end_time: item.bid_end_time ? util.formatDate(new Date(item.bid_end_time)) : '',
        status: item.status || '可兑换'
      }
    });
  },

  // 关闭商品弹窗
  onCloseItemModal: function () {
    this.setData({ showItemModal: false, editingItem: null });
  },

  // 商品表单输入
  onItemFormInput: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`itemForm.${field}`]: e.detail.value
    });
  },

  // 兑换模式选择
  onModeChange: function (e) {
    const index = parseInt(e.detail.value);
    this.setData({
      'itemForm.modeIndex': index,
      'itemForm.redemption_mode': this.data.modeOptions[index]
    });
  },

  // 投标截止时间选择
  onBidEndTimeChange: function (e) {
    this.setData({
      'itemForm.bid_end_time': e.detail.value
    });
  },

  // 状态切换
  onStatusChange: function (e) {
    this.setData({
      'itemForm.status': e.detail.value ? '可兑换' : '已下架'
    });
  },

  // 选择商品图片
  onChooseItemImage: async function () {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera']
      });
      
      const tempFilePath = res.tempFiles[0].tempFilePath;
      wx.showLoading({ title: '上传中...', mask: true });
      
      const cloudPath = `items/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath
      });
      
      this.setData({
        'itemForm.image_url': uploadRes.fileID
      });
      
      wx.hideLoading();
    } catch (err) {
      console.error('上传图片失败:', err);
      wx.hideLoading();
      util.showError('上传失败');
    }
  },

  // 保存商品
  onSaveItem: async function () {
    const { itemForm, editingItem } = this.data;
    
    // 验证
    if (!itemForm.name.trim()) {
      util.showError('请输入商品名称');
      return;
    }
    if (!itemForm.required_score || parseInt(itemForm.required_score) <= 0) {
      util.showError('请输入有效的积分');
      return;
    }
    if (!itemForm.quantity || parseInt(itemForm.quantity) < 0) {
      util.showError('请输入有效的库存数量');
      return;
    }
    
    try {
      wx.showLoading({ title: '保存中...', mask: true });
      const classId = app.globalData.class_id;
      
      const data = {
        name: itemForm.name.trim(),
        required_score: parseInt(itemForm.required_score),
        quantity: parseInt(itemForm.quantity),
        redemption_mode: itemForm.redemption_mode,
        description: itemForm.description.trim(),
        image_url: itemForm.image_url,
        status: itemForm.status,
        class_id: classId
      };
      
      if (itemForm.redemption_mode === '投标模式' && itemForm.bid_end_time) {
        data.bid_end_time = itemForm.bid_end_time;
        data.bid_start_time = new Date().toISOString();
      }
      
      if (editingItem) {
        const res = await wx.cloud.callFunction({
          name: 'processRedemption',
          data: {
            action: 'updateItem',
            data: { itemId: editingItem._id, updateData: data }
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '更新失败');
        }
        util.showSuccess('更新成功');
      } else {
        data.item_id = `ITEM-${Date.now()}`;
        const res = await wx.cloud.callFunction({
          name: 'processRedemption',
          data: {
            action: 'addItem',
            data: { itemData: data }
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '添加失败');
        }
        util.showSuccess('添加成功');
      }
      
      wx.hideLoading();
      this.onCloseItemModal();
      this.loadItems();
      
    } catch (err) {
      console.error('保存商品失败:', err);
      wx.hideLoading();
      util.showError('保存失败');
    }
  },

  // 删除商品
  onDeleteItem: function (e) {
    const item = e.currentTarget.dataset.item;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除商品"${item.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...', mask: true });
            
            const res = await wx.cloud.callFunction({
              name: 'processRedemption',
              data: {
                action: 'deleteItem',
                data: { itemId: item._id }
              }
            });
            
            if (!res.result || !res.result.success) {
              throw new Error(res.result?.message || '删除失败');
            }
            
            wx.hideLoading();
            util.showSuccess('删除成功');
            this.loadItems();
            
          } catch (err) {
            console.error('删除商品失败:', err);
            wx.hideLoading();
            util.showError('删除失败');
          }
        }
      }
    });
  },

  // 跳转到兑换台账
  onGoLedger: function () {
    wx.navigateTo({
      url: '/subPkg1/score/mall/ledger/ledger'
    });
  }
});
