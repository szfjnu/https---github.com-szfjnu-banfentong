const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { getCallerInfo, requireScoringInputRole, requireScoringDeleteRole, getVisibleRoomFilter, AUTH_ERRORS } = require('./utils/auth');

function validateParams(data, requiredFields) {
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return { valid: false, missing: field };
    }
  }
  return { valid: true };
}

async function addDailyScore(data, caller) {
  const required = ['building_id', 'building_name', 'room_id', 'room_number', 'score_date', 'score', 'class_id', 'semester_id'];
  const v = validateParams(data, required);
  if (!v.valid) return { success: false, message: `缺少参数: ${v.missing}` };

  const { building_id, building_name, room_id, room_number, score_date, score, remark, class_id, semester_id } = data;

  if (typeof score !== 'number' || score < 0 || score > 100) {
    return { success: false, message: '评分范围为0-100', code: 'SCORE_OUT_OF_RANGE' };
  }

  if (!/^\d+(\.\d)?$/.test(String(score))) {
    return { success: false, message: '评分最多保留一位小数', code: 'SCORE_OUT_OF_RANGE' };
  }

  requireScoringInputRole(caller);

  if (caller.role === 'dorm_leader') {
    const studentRes = await db.collection('students').doc(caller.studentId).get();
    const dormRoomId = studentRes.data ? studentRes.data.dorm_room_id : '';
    if (room_id !== dormRoomId) {
      return { success: false, message: '宿舍长仅可录入本宿舍评分', code: 'DORM_LEADER_MISMATCH' };
    }
  }

  const existingRes = await db.collection('dorm_daily_scores')
    .where({ room_id, score_date, class_id })
    .limit(1)
    .get();
  if (existingRes.data && existingRes.data.length > 0) {
    return { success: false, message: '该房间在该日期已录入评分，不可重复录入', code: 'DUPLICATE_SCORE' };
  }

  try {
    const now = db.serverDate();
    await db.runTransaction(async (t) => {
      const addRes = await t.collection('dorm_daily_scores').add({
        data: {
          building_id,
          building_name,
          room_id,
          room_number,
          score_date,
          score,
          remark: remark || '',
          class_id,
          semester_id,
          recorder_openid: caller.openid,
          recorder_name: caller.realName,
          created_at: now
        }
      });

      const roomRes = await t.collection('dorm_rooms').doc(room_id).get();
      if (roomRes.data) {
        const currentTotal = roomRes.data.total_score || 0;
        const currentCount = roomRes.data.score_count || 0;
        const newTotal = currentTotal + score;
        const newCount = currentCount + 1;
        const newAvg = Math.round(newTotal / newCount * 10) / 10;
        await t.collection('dorm_rooms').doc(room_id).update({
          data: {
            total_score: newTotal,
            score_count: newCount,
            avg_score: newAvg,
            updated_at: now
          }
        });
      }
    });

    return { success: true };
  } catch (err) {
    console.error('addDailyScore error:', err);
    return { success: false, message: '录入失败，请重试', code: 'UPDATE_FAILED' };
  }
}

async function getDailyScores(data, caller) {
  const { room_id, start_date, end_date, page = 1, page_size = 20 } = data || {};

  try {
    let query = {};

    if (room_id) {
      query.room_id = room_id;
    } else {
      const roomFilter = await getVisibleRoomFilter(caller);
      if (roomFilter) {
        if (roomFilter.class_id) {
          query.class_id = roomFilter.class_id;
        } else if (roomFilter._id) {
          query.room_id = roomFilter._id;
        }
      }
    }

    if (start_date) {
      query.score_date = query.score_date || {};
      query.score_date = _.gte(start_date);
    }
    if (end_date) {
      if (query.score_date && typeof query.score_date === 'object') {
        query.score_date = _.gte(start_date).and(_.lte(end_date));
      } else {
        query.score_date = _.lte(end_date);
      }
    }

    const countRes = await db.collection('dorm_daily_scores').where(query).count();
    const total = countRes.total || 0;

    const res = await db.collection('dorm_daily_scores')
      .where(query)
      .orderBy('score_date', 'desc')
      .orderBy('created_at', 'desc')
      .skip((page - 1) * page_size)
      .limit(page_size)
      .get();

    return {
      success: true,
      data: {
        records: res.data || [],
        total
      }
    };
  } catch (err) {
    console.error('getDailyScores error:', err);
    return { success: false, message: err.message || '查询失败' };
  }
}

async function deleteDailyScore(data, caller) {
  const { score_id } = data || {};
  if (!score_id) return { success: false, message: '缺少参数: score_id' };

  requireScoringDeleteRole(caller);

  try {
    const scoreRes = await db.collection('dorm_daily_scores').doc(score_id).get();
    if (!scoreRes.data) {
      return { success: false, message: '评分记录不存在' };
    }

    const record = scoreRes.data;
    await db.collection('dorm_daily_scores').doc(score_id).remove();

    try {
      const roomRes = await db.collection('dorm_rooms').doc(record.room_id).get();
      if (roomRes.data) {
        const currentTotal = roomRes.data.total_score || 0;
        const currentCount = roomRes.data.score_count || 0;
        const newTotal = currentTotal - record.score;
        const newCount = Math.max(0, currentCount - 1);
        const newAvg = newCount > 0 ? Math.round(newTotal / newCount * 10) / 10 : 0;
        const now = db.serverDate();
        await db.collection('dorm_rooms').doc(record.room_id).update({
          data: {
            total_score: newTotal,
            score_count: newCount,
            avg_score: newAvg,
            updated_at: now
          }
        });
      }
    } catch (e) {
      console.error('更新房间评分统计失败:', e);
    }

    return { success: true };
  } catch (err) {
    console.error('deleteDailyScore error:', err);
    return { success: false, message: err.message || '删除失败' };
  }
}

async function getScoreTrends(data, caller) {
  const { room_id, chart_type = 'daily', class_id } = data || {};
  if (!room_id) return { success: false, message: '缺少参数: room_id' };

  try {
    const today = new Date();
    const todayStr = formatDate(today);
    let startDate = '';
    let endDate = todayStr;

    const semesterRes = await db.collection('semesters')
      .where({ is_current: true })
      .limit(1)
      .get();
    const semester = (semesterRes.data && semesterRes.data.length > 0) ? semesterRes.data[0] : null;
    const semesterStart = semester ? formatDate(new Date(semester.start_date)) : '';

    if (chart_type === 'daily' || chart_type === 'semester_trend') {
      startDate = semesterStart || getDateBefore(today, 30);
    } else if (chart_type === 'week_compare') {
      const monday = getMonday(today);
      startDate = getDateBefore(monday, 7);
    } else if (chart_type === 'month_compare') {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      startDate = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() - 1, 1).toISOString().slice(0, 10);
    }

    const query = {
      room_id,
      score_date: _.gte(startDate).and(_.lte(endDate))
    };
    if (class_id) query.class_id = class_id;

    const res = await db.collection('dorm_daily_scores')
      .where(query)
      .orderBy('score_date', 'asc')
      .limit(1000)
      .get();

    const records = res.data || [];

    if (chart_type === 'daily') {
      const dates = records.map(r => r.score_date);
      const scores = records.map(r => r.score);
      return { success: true, data: { chart_type, dates, scores } };
    }

    if (chart_type === 'week_compare') {
      const mondayStr = formatDate(getMonday(today));
      const lastMondayStr = getDateBefore(getMonday(today), 7);
      const sundayStr = getDateAfter(getMonday(today), 6);

      const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      const currentScores = new Array(7).fill(null);
      const previousScores = new Array(7).fill(null);

      records.forEach(r => {
        const rDate = new Date(r.score_date);
        const dayIdx = (rDate.getDay() + 6) % 7;
        if (r.score_date >= mondayStr) {
          currentScores[dayIdx] = r.score;
        } else {
          previousScores[dayIdx] = r.score;
        }
      });

      return {
        success: true,
        data: {
          chart_type,
          current_labels: weekDays,
          current_scores: currentScores,
          previous_labels: weekDays,
          previous_scores: previousScores
        }
      };
    }

    if (chart_type === 'month_compare') {
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
      const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

      const currentLabels = [];
      const previousLabels = [];
      for (let i = 1; i <= thisMonthEnd; i++) currentLabels.push(i + '日');
      for (let i = 1; i <= lastMonthEnd; i++) previousLabels.push(i + '日');

      const currentScores = new Array(thisMonthEnd).fill(null);
      const previousScores = new Array(lastMonthEnd).fill(null);

      records.forEach(r => {
        const day = new Date(r.score_date).getDate();
        if (r.score_date >= thisMonthStart) {
          currentScores[day - 1] = r.score;
        } else {
          previousScores[day - 1] = r.score;
        }
      });

      return {
        success: true,
        data: {
          chart_type,
          current_labels: currentLabels,
          current_scores: currentScores,
          previous_labels: previousLabels,
          previous_scores: previousScores
        }
      };
    }

    if (chart_type === 'semester_trend') {
      const dates = records.map(r => r.score_date);
      const scores = records.map(r => r.score);
      const movingAvg = [];
      for (let i = 0; i < scores.length; i++) {
        const start = Math.max(0, i - 6);
        const window = scores.slice(start, i + 1).filter(v => v !== null);
        movingAvg.push(window.length > 0 ? Math.round(window.reduce((a, b) => a + b, 0) / window.length * 10) / 10 : null);
      }

      return {
        success: true,
        data: {
          chart_type,
          dates,
          scores,
          moving_avg: movingAvg
        }
      };
    }

    return { success: false, message: '未知chart_type' };
  } catch (err) {
    console.error('getScoreTrends error:', err);
    return { success: false, message: err.message || '查询趋势数据失败' };
  }
}

async function getRoomScoreSummary(data, caller) {
  const { room_id, semester_id } = data || {};
  if (!room_id) return { success: false, message: '缺少参数: room_id' };

  try {
    const roomRes = await db.collection('dorm_rooms').doc(room_id).get();
    if (!roomRes.data) {
      return { success: false, message: '房间不存在' };
    }

    const recentRes = await db.collection('dorm_daily_scores')
      .where({
        room_id,
        ...(semester_id ? { semester_id } : {})
      })
      .orderBy('score_date', 'desc')
      .limit(5)
      .get();

    return {
      success: true,
      data: {
        total_score: roomRes.data.total_score || 0,
        avg_score: roomRes.data.avg_score || 0,
        score_count: roomRes.data.score_count || 0,
        recent_records: recentRes.data || []
      }
    };
  } catch (err) {
    console.error('getRoomScoreSummary error:', err);
    return { success: false, message: err.message || '查询汇总失败' };
  }
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDateBefore(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

function getDateAfter(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const caller = await getCallerInfo(event, data?.class_id);

    switch (action) {
      case 'addDailyScore':
        return await addDailyScore(data || {}, caller);
      case 'getDailyScores':
        return await getDailyScores(data || {}, caller);
      case 'deleteDailyScore':
        return await deleteDailyScore(data || {}, caller);
      case 'getScoreTrends':
        return await getScoreTrends(data || {}, caller);
      case 'getRoomScoreSummary':
        return await getRoomScoreSummary(data || {}, caller);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    if (Object.values(AUTH_ERRORS).includes(err.code)) {
      const msgMap = {
        [AUTH_ERRORS.NO_OPENID]: '未获取到用户身份',
        [AUTH_ERRORS.NO_CLASS]: '用户未加入任何班级',
        [AUTH_ERRORS.NO_ACCESS]: '无权操作此班级',
        [AUTH_ERRORS.ROLE_DENIED]: err.message,
        [AUTH_ERRORS.CLASS_DENIED]: '无权访问该班级数据'
      };
      return { success: false, message: msgMap[err.code] || err.message, code: 'PERMISSION_DENIED' };
    }
    console.error('dormScoringManager error:', err);
    return { success: false, message: err.message || '服务器错误', code: 'INTERNAL_ERROR' };
  }
};
