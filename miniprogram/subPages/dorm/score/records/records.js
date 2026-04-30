// pages/dorm/score/records/records.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    // 筛选选项
    typeOptions: ['全部类型', '违规扣分', '服务加分'],
    selectedTypeIndex: 0,

    semesterOptions: ['全部学期'],
    semesters: [],
    selectedSemesterIndex: 0,

    startDate: '',
    endDate: '',
    minDate: '',
    maxDate: '',

    searchKeyword: '',

    // 统计数据
    totalCount: 0,
    totalScore: 0,
    violationCount: 0,
    serviceCount: 0,

    // 记录列表
    records: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    pageSize: 20,
    page: 1,

    // 权限
    isAdmin: false
  },

  onLoad: async function () {
    this.setData({
      isAdmin: app.globalData.isAdmin || false
    });

    // 设置日期范围
    const today = new Date();
    const minDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    this.setData({
      minDate: this.formatDate(minDate),
      maxDate: this.formatDate(today),
      endDate: this.formatDate(today)
    });

    await this.loadSemesters();
    await this.loadRecords(true);
  },

  // 加载学期
  loadSemesters: async function () {
    try {
      const res = await db.collection('semesters')
        .orderBy('created_at', 'desc')
        .get();

      const semesters = res.data || [];
      const semesterOptions = ['全部学期', ...semesters.map(s => s.semester_name)];

      this.setData({
        semesters,
        semesterOptions
      });
    } catch (err) {
      console.error('加载学期失败:', err);
    }
  },

  // 加载记录
  loadRecords: async function (refresh = false) {
    if (this.data.loading || this.data.loadingMore) return;

    try {
      if (refresh) {
        this.setData({
          loading: true,
          page: 1,
          hasMore: true
        });
      } else {
        this.setData({
          loadingMore: true
        });
      }

      const {
        selectedTypeIndex,
        semesters,
        selectedSemesterIndex,
        startDate,
        endDate,
        searchKeyword,
        pageSize,
        page
      } = this.data;

      const userClassId = app.globalData.class_id || '';

      // 构建查询条件
      let query = {
        class_id: _.eq(userClassId)
      };

      // 类型筛选
      if (selectedTypeIndex === 1) {
        query.record_type = 'violation';
      } else if (selectedTypeIndex === 2) {
        query.record_type = 'service';
      }

      // 学期筛选
      if (selectedSemesterIndex > 0 && semesters.length > 0) {
        const semesterId = semesters[selectedSemesterIndex - 1]._id;
        query.semester_id = semesterId;
      }

      // 日期筛选
      if (startDate) {
        query.record_date = _.gte(new Date(startDate));
      }
      if (endDate) {
        if (query.record_date) {
          query.record_date = _.and(query.record_date, _.lte(new Date(endDate + ' 23:59:59')));
        } else {
          query.record_date = _.lte(new Date(endDate + ' 23:59:59'));
        }
      }

      // 搜索
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.trim();
        query.student_id = db.RegExp({
          regexp: keyword,
          options: 'i'
        });
      }

      const res = await db.collection('dorm_score_records')
        .where(query)
        .orderBy('record_date', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      const records = res.data || [];

      // 获取所有涉及的学生ID
      const studentIds = [...new Set(records.map(r => r.student_id).filter(id => id))];
      
      // 批量查询学生信息
      let studentMap = {};
      if (studentIds.length > 0) {
        const batchSize = 20;
        for (let i = 0; i < studentIds.length; i += batchSize) {
          const batch = studentIds.slice(i, i + batchSize);
          const studentRes = await db.collection('students')
            .where({
              student_id: _.in(batch)
            })
            .field({
              student_id: true,
              name: true,
              dorm_info: true
            })
            .get();
          
          studentRes.data.forEach(s => {
            studentMap[s.student_id] = s;
          });
        }
      }

      // 格式化记录，关联学生信息
      const formattedRecords = records.map(record => {
        const student = studentMap[record.student_id] || {};
        
        // 处理宿舍信息（可能是对象或字符串）
        let dormInfoStr = '';
        if (student.dorm_info) {
          if (typeof student.dorm_info === 'string') {
            dormInfoStr = student.dorm_info;
          } else if (typeof student.dorm_info === 'object') {
            const building = student.dorm_info.building || '';
            const room = student.dorm_info.room || '';
            dormInfoStr = building && room ? `${building}-${room}` : (building || room || '');
          }
        }
        
        return {
          ...record,
          student_name: student.name || record.student_name || '未知',
          dorm_info: dormInfoStr || record.dorm_info || '',
          record_date_text: this.formatDate(new Date(record.record_date))
        };
      });

      // 计算统计数据
      const totalCount = formattedRecords.length;
      const totalScore = formattedRecords.reduce((sum, r) => sum + r.score_value, 0);
      const violationCount = formattedRecords.filter(r => r.record_type === 'violation').length;
      const serviceCount = formattedRecords.filter(r => r.record_type === 'service').length;

      if (refresh) {
        this.setData({
          records: formattedRecords,
          totalCount,
          totalScore,
          violationCount,
          serviceCount,
          hasMore: records.length >= pageSize
        });
      } else {
        this.setData({
          records: [...this.data.records, ...formattedRecords],
          hasMore: records.length >= pageSize
        });
      }

    } catch (err) {
      console.error('加载记录失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({
        loading: false,
        loadingMore: false
      });
    }
  },

  // 类型变化
  onTypeChange: function (e) {
    this.setData({
      selectedTypeIndex: parseInt(e.detail.value)
    });
    this.loadRecords(true);
  },

  // 学期变化
  onSemesterChange: function (e) {
    this.setData({
      selectedSemesterIndex: parseInt(e.detail.value)
    });
    this.loadRecords(true);
  },

  // 开始日期变化
  onStartDateChange: function (e) {
    this.setData({
      startDate: e.detail.value
    });
    this.loadRecords(true);
  },

  // 结束日期变化
  onEndDateChange: function (e) {
    this.setData({
      endDate: e.detail.value
    });
    this.loadRecords(true);
  },

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 搜索
  onSearch: function () {
    this.loadRecords(true);
  },

  // 查看详情
  onViewDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/dorm/score/detail/detail?id=${id}`
    });
  },

  // 删除记录
  onDeleteRecord: function (e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？如果记录关联了个人积分，个人积分也会相应减少。',
      success: async (res) => {
        if (res.confirm) {
          await this.deleteRecord(id);
        }
      }
    });
  },

  // 删除记录
  deleteRecord: async function (recordId) {
    try {
      wx.showLoading({ title: '删除中...' });

      // 调用删除云函数
      const res = await wx.cloud.callFunction({
        name: 'deleteDormRecord',
        data: {
          recordId: recordId
        }
      });

      wx.hideLoading();

      if (res.result.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });

        // 重新加载记录
        this.loadRecords(true);
      } else {
        wx.showToast({
          title: '删除失败',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('删除失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  // 格式化日期
  formatDate: function (date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadRecords(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.setData({
        page: this.data.page + 1
      });
      this.loadRecords(false);
    }
  }
});
