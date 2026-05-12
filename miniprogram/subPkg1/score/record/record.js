// pages/score/record/record.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');
const excelTransfer = require('../../utils/excelTransfer.js');

// 异常预警阈值
const ANOMALY_THRESHOLDS = {
  HIGH_SCORE: 50,        // 单次超50分预警
  HIGH_FREQUENCY: 5,     // 24小时内超过5次操作预警
  SUSPICIOUS_PATTERNS: ['深夜操作', '节假日大量操作']
};

Page({
  data: {
    records: [],
    students: [],
    studentNames: {},
    scoreItems: [],
    itemNameMap: {},
    categories: [],          // 积分类别列表（从数据库加载）
    loading: true,
    hasMore: true,
    page: 0,
    pageSize: 20,
    
    // 多维度筛选
    searchKeyword: '',
    selectedStudent: '',
    selectedStudentLabel: '全部学生',
    selectedType: '',
    selectedTypeLabel: '全部类型',
    selectedCategory: '',
    selectedCategoryLabel: '全部类别',
    selectedDirection: '',
    selectedDirectionLabel: '全部方向',
    selectedStatus: '',
    selectedStatusLabel: '全部状态',
    
    // 时间筛选（默认近30天）
    timeOptions: [
      { value: 'today', label: '今天' },
      { value: 'week', label: '近7天' },
      { value: 'month', label: '近30天', default: true },
      { value: 'semester', label: '本学期' },
      { value: 'year', label: '本年' },
      { value: 'all', label: '全部' },
      { value: 'custom', label: '自定义' }
    ],
    selectedTime: 'month',
    selectedTimeLabel: '近30天',
    showDatePicker: false,
    customDateRange: {
      start: '',
      end: ''
    },
    
    // 筛选选项
    sourceTypes: [
      { value: '', label: '全部类型' },
      { value: '日常记录', label: '日常记录' },
      { value: '志愿服务', label: '志愿服务' },
      { value: '竞赛获奖', label: '竞赛获奖' },
      { value: '证书获得', label: '证书获得' },
      { value: '处分扣分', label: '处分扣分' },
      { value: '宿舍折算', label: '宿舍折算' },
      { value: '考勤', label: '考勤扣分' }
    ],
    directions: [
      { value: '', label: '全部方向' },
      { value: 'positive', label: '积分增加' },
      { value: 'negative', label: '积分扣减' }
    ],
    approvalStatuses: [
      { value: '', label: '全部状态' },
      { value: '待审核', label: '待审核' },
      { value: '已通过', label: '已通过' },
      { value: '已拒绝', label: '已拒绝' }
    ],
    
    // 权限
    userRole: '',
    canExport: false,
    canAppeal: false,
    
    // 班级信息
    currentClassId: '',
    currentSemesterId: '',
    
    // 统计概览
    statistics: {
      totalCount: 0,
      totalAdd: 0,
      totalDeduct: 0,
      anomalyCount: 0
    },
    
    // 异常预警记录ID集合（使用数组，因为Set无法序列化）
    anomalyRecordIds: [],
    
    // 高级筛选展开
    showAdvancedFilter: false
  },

  onLoad: function () {
    const role = app.globalData.role;
    const classId = app.globalData.class_id || '';
    const semesterId = app.globalData.currentSemesterId || '';
    
    // 判断权限
    const canExport = ['admin', 'head_teacher'].includes(role);
    const canAppeal = ['student', 'parent'].includes(role);
    
    this.setData({ 
      userRole: role,
      canExport: canExport,
      canAppeal: canAppeal,
      currentClassId: classId,
      currentSemesterId: semesterId
    });
    
    this.loadStudents();
    this.loadScoreItems();
    this.loadCategories();
    this.loadAnomalyRecords();
    this.loadRecords();
  },

  onShow: function () {
    this.onRefresh();
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
    this.loadAnomalyRecords();
    this.loadRecords();
    this.loadStatistics();
  },

  // 加载学生列表
  loadStudents: async function () {
    try {
      const role = this.data.userRole;
      const classId = this.data.currentClassId;
      const openid = app.globalData.openid;
      
      let students = [];
      
      // 数据隔离：根据角色过滤学生
      if (role === 'student' || role === 'parent') {
        // 学生和家长只能看到自己的记录
        const studentId = app.globalData.student_id;
        if (studentId) {
          const res = await api.studentApi.getStudentByStudentId(studentId);
          if (res.data && res.data.length > 0) {
            students = [res.data[0]];
          }
        }
      } else if (role === 'head_teacher' && classId) {
        // 班主任只能看到本班学生
        const res = await api.studentApi.getStudents({ 
          class_id: classId,
          limit: 1000 
        });
        students = res.data || [];
      } else if (role === 'subject_teacher') {
        // 科任老师只能看到所教班级的学生
        const db = wx.cloud.database();
        const _ = db.command;
        
        // 查询教师管理的班级
        const relationRes = await db.collection('user_class_relation')
          .where({
            user_openid: openid,
            role: 'subject_teacher',
            status: 'joined'
          })
          .get();
        
        const managedClassIds = relationRes.data.map(r => r.class_id);
        
        if (managedClassIds.length > 0) {
          const res = await db.collection('students')
            .where({
              class_id: _.in(managedClassIds)
            })
            .limit(1000)
            .get();
          
          students = res.data || [];
        }
      } else if (role === 'admin') {
        // 管理员可以看到所有学生
        const res = await api.studentApi.getStudents({ limit: 1000 });
        students = res.data || [];
      }

      const studentNames = {};
      students.forEach(student => {
        studentNames[student.student_id] = student.name;
      });

      this.setData({
        students: students,
        studentNames: studentNames
      });
      
      console.log(`加载学生列表成功，共 ${students.length} 名学生`);
    } catch (err) {
      console.error('加载学生列表失败:', err);
      util.showError('加载学生列表失败');
    }
  },

  // 加载积分项目
  loadScoreItems: async function () {
    try {
      const res = await api.scoreApi.getScoreItems();
      const items = res.data;

      const itemNameMap = {};
      items.forEach(item => {
        itemNameMap[item.item_id] = item.name;
      });

      this.setData({
        scoreItems: items,
        itemNameMap: itemNameMap
      });
    } catch (err) {
      console.error('加载积分项目失败:', err);
    }
  },

  // 加载积分类别
  loadCategories: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('score_categories')
        .where({
          is_active: true,
          class_id: db.command.in([this.data.currentClassId, '', null])
        })
        .orderBy('sort_order', 'asc')
        .get();
      
      const categories = res.data || [];
      const categoryOptions = [
        { value: '', label: '全部类别' },
        ...categories.map(c => ({ value: c.category_id, label: c.category_name }))
      ];
      
      this.setData({ 
        categories: categories,
        categoryOptions: categoryOptions
      });
    } catch (err) {
      console.error('加载积分类别失败:', err);
      // 使用默认类别
      this.setData({
        categoryOptions: [
          { value: '', label: '全部类别' },
          { value: '学习', label: '学习' },
          { value: '纪律', label: '纪律' },
          { value: '卫生', label: '卫生' },
          { value: '活动', label: '活动' },
          { value: '志愿服务', label: '志愿服务' },
          { value: '其他', label: '其他' }
        ]
      });
    }
  },

  // 加载异常预警记录
  loadAnomalyRecords: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('score_anomaly_alerts')
        .where({
          class_id: this.data.currentClassId,
          status: 'pending'
        })
        .field({ record_id: true })
        .get();
      
      const anomalyRecordIds = res.data.map(a => a.record_id);
      this.setData({ anomalyRecordIds: anomalyRecordIds });
    } catch (err) {
      console.error('加载异常预警失败:', err);
    }
  },

  // 获取时间范围查询条件
  getDateRangeQuery: function () {
    const { selectedTime, customDateRange, currentSemesterId } = this.data;
    const now = new Date();
    const db = wx.cloud.database();
    const _ = db.command;
    
    let dateQuery = {};
    const dateField = 'record_date';
    
    switch (selectedTime) {
      case 'today':
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateQuery[dateField] = _.gte(todayStart).and(_.lte(now));
        break;
        
      case 'week':
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateQuery[dateField] = _.gte(weekStart).and(_.lte(now));
        break;
        
      case 'month':
        const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateQuery[dateField] = _.gte(monthStart).and(_.lte(now));
        break;
        
      case 'semester':
        if (currentSemesterId) {
          dateQuery.semester_id = currentSemesterId;
        }
        break;
        
      case 'year':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        dateQuery[dateField] = _.gte(yearStart).and(_.lte(now));
        break;
        
      case 'custom':
        if (customDateRange.start && customDateRange.end) {
          const startDate = new Date(customDateRange.start);
          const endDate = new Date(customDateRange.end);
          endDate.setHours(23, 59, 59, 999);
          dateQuery[dateField] = _.gte(startDate).and(_.lte(endDate));
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
      const role = app.globalData.role;
      let studentId = this.data.selectedStudent;

      if ((role === 'student' || role === 'parent') && !studentId) {
        studentId = app.globalData.student_id;
      }

      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'getScoreRecords',
          data: {
            classId: this.data.currentClassId,
            studentId: studentId || '',
            needAll: true
          }
        }
      });

      const records = (res.result && res.result.data) || [];
      const totalAdd = records.filter(r => (r.score_change || r.score_value || 0) > 0)
        .reduce((sum, r) => sum + (r.score_change || r.score_value || 0), 0);
      const totalDeduct = records.filter(r => (r.score_change || r.score_value || 0) < 0)
        .reduce((sum, r) => sum + Math.abs(r.score_change || r.score_value || 0), 0);
      
      this.setData({
        statistics: {
          totalCount: records.length,
          totalAdd: totalAdd,
          totalDeduct: totalDeduct,
          anomalyCount: this.data.anomalyRecordIds.length
        }
      });
      
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },

  // 加载积分记录
  loadRecords: async function () {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const role = app.globalData.role;
      let studentId = this.data.selectedStudent;

      if ((role === 'student' || role === 'parent') && !studentId) {
        studentId = app.globalData.student_id;
      }

      // 构建基础查询条件（参考学生详情页的查询逻辑）
      let baseConditions = [];
      
      // 添加学生ID筛选
      if (studentId) {
        baseConditions.push({ student_id: studentId });
      }
      
      // 构建OR查询条件（参考学生详情页）
      let query = _.or([
        // 旧格式：record_type + status
        {
          record_type: 'record',
          status: '已确认',
          ...(baseConditions.length > 0 ? baseConditions[0] : {}),
          class_id: this.data.currentClassId
        },
        // 新格式：approval_status
        {
          approval_status: '已通过',
          ...(baseConditions.length > 0 ? baseConditions[0] : {}),
          class_id: this.data.currentClassId
        },
        // 兼容：只有student_id的记录
        {
          approval_status: _.exists(false),
          record_type: _.exists(false),
          ...(baseConditions.length > 0 ? baseConditions[0] : {}),
          class_id: this.data.currentClassId
        }
      ]);
      
      // 如果有额外筛选条件,需要额外处理
      let extraFilters = {};
      if (this.data.selectedType) {
        extraFilters.source_type = this.data.selectedType;
      }
      if (this.data.selectedCategory) {
        extraFilters.category_id = this.data.selectedCategory;
      }
      if (this.data.selectedStatus) {
        extraFilters.approval_status = this.data.selectedStatus;
      }
      
      // 正负向筛选
      if (this.data.selectedDirection === 'positive') {
        extraFilters.score_change = _.gt(0);
      } else if (this.data.selectedDirection === 'negative') {
        extraFilters.score_change = _.lt(0);
      }
      
      // 时间筛选
      const dateQuery = this.getDateRangeQuery();
      extraFilters = { ...extraFilters, ...dateQuery };
      
      // 搜索关键词
      if (this.data.searchKeyword) {
        extraFilters.student_name = db.RegExp({
          regexp: this.data.searchKeyword,
          options: 'i'
        });
      }

      const res = await db.collection('score_records')
        .where(query)
        .orderBy('created_at', 'desc')
        .skip(this.data.page * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();

      // 处理记录数据
      const anomalyRecordIds = this.data.anomalyRecordIds;
      const records = res.data.map(item => {
        const scoreValue = item.score_change || item.score_value || 0;
        const isAnomaly = anomalyRecordIds.includes(item._id) || this.checkAnomaly(item);
        
        return {
          ...item,
          studentName: item.student_name || this.data.studentNames[item.student_id] || item.student_id,
          itemName: item.rule_name || item.reason || '未知项目',
          date: item.record_date ? util.formatDate(new Date(item.record_date)) : 
                (item.date ? util.formatDate(new Date(item.date)) : ''),
          scoreChangeClass: scoreValue > 0 ? 'score-add' : 'score-minus',
          scoreChangeText: scoreValue > 0 ? `+${scoreValue}` : `${scoreValue}`,
          recorder_name: item.operator_name || '系统',
          statusClass: this.getStatusClass(item.approval_status),
          sourceTypeColor: this.getSourceTypeColor(item.source_type),
          // 原因详情细化
          reason_detail: this.formatReasonDetail(item),
          // 异常预警
          isAnomaly: isAnomaly,
          anomalyClass: isAnomaly ? 'anomaly-warning' : '',
          // 分类颜色
          categoryColor: this.getCategoryColor(item.category_id || item.rule_category)
        };
      });

      this.setData({
        records: this.data.page === 0 ? records : [...this.data.records, ...records],
        hasMore: records.length === this.data.pageSize,
        loading: false
      });

      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载积分记录失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
      if (err.errCode !== -502005) {
        util.showError('加载失败');
      }
    }
  },

  // 检查异常
  checkAnomaly: function (item) {
    const scoreValue = Math.abs(item.score_change || item.score_value || 0);
    
    // 单次积分过高
    if (scoreValue >= ANOMALY_THRESHOLDS.HIGH_SCORE) {
      return true;
    }
    
    return false;
  },

  // 格式化原因详情
  formatReasonDetail: function (item) {
    const parts = [];
    
    // 志愿服务特殊处理
    if (item.source_type === '志愿服务' && item.volunteer_hours) {
      parts.push(`${item.reason || '志愿服务'}（${item.volunteer_hours}小时）`);
    } 
    // 竞赛获奖特殊处理
    else if (item.source_type === '竞赛获奖' && item.competition_level) {
      parts.push(`获${item.competition_level}${item.reason || '竞赛奖励'}`);
    }
    // 其他类型
    else {
      if (item.reason) parts.push(item.reason);
      if (item.remark) parts.push(item.remark);
    }
    
    return parts.join(' | ') || '';
  },

  // 获取分类颜色
  getCategoryColor: function (categoryId) {
    const category = this.data.categories.find(c => c.category_id === categoryId);
    return category?.color || '#1890ff';
  },

  // 加载更多
  loadMore: function () {
    this.setData({ page: this.data.page + 1 });
    this.loadRecords();
  },

  // 获取状态样式类
  getStatusClass: function (status) {
    const classMap = {
      '待审核': 'status-pending',
      '已通过': 'status-approved',
      '已拒绝': 'status-rejected'
    };
    return classMap[status] || '';
  },

  // 获取来源类型颜色
  getSourceTypeColor: function (type) {
    const colorMap = {
      '日常记录': '#1890ff',
      '志愿服务': '#52c41a',
      '竞赛获奖': '#fa8c16',
      '证书获得': '#722ed1',
      '处分扣分': '#ff4d4f',
      '宿舍折算': '#13c2c2',
      '考勤': '#faad14'
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

  // 学生筛选
  onStudentChange: function (e) {
    const index = e.detail.value;
    if (index === 0) {
      this.setData({
        selectedStudent: '',
        selectedStudentLabel: '全部学生'
      });
    } else {
      const student = this.data.students[index - 1];
      this.setData({
        selectedStudent: student.student_id,
        selectedStudentLabel: student.name
      });
    }
    this.onRefresh();
  },

  // 类型筛选
  onTypeChange: function (e) {
    const index = e.detail.value;
    const selectedType = this.data.sourceTypes[index];
    this.setData({
      selectedType: selectedType.value,
      selectedTypeLabel: selectedType.label
    });
    this.onRefresh();
  },

  // 类别筛选
  onCategoryChange: function (e) {
    const index = e.detail.value;
    const selectedCategory = this.data.categoryOptions[index];
    this.setData({
      selectedCategory: selectedCategory.value,
      selectedCategoryLabel: selectedCategory.label
    });
    this.onRefresh();
  },

  // 正负向筛选
  onDirectionChange: function (e) {
    const index = e.detail.value;
    const selectedDirection = this.data.directions[index];
    this.setData({
      selectedDirection: selectedDirection.value,
      selectedDirectionLabel: selectedDirection.label
    });
    this.onRefresh();
  },

  // 状态筛选
  onStatusChange: function (e) {
    const index = e.detail.value;
    const selectedStatus = this.data.approvalStatuses[index];
    this.setData({
      selectedStatus: selectedStatus.value,
      selectedStatusLabel: selectedStatus.label
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

  // 日期选择器
  onStartDateChange: function (e) {
    this.setData({ 'customDateRange.start': e.detail.value });
  },

  onEndDateChange: function (e) {
    this.setData({ 'customDateRange.end': e.detail.value });
  },

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

  onCloseDatePicker: function () {
    this.setData({ showDatePicker: false });
  },

  // 切换高级筛选
  toggleAdvancedFilter: function () {
    this.setData({ showAdvancedFilter: !this.data.showAdvancedFilter });
  },

  // 重置筛选
  resetFilters: function () {
    this.setData({
      searchKeyword: '',
      selectedStudent: '',
      selectedStudentLabel: '全部学生',
      selectedType: '',
      selectedTypeLabel: '全部类型',
      selectedCategory: '',
      selectedCategoryLabel: '全部类别',
      selectedDirection: '',
      selectedDirectionLabel: '全部方向',
      selectedStatus: '',
      selectedStatusLabel: '全部状态',
      selectedTime: 'month',
      selectedTimeLabel: '近30天'
    });
    this.onRefresh();
  },

  // 查看详情
  onRecordDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPkg1/score/record/detail/detail?id=${id}`
    });
  },

  // 发起申诉
  onAppeal: function (e) {
    const record = e.currentTarget.dataset.record;
    wx.navigateTo({
      url: `/subPkg1/score/appeal/appeal?recordId=${record._id}&studentId=${record.student_id}`
    });
  },

  // 导出TOP10
  onExportTop10: async function () {
    if (!this.data.canExport) {
      util.showError('无权限导出');
      return;
    }
    
    try {
      wx.showLoading({ title: '导出中...', mask: true });
      
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({
          class_id: this.data.currentClassId
        })
        .orderBy('current_score', 'desc')
        .limit(10)
        .get();
      
      const top10 = res.data || [];
      
      // 生成导出内容
      let content = '班级积分TOP10学生清单\n';
      content += `导出时间: ${util.formatDate(new Date())}\n`;
      content += `班级: ${app.globalData.currentClassName || ''}\n\n`;
      content += '排名\t姓名\t学号\t总分\t近一学期增长\t主要来源\n';
      
      top10.forEach((student, index) => {
        content += `${index + 1}\t${student.name}\t${student.student_id}\t${student.current_score || 0}\t${student.semester_growth || '-'}\t${student.main_source || '-'}\n`;
      });
      
      wx.hideLoading();
      
      // 复制到剪贴板
      wx.setClipboardData({
        data: content,
        success: () => {
          util.showSuccess('已复制到剪贴板');
        }
      });
      
    } catch (err) {
      console.error('导出失败:', err);
      wx.hideLoading();
      util.showError('导出失败');
    }
  },

  // 查看异常记录
  onExportScoreRecords: async function () {
    const perm = excelTransfer.checkExportPermission()
    if (!perm.allowed) {
      wx.showToast({ title: perm.reason, icon: 'none' })
      return
    }
    if (!this.data.canExport) {
      wx.showToast({ title: '无导出权限', icon: 'none' })
      return
    }
    wx.showLoading({ title: '导出中...', mask: true })
    try {
      const now = new Date()
      const endDate = now.toISOString().slice(0, 10)
      const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
      const startDate = start.toISOString().slice(0, 10)
      const res = await excelTransfer.callDataTransfer('exportScoreRecords', {
        classId: this.data.currentClassId,
        className: this.data.currentClassName || '',
        startDate,
        endDate
      })
      wx.hideLoading()
      if (res.data && res.data.fileID) {
        await excelTransfer.downloadExcel(res.data.fileID)
      } else {
        wx.showToast({ title: '导出失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '导出失败', icon: 'none' })
    }
  },

  onViewAnomalies: function () {
    wx.navigateTo({
      url: '/subPkg1/score/anomaly/anomaly'
    });
  },

  preventBubble() {},
});
