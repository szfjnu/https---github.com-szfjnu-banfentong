const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { getCallerInfo, requireTeacher, AUTH_ERRORS } = require('../utils/auth');

const DEFAULT_WARNING_LEVELS = [
  { level_code: 'warning', level_name: '警告处分', min_sections: 20, max_sections: 40, color: '#faad14' },
  { level_code: 'serious_warning', level_name: '严重警告处分', min_sections: 40, max_sections: 60, color: '#fa8c16' },
  { level_code: 'demerit', level_name: '记过处分', min_sections: 60, max_sections: 80, color: '#ff4d4f' },
  { level_code: 'probation', level_name: '留校察看处分', min_sections: 80, max_sections: null, color: '#cf1322' }
];

const DEFAULT_LEAVE_THRESHOLD = 30;

const DEFAULT_TIMETABLE = [
  { section_id: 1, section_name: '第1节', section_type: 'class', start_time: '08:20', end_time: '09:00' },
  { section_id: 2, section_name: '第2节', section_type: 'class', start_time: '09:10', end_time: '09:50' },
  { section_id: 3, section_name: '课间操', section_type: 'break', start_time: '09:50', end_time: '10:10' },
  { section_id: 4, section_name: '第3节', section_type: 'class', start_time: '10:20', end_time: '11:00' },
  { section_id: 5, section_name: '第4节', section_type: 'class', start_time: '11:15', end_time: '11:55' },
  { section_id: 6, section_name: '午休', section_type: 'lunch', start_time: '11:55', end_time: '14:00' },
  { section_id: 7, section_name: '第5节', section_type: 'class', start_time: '14:00', end_time: '14:40' },
  { section_id: 8, section_name: '第6节', section_type: 'class', start_time: '14:50', end_time: '15:30' },
  { section_id: 9, section_name: '第7节', section_type: 'class', start_time: '15:40', end_time: '16:20' },
  { section_id: 10, section_name: '第8节', section_type: 'class', start_time: '16:30', end_time: '17:10' },
  { section_id: 11, section_name: '第9节', section_type: 'class', start_time: '17:20', end_time: '18:00' },
  { section_id: 12, section_name: '晚自习', section_type: 'class', start_time: '19:30', end_time: '21:00' }
];

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const classId = data && data.class_id
    const caller = await getCallerInfo(event, classId)

    const READ_ACTIONS = ['getTimetableByDate', 'getTimetableConfig', 'getHolidayAdjustments',
      'getAbsentWarningConfig', 'getLeaveWarningConfig', 'getWarnings', 'getWarningStats']
    const WRITE_ACTIONS = ['saveTimetableConfig', 'resetTimetableConfig', 'saveHolidayAdjustment',
      'deleteHolidayAdjustment', 'saveAbsentWarningConfig', 'resetAbsentWarningConfig',
      'saveLeaveWarningConfig', 'resetLeaveWarningConfig', 'detectWarnings',
      'updateAttendanceStatistics', 'addAttendanceStatistics']

    if (WRITE_ACTIONS.includes(action)) {
      requireTeacher(caller)
    }

    switch (action) {
      case 'getTimetableByDate':
        return await getTimetableByDate(data, caller.openid);
      case 'getTimetableConfig':
        return await getTimetableConfig(data, caller.openid);
      case 'saveTimetableConfig':
        return await saveTimetableConfig(data, caller.openid);
      case 'resetTimetableConfig':
        return await resetTimetableConfig(data, caller.openid);
      case 'getHolidayAdjustments':
        return await getHolidayAdjustments(data, caller.openid);
      case 'saveHolidayAdjustment':
        return await saveHolidayAdjustment(data, caller.openid);
      case 'deleteHolidayAdjustment':
        return await deleteHolidayAdjustment(data, caller.openid);
      case 'getAbsentWarningConfig':
        return await getAbsentWarningConfig(data, caller.openid);
      case 'saveAbsentWarningConfig':
        return await saveAbsentWarningConfig(data, caller.openid);
      case 'resetAbsentWarningConfig':
        return await resetAbsentWarningConfig(data, caller.openid);
      case 'getLeaveWarningConfig':
        return await getLeaveWarningConfig(data, caller.openid);
      case 'saveLeaveWarningConfig':
        return await saveLeaveWarningConfig(data, caller.openid);
      case 'resetLeaveWarningConfig':
        return await resetLeaveWarningConfig(data, caller.openid);
      case 'detectWarnings':
        return await detectWarnings(data, caller.openid);
      case 'getWarnings':
        return await getWarnings(data, caller.openid);
      case 'getWarningStats':
        return await getWarningStats(data, caller.openid);
      case 'updateAttendanceStatistics':
        return await updateAttendanceStatistics(data, caller.openid);
      case 'addAttendanceStatistics':
        return await addAttendanceStatistics(data, caller.openid);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('attendanceWarning 错误:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get();
  } catch (err) {
    if (err.message && (err.message.includes('no such collection') || err.message.includes('not exist'))) {
      await db.createCollection(name);
    } else {
      throw err;
    }
  }
}

async function getTimetableByDate(data, openId) {
  const { class_id, date } = data;
  if (!class_id || !date) return { success: false, message: '缺少班级ID或日期' };

  await ensureCollection('holiday_adjustments');
  await ensureCollection('timetable_config');

  const adjustRes = await db.collection('holiday_adjustments')
    .where({ class_id, adjust_date: date })
    .limit(1).get();

  let weekDay = new Date(date).getDay() || 7;
  let isAdjusted = false;
  let adjustInfo = null;

  if (adjustRes.data && adjustRes.data.length > 0) {
    const adj = adjustRes.data[0];
    if (adj.adjust_type === 'holiday') {
      return { success: true, data: { sections: [], week_day: weekDay, is_adjusted: true, adjust_info: '今日放假' } };
    }
    if (adj.adjust_type === 'makeup' && adj.target_week_day) {
      weekDay = adj.target_week_day;
      isAdjusted = true;
      adjustInfo = `补周${['一','二','三','四','五','六','日'][weekDay-1]}的课`;
    }
  }

  const ttRes = await db.collection('timetable_config')
    .where({ class_id, week_day: weekDay })
    .limit(1).get();

  const sections = (ttRes.data && ttRes.data.length > 0)
    ? ttRes.data[0].sections
    : DEFAULT_TIMETABLE;

  return { success: true, data: { sections, week_day: weekDay, is_adjusted: isAdjusted, adjust_info: adjustInfo } };
}

async function getTimetableConfig(data, openId) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('timetable_config');

  const res = await db.collection('timetable_config').where({ class_id }).limit(10).get();
  const timetables = {};
  for (let d = 1; d <= 5; d++) {
    const found = (res.data || []).find(r => r.week_day === d);
    timetables[d] = found ? found.sections : [...DEFAULT_TIMETABLE];
  }

  return { success: true, data: { timetables } };
}

async function saveTimetableConfig(data, openId) {
  const { class_id, week_day, sections } = data;
  if (!class_id || !week_day || !sections) return { success: false, message: '参数不完整' };
  if (week_day < 1 || week_day > 7) return { success: false, message: '星期无效' };

  await ensureCollection('timetable_config');

  for (let i = 1; i < sections.length; i++) {
    if (sections[i].start_time < sections[i-1].end_time) {
      return { success: false, message: `第${i}节开始时间早于前一节结束时间` };
    }
  }

  const now = db.serverDate();
  const existRes = await db.collection('timetable_config').where({ class_id, week_day }).limit(1).get();

  if (existRes.data && existRes.data.length > 0) {
    await db.collection('timetable_config').doc(existRes.data[0]._id).update({
      data: { sections, updated_at: now }
    });
  } else {
    await db.collection('timetable_config').add({
      data: { class_id, week_day, sections, created_at: now, updated_at: now }
    });
  }

  return { success: true, message: '保存成功' };
}

async function resetTimetableConfig(data, openId) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('timetable_config');

  const oldRes = await db.collection('timetable_config').where({ class_id }).limit(10).get();
  for (const doc of (oldRes.data || [])) {
    await db.collection('timetable_config').doc(doc._id).remove();
  }

  const now = db.serverDate();
  const timetables = {};
  for (let d = 1; d <= 5; d++) {
    await db.collection('timetable_config').add({
      data: { class_id, week_day: d, sections: [...DEFAULT_TIMETABLE], created_at: now, updated_at: now }
    });
    timetables[d] = [...DEFAULT_TIMETABLE];
  }

  return { success: true, data: { timetables } };
}

async function getHolidayAdjustments(data, openId) {
  const { class_id, semester_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('holiday_adjustments');

  let query = { class_id };
  if (semester_id) query.semester_id = semester_id;

  const res = await db.collection('holiday_adjustments').where(query).orderBy('adjust_date', 'desc').limit(100).get();
  return { success: true, data: { adjustments: res.data || [] } };
}

async function saveHolidayAdjustment(data, openId) {
  const { class_id, adjust_date, adjust_type, target_week_day, description } = data;
  if (!class_id || !adjust_date || !adjust_type) return { success: false, message: '参数不完整' };
  if (!['makeup', 'holiday'].includes(adjust_type)) return { success: false, message: '调休类型无效' };
  if (adjust_type === 'makeup' && (!target_week_day || target_week_day < 1 || target_week_day > 5)) {
    return { success: false, message: '补课须指定周一至周五' };
  }

  await ensureCollection('holiday_adjustments');

  const existRes = await db.collection('holiday_adjustments')
    .where({ class_id, adjust_date }).limit(1).get();

  const now = db.serverDate();
  const record = {
    class_id,
    adjust_date,
    adjust_type,
    target_week_day: adjust_type === 'makeup' ? target_week_day : null,
    description: description || '',
    updated_at: now
  };

  if (existRes.data && existRes.data.length > 0) {
    await db.collection('holiday_adjustments').doc(existRes.data[0]._id).update({ data: record });
  } else {
    record.created_at = now;
    await db.collection('holiday_adjustments').add({ data: record });
  }

  return { success: true, message: '保存成功' };
}

async function deleteHolidayAdjustment(data, openId) {
  const { adjustment_id } = data;
  if (!adjustment_id) return { success: false, message: '缺少规则ID' };

  await ensureCollection('holiday_adjustments');
  await db.collection('holiday_adjustments').doc(adjustment_id).remove();
  return { success: true, message: '删除成功' };
}

async function getAbsentWarningConfig(data, openId) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('absent_warning_config');

  const res = await db.collection('absent_warning_config').where({ class_id }).limit(1).get();

  if (res.data && res.data.length > 0) {
    return { success: true, data: { warning_levels: res.data[0].warning_levels, is_default: false, _id: res.data[0]._id } };
  }

  return { success: true, data: { warning_levels: [...DEFAULT_WARNING_LEVELS], is_default: true } };
}

async function saveAbsentWarningConfig(data, openId) {
  const { class_id, warning_levels } = data;
  if (!class_id || !warning_levels) return { success: false, message: '参数不完整' };

  await ensureCollection('absent_warning_config');

  const now = db.serverDate();
  const existRes = await db.collection('absent_warning_config').where({ class_id }).limit(1).get();

  if (existRes.data && existRes.data.length > 0) {
    await db.collection('absent_warning_config').doc(existRes.data[0]._id).update({
      data: { warning_levels, updated_at: now }
    });
  } else {
    await db.collection('absent_warning_config').add({
      data: { class_id, warning_levels, created_at: now, updated_at: now }
    });
  }

  return { success: true, message: '保存成功' };
}

async function resetAbsentWarningConfig(data, openId) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('absent_warning_config');

  const existRes = await db.collection('absent_warning_config').where({ class_id }).limit(1).get();
  const now = db.serverDate();

  if (existRes.data && existRes.data.length > 0) {
    await db.collection('absent_warning_config').doc(existRes.data[0]._id).update({
      data: { warning_levels: [...DEFAULT_WARNING_LEVELS], updated_at: now }
    });
  } else {
    await db.collection('absent_warning_config').add({
      data: { class_id, warning_levels: [...DEFAULT_WARNING_LEVELS], created_at: now, updated_at: now }
    });
  }

  return { success: true, data: { warning_levels: [...DEFAULT_WARNING_LEVELS] } };
}

async function getLeaveWarningConfig(data, openId) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('leave_warning_config');

  const res = await db.collection('leave_warning_config').where({ class_id }).limit(1).get();

  if (res.data && res.data.length > 0) {
    return { success: true, data: { threshold_days: res.data[0].threshold_days, is_default: false, _id: res.data[0]._id } };
  }

  return { success: true, data: { threshold_days: DEFAULT_LEAVE_THRESHOLD, is_default: true } };
}

async function saveLeaveWarningConfig(data, openId) {
  const { class_id, threshold_days } = data;
  if (!class_id || threshold_days === undefined) return { success: false, message: '参数不完整' };
  if (threshold_days < 1) return { success: false, message: '阈值天数不能小于1' };

  await ensureCollection('leave_warning_config');

  const now = db.serverDate();
  const existRes = await db.collection('leave_warning_config').where({ class_id }).limit(1).get();

  if (existRes.data && existRes.data.length > 0) {
    await db.collection('leave_warning_config').doc(existRes.data[0]._id).update({
      data: { threshold_days, updated_at: now }
    });
  } else {
    await db.collection('leave_warning_config').add({
      data: { class_id, threshold_days, created_at: now, updated_at: now }
    });
  }

  return { success: true, message: '保存成功' };
}

async function resetLeaveWarningConfig(data, openId) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('leave_warning_config');

  const existRes = await db.collection('leave_warning_config').where({ class_id }).limit(1).get();
  const now = db.serverDate();

  if (existRes.data && existRes.data.length > 0) {
    await db.collection('leave_warning_config').doc(existRes.data[0]._id).update({
      data: { threshold_days: DEFAULT_LEAVE_THRESHOLD, updated_at: now }
    });
  } else {
    await db.collection('leave_warning_config').add({
      data: { class_id, threshold_days: DEFAULT_LEAVE_THRESHOLD, created_at: now, updated_at: now }
    });
  }

  return { success: true, data: { threshold_days: DEFAULT_LEAVE_THRESHOLD } };
}

async function detectWarnings(data, openId) {
  const { class_id, semester_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('attendance_warnings');

  const absentConfigRes = await getAbsentWarningConfig({ class_id }, openId);
  const warningLevels = absentConfigRes.data.warning_levels;

  const leaveConfigRes = await getLeaveWarningConfig({ class_id }, openId);
  const leaveThreshold = leaveConfigRes.data.threshold_days;

  const semesterQuery = semester_id ? { semester_id } : {};
  const absentRes = await db.collection('attendance_records')
    .where({ class_id, category_code: 'absent', ...semesterQuery })
    .limit(1000).get();

  const absentByStudent = {};
  const absentDaysByStudent = {};
  for (const r of (absentRes.data || [])) {
    if (!absentByStudent[r.student_id]) {
      absentByStudent[r.student_id] = { sections: 0, name: r.student_name || '' };
      absentDaysByStudent[r.student_id] = new Set();
    }
    absentByStudent[r.student_id].sections++;
    if (r.date) absentDaysByStudent[r.student_id].add(r.date);
  }

  const sickRes = await db.collection('attendance_records')
    .where({ class_id, category_code: 'sick_leave', ...semesterQuery })
    .limit(1000).get();
  const personalRes = await db.collection('attendance_records')
    .where({ class_id, category_code: 'personal_leave', ...semesterQuery })
    .limit(1000).get();

  const sickDaysByStudent = {};
  for (const r of (sickRes.data || [])) {
    if (!sickDaysByStudent[r.student_id]) sickDaysByStudent[r.student_id] = new Set();
    if (r.date) sickDaysByStudent[r.student_id].add(r.date);
  }
  const personalDaysByStudent = {};
  for (const r of (personalRes.data || [])) {
    if (!personalDaysByStudent[r.student_id]) personalDaysByStudent[r.student_id] = new Set();
    if (r.date) personalDaysByStudent[r.student_id].add(r.date);
  }

  const allStudentIds = new Set([
    ...Object.keys(absentByStudent),
    ...Object.keys(sickDaysByStudent),
    ...Object.keys(personalDaysByStudent)
  ]);

  const absentWarnings = [];
  const leaveWarnings = [];
  const now = db.serverDate();

  for (const studentId of allStudentIds) {
    const absentInfo = absentByStudent[studentId] || { sections: 0, name: '' };
    const totalSections = absentInfo.sections;

    if (totalSections > 0) {
      let detectedLevel = null;
      for (const level of warningLevels) {
        if (totalSections >= level.min_sections && (level.max_sections === null || totalSections < level.max_sections)) {
          detectedLevel = level;
          break;
        }
      }

      if (detectedLevel) {
        const existWarn = await db.collection('attendance_warnings')
          .where({ class_id, student_id: studentId, warning_type: 'absent_discipline', ...semesterQuery })
          .limit(1).get();

        const warningData = {
          student_id: studentId,
          student_name: absentInfo.name,
          class_id,
          warning_type: 'absent_discipline',
          level_code: detectedLevel.level_code,
          level_name: detectedLevel.level_name,
          level_color: detectedLevel.color,
          trigger_value: totalSections,
          threshold_config: warningLevels,
          detail: {
            absent_sections: totalSections,
            sick_days: (sickDaysByStudent[studentId] || new Set()).size,
            personal_days: (personalDaysByStudent[studentId] || new Set()).size,
            absent_days: (absentDaysByStudent[studentId] || new Set()).size
          },
          updated_at: now
        };

        if (existWarn.data && existWarn.data.length > 0) {
          const old = existWarn.data[0];
          const isUpgrade = detectedLevel.min_sections > (old.threshold_config || []).find(l => l.level_code === old.level_code)?.min_sections;
          await db.collection('attendance_warnings').doc(old._id).update({ data: warningData });
          if (isUpgrade || old.level_code !== detectedLevel.level_code) {
            await sendWarningNotification(class_id, studentId, detectedLevel.level_name, totalSections);
          }
          absentWarnings.push({ ...warningData, _id: old._id });
        } else {
          warningData.created_at = now;
          warningData.notify_status = 'pending';
          const addRes = await db.collection('attendance_warnings').add({ data: warningData });
          await sendWarningNotification(class_id, studentId, detectedLevel.level_name, totalSections);
          absentWarnings.push({ ...warningData, _id: addRes._id });
        }
      }
    }

    const sickDays = (sickDaysByStudent[studentId] || new Set()).size;
    const personalDays = (personalDaysByStudent[studentId] || new Set()).size;
    const absentDays = (absentDaysByStudent[studentId] || new Set()).size;
    const totalLeaveDays = sickDays + personalDays + absentDays;

    if (totalLeaveDays > leaveThreshold) {
      const studentName = absentInfo.name || '';
      const existWarn = await db.collection('attendance_warnings')
        .where({ class_id, student_id: studentId, warning_type: 'leave_warning', ...semesterQuery })
        .limit(1).get();

      const leaveWarningData = {
        student_id: studentId,
        student_name: studentName,
        class_id,
        warning_type: 'leave_warning',
        level_code: 'leave_warning',
        level_name: '休学预警',
        level_color: '#ff4d4f',
        trigger_value: totalLeaveDays,
        detail: { sick_days: sickDays, personal_days: personalDays, absent_days: absentDays, threshold_days: leaveThreshold },
        updated_at: now
      };

      if (existWarn.data && existWarn.data.length > 0) {
        await db.collection('attendance_warnings').doc(existWarn.data[0]._id).update({ data: leaveWarningData });
        leaveWarnings.push({ ...leaveWarningData, _id: existWarn.data[0]._id });
      } else {
        leaveWarningData.created_at = now;
        leaveWarningData.notify_status = 'pending';
        const addRes = await db.collection('attendance_warnings').add({ data: leaveWarningData });
        leaveWarnings.push({ ...leaveWarningData, _id: addRes._id });
      }
    }
  }

  return { success: true, data: { absent_warnings: absentWarnings, leave_warnings: leaveWarnings } };
}

async function sendWarningNotification(class_id, student_id, level_name, trigger_value) {
  try {
    const relRes = await db.collection('user_class_relation')
      .where({ class_id, student_id, role: 'parent' })
      .limit(5).get();

    if (!relRes.data || relRes.data.length === 0) return;

    for (const rel of relRes.data) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: rel._openid || rel.user_openid,
          templateId: 'warning_notice_template_id',
          page: `subPages/attendance/warning/warning?class_id=${class_id}`,
          data: {
            thing1: { value: '旷课纪律预警' },
            thing2: { value: level_name },
            number3: { value: String(trigger_value) },
            thing4: { value: '请关注学生考勤情况' }
          }
        });
      } catch (e) {
        console.error('推送家长通知失败:', e.message);
      }
    }
  } catch (err) {
    console.error('查询家长关系失败:', err);
  }
}

async function getWarnings(data, openId) {
  const { class_id, semester_id, warning_type } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('attendance_warnings');

  let query = { class_id };
  if (warning_type) query.warning_type = warning_type;

  const res = await db.collection('attendance_warnings').where(query).orderBy('updated_at', 'desc').limit(200).get();

  const warnings = res.data || [];
  const summary = {
    total: warnings.length,
    absent_discipline_count: warnings.filter(w => w.warning_type === 'absent_discipline').length,
    leave_warning_count: warnings.filter(w => w.warning_type === 'leave_warning').length
  };

  return { success: true, data: { warnings, summary } };
}

async function getWarningStats(data, openId) {
  const { class_id, semester_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  await ensureCollection('attendance_warnings');

  const warningsRes = await db.collection('attendance_warnings').where({ class_id }).limit(200).get();
  const warnings = warningsRes.data || [];

  const studentsRes = await db.collection('students').where({ class_id, status: _.neq('graduated') }).limit(1).count();

  const levelDistribution = {};
  for (const w of warnings) {
    const key = w.level_code || 'unknown';
    levelDistribution[key] = (levelDistribution[key] || 0) + 1;
  }

  return {
    success: true,
    data: {
      total_students: studentsRes.total || 0,
      absent_warning_count: warnings.filter(w => w.warning_type === 'absent_discipline').length,
      leave_warning_count: warnings.filter(w => w.warning_type === 'leave_warning').length,
      warning_level_distribution: levelDistribution
    }
  };
}

async function updateAttendanceStatistics(data, openId) {
  const { statId, ...updateFields } = data || {};
  if (!statId) return { success: false, message: '缺少必要参数: statId' };
  try {
    const now = db.serverDate();
    const fields = { ...updateFields, updated_at: now };
    delete fields.class_id;
    await db.collection('attendance_statistics').doc(statId).update({ data: fields });
    return { success: true };
  } catch (err) {
    console.error('updateAttendanceStatistics失败:', err);
    return { success: false, message: err.message };
  }
}

async function addAttendanceStatistics(data, openId) {
  try {
    const now = db.serverDate();
    const recordData = { ...data, created_at: now, updated_at: now };
    delete recordData.class_id;
    const res = await db.collection('attendance_statistics').add({ data: recordData });
    return { success: true, data: { _id: res._id } };
  } catch (err) {
    console.error('addAttendanceStatistics失败:', err);
    return { success: false, message: err.message };
  }
}
