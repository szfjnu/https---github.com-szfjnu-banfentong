// 卫生值日管理云函数
// 功能：任务模板管理、值日安排（小组轮流+任务分派）、值日检查+加减分、提醒通知

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const batchQuery = require('./utils/batchQuery');

const { getCallerInfo, requireTeacher, requireTeacherOrDelegated, AUTH_ERRORS } = require('./utils/auth');

// 生成唯一ID
function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

// 获取今天的日期字符串 YYYY-MM-DD
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 获取星期几中文
function getWeekday(dateStr) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return '星期' + weekdays[new Date(dateStr).getDay()];
}

// 获取第几周（从学期开始算）
function getWeekNumber(semesterStartDate) {
  const start = new Date(semesterStartDate);
  const now = new Date();
  const diff = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));
  return diff + 1;
}

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const classId = data && data.class_id
    const caller = await getCallerInfo(event, classId)

    const TEACHER_ONLY_ACTIONS = ['addTemplate', 'updateTemplate', 'deleteTemplate',
      'saveRotation', 'advanceRotation', 'arrangeDuty',
      'updateDutyTask', 'deleteDutyTask']

    const DELEGATED_ACTIONS = ['inspectTask', 'batchInspect']

    if (TEACHER_ONLY_ACTIONS.includes(action)) {
      requireTeacher(caller)
    } else if (DELEGATED_ACTIONS.includes(action)) {
      await requireTeacherOrDelegated(caller, 'duty', 'check')
    }

    switch (action) {
      // ========== 任务模板管理 ==========
      case 'getTemplates': return await getTemplates(data);
      case 'addTemplate': return await addTemplate(data, caller.openid);
      case 'updateTemplate': return await updateTemplate(data);
      case 'deleteTemplate': return await deleteTemplate(data);

      // ========== 值日轮转配置 ==========
      case 'getRotation': return await getRotation(data);
      case 'saveRotation': return await saveRotation(data, caller.openid);
      case 'advanceRotation': return await advanceRotation(data);

      // ========== 值日安排（任务分派） ==========
      case 'arrangeDuty': return await arrangeDuty(data, caller.openid);
      case 'getDutyTasks': return await getDutyTasks(data);
      case 'getDutyTasksByDate': return await getDutyTasksByDate(data);

      // ========== 值日检查+加减分 ==========
      case 'inspectTask': return await inspectTask(data, caller.openid);
      case 'batchInspect': return await batchInspect(data, caller.openid);

      // ========== 我的值日（学生端） ==========
      case 'getMyDutyTasks': return await getMyDutyTasks(data);
      case 'getMyReminders': return await getMyReminders(data);
      case 'markReminderRead': return await markReminderRead(data);

      // ========== 值日任务修改/删除 ==========
      case 'updateDutyTask': return await updateDutyTask(data, caller.openid);
      case 'deleteDutyTask': return await deleteDutyTask(data, caller.openid);

      // ========== 值日统计 ==========
      case 'getDutyStats': return await getDutyStats(data);

      default:
        return { success: false, message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error(`manageDuty ${action} error:`, err);
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code };
    }
    return { success: false, message: err.message || '操作失败' };
  }
};

// ==================== 任务模板管理 ====================

async function getTemplates(data) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const res = await db.collection('duty_task_template')
    .where({ class_id, is_active: _.neq(false) })
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'desc')
    .limit(100)
    .get();

  return { success: true, data: res.data };
}

async function addTemplate(data, openid) {
  const { class_id, name, description, category, icon, default_score, deduction_score, requires_inspection, sort_order } = data;
  if (!class_id || !name) return { success: false, message: '缺少必要参数' };

  const template_id = generateId('tmpl');
  const now = db.serverDate();

  await db.collection('duty_task_template').add({
    data: {
      template_id,
      name,
      description: description || '',
      category: category || '其他',
      icon: icon || '🧹',
      default_score: default_score || 2,
      deduction_score: deduction_score || -2,
      requires_inspection: requires_inspection !== false,
      sort_order: sort_order || 0,
      is_active: true,
      class_id,
      created_by: openid,
      created_at: now,
      updated_at: now
    }
  });

  return { success: true, data: { template_id } };
}

async function updateTemplate(data) {
  const { _id, name, description, category, icon, default_score, deduction_score, requires_inspection, sort_order, is_active } = data;
  if (!_id) return { success: false, message: '缺少模板ID' };

  const updateData = { updated_at: db.serverDate() };
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (category !== undefined) updateData.category = category;
  if (icon !== undefined) updateData.icon = icon;
  if (default_score !== undefined) updateData.default_score = default_score;
  if (deduction_score !== undefined) updateData.deduction_score = deduction_score;
  if (requires_inspection !== undefined) updateData.requires_inspection = requires_inspection;
  if (sort_order !== undefined) updateData.sort_order = sort_order;
  if (is_active !== undefined) updateData.is_active = is_active;

  await db.collection('duty_task_template').doc(_id).update({ data: updateData });
  return { success: true };
}

async function deleteTemplate(data) {
  const { _id } = data;
  if (!_id) return { success: false, message: '缺少模板ID' };

  // 软删除
  await db.collection('duty_task_template').doc(_id).update({
    data: { is_active: false, updated_at: db.serverDate() }
  });
  return { success: true };
}

// ==================== 值日轮转配置 ====================

async function getRotation(data) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const res = await db.collection('duty_rotation')
    .where({ class_id, is_active: true })
    .limit(1)
    .get();

  if (res.data && res.data.length > 0) {
    return { success: true, data: res.data[0] };
  }
  return { success: true, data: null };
}

async function saveRotation(data, openid) {
  const { class_id, group_ids, rotation_mode, effective_weekdays, auto_advance } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };
  if (!group_ids || group_ids.length === 0) return { success: false, message: '请选择参与轮转的小组' };

  // 获取学期ID
  let semesterQuery = { status: 'active' };
  if (class_id) {
    semesterQuery = { class_id: class_id, status: 'active' };
  }
  const semesterRes = await db.collection('semesters')
    .where(semesterQuery)
    .limit(1)
    .get();
  if (semesterRes.data.length === 0 && class_id) {
    const fallbackRes = await db.collection('semesters')
      .where({ status: 'active' })
      .limit(1)
      .get();
    if (fallbackRes.data.length > 0) {
      semesterRes.data = fallbackRes.data;
    }
  }
  const semester_id = semesterRes.data && semesterRes.data.length > 0 ? semesterRes.data[0]._id : '';

  const now = db.serverDate();

  // 查看是否已有配置
  const existingRes = await db.collection('duty_rotation')
    .where({ class_id, is_active: true })
    .limit(1)
    .get();

  const rotationData = {
    group_ids,
    rotation_mode: rotation_mode || 'daily',
    effective_weekdays: effective_weekdays || ['一', '二', '三', '四', '五'],
    auto_advance: auto_advance !== false,
    semester_id,
    updated_at: now
  };

  if (existingRes.data && existingRes.data.length > 0) {
    // 更新
    await db.collection('duty_rotation').doc(existingRes.data[0]._id).update({
      data: rotationData
    });
    return { success: true, data: { rotation_id: existingRes.data[0].rotation_id } };
  } else {
    // 新建
    const rotation_id = generateId('rot');
    await db.collection('duty_rotation').add({
      data: {
        ...rotationData,
        rotation_id,
        class_id,
        current_index: 0,
        last_rotation_date: null,
        is_active: true,
        created_by: openid,
        created_at: now
      }
    });
    return { success: true, data: { rotation_id } };
  }
}

async function advanceRotation(data) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const res = await db.collection('duty_rotation')
    .where({ class_id, is_active: true })
    .limit(1)
    .get();

  if (!res.data || res.data.length === 0) {
    return { success: false, message: '未找到轮转配置' };
  }

  const rotation = res.data[0];
  const totalGroups = rotation.group_ids.length;
  const newIndex = (rotation.current_index + 1) % totalGroups;

  await db.collection('duty_rotation').doc(rotation._id).update({
    data: {
      current_index: newIndex,
      last_rotation_date: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return { success: true, data: { current_index: newIndex } };
}

// ==================== 值日安排（任务分派） ====================

async function arrangeDuty(data, openid) {
  const { class_id, duty_date, group_id, assignments } = data;
  // assignments: [{ student_id, student_name, template_id, task_name }]
  if (!class_id || !duty_date || !group_id) {
    return { success: false, message: '缺少必要参数' };
  }
  if (!assignments || assignments.length === 0) {
    return { success: false, message: '请分派至少一个任务' };
  }

  // 获取学期信息
  let semesterQuery = { status: 'active' };
  if (class_id) {
    semesterQuery = { class_id: class_id, status: 'active' };
  }
  const semesterRes = await db.collection('semesters').where(semesterQuery).limit(1).get();
  if (semesterRes.data.length === 0 && class_id) {
    const fallbackRes = await db.collection('semesters').where({ status: 'active' }).limit(1).get();
    if (fallbackRes.data.length > 0) {
      semesterRes.data = fallbackRes.data;
    }
  }
  const semester_id = semesterRes.data && semesterRes.data.length > 0 ? semesterRes.data[0]._id : '';
  const semester_start = semesterRes.data && semesterRes.data.length > 0 ? semesterRes.data[0].start_date : null;

  // 获取小组信息
  const groupRes = await db.collection('student_groups').doc(group_id).get();
  const group = groupRes.data;
  const group_name = group ? group.group_name : '';

  const weekday = getWeekday(duty_date);
  const week_number = semester_start ? getWeekNumber(semester_start) : 1;
  const now = db.serverDate();
  const createdTasks = [];
  const createdReminders = [];

  for (const assignment of assignments) {
    const { student_id, student_name, template_id, task_name } = assignment;
    if (!student_id) continue;

    // 检查是否已存在同一天同一学生同一任务
    const existRes = await db.collection('duty_task')
      .where({
        class_id,
        student_id,
        duty_date,
        template_id: template_id || '',
        status: _.neq('免值')
      })
      .limit(1)
      .get();

    if (existRes.data && existRes.data.length > 0) {
      continue; // 跳过重复
    }

    const task_id = generateId('task');

    const taskData = {
      task_id,
      template_id: template_id || '',
      task_name: task_name || '',
      group_id,
      group_name,
      student_id,
      student_name: student_name || '',
      class_id,
      semester_id,
      duty_date,
      week_number,
      weekday,
      status: '待完成',
      score_change: 0,
      completion_time: null,
      inspection: {
        is_inspected: false,
        inspector_id: '',
        inspector_name: '',
        inspector_role: '',
        inspection_time: null,
        inspection_score: 0,
        is_qualified: false,
        problems: '',
        problem_images: [],
        comment: ''
      },
      related_score_record_id: '',
      created_at: now,
      updated_at: now
    };

    await db.collection('duty_task').add({ data: taskData });
    createdTasks.push(task_id);

    // 立即创建duty_reminders通知
    const reminder_id = generateId('rmd');
    const leader_id = group.leader_id || '';
    const leader_name = group.leader_name || '';

    const reminderContent = `你被分配了值日任务【${task_name || '卫生值日'}】，日期：${duty_date}（${weekday}），请按时完成。`;

    const reminderData = {
      reminder_id,
      task_id,
      class_id,
      student_id,
      student_name: student_name || '',
      group_id,
      leader_id,
      leader_name,
      duty_date,
      task_name: task_name || '',
      reminder_type: '任务分配',
      reminder_content: reminderContent,
      reminder_time: now,
      reminder_status: '已发送',
      is_read: false,
      read_time: null,
      consecutive_incomplete: 0,
      created_at: now
    };

    await db.collection('duty_reminders').add({ data: reminderData });
    createdReminders.push(reminder_id);

    // 异步发送微信订阅消息（不阻塞主流程）
    sendDutyReminder(reminderData, student_id, class_id).catch(err => {
      console.error('发送订阅消息失败(不阻塞主流程):', err);
      // 推送失败则更新reminder状态
      db.collection('duty_reminders').where({ reminder_id }).limit(1).get().then(r => {
        if (r.data && r.data.length > 0) {
          db.collection('duty_reminders').doc(r.data[0]._id).update({
            data: { reminder_status: '推送失败' }
          });
        }
      });
    });
  }

  return {
    success: true,
    data: {
      task_count: createdTasks.length,
      reminder_count: createdReminders.length,
      task_ids: createdTasks
    }
  };
}

async function getDutyTasks(data) {
  const { class_id, duty_date, status, group_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const query = { class_id };
  if (duty_date) query.duty_date = duty_date;
  if (status) query.status = status;
  if (group_id) query.group_id = group_id;

  const res = await db.collection('duty_task')
    .where(query)
    .orderBy('duty_date', 'desc')
    .orderBy('created_at', 'asc')
    .limit(200)
    .get();

  return { success: true, data: res.data };
}

async function getDutyTasksByDate(data) {
  const { class_id, start_date, end_date } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const query = { class_id };
  if (start_date && end_date) {
    query.duty_date = _.gte(start_date).and(_.lte(end_date));
  } else if (start_date) {
    query.duty_date = _.gte(start_date);
  }

  const res = await db.collection('duty_task')
    .where(query)
    .orderBy('duty_date', 'desc')
    .limit(500)
    .get();

  return { success: true, data: res.data };
}

// ==================== 值日检查+加减分 ====================

async function inspectTask(data, openid) {
  const { task_id, is_qualified, inspection_score, problems, problem_images, comment, inspector_name, inspector_role, score_change } = data;
  if (!task_id) return { success: false, message: '缺少任务ID' };

  // 获取任务详情
  const taskRes = await db.collection('duty_task').where({ task_id }).limit(1).get();
  if (!taskRes.data || taskRes.data.length === 0) {
    return { success: false, message: '任务不存在' };
  }

  const task = taskRes.data[0];
  const now = db.serverDate();

  // 计算积分变化
  let finalScoreChange = 0;
  if (is_qualified) {
    // 合格：加分
    finalScoreChange = score_change || task.inspection?.default_score || 2;
    if (finalScoreChange <= 0) finalScoreChange = 2;
  } else {
    // 不合格：扣分
    finalScoreChange = score_change || task.inspection?.deduction_score || -2;
    if (finalScoreChange >= 0) finalScoreChange = -2;
  }

  // 更新任务状态
  const newStatus = is_qualified ? '已完成' : '未完成';
  const inspectionData = {
    is_inspected: true,
    inspector_id: openid,
    inspector_name: inspector_name || '',
    inspector_role: inspector_role || '卫生委员',
    inspection_time: now,
    inspection_score: inspection_score || (is_qualified ? 5 : 1),
    is_qualified,
    problems: problems || '',
    problem_images: problem_images || [],
    comment: comment || ''
  };

  // 先同步积分到学生个人积分（如果失败则不更新任务状态）
  let scoreRecordId = '';
  if (finalScoreChange !== 0) {
    try {
      scoreRecordId = await syncScoreToStudent(task, finalScoreChange, inspectionData, openid);
    } catch (scoreErr) {
      console.error('积分同步失败:', scoreErr);
      return { success: false, message: '积分同步失败，请重试: ' + (scoreErr.message || '') };
    }
  }

  // 积分同步成功后，才更新任务状态
  await db.collection('duty_task').doc(task._id).update({
    data: {
      status: newStatus,
      score_change: finalScoreChange,
      completion_time: is_qualified ? now : null,
      inspection: inspectionData,
      related_score_record_id: scoreRecordId || '',
      updated_at: now
    }
  });

  // 创建检查结果提醒
  const reminderContent = is_qualified
    ? `你${task.duty_date}的值日任务【${task.task_name}】检查合格，获得${finalScoreChange}积分。`
    : `你${task.duty_date}的值日任务【${task.task_name}】检查不合格，扣除${Math.abs(finalScoreChange)}积分。${problems ? '问题：' + problems : ''}`;

  await db.collection('duty_reminders').add({
    data: {
      reminder_id: generateId('rmd'),
      task_id,
      class_id: task.class_id,
      student_id: task.student_id,
      student_name: task.student_name,
      group_id: task.group_id,
      leader_id: '',
      leader_name: '',
      duty_date: task.duty_date,
      task_name: task.task_name,
      reminder_type: '检查结果',
      reminder_content: reminderContent,
      reminder_time: now,
      reminder_status: '已发送',
      is_read: false,
      read_time: null,
      consecutive_incomplete: is_qualified ? 0 : await getConsecutiveIncomplete(task.student_id, task.class_id),
      created_at: now
    }
  });

  return {
    success: true,
    data: {
      status: newStatus,
      score_change: finalScoreChange,
      score_record_id: scoreRecordId
    }
  };
}

// 批量检查
async function batchInspect(data, openid) {
  const { tasks } = data;
  // tasks: [{ task_id, is_qualified, inspection_score, problems, comment, inspector_name, inspector_role }]
  if (!tasks || tasks.length === 0) return { success: false, message: '无任务数据' };

  const results = [];
  for (const t of tasks) {
    const result = await inspectTask({
      ...t,
      problem_images: t.problem_images || [],
      score_change: t.score_change
    }, openid);
    results.push(result);
  }

  return { success: true, data: { total: results.length, results } };
}

// 同步积分到学生个人积分
async function syncScoreToStudent(task, scoreChange, inspection, openid) {
  const record_id = generateId('sr');

  // 获取学期
  const { class_id } = task;
  let semesterQuery = { status: 'active' };
  if (class_id) {
    semesterQuery = { class_id: class_id, status: 'active' };
  }
  const semesterRes = await db.collection('semesters').where(semesterQuery).limit(1).get();
  if (semesterRes.data.length === 0 && class_id) {
    const fallbackRes = await db.collection('semesters').where({ status: 'active' }).limit(1).get();
    if (fallbackRes.data.length > 0) {
      semesterRes.data = fallbackRes.data;
    }
  }
  const semester_id = semesterRes.data && semesterRes.data.length > 0 ? semesterRes.data[0]._id : '';

  // 读取class_settings中的卫生同步配置
  let hygieneSyncEnabled = true;
  let hygieneConversionRatio = 1.0;
  try {
    const settingsRes = await db.collection('class_settings')
      .where({ class_id: class_id })
      .limit(1)
      .get();
    if (settingsRes.data && settingsRes.data.length > 0) {
      const cs = settingsRes.data[0];
      hygieneSyncEnabled = cs.hygiene_sync_enabled !== false;
      hygieneConversionRatio = cs.hygiene_conversion_ratio !== undefined ? cs.hygiene_conversion_ratio : 1.0;
    }
  } catch (err) {
    console.error('读取卫生同步配置失败，使用默认值:', err);
  }

  // 如果未开启同步，直接返回
  if (!hygieneSyncEnabled) {
    return '';
  }

  // 按折算比例计算实际积分变化
  const convertedScoreChange = Math.round(scoreChange * hygieneConversionRatio * 100) / 100;

  // 获取积分项目
  const scoreItemRes = await db.collection('score_items')
    .where(
      _.or(
        { name: db.RegExp({ regexp: '卫生', options: 'i' }) },
        { category: '卫生' }
      ).and({
        is_active: _.neq(false)
      })
    )
    .limit(1)
    .get();

  const item_id = scoreItemRes.data && scoreItemRes.data.length > 0 ? scoreItemRes.data[0].item_id : '';
  const item_name = scoreItemRes.data && scoreItemRes.data.length > 0 ? scoreItemRes.data[0].name : '卫生值日';

  const now = db.serverDate();
  const ratioLabel = hygieneConversionRatio !== 1.0 ? ` (折算比例${hygieneConversionRatio})` : '';

  // 调用统一积分变更云函数
  try {
    await cloud.callFunction({
      name: 'scoreManager',
      data: {
        action: 'applyScoreChange',
        data: {
          student_id: task.student_id,
          class_id: task.class_id || '',
          semester_id: semester_id || '',
          score_change: convertedScoreChange,
          source_type: '卫生值日',
          item_id: item_id || '',
          item_name: item_name || '卫生值日',
          rule_name: item_name || '卫生值日',
          rule_code: 'DUTY_CHECK',
          reason_detail: `${task.duty_date}值日任务【${task.task_name}】${scoreChange > 0 ? '合格加分' : '不合格扣分'}${ratioLabel}${inspection.comment ? '：' + inspection.comment : ''}`,
          recorder_openid: openid,
          recorder_name: inspection.inspector_name || '系统',
          date: task.duty_date || ''
        }
      }
    });
  } catch (scoreErr) {
    console.error('调用统一积分云函数失败，回退直接写入:', scoreErr);
    await db.collection('score_records').add({
      data: {
        record_id,
        student_id: task.student_id,
        class_id: task.class_id || '',
        item_id,
        score_change: convertedScoreChange,
        reason_detail: `${task.duty_date}值日任务【${task.task_name}】${scoreChange > 0 ? '合格加分' : '不合格扣分'}${ratioLabel}${inspection.comment ? '：' + inspection.comment : ''}`,
        date: now,
        recorder_name: inspection.inspector_name || '系统',
        recorder_openid: openid,
        semester_id,
        source_type: '卫生值日',
        source_record_id: task.task_id,
        approval_status: '已通过',
        created_at: now
      }
    });
    await db.collection('students')
      .where({ student_id: task.student_id })
      .update({
        data: { current_score: _.inc(convertedScoreChange), updated_at: now }
      });
  }

  return record_id;
}

// 获取连续未完成天数
async function getConsecutiveIncomplete(studentId, classId) {
  const today = getTodayStr();
  let count = 0;
  let checkDate = new Date();

  for (let i = 0; i < 7; i++) {
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    const res = await db.collection('duty_task')
      .where({
        student_id: studentId,
        class_id: classId,
        duty_date: dateStr,
        status: '未完成'
      })
      .count();

    if (res.total > 0) {
      count++;
    } else {
      break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return count;
}

// ==================== 我的值日（学生端） ====================

async function getMyDutyTasks(data) {
  const { student_id, class_id, status } = data;
  if (!student_id) return { success: false, message: '缺少学生ID' };

  const query = { student_id };
  if (class_id) query.class_id = class_id;
  if (status) query.status = status;

  const tasks = await batchQuery.getAllRecords('duty_task', query, 'duty_date', 'desc');

  return { success: true, data: tasks };
}

async function getMyReminders(data) {
  const { student_id, is_read } = data;
  if (!student_id) return { success: false, message: '缺少学生ID' };

  const query = { student_id };
  if (is_read !== undefined) query.is_read = is_read;

  const res = await db.collection('duty_reminders')
    .where(query)
    .orderBy('created_at', 'desc')
    .limit(50)
    .get();

  return { success: true, data: res.data };
}

async function markReminderRead(data) {
  const { reminder_id } = data;
  if (!reminder_id) return { success: false, message: '缺少提醒ID' };

  const res = await db.collection('duty_reminders')
    .where({ reminder_id })
    .limit(1)
    .get();

  if (res.data && res.data.length > 0) {
    await db.collection('duty_reminders').doc(res.data[0]._id).update({
      data: {
        is_read: true,
        read_time: db.serverDate()
      }
    });
  }

  return { success: true };
}

// ==================== 值日任务修改/删除 ====================

async function updateDutyTask(data, openid) {
  const { task_id, class_id, role, task_name, duty_date, student_id, student_name, score_for_qualified, deduction_for_unqualified, group_name } = data;
  if (!task_id || !class_id) return { success: false, message: '缺少必要参数' };

  if (role !== 'admin' && role !== 'head_teacher' && role !== 'class_cadre') {
    return { success: false, message: '无权限修改值日任务' };
  }

  const taskRes = await db.collection('duty_task').where({ task_id, class_id }).limit(1).get();
  if (!taskRes.data || taskRes.data.length === 0) {
    return { success: false, message: '任务不存在' };
  }

  const task = taskRes.data[0];
  const now = db.serverDate();

  const updateData = { updated_at: now };
  if (task_name !== undefined) updateData.task_name = task_name;
  if (duty_date !== undefined) updateData.duty_date = duty_date;
  if (student_id !== undefined) updateData.student_id = student_id;
  if (student_name !== undefined) updateData.student_name = student_name;
  if (score_for_qualified !== undefined) {
    if (!updateData.inspection) updateData.inspection = { ...task.inspection };
    updateData.inspection.default_score = score_for_qualified;
  }
  if (deduction_for_unqualified !== undefined) {
    if (!updateData.inspection) updateData.inspection = { ...task.inspection };
    updateData.inspection.deduction_score = deduction_for_unqualified;
  }
  if (group_name !== undefined) updateData.group_name = group_name;

  await db.collection('duty_task').doc(task._id).update({ data: updateData });

  if (duty_date !== undefined && duty_date !== task.duty_date) {
    const reminderRes = await db.collection('duty_reminders')
      .where({ task_id, class_id })
      .get();
    if (reminderRes.data && reminderRes.data.length > 0) {
      const weekday = getWeekday(duty_date);
      for (const reminder of reminderRes.data) {
        const newContent = `你被分配了值日任务【${task_name || task.task_name}】，日期：${duty_date}（${weekday}），请按时完成。`;
        await db.collection('duty_reminders').doc(reminder._id).update({
          data: {
            duty_date,
            task_name: task_name || task.task_name,
            reminder_content: newContent,
            reminder_time: now
          }
        });
      }
    }
  }

  if (student_id !== undefined && student_id !== task.student_id) {
    const reminderRes = await db.collection('duty_reminders')
      .where({ task_id, class_id })
      .get();
    if (reminderRes.data && reminderRes.data.length > 0) {
      for (const reminder of reminderRes.data) {
        await db.collection('duty_reminders').doc(reminder._id).update({
          data: {
            student_id,
            student_name: student_name || '',
            reminder_time: now
          }
        });
      }
    }
  }

  return { success: true, data: { task_id } };
}

async function deleteDutyTask(data, openid) {
  const { task_id, class_id, role } = data;
  if (!task_id || !class_id) return { success: false, message: '缺少必要参数' };

  if (role !== 'admin' && role !== 'head_teacher' && role !== 'class_cadre') {
    return { success: false, message: '无权限删除值日任务' };
  }

  const taskRes = await db.collection('duty_task').where({ task_id, class_id }).limit(1).get();
  if (!taskRes.data || taskRes.data.length === 0) {
    return { success: false, message: '任务不存在' };
  }

  const task = taskRes.data[0];
  const now = db.serverDate();

  if ((task.status === '已完成' || task.status === '未完成') && task.score_change !== 0) {
    if (task.related_score_record_id) {
      const scoreRecordRes = await db.collection('score_records')
        .where({ record_id: task.related_score_record_id })
        .limit(1)
        .get();
      if (scoreRecordRes.data && scoreRecordRes.data.length > 0) {
        await db.collection('score_records').doc(scoreRecordRes.data[0]._id).remove();
      }
    } else {
      const scoreRecordRes = await db.collection('score_records')
        .where({ source_type: '卫生值日', source_record_id: task_id })
        .limit(1)
        .get();
      if (scoreRecordRes.data && scoreRecordRes.data.length > 0) {
        await db.collection('score_records').doc(scoreRecordRes.data[0]._id).remove();
      }
    }

    try {
      await db.collection('students')
        .where({ student_id: task.student_id })
        .update({
          data: {
            current_score: _.inc(-task.score_change),
            updated_at: now
          }
        });
    } catch (rollbackErr) {
      console.error('积分回退失败:', rollbackErr);
    }
  }

  await db.collection('duty_reminders')
    .where({ task_id, class_id })
    .remove();

  await db.collection('duty_task').doc(task._id).remove();

  return { success: true, data: { task_id, score_rolled_back: (task.status === '已完成' || task.status === '未完成') && task.score_change !== 0 } };
}

// ==================== 值日统计 ====================

async function getDutyStats(data) {
  const { class_id, start_date, end_date } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const query = { class_id };
  if (start_date && end_date) {
    query.duty_date = _.gte(start_date).and(_.lte(end_date));
  } else if (start_date) {
    query.duty_date = _.gte(start_date);
  }

  // 获取所有任务
  const tasksRes = await db.collection('duty_task')
    .where(query)
    .limit(1000)
    .get();

  const tasks = tasksRes.data || [];

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === '已完成').length;
  const incompleteTasks = tasks.filter(t => t.status === '未完成').length;
  const pendingTasks = tasks.filter(t => t.status === '待完成').length;
  const inspectedTasks = tasks.filter(t => t.inspection && t.inspection.is_inspected).length;
  const qualifiedTasks = tasks.filter(t => t.inspection && t.inspection.is_qualified).length;

  // 按小组统计
  const groupStats = {};
  tasks.forEach(t => {
    if (!groupStats[t.group_name]) {
      groupStats[t.group_name] = { total: 0, completed: 0, incomplete: 0, qualified: 0 };
    }
    groupStats[t.group_name].total++;
    if (t.status === '已完成') groupStats[t.group_name].completed++;
    if (t.status === '未完成') groupStats[t.group_name].incomplete++;
    if (t.inspection && t.inspection.is_qualified) groupStats[t.group_name].qualified++;
  });

  // 按任务模板统计
  const taskTypeStats = {};
  tasks.forEach(t => {
    const name = t.task_name || '未分类';
    if (!taskTypeStats[name]) {
      taskTypeStats[name] = { total: 0, completed: 0, incomplete: 0 };
    }
    taskTypeStats[name].total++;
    if (t.status === '已完成') taskTypeStats[name].completed++;
    if (t.status === '未完成') taskTypeStats[name].incomplete++;
  });

  return {
    success: true,
    data: {
      totalTasks,
      completedTasks,
      incompleteTasks,
      pendingTasks,
      inspectedTasks,
      qualifiedTasks,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0,
      qualificationRate: inspectedTasks > 0 ? (qualifiedTasks / inspectedTasks * 100).toFixed(1) : 0,
      groupStats,
      taskTypeStats
    }
  };
}

// ==================== 订阅消息推送 ====================

async function sendDutyReminder(reminderData, student_id, class_id) {
  // 通过 user_class_relation 获取学生的 openid
  let studentOpenid = '';

  // 先尝试通过 user_openid 字段查询
  let userRes = await db.collection('user_class_relation')
    .where({ student_id, class_id, user_openid: _.neq(null) })
    .limit(1)
    .get();

  if (userRes.data && userRes.data.length > 0 && userRes.data[0].user_openid) {
    studentOpenid = userRes.data[0].user_openid;
  } else {
    // fallback: 通过 _openid 查询
    userRes = await db.collection('user_class_relation')
      .where({ student_id, class_id, _openid: _.neq(null) })
      .limit(1)
      .get();

    if (userRes.data && userRes.data.length > 0 && userRes.data[0]._openid) {
      studentOpenid = userRes.data[0]._openid;
    }
  }

  if (!studentOpenid) {
    console.warn('未找到学生的openid，无法推送订阅消息, student_id:', student_id);
    return;
  }

  // 发送微信订阅消息
  // 注意：需要在小程序管理后台配置对应的模板ID
  // 模板ID需要在实际部署时替换
  const templateId = process.env.DUTY_REMINDER_TEMPLATE_ID || '';

  if (!templateId) {
    console.warn('未配置DUTY_REMINDER_TEMPLATE_ID，跳过订阅消息推送');
    return;
  }

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: studentOpenid,
      templateid: templateId,
      page: `subPages/duty/myduty/myduty`,
      data: {
        thing1: { value: reminderData.task_name || '卫生值日' },
        thing2: { value: reminderData.duty_date },
        thing3: { value: reminderData.reminder_content.length > 20 ? reminderData.reminder_content.substring(0, 20) : reminderData.reminder_content }
      }
    });

    // 推送成功，更新reminder状态
    const reminderRes = await db.collection('duty_reminders')
      .where({ reminder_id: reminderData.reminder_id })
      .limit(1)
      .get();

    if (reminderRes.data && reminderRes.data.length > 0) {
      await db.collection('duty_reminders').doc(reminderRes.data[0]._id).update({
        data: { reminder_status: '推送成功' }
      });
    }

    console.log('订阅消息推送成功, student_id:', student_id);
  } catch (sendErr) {
    console.error('订阅消息推送失败:', sendErr);
    throw sendErr;
  }
}
