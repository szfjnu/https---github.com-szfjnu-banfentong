const app = getApp();
const db = wx.cloud.database();
const _ = db.command;
const batchQuery = require('../../../utils/batchQuery.js');

Page({
  data: {
    loading: true,
    isEnabled: false,
    isAdmin: false,
    classId: '',
    semesterId: '',
    semesterName: '',

    // 统计数据
    stats: {
      totalStudents: 0,
      warningCount: 0,
      avgScore: 0
    },

    // 规则数量
    rulesCount: 0,

    // 最近检查记录
    recentRecords: [],

    // 预警列表
    warnings: [],

    // 搜索关键词
    searchKeyword: '',

    // 筛选选项
    buildingOptions: [
      { label: '全部楼栋', value: '' },
      { label: '1号楼', value: '1号楼' },
      { label: '2号楼', value: '2号楼' },
      { label: '3号楼', value: '3号楼' },
      { label: '4号楼', value: '4号楼' }
    ],
    selectedBuilding: '',
    selectedBuildingLabel: '',

    scoreOptions: [
      { label: '全部状态', value: '' },
      { label: '优秀 (≥90分)', value: 'excellent' },
      { label: '良好 (80-89分)', value: 'good' },
      { label: '及格 (60-79分)', value: 'pass' },
      { label: '不及格 (<60分)', value: 'fail' }
    ],
    selectedScore: '',
    selectedScoreLabel: ''
  },

  onLoad: function (options) {
    this.initPage();
  },

  onShow: function () {
    // 每次显示时刷新数据
    if (this.data.isEnabled) {
      this.loadStats();
    }
  },

  // 初始化页面
  initPage: async function () {
    try {
      const role = app.globalData.role;
      const classId = app.globalData.class_id;
      const isAdmin = role === 'admin' || role === 'head_teacher';

      this.setData({
        isAdmin,
        classId
      });

      // 检查是否启用宿舍管理
      await this.checkDormEnabled();
      
      if (this.data.isEnabled) {
        // 加载统计数据
        await this.loadStats();
      }

      this.setData({ loading: false });

    } catch (err) {
      console.error('初始化页面失败:', err);
      this.setData({ loading: false });
    }
  },

  // 检查宿舍管理是否启用
  checkDormEnabled: async function () {
    try {
      const { classId } = this.data;

      if (!classId) {
        this.setData({ isEnabled: false });
        return;
      }

      // 从 class_settings 集合查询班级设置
      const settingsRes = await db.collection('class_settings')
        .where({ class_id: classId })
        .field({
          'feature_flags.enable_dorm': true
        })
        .get();

      // 同时获取班级的当前学期ID
      const classRes = await db.collection('classes')
        .doc(classId)
        .field({
          current_semester_id: true
        })
        .get();

      let isEnabled = false;
      let semesterId = '';

      // 检查宿舍管理是否启用
      if (settingsRes.data && settingsRes.data.length > 0) {
        const classSettings = settingsRes.data[0];
        isEnabled = classSettings.feature_flags?.enable_dorm || false;
      }

      // 获取学期ID
      if (classRes.data) {
        semesterId = classRes.data.current_semester_id || '';
      }

      this.setData({
        isEnabled,
        semesterId
      });

      // 加载学期名称
      if (semesterId) {
        await this.loadSemesterName(semesterId);
      }

    } catch (err) {
      console.error('检查宿舍管理启用状态失败:', err);
      this.setData({ isEnabled: false });
    }
  },

  // 加载学期名称
  loadSemesterName: async function (semesterId) {
    try {
      const res = await db.collection('semesters')
        .doc(semesterId)
        .field({ name: true })
        .get();
      
      if (res.data) {
        this.setData({ semesterName: res.data.name });
      }
    } catch (err) {
      console.error('加载学期名称失败:', err);
    }
  },

  // 加载统计数据
  loadStats: async function () {
    try {
      const { classId, semesterId } = this.data;
      const db = wx.cloud.database();
      const _ = db.command;

      // 并行加载多个统计数据
      // 1. 统计住宿生数量（通过云函数获取全量学生后过滤）
      const studentsCfRes = await wx.cloud.callFunction({
        name: 'manageAuthorization',
        data: { action: 'getStudents', data: { class_id: classId } }
      });
      const allClassStudents = (studentsCfRes.result && studentsCfRes.result.success) ? studentsCfRes.result.data : [];
      const boardingStudents = allClassStudents.filter(s => s.is_boarding === true);

      const [rulesRes, recordsRes, warningsRes] = await Promise.all([
        // 2. 统计宿舍规则数量
        db.collection('dorm_rules')
          .where({
            class_id: _.in([classId, '', null]),
            is_enabled: true
          })
          .count(),

        // 3. 查询最近宿舍积分记录
        db.collection('dorm_score_records')
          .where({
            class_id: classId
          })
          .orderBy('record_date', 'desc')
          .limit(5)
          .get(),

        // 4. 查询预警学生
        db.collection('dorm_warnings')
          .where({
            class_id: classId,
            status: 'active'
          })
          .orderBy('created_at', 'desc')
          .limit(5)
          .get(),
        
        // 5. 查询宿舍积分账户获取实时平均分
        db.collection('dorm_score_accounts')
          .where({
            class_id: classId,
            ...(semesterId ? { semester_id: semesterId } : {})
          })
          .field({
            student_id: true,
            current_score: true,
            original_score: true
          })
          .get()
      ]);

      // 5. 查询宿舍积分账户获取实时平均分（使用batchQuery全量加载）
      const accountsQuery = {
        class_id: classId
      };
      if (semesterId) accountsQuery.semester_id = semesterId;
      const accounts = await batchQuery.getAllRecords('dorm_score_accounts', accountsQuery, 'created_at', 'desc');

      // 计算统计数据
      const students = boardingStudents;
      const totalStudents = students.length;
      
      // 从宿舍积分账户计算实时平均分
      const totalScore = accounts.reduce((sum, a) => sum + (a.current_score || a.original_score || 100), 0);
      const avgScore = accounts.length > 0 ? Math.round(totalScore / accounts.length) : 100;

      // 统计预警人数（积分 < 60）
      const warningCount = accounts.filter(a => (a.current_score || a.original_score || 100) < 60).length;

      // 格式化预警数据
      const warnings = warningsRes.data.map(w => ({
        ...w,
        warning_level_text: this.getWarningLevelText(w.warning_level)
      }));

      // 关联学生信息到宿舍积分记录
      const studentMap = {};
      students.forEach(s => {
        studentMap[s.student_id] = s;
      });

      // 格式化积分记录数据
      const formattedRecords = recordsRes.data.map(record => {
        // 处理 dorm_info，可能是对象或字符串
        let building = '';
        let room = '';

        if (record.dorm_info) {
          if (typeof record.dorm_info === 'string') {
            // 旧格式：字符串 "楼栋-房间"
            const parts = record.dorm_info.split('-');
            building = parts[0] || '';
            room = parts[1] || '';
          } else if (typeof record.dorm_info === 'object') {
            // 新格式：对象 {building, room, bed}
            building = record.dorm_info.building || '';
            room = record.dorm_info.room || '';
          }
        }

        return {
          ...record,
          inspection_type: record.record_type === 'violation' ? '违规扣分' : '服务加分',
          building,
          room,
          student_name: studentMap[record.student_id]?.name || '未知',
          score_display: record.score_change || record.score_value || 0,  // 使用 score_change 字段
          inspection_date: this.formatDate(new Date(record.record_date))
        };
      });

      this.setData({
        stats: {
          totalStudents,
          warningCount,
          avgScore
        },
        rulesCount: rulesRes.total,
        recentRecords: formattedRecords,
        warnings
      });

    } catch (err) {
      console.error('加载统计数据失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 获取预警等级文本
  getWarningLevelText: function (level) {
    const map = {
      yellow: '黄色预警',
      orange: '橙色预警',
      red: '红色预警'
    };
    return map[level] || '预警';
  },

  // 页面跳转方法
  goToSettings: function () {
    wx.navigateTo({
      url: `/subPages/class/settings/settings?id=${this.data.classId}`
    });
  },

  goToBuildings: function () {
    wx.navigateTo({
      url: '/subPages/dorm/buildings/buildings'
    });
  },

  goToRules: function () {
    wx.navigateTo({
      url: '/subPages/dorm/rules/rules'
    });
  },

  goToInspection: function () {
    wx.navigateTo({
      url: '/subPages/dorm/score/records/records'
    });
  },

  goToInspectionAdd: function () {
    wx.navigateTo({
      url: '/subPages/dorm/score/add/add'
    });
  },

  goToStatistics: function () {
    wx.navigateTo({
      url: '/subPages/dorm/statistics/statistics'
    });
  },

  goToStudentList: function () {
    // 跳转到学生列表页，筛选住宿生
    wx.navigateTo({
      url: '/pages/student/student?filter=boarding'
    });
  },

  goToWarnings: function () {
    wx.navigateTo({
      url: '/subPages/dorm/statistics/statistics?tab=warnings'
    });
  },

  viewRecordDetail: function (e) {
    const recordId = e.currentTarget.dataset.id;
    const record = this.data.recentRecords.find(r => r._id === recordId);
    
    if (record && record.student_id) {
      // 跳转到学生详情页面，显示该学生的宿舍积分记录
      wx.navigateTo({
        url: `/subPages/dorm/detail/detail?student_id=${record.student_id}&highlight_record=${recordId}`
      });
    } else {
      wx.showToast({
        title: '记录详情暂不可用',
        icon: 'none'
      });
    }
  },

  viewStudentDetail: function (e) {
    const studentId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/dorm/detail/detail?student_id=${studentId}`
    });
  },

  // 搜索相关方法
  onSearchInput: function (e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  onSearch: function () {
    // 执行搜索逻辑
    this.loadRecords();
  },

  onClearSearch: function () {
    this.setData({
      searchKeyword: ''
    });
    this.loadRecords();
  },

  // 筛选相关方法
  onBuildingChange: function (e) {
    const index = e.detail.value;
    const selected = this.data.buildingOptions[index];
    this.setData({
      selectedBuilding: selected.value,
      selectedBuildingLabel: selected.label
    });
    this.loadRecords();
  },

  // 格式化日期
  formatDate: function (date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  onScoreChange: function (e) {
    const index = e.detail.value;
    const selected = this.data.scoreOptions[index];
    this.setData({
      selectedScore: selected.value,
      selectedScoreLabel: selected.label
    });
    this.loadRecords();
  },

  // 加载检查记录（带搜索和筛选）
  loadRecords: async function () {
    try {
      const { classId, searchKeyword, selectedBuilding, selectedScore } = this.data;
      const db = wx.cloud.database();
      const _ = db.command;

      let query = db.collection('dorm_inspection_records').where({
        class_id: classId
      });

      // 搜索关键词
      if (searchKeyword) {
        query = query.where(_.or([
          { building: db.RegExp({ regexp: searchKeyword, options: 'i' }) },
          { room: db.RegExp({ regexp: searchKeyword, options: 'i' }) }
        ]));
      }

      // 楼栋筛选
      if (selectedBuilding) {
        query = query.where({ building: selectedBuilding });
      }

      // 积分筛选
      if (selectedScore) {
        let scoreCondition;
        switch (selectedScore) {
          case 'excellent':
            scoreCondition = _.gte(90);
            break;
          case 'good':
            scoreCondition = _.gte(80).and(_.lt(90));
            break;
          case 'pass':
            scoreCondition = _.gte(60).and(_.lt(80));
            break;
          case 'fail':
            scoreCondition = _.lt(60);
            break;
        }
        query = query.where({ overall_score: scoreCondition });
      }

      const res = await query
        .orderBy('inspection_date', 'desc')
        .limit(5)
        .get();

      this.setData({
        recentRecords: res.data || []
      });
    } catch (err) {
      console.error('加载检查记录失败:', err);
    }
  }
});
