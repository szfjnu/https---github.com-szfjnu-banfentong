// pages/student/detail/detail.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');

Page({
  data: {
    studentId: null,
    student: null,
    scoreRecords: [],
    volunteerRecords: [],
    disciplineRecords: [],
    loading: true,
    activeTab: 'info',
    canEdit: false,
    // 考勤统计
    attendanceStats: {
      sick_leave: 0,
      personal_leave: 0,
      late: 0,
      early_leave: 0,
      absent: 0,
      total_leave: 0
    },
    attendanceRecords: [],
    // 住宿积分
    dormScoreInfo: null,
    dormRecords: [],
    isBoarding: false,
    tabs: [
      { key: 'info', label: '基本信息' },
      { key: 'score', label: '积分记录' },
      { key: 'attendance', label: '考勤' },
      { key: 'volunteer', label: '志愿服务' },
      { key: 'discipline', label: '处分记录' }
    ]
  },

  onLoad: function (options) {
    const studentId = options.id;
    console.log('学生详情页面加载, studentId:', studentId);
    console.log('完整的options:', options);

    // 检查权限
    this.checkPermission();

    if (!studentId) {
      wx.showToast({
        title: '参数错误',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
      return;
    }

    this.setData({ studentId });
    this.loadData();
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    const canEdit = role === 'admin' || role === 'head_teacher';
    this.setData({ canEdit });
  },

  onShow: function () {
    // 如果有studentId,刷新数据
    if (this.data.studentId) {
      console.log('onShow 触发, 刷新学生数据');
      this.loadData();
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    console.log('下拉刷新触发');
    this.loadData();
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });
    console.log('=== 开始加载数据 ===');

    try {
      // 始终先加载学生基本信息（确保积分是最新的）
      await this.loadStudentInfo();

      // 根据当前激活的标签页加载对应数据
      const activeTab = this.data.activeTab;
      if (activeTab === 'score') {
        await this.loadScoreRecords();
      } else if (activeTab === 'volunteer') {
        await this.loadVolunteerRecords();
      } else if (activeTab === 'discipline') {
        await this.loadDisciplineRecords();
      } else if (activeTab === 'attendance') {
        await this.loadAttendanceStats();
      }

      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
      util.showError('加载失败');
    }
  },

  // 加载学生基本信息
  loadStudentInfo: async function () {
    try {
      const studentId = this.data.studentId;
      console.log('开始加载学生信息, studentId:', studentId);

      // 使用 get 方法获取最新数据，避免缓存
      const db = wx.cloud.database();
      const res = await db.collection('students')
        .where({
          student_id: studentId
        })
        //.limit(1)
        .get();

      console.log('API返回结果:', res);

      if (res.data && res.data.length > 0) {
        const student = res.data[0];
        console.log('找到学生信息:', student);
        console.log('学生当前积分 (current_score):', student.current_score);

        this.setData({
          student: {
            ...student,
            scoreLevel: util.getScoreLevel(student.current_score || 100),
            scoreColor: util.getScoreColor(student.current_score || 100),
            formattedEnrollmentDate: student.enrollment_date ? util.formatDate(new Date(student.enrollment_date)) : '未填写',
            formattedBirthDate: student.date_of_birth ? util.formatDate(new Date(student.date_of_birth)) : '未填写'
          }
        });
        console.log('学生信息已设置到data, current_score:', this.data.student.current_score);
      } else {
        console.log('未找到学生信息');
        wx.showToast({
          title: '未找到学生信息',
          icon: 'none',
          duration: 2000
        });
      }
    } catch (err) {
      console.error('加载学生信息失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none',
        duration: 2000
      });
    }
  },

  // 加载积分记录
  loadScoreRecords: async function () {
    try {
      const studentId = this.data.studentId;
      console.log('加载积分记录, student_id:', studentId);
      
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'getScoreRecords',
          data: {
            studentId: studentId,
            needAll: true
          }
        }
      });
      const rawRecords = (res.result && res.result.data) || [];
      rawRecords.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      console.log('积分记录查询结果:', rawRecords);

      const records = rawRecords.map(item => {
        // 日期处理：兼容多种日期字段
        let dateStr = '';
        if (item.record_date) {
          dateStr = util.formatDate(new Date(item.record_date));
        } else if (item.date) {
          dateStr = util.formatDate(new Date(item.date));
        } else if (item.created_at) {
          dateStr = util.formatDate(new Date(item.created_at));
        }
        
        // 积分变化
        const scoreChange = item.score_change || item.score_value || 0;
        
        return {
          ...item,
          date: dateStr,
          scoreChangeClass: scoreChange > 0 ? 'score-add' : 'score-minus',
          scoreChangeText: scoreChange > 0 ? `+${scoreChange}` : `${scoreChange}`,
          // 项目名称：兼容多种字段名
          rule_name: item.rule_name || item.item_name || item.source_type || '',
          // 原因详情
          reason_detail: item.reason_detail || item.reason || item.remark || '',
          // 记录人
          operator_name: item.operator_name || item.recorder_name || '系统',
          // 来源类型标签
          sourceTag: this.getSourceTag(item.source_type || item.item_id)
        };
      });

      this.setData({ scoreRecords: records });
    } catch (err) {
      console.error('加载积分记录失败:', err);
      // 集合不存在时显示空列表
      if (err.errCode === -502005) {
        this.setData({ scoreRecords: [] });
      }
    }
  },

  // 获取来源类型标签
  getSourceTag: function (sourceType) {
    const tagMap = {
      'volunteer_service': '志愿服务',
      '志愿服务': '志愿服务',
      'discipline': '处分',
      'skill_certificate': '技能证书',
      'dorm': '宿舍管理',
      '日常': '日常积分',
      'default': ''
    };
    return tagMap[sourceType] || '';
  },

  // 加载志愿服务记录
  loadVolunteerRecords: async function () {
    try {
      const studentId = this.data.studentId;
      console.log('加载志愿服务记录, student_id:', studentId);
      
      const res = await api.volunteerApi.getRecords({
        student_id: studentId,
        limit: 50
      });
      console.log('志愿服务记录查询结果:', res);

      const records = res.data.map(item => ({
        ...item,
        date: util.formatDate(new Date(item.date)),
        typeColor: this.getTypeColor(item.service_type)
      }));

      this.setData({ volunteerRecords: records });
    } catch (err) {
      console.error('加载志愿服务记录失败:', err);
      // 集合不存在时显示空列表
      if (err.errCode === -502005) {
        this.setData({ volunteerRecords: [] });
      }
    }
  },

  // 加载处分记录
  loadDisciplineRecords: async function () {
    try {
      const studentId = this.data.studentId;
      console.log('加载处分记录, student_id:', studentId);
      
      const res = await api.disciplineApi.getDisciplineRecords(studentId);
      console.log('处分记录查询结果:', res);

      const records = res.data.map(item => ({
        ...item,
        // 日期格式化
        dateText: item.date ? util.formatDate(new Date(item.date)) : '',
        startDateText: item.start_date ? util.formatDate(new Date(item.start_date)) : '',
        endDateText: item.end_date ? util.formatDate(new Date(item.end_date)) : '',
        expiryDateText: item.expiry_date ? util.formatDate(new Date(item.expiry_date)) : '',
        revokedDateText: item.revoked_date ? util.formatDate(new Date(item.revoked_date)) : '',
        // 级别颜色
        levelColor: this.getDisciplineLevelColor(item.level_name),
        // 状态文字
        statusText: this.getDisciplineStatusText(item.status, item.revocation_status)
      }));

      this.setData({ disciplineRecords: records });
    } catch (err) {
      console.error('加载处分记录失败:', err);
      // 集合不存在时显示空列表
      if (err.errCode === -502005) {
        this.setData({ disciplineRecords: [] });
      }
    }
  },

  // 切换标签页
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });

    // 根据标签页加载对应数据
    if (tab === 'score') {
      this.loadScoreRecords();
    } else if (tab === 'volunteer') {
      this.loadVolunteerRecords();
    } else if (tab === 'discipline') {
      this.loadDisciplineRecords();
    } else if (tab === 'attendance') {
      this.loadAttendanceStats();
    }
  },

  // 加载考勤统计
  loadAttendanceStats: async function () {
    try {
      const studentId = this.data.studentId;
      const db = wx.cloud.database();
      const _ = db.command;
      const semesterId = app.globalData.currentSemesterId || '';

      let query = { student_id: studentId };
      if (semesterId) query.semester_id = semesterId;

      const res = await db.collection('attendance_records')
        .where(query)
        .orderBy('date', 'desc')
        .limit(200)
        .get();

      const records = res.data || [];

      // 按类型统计
      const stats = { sick_leave: 0, personal_leave: 0, late: 0, early_leave: 0, absent: 0, total_leave: 0 };
      records.forEach(r => {
        const code = r.category_code || '';
        if (code === 'sick_leave') stats.sick_leave++;
        else if (code === 'personal_leave') stats.personal_leave++;
        else if (code === 'late') stats.late++;
        else if (code === 'early_leave') stats.early_leave++;
        else if (code === 'absent') stats.absent++;
      });
      stats.total_leave = stats.sick_leave + stats.personal_leave;

      const formattedRecords = records.slice(0, 30).map(r => ({
        ...r,
        dateText: r.date || '',
        categoryText: r.category_name || r.category_code || '',
        categoryColor: this.getAttendanceCategoryColor(r.category_code)
      }));

      this.setData({
        attendanceStats: stats,
        attendanceRecords: formattedRecords
      });

      // 如果是住宿生，加载住宿积分
      const student = this.data.student;
      if (student && student.is_boarding) {
        await this.loadDormScore();
      }
    } catch (err) {
      console.error('加载考勤统计失败:', err);
      if (err.errCode === -502005) {
        this.setData({ attendanceStats: { sick_leave: 0, personal_leave: 0, late: 0, early_leave: 0, absent: 0, total_leave: 0 }, attendanceRecords: [] });
      }
    }
  },

  // 获取考勤类型颜色
  getAttendanceCategoryColor: function (code) {
    const map = {
      'sick_leave': '#52c41a',
      'personal_leave': '#1890ff',
      'late': '#fa8c16',
      'early_leave': '#faad14',
      'absent': '#ff4d4f'
    };
    return map[code] || '#999999';
  },

  // 加载住宿积分
  loadDormScore: async function () {
    try {
      const studentId = this.data.studentId;
      const classId = app.globalData.class_id;
      const db = wx.cloud.database();

      // 获取宿舍积分账户
      const accountRes = await db.collection('dorm_score_accounts')
        .where({ student_id: studentId })
        .limit(1)
        .get();

      let dormScoreInfo = null;
      if (accountRes.data && accountRes.data.length > 0) {
        const account = accountRes.data[0];
        const current = account.current_score || account.original_score || 100;
        const original = account.original_score || 100;
        dormScoreInfo = {
          current_score: current,
          original_score: original,
          total_deduct: Math.max(0, original - current),
          total_add: Math.max(0, current - original)
        };
      }

      // 获取近期记录
      const recordsRes = await db.collection('dorm_score_records')
        .where({ student_id: studentId, class_id: classId })
        .orderBy('record_date', 'desc')
        .limit(10)
        .get();

      const dormRecords = (recordsRes.data || []).map(r => ({
        ...r,
        dateStr: r.record_date ? util.formatDate(new Date(r.record_date)) : '',
        scoreText: (r.score_change || r.score_value || 0) > 0
          ? `+${r.score_change || r.score_value || 0}`
          : `${r.score_change || r.score_value || 0}`,
        scoreClass: (r.score_change || r.score_value || 0) > 0 ? 'score-add' : 'score-minus'
      }));

      this.setData({ dormScoreInfo, dormRecords, isBoarding: true });
    } catch (err) {
      console.error('加载住宿积分失败:', err);
    }
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

  // 获取处分级别颜色
  getDisciplineLevelColor: function (level) {
    const colorMap = {
      '警告': '#faad14',
      '严重警告': '#fa8c16',
      '记过': '#ff4d4f',
      '记大过': '#cf1322',
      '留校察看': '#a8071a',
      '开除学籍': '#5c0011'
    };
    return colorMap[level] || '#999999';
  },

  // 获取处分状态文字
  getDisciplineStatusText: function (status, revocationStatus) {
    if (revocationStatus === '已撤销' || status === 'revoked') {
      return '已撤销';
    }
    const statusMap = {
      'active': '生效中',
      'expired': '已过期',
      'revoked': '已撤销',
      'pending': '待审核'
    };
    return statusMap[status] || status;
  },

  // 编辑学生
  onEditStudent: function () {
    const studentId = this.data.studentId;
    wx.navigateTo({
      url: `/subPages/student/add/add?id=${studentId}`
    });
  },

  // 删除学生
  onDeleteStudent: function () {
    const studentId = this.data.studentId;
    const studentName = this.data.student ? this.data.student.name : '';

    wx.showModal({
      title: '确认删除',
      content: `确定要删除学生"${studentName}"吗？此操作不可恢复。`,
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...', mask: true });

            // 获取学生记录的 _id
            const studentRes = await api.studentApi.getStudentByStudentId(studentId);
            if (studentRes.data && studentRes.data.length > 0) {
              await api.studentApi.deleteStudent(studentRes.data[0]._id);
              wx.hideLoading();
              util.showSuccess('删除成功');

              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.hideLoading();
              util.showError('未找到学生记录');
            }
          } catch (err) {
            console.error('删除学生失败:', err);
            wx.hideLoading();
            util.showError('删除失败');
          }
        }
      }
    });
  },

  // 查看积分详情
  onViewScoreDetail: function (e) {
    const recordId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/score/record/detail/detail?id=${recordId}`
    });
  },

  // 查看志愿服务详情
  onViewVolunteerDetail: function (e) {
    const recordId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPages/volunteer/detail/detail?id=${recordId}`
    });
  }
});
