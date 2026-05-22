// pages/dorm/mydorm/mydorm.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    loading: true,
    studentId: '',
    classId: '',
    isBoarding: false,

    // 宿舍信息
    dormInfo: {
      building: '',
      room: '',
      bed: ''
    },

    // 积分信息
    scoreInfo: {
      current_score: 100,
      original_score: 100,
      total_deduct: 0,
      total_add: 0
    },

    // 近期记录
    recentRecords: [],

    // 预警状态
    warningLevel: '',
    warningText: ''
  },

  onLoad: function () {
    const role = app.globalData.role;
    const studentId = app.globalData.student_id;
    const classId = app.globalData.class_id || app.globalData.classId || '';

    if (!studentId) {
      wx.showToast({ title: '未找到学生信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ studentId, classId });
    this.loadData();
  },

  onShow: function () {
    if (this.data.studentId) {
      this.loadData();
    }
  },

  onPullDownRefresh: function () {
    this.loadData();
  },

  loadData: async function () {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const { studentId, classId } = this.data;
      const semesterId = app.globalData.semesterId || '';

      // 查询学生信息
      const studentRes = await db.collection('students')
        .where({ student_id: studentId, class_id: classId })
        .limit(1)
        .get();

      if (!studentRes.data || studentRes.data.length === 0) {
        wx.showToast({ title: '未找到学生信息', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const student = studentRes.data[0];
      const isBoarding = student.is_boarding || false;
      const studentDocId = student._id || '';

      this.setData({ isBoarding });

      if (!isBoarding) {
        this.setData({ loading: false });
        return;
      }

      // 获取宿舍分配信息 - dorm_beds中student_doc_id存文档_id, student_id存业务ID
      let dormInfo = { building: '', room: '', bed: '' };
      try {
        let bedRes = await db.collection('dorm_beds')
          .where({ student_doc_id: studentDocId, occupied: true })
          .limit(1)
          .get();

        if (!bedRes.data || bedRes.data.length === 0) {
          bedRes = await db.collection('dorm_beds')
            .where({ student_id: studentDocId, occupied: true })
            .limit(1)
            .get();
        }

        if ((!bedRes.data || bedRes.data.length === 0) && studentId !== studentDocId) {
          bedRes = await db.collection('dorm_beds')
            .where({ student_id: studentId, occupied: true })
            .limit(1)
            .get();
        }

        if (bedRes.data && bedRes.data.length > 0) {
          const bed = bedRes.data[0];
          let buildingName = bed.building || '';
          let roomName = bed.room || '';
          if (!buildingName && bed.building_id) {
            try {
              const bRes = await db.collection('dorm_buildings').doc(bed.building_id).get();
              buildingName = bRes.data ? (bRes.data.name || bRes.data.building_name || '') : '';
            } catch (e) {}
          }
          if (!roomName && bed.room_id) {
            try {
              const rRes = await db.collection('dorm_rooms').doc(bed.room_id).get();
              roomName = rRes.data ? (rRes.data.room_number || rRes.data.name || '') : '';
            } catch (e) {}
          }
          dormInfo = {
            building: buildingName,
            room: roomName,
            bed: bed.bed_number || ''
          };
        }
      } catch (e) {
        console.error('查询宿舍分配失败:', e);
      }

      // 获取宿舍积分账户
      let scoreInfo = {
        current_score: 100,
        original_score: 100,
        total_deduct: 0,
        total_add: 0
      };

      let accountFound = false;
      try {
        const accountQuery = { student_id: studentId };
        if (semesterId) accountQuery.semester_id = semesterId;
        const accountRes = await db.collection('dorm_score_accounts')
          .where(accountQuery)
          .limit(1)
          .get();

        if (accountRes.data && accountRes.data.length > 0) {
          accountFound = true;
          const account = accountRes.data[0];
          const current = account.current_score != null ? account.current_score : (account.original_score != null ? account.original_score : 100);
          const original = account.original_score != null ? account.original_score : 100;
          scoreInfo = {
            current_score: current,
            original_score: original,
            total_deduct: Math.max(0, original - current),
            total_add: Math.max(0, current - original)
          };
        }
      } catch (e) {
        console.error('查询dorm_score_accounts失败:', e);
      }

      if (!accountFound) {
        try {
          const fallbackQuery = { student_id: studentId, class_id: classId };
          if (semesterId) fallbackQuery.semester_id = semesterId;
          const allRecordsRes = await db.collection('dorm_score_records')
            .where(fallbackQuery)
            .get();
          const allRecords = allRecordsRes.data || [];
          const totalChange = allRecords.reduce((sum, r) => sum + (r.score_change || r.score_value || 0), 0);
          const original = student.dorm_initial_score || student.initial_score || 100;
          const current = original + totalChange;
          scoreInfo = {
            current_score: current,
            original_score: original,
            total_deduct: Math.max(0, -totalChange),
            total_add: Math.max(0, totalChange)
          };
        } catch (e) {
          console.error('从dorm_score_records计算积分失败:', e);
        }
      }

      // 获取近期宿舍积分记录
      const recentQuery = { student_id: studentId, class_id: classId };
      if (semesterId) recentQuery.semester_id = semesterId;
      const recordsRes = await db.collection('dorm_score_records')
        .where(recentQuery)
        .orderBy('record_date', 'desc')
        .limit(10)
        .get();

      const recentRecords = (recordsRes.data || []).map(record => ({
        ...record,
        dateStr: record.record_date ? util.formatDate(new Date(record.record_date)) : '',
        scoreText: (record.score_change || record.score_value || 0) > 0 
          ? `+${record.score_change || record.score_value || 0}` 
          : `${record.score_change || record.score_value || 0}`,
        scoreClass: (record.score_change || record.score_value || 0) > 0 ? 'score-add' : 'score-minus',
        typeText: record.record_type === 'violation' ? '违规扣分' : (record.record_type === 'service' ? '服务加分' : '日常记录')
      }));

      // 判断预警等级
      let warningLevel = '';
      let warningText = '';
      const currentScore = scoreInfo.current_score;
      if (currentScore < 60) {
        warningLevel = 'red';
        warningText = '红色预警：积分严重不足，请尽快改善';
      } else if (currentScore < 70) {
        warningLevel = 'orange';
        warningText = '橙色预警：积分偏低，需注意改善';
      } else if (currentScore < 80) {
        warningLevel = 'yellow';
        warningText = '黄色预警：积分略低，建议保持良好习惯';
      }

      this.setData({
        dormInfo,
        scoreInfo,
        recentRecords,
        warningLevel,
        warningText,
        loading: false
      });

      wx.stopPullDownRefresh();

    } catch (err) {
      console.error('加载宿舍数据失败:', err);
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 查看全部记录
  onViewAllRecords: function () {
    wx.navigateTo({
      url: '/subPkg2/dorm/detail/detail?student_id=' + this.data.studentId
    });
  }
});
