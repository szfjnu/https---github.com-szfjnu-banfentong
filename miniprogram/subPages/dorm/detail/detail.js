const app = getApp();
const db = wx.cloud.database();
const _ = db.command;
const batchQuery = require('../../../utils/batchQuery.js');

Page({
  data: {
    studentId: '',
    student: {
      name: '',
      class_name: '',
      dorm_info: {},
      dorm_score: 100
    },
    accounts: {
      original_score: 100,
      converted_score: 0
    },
    records: [],
    
    // 分页
    page: 0,
    pageSize: 20,
    hasMore: true,
    loadingMore: false
  },

  onLoad: function (options) {
    const studentId = options.student_id;
    if (studentId) {
      this.setData({ studentId });
      this.loadStudentInfo();
      this.loadRecords();
    }
  },

  // 加载学生信息
  loadStudentInfo: async function () {
    try {
      const { studentId } = this.data;
      
      const res = await db.collection('students')
        .where({
          student_id: studentId
        })
        .limit(1)
        .get();

      if (res.data.length > 0) {
        this.setData({
          student: res.data[0]
        });
        
        // 加载积分账户
        await this.loadAccounts();
      }

    } catch (err) {
      console.error('加载学生信息失败:', err);
    }
  },

  // 加载积分账户
  loadAccounts: async function () {
    try {
      const { studentId, student } = this.data;
      const semesterId = app.globalData.semesterId || '';
      
      // 优先从 dorm_score_accounts 获取实时积分（更准确的来源）
      const accountRes = await db.collection('dorm_score_accounts')
        .where({
          student_id: studentId,
          ...(semesterId ? { semester_id: semesterId } : {})
        })
        .limit(1)
        .get();

      let currentDormScore = student.dorm_score || 100;
      let accounts = { original_score: 100, converted_score: 0 };

      if (accountRes.data.length > 0) {
        const account = accountRes.data[0];
        accounts = account;
        // 使用账户中的 current_score 或 original_score 作为当前宿舍积分
        currentDormScore = account.current_score !== undefined ? account.current_score : (account.original_score || 100);
      }

      this.setData({
        accounts: accounts,
        'student.dorm_score': currentDormScore
      });

    } catch (err) {
      console.error('加载积分账户失败:', err);
    }
  },

  // 加载记录
  loadRecords: async function (refresh = true) {
    if (refresh) {
      this.setData({ page: 0, hasMore: true });
    } else {
      this.setData({ loadingMore: true });
    }

    try {
      const { studentId, page, pageSize } = this.data;
      const skip = refresh ? 0 : page * pageSize;

      // 加载当前页记录（按时间倒序）
      const res = await db.collection('dorm_score_records')
        .where({
          student_id: studentId
        })
        .orderBy('record_date', 'desc')
        .orderBy('date', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get();

      const newRecords = res.data || [];

      // 计算每条记录后的剩余积分（从当前积分倒推）
      // 先获取当前总积分作为起点
      const accountRes = await db.collection('dorm_score_accounts')
        .where({ student_id: studentId })
        .limit(1)
        .get();

      let currentScore = this.data.student.dorm_score || 100;
      if (accountRes.data.length > 0) {
        currentScore = accountRes.data[0].current_score !== undefined
          ? accountRes.data[0].current_score
          : (accountRes.data[0].original_score || 100);
      }

      // 从当前积分倒推每条历史记录后的剩余积分
      // 新记录在前面，所以当前积分是最后一条记录后的值
      // 要显示每条记录"变动后"的积分，需要把新记录放在前面计算
      const recordsWithAfter = [];

      for (let i = 0; i < newRecords.length; i++) {
        const record = newRecords[i];
        // 获取该条记录的积分变化值（兼容不同字段名）
        const change = record.score_change || record.score_value || 0;
        // 该记录变动后的积分就是 currentScore
        // 然后回退到上一条记录变动后的积分
        recordsWithAfter.push({
          ...record,
          score_after: currentScore,
          _display_change: change
        });
        // 回推：当前积分减去这次的变化，得到这次变化前的积分
        currentScore -= change;
      }

      const records = refresh ? recordsWithAfter : [...this.data.records, ...recordsWithAfter];

      this.setData({
        records,
        hasMore: newRecords.length === pageSize,
        loadingMore: false,
        page: refresh ? 0 : page
      });

    } catch (err) {
      console.error('加载记录失败:', err);
      this.setData({ loadingMore: false });
    }
  },

  // 加载更多
  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadRecords(false);
    }
  },

  // 筛选变化
  onFilterChange: function () {
    // 弹出筛选选项
    wx.showActionSheet({
      itemList: ['全部记录', '只看扣分', '只看加分'],
      success: (res) => {
        const filterTypes = ['all', 'violation', 'service'];
        const selectedFilter = filterTypes[res.tapIndex];
        this.applyFilter(selectedFilter);
      }
    });
  },

  // 应用筛选
  applyFilter: async function (filterType) {
    wx.showLoading({ title: '筛选中...' });
    try {
      const { studentId } = this.data;
      let query = { student_id: studentId };

      if (filterType === 'violation') {
        query.record_type = 'violation';
      } else if (filterType === 'service') {
        query.record_type = 'service';
      }

      const res = await batchQuery.getAllRecords('dorm_score_records', query, 'record_date', 'desc');

      const records = this.calculateScoreAfter(res || []);

      this.setData({
        records,
        hasMore: false
      });
    } catch (err) {
      console.error('筛选失败:', err);
    } finally {
      wx.hideLoading();
    }
  },

  // 计算每条记录后的剩余积分（通用方法）
  calculateScoreAfter: function (newRecords) {
    let currentScore = this.data.student.dorm_score || 100;
    const recordsWithAfter = [];

    for (let i = 0; i < newRecords.length; i++) {
      const record = newRecords[i];
      const change = record.score_change || record.score_value || 0;
      recordsWithAfter.push({
        ...record,
        score_after: currentScore,
        _display_change: change
      });
      currentScore -= change;
    }

    return recordsWithAfter;
  },

  // 调整积分（手动调整学生宿舍积分）
  goToAdjust: function () {
    const { student } = this.data;
    wx.showModal({
      title: `调整积分 - ${student.name}`,
      editable: true,
      placeholderText: '请输入调整分值（如：-5 或 +3）',
      success: async (res) => {
        if (res.confirm && res.content) {
          const adjustValue = parseFloat(res.content);
          if (isNaN(adjustValue) || adjustValue === 0) {
            wx.showToast({ title: '请输入有效的分值', icon: 'none' });
            return;
          }
          await this.submitAdjustment(adjustValue);
        }
      }
    });
  },

  // 提交积分调整
  submitAdjustment: async function (adjustValue) {
    const { studentId, student, accounts } = this.data;
    wx.showLoading({ title: '调整中...', mask: true });

    try {
      const semesterId = app.globalData.semesterId || '';
      const operatorName = app.globalData.userInfo?.nickName || app.globalData.userInfo?.name || '管理员';

      // 1. 创建调整记录
      const recordData = {
        record_id: `ADJ-${Date.now()}`,
        student_id: studentId,
        record_type: adjustValue > 0 ? 'service' : 'violation',
        rule_name: '手动调整',
        rule_category: '手动调整',
        score_value: adjustValue,
        score_change: adjustValue,
        remark: '管理员手动调整宿舍积分',
        recorder_name: operatorName,
        recorder_openid: app.globalData.openid,
        semester_id: semesterId,
        class_id: app.globalData.class_id || '',
        record_date: new Date(),
        date: new Date(),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      };

      await db.collection('dorm_score_records').add({ data: recordData });

      // 2. 更新学生宿舍积分
      await db.collection('students').where({
        student_id: studentId
      }).update({
        data: {
          dorm_score: _.inc(adjustValue),
          updated_at: db.serverDate()
        }
      });

      // 3. 更新宿舍积分账户
      const accountRes = await db.collection('dorm_score_accounts').where({
        student_id: studentId,
        semester_id: semesterId
      }).limit(1).get();

      if (accountRes.data.length > 0) {
        await db.collection('dorm_score_accounts').doc(accountRes.data[0]._id).update({
          data: {
            original_score: _.inc(adjustValue),
            current_score: _.inc(adjustValue),
            updated_at: db.serverDate()
          }
        });
      } else {
        await db.collection('dorm_score_accounts').add({
          data: {
            student_id: studentId,
            semester_id: semesterId,
            class_id: app.globalData.class_id || '',
            original_score: 100 + adjustValue,
            current_score: 100 + adjustValue,
            converted_score: 0,
            conversion_ratio: 0.2,
            warning_count: 0,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
          }
        });
      }

      wx.hideLoading();
      wx.showToast({ title: '调整成功', icon: 'success' });

      // 刷新页面数据
      await this.loadStudentInfo();
      this.loadRecords(true);

    } catch (err) {
      console.error('调整积分失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '调整失败', icon: 'none' });
    }
  },

  // 查看统计（跳转到该学生的积分记录页面）
  goToHistory: function () {
    const { studentId } = this.data;
    wx.navigateTo({
      url: `/subPages/dorm/score/records/records?student_id=${studentId}`
    });
  }
});
