// pages/volunteer/volunteer.js
const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    // 统计数据
    statistics: {
      totalHours: 0,
      totalScore: 0,
      recordCount: 0
    },
    records: [],
    searchKeyword: '',
    
    // 服务类型筛选
    serviceTypes: [
      { value: '', label: '全部类型' },
      { value: '社区服务', label: '社区服务' },
      { value: '环保活动', label: '环保活动' },
      { value: '助老助残', label: '助老助残' },
      { value: '支教助学', label: '支教助学' },
      { value: '其他', label: '其他' }
    ],
    selectedType: '',
    selectedTypeLabel: '全部类型',
    
    // 时间筛选
    timeOptions: [
      { value: 'all', label: '全部' },
      { value: 'month', label: '本月' },
      { value: 'semester', label: '本学期' },
      { value: 'year', label: '本年' },
      { value: 'custom', label: '自定义' }
    ],
    selectedTime: 'all',
    selectedTimeLabel: '全部',
    showDatePicker: false,
    customDateRange: {
      start: '',
      end: ''
    },
    
    // 积分规则
    scoreRule: {
      scorePerHour: 2 // 默认每小时2积分
    },
    showRuleModal: false,
    ruleForm: {
      scorePerHour: 2
    },
    
    // 处理点击事件
    handleTap: function() {
    console.log('元素被点击了');
    },

    // 权限
    canEdit: false, // 是否可以编辑（管理员、班主任）
    
    // 分页
    loading: true,
    hasMore: true,
    page: 0,
    pageSize: 20,
    
    // 班级信息
    currentClassId: '',
    currentSemesterId: ''
  },

  onLoad: function () {
    this.initPage();
  },

  onShow: function () {
    // 确保每次显示时都检查 classId 是否有效
    const classId = app.globalData.class_id;
    if (classId && classId !== this.data.currentClassId) {
      // classId 发生变化，重新初始化
      this.setData({ currentClassId: classId });
    }
    this.onRefresh();
  },

  // 初始化页面
  initPage: function () {
    const classId = app.globalData.class_id;
    const role = app.globalData.role;
    const semesterId = app.globalData.currentSemesterId || '';
    
    console.log('志愿服务页面初始化 - classId:', classId, 'role:', role);
    
    // 判断权限
    const canEdit = app.hasPermission('volunteer', 'write');
    
    if (!classId) {
      console.error('志愿服务页面初始化失败: classId 为空');
      wx.showToast({
        title: '请先选择班级',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }
    
    this.setData({
      currentClassId: classId,
      currentSemesterId: semesterId,
      canEdit: canEdit
    });
    
    // 加载积分规则
    this.loadScoreRule();
    this.loadStatistics();
    this.loadRecords();
  },

  // 加载积分规则
  loadScoreRule: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('class_settings')
        .where({
          class_id: this.data.currentClassId
        })
        .field({
          volunteer_score_per_hour: true
        })
        .get();
      
      if (res.data && res.data.length > 0 && res.data[0].volunteer_score_per_hour) {
        this.setData({
          scoreRule: {
            scorePerHour: res.data[0].volunteer_score_per_hour
          },
          'ruleForm.scorePerHour': res.data[0].volunteer_score_per_hour
        });
      }
    } catch (err) {
      console.error('加载积分规则失败:', err);
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.onRefresh();
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  // 刷新数据
  onRefresh: function () {
    this.setData({
      page: 0,
      hasMore: true,
      records: []
    });
    this.loadStatistics();
    this.loadRecords();
  },

  // 获取时间范围查询条件
  getDateRangeQuery: function () {
    const { selectedTime, customDateRange, currentSemesterId } = this.data;
    const now = new Date();
    const db = wx.cloud.database();
    const _ = db.command;
    
    let dateQuery = {};
    
    switch (selectedTime) {
      case 'month':
        // 本月
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateQuery = {
          date: _.gte(monthStart).and(_.lte(now))
        };
        break;
        
      case 'semester':
        // 本学期（需要学期数据）
        if (currentSemesterId) {
          dateQuery = { semester_id: currentSemesterId };
        }
        break;
        
      case 'year':
        // 本年
        const yearStart = new Date(now.getFullYear(), 0, 1);
        dateQuery = {
          date: _.gte(yearStart).and(_.lte(now))
        };
        break;
        
      case 'custom':
        // 自定义时间段
        if (customDateRange.start && customDateRange.end) {
          const startDate = new Date(customDateRange.start);
          const endDate = new Date(customDateRange.end);
          endDate.setHours(23, 59, 59, 999);
          dateQuery = {
            date: _.gte(startDate).and(_.lte(endDate))
          };
        }
        break;
        
      default:
        // 全部，不添加时间限制
        break;
    }
    
    return dateQuery;
  },

  // 加载统计数据
  loadStatistics: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const role = app.globalData.role;
      const classId = this.data.currentClassId;
      const studentId = app.globalData.student_id;
      
      // 构建查询条件
      let query = { class_id: classId };
      
      // 数据隔离：学生和家长只看自己的
      if (role === 'student' || role === 'parent') {
        if (!studentId) {
          this.setData({ statistics: { totalHours: 0, totalScore: 0, recordCount: 0 } });
          return;
        }
        query.student_id = studentId;
      }
      
      // 添加时间筛选
      const dateQuery = this.getDateRangeQuery();
      query = { ...query, ...dateQuery };
      
      // 聚合查询
      const res = await db.collection('volunteer_records')
        .where(query)
        .get();
      
      const records = res.data || [];
      const totalHours = records.reduce((sum, r) => sum + (r.duration || 0), 0);
      const totalScore = records.reduce((sum, r) => sum + (r.earned_score || 0), 0);
      
      this.setData({
        statistics: {
          totalHours: totalHours,
          totalScore: totalScore,
          recordCount: records.length
        }
      });
      
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 加载记录列表
  loadRecords: async function () {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const role = app.globalData.role;
      const classId = this.data.currentClassId;
      const studentId = app.globalData.student_id;
      
      console.log('志愿服务记录查询 - classId:', classId, 'role:', role);
      
      // 检查 classId 是否有效
      if (!classId) {
        console.error('classId 为空，无法查询');
        this.setData({ loading: false, records: [] });
        return;
      }
      
      // 构建查询条件
      let query = { class_id: classId };
      
      // 数据隔离：学生和家长只看自己的
      if (role === 'student' || role === 'parent') {
        if (!studentId) {
          this.setData({ loading: false, records: [] });
          return;
        }
        query.student_id = studentId;
      }
      
      // 服务类型筛选
      if (this.data.selectedType) {
        query.service_type = this.data.selectedType;
      }
      
      // 时间筛选
      const dateQuery = this.getDateRangeQuery();
      query = { ...query, ...dateQuery };
      
      console.log('志愿服务记录查询条件:', JSON.stringify(query));
      
      // 分页查询
      const res = await db.collection('volunteer_records')
        .where(query)
        .orderBy('date', 'desc')
        .skip(this.data.page * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();
      
      console.log('志愿服务记录查询结果:', res.data.length, '条');

      const records = res.data.map(item => ({
        ...item,
        dateStr: util.formatDate(new Date(item.date)),
        typeColor: this.getTypeColor(item.service_type)
      }));

      this.setData({
        records: this.data.page === 0 ? records : [...this.data.records, ...records],
        hasMore: records.length === this.data.pageSize,
        loading: false
      });

      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载记录失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
      util.showError('加载失败');
    }
  },

  // 加载更多
  loadMore: function () {
    this.setData({ page: this.data.page + 1 });
    this.loadRecords();
  },

  // 获取类型颜色
  getTypeColor: function (type) {
    const colorMap = {
      '社区服务': '#1890ff',
      '环保活动': '#52c41a',
      '助老助残': '#fa8c16',
      '支教助学': '#722ed1',
      '其他': '#999999'
    };
    return colorMap[type] || '#999999';
  },

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.onRefresh();
    }, 500);
  },

  // 类型筛选
  onTypeChange: function (e) {
    const index = e.detail.value;
    const selectedType = this.data.serviceTypes[index];
    this.setData({
      selectedType: selectedType.value,
      selectedTypeLabel: selectedType.label
    });
    this.onRefresh();
  },

  // 时间筛选
  onTimeChange: function (e) {
    const index = e.detail.value;
    const selectedTime = this.data.timeOptions[index];
    
    if (selectedTime.value === 'custom') {
      this.setData({ showDatePicker: true });
    } else {
      this.setData({
        selectedTime: selectedTime.value,
        selectedTimeLabel: selectedTime.label
      });
      this.onRefresh();
    }
  },

  // 日期选择器 - 开始日期
  onStartDateChange: function (e) {
    this.setData({ 'customDateRange.start': e.detail.value });
  },

  // 日期选择器 - 结束日期
  onEndDateChange: function (e) {
    this.setData({ 'customDateRange.end': e.detail.value });
  },

  // 确认自定义日期
  onConfirmDateRange: function () {
    const { start, end } = this.data.customDateRange;
    if (!start || !end) {
      util.showError('请选择完整的日期范围');
      return;
    }
    if (new Date(start) > new Date(end)) {
      util.showError('开始日期不能大于结束日期');
      return;
    }
    
    this.setData({
      showDatePicker: false,
      selectedTime: 'custom',
      selectedTimeLabel: `${start} 至 ${end}`
    });
    this.onRefresh();
  },

  // 关闭日期选择器
  onCloseDatePicker: function () {
    this.setData({ showDatePicker: false });
  },

  // 显示积分规则配置
  showScoreRuleModal: function () {
    this.setData({ showRuleModal: true });
  },

  // 关闭积分规则配置
  hideScoreRuleModal: function () {
    this.setData({ showRuleModal: false });
  },

  // 积分规则输入
  onRuleInput: function (e) {
    this.setData({ 'ruleForm.scorePerHour': parseInt(e.detail.value) || 0 });
  },

  // 保存积分规则
  saveScoreRule: async function () {
    const scorePerHour = this.data.ruleForm.scorePerHour;
    
    if (scorePerHour <= 0) {
      util.showError('积分值必须大于0');
      return;
    }
    
    try {
      const db = wx.cloud.database();
      
      // 检查是否已有设置
      const checkRes = await db.collection('class_settings')
        .where({ class_id: this.data.currentClassId })
        .get();
      
      if (checkRes.data && checkRes.data.length > 0) {
        // 更新
        const res = await wx.cloud.callFunction({
          name: 'manageSemester',
          data: {
            action: 'updateClassSettings',
            data: {
              _id: checkRes.data[0]._id,
              volunteer_score_per_hour: scorePerHour
            }
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '保存失败');
        }
      } else {
        // 新增
        const res = await wx.cloud.callFunction({
          name: 'manageSemester',
          data: {
            action: 'addClassSettings',
            data: {
              class_id: this.data.currentClassId,
              volunteer_score_per_hour: scorePerHour
            }
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '保存失败');
        }
      }
      
      this.setData({
        scoreRule: { scorePerHour: scorePerHour },
        showRuleModal: false
      });
      
      util.showSuccess('保存成功');
      
    } catch (err) {
      console.error('保存积分规则失败:', err);
      util.showError('保存失败');
    }
  },

  // 查看详情
  onRecordDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPkg1/volunteer/detail/detail?id=${id}`
    });
  },

  // 添加记录
  onAddRecord: function () {
    wx.navigateTo({
      url: '/subPkg1/volunteer/add/add'
    });
  },

  // 查看我的提交记录（学生/家长）
  onViewMyRecords: function () {
    wx.navigateTo({
      url: '/subPkg1/volunteer/records/records'
    });
  },

  // 删除志愿服务记录
  onDeleteRecord: function (e) {
    const record = e.currentTarget.dataset.record;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${record.activity_name}"的志愿服务记录吗？删除后积分将回退。`,
      success: (res) => {
        if (res.confirm) {
          this.doDeleteRecord(record);
        }
      }
    });
  },

  // 执行删除操作
  doDeleteRecord: async function (record) {
    wx.showLoading({ title: '删除中...' });
    
    try {
      // 使用云函数删除记录并回退积分
      const res = await wx.cloud.callFunction({
        name: 'deleteRecordWithScore',
        data: {
          recordType: 'volunteer',
          recordId: record._id
        }
      });
      
      wx.hideLoading();
      
      if (res.result && res.result.success) {
        util.showSuccess('删除成功');
        // 刷新列表
        this.onRefresh();
      } else {
        util.showError(res.result?.message || '删除失败');
      }
      
    } catch (err) {
      console.error('删除失败:', err);
      wx.hideLoading();
      util.showError('删除失败');
    }
  },

  preventBubble() {},
});
