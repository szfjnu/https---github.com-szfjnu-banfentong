// 处分管理云函数
// 功能：处分级别配置、处分记录CRUD、撤销申请管理、通知推送

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { getCallerInfo, requireClassAccess, requireTeacher } = require('./utils/auth');
const { withTransaction } = require('./utils/transaction');

// 生成唯一ID
function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

// 获取今天日期字符串
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 计算到期日期
function calcExpirationDate(issueDate, months) {
  const d = new Date(issueDate);
  d.setMonth(d.getMonth() + months);
  return d;
}

// 默认处分级别配置
const DEFAULT_LEVELS = [
  { level_code: 'verbal_warning', level_name: '口头警告', level_order: 1, probation_months: 1, thought_reports: 1, service_hours: 2, score_deduction: 5, color: '#52c41a' },
  { level_code: 'written_warning', level_name: '通报批评', level_order: 2, probation_months: 2, thought_reports: 2, service_hours: 4, score_deduction: 10, color: '#faad14' },
  { level_code: 'warning', level_name: '警告', level_order: 3, probation_months: 3, thought_reports: 3, service_hours: 6, score_deduction: 15, color: '#fa8c16' },
  { level_code: 'serious_warning', level_name: '严重警告', level_order: 4, probation_months: 4, thought_reports: 4, service_hours: 8, score_deduction: 20, color: '#ff4d4f' },
  { level_code: 'demerit', level_name: '记过', level_order: 5, probation_months: 6, thought_reports: 6, service_hours: 12, score_deduction: 30, color: '#cf1322' },
  { level_code: 'probation', level_name: '留校察看', level_order: 6, probation_months: 12, thought_reports: 12, service_hours: 20, score_deduction: 50, color: '#820014' },
  { level_code: 'expulsion', level_name: '试读（开除学籍）', level_order: 7, probation_months: 0, thought_reports: 0, service_hours: 0, score_deduction: 100, color: '#595959' }
];

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const caller = await getCallerInfo(event, data?.class_id || data?.classId);

    switch (action) {
      case 'getLevelConfigs': return await getLevelConfigs(data, caller);
      case 'initLevelConfigs': requireClassAccess(caller, data.class_id, ['head_teacher', 'admin']); return await initLevelConfigs(data, caller);
      case 'updateLevelConfig': requireTeacher(caller); return await updateLevelConfig(data, caller);
      case 'addLevelConfig': requireClassAccess(caller, data.class_id, ['head_teacher', 'admin']); return await addLevelConfig(data, caller);
      case 'deleteLevelConfig': requireClassAccess(caller, data.class_id, ['head_teacher', 'admin']); return await deleteLevelConfig(data, caller);

      case 'getDisciplineRecords': return await getDisciplineRecords(data, caller);
      case 'addDisciplineRecord': requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin']); return await addDisciplineRecord(data, caller);
      case 'updateDisciplineRecord': requireTeacher(caller); return await updateDisciplineRecord(data, caller);
      case 'deleteDisciplineRecord': requireTeacher(caller); return await deleteDisciplineRecord(data, caller);
      case 'getDisciplineDetail': return await getDisciplineDetail(data, caller);
      case 'getMyDisciplineRecords': return await getMyDisciplineRecords(data, caller);

      case 'submitRevocationApplication': return await submitRevocationApplication(data, caller);
      case 'getRevocationApplications': return await getRevocationApplications(data, caller);
      case 'reviewRevocationApplication': requireClassAccess(caller, data.class_id, ['head_teacher', 'admin']); return await reviewRevocationApplication(data, caller);
      case 'getMyRevocationApplications': return await getMyRevocationApplications(data, caller);

      case 'submitThoughtReport': return await submitThoughtReport(data, caller);
      case 'submitServiceRecord': return await submitServiceRecord(data, caller);
      case 'getThoughtReports': return await getThoughtReports(data, caller);
      case 'getServiceRecords': return await getServiceRecords(data, caller);

      case 'getDisciplineStats': return await getDisciplineStats(data, caller);

      default:
        return { success: false, message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error(`manageDiscipline ${action} error:`, err);
    return { success: false, message: err.message || '操作失败' };
  }
};

// ==================== 处分级别配置 ====================

async function getLevelConfigs(data, caller) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const res = await db.collection('discipline_level_config')
    .where({ class_id, is_deleted: _.neq(true) })
    .orderBy('level_order', 'asc')
    .limit(50)
    .get();

  // 如果没有配置，返回默认配置（不写入数据库）
  if (res.data.length === 0) {
    return { success: true, data: DEFAULT_LEVELS, isDefault: true };
  }

  return { success: true, data: res.data };
}

async function initLevelConfigs(data, caller) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  // 检查是否已初始化
  const existing = await db.collection('discipline_level_config')
    .where({ class_id, is_deleted: _.neq(true) })
    .count();

  if (existing.total > 0) {
    return { success: false, message: '已初始化，请使用编辑功能' };
  }

  const now = db.serverDate();
  const tasks = DEFAULT_LEVELS.map(level => {
    const config_id = generateId('dlc');
    return db.collection('discipline_level_config').add({
      data: {
        config_id,
        class_id,
        ...level,
        is_active: true,
        is_deleted: false,
        created_by: caller.openid,
        created_at: now,
        updated_at: now
      }
    });
  });

  await Promise.all(tasks);
  return { success: true, message: '初始化成功' };
}

async function addLevelConfig(data, caller) {
  const { class_id, level_code, level_name, level_order, probation_months, thought_reports, service_hours, score_deduction, color } = data;
  if (!class_id || !level_name) return { success: false, message: '缺少必要参数' };

  const config_id = generateId('dlc');
  const now = db.serverDate();

  await db.collection('discipline_level_config').add({
    data: {
      config_id,
      class_id,
      level_code: level_code || generateId('lc'),
      level_name,
      level_order: level_order || 99,
      probation_months: probation_months || 0,
      thought_reports: thought_reports || 0,
      service_hours: service_hours || 0,
      score_deduction: score_deduction || 0,
      color: color || '#faad14',
      is_active: true,
      is_deleted: false,
      created_by: caller.openid,
      created_at: now,
      updated_at: now
    }
  });

  return { success: true, message: '添加成功' };
}

async function updateLevelConfig(data, caller) {
  const { config_id, level_name, level_order, probation_months, thought_reports, service_hours, score_deduction, color, is_active } = data;
  if (!config_id) return { success: false, message: '缺少配置ID' };

  const updateData = { updated_at: db.serverDate() };
  if (level_name !== undefined) updateData.level_name = level_name;
  if (level_order !== undefined) updateData.level_order = level_order;
  if (probation_months !== undefined) updateData.probation_months = probation_months;
  if (thought_reports !== undefined) updateData.thought_reports = thought_reports;
  if (service_hours !== undefined) updateData.service_hours = service_hours;
  if (score_deduction !== undefined) updateData.score_deduction = score_deduction;
  if (color !== undefined) updateData.color = color;
  if (is_active !== undefined) updateData.is_active = is_active;

  await db.collection('discipline_level_config')
    .where({ config_id })
    .update({ data: updateData });

  return { success: true, message: '更新成功' };
}

async function deleteLevelConfig(data, caller) {
  const { config_id } = data;
  if (!config_id) return { success: false, message: '缺少配置ID' };

  // 软删除
  await db.collection('discipline_level_config')
    .where({ config_id })
    .update({ data: { is_deleted: true, updated_at: db.serverDate() } });

  return { success: true, message: '删除成功' };
}

// ==================== 处分记录管理 ====================

async function getDisciplineRecords(data, caller) {
  const { class_id, status, student_id, page = 1, pageSize = 20 } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  let query = { class_id, is_deleted: _.neq(true) };
  if (status) query.status = status;
  if (student_id) query.student_id = student_id;

  const total = (await db.collection('discipline_records').where(query).count()).total;
  const res = await db.collection('discipline_records')
    .where(query)
    .orderBy('issue_date', 'desc')
    .orderBy('created_at', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return { success: true, data: res.data, total, page, pageSize };
}

async function getMyDisciplineRecords(data, caller) {
  const { student_id } = data;
  if (!student_id) return { success: false, message: '缺少学号' };

  const res = await db.collection('discipline_records')
    .where({ student_id, is_deleted: _.neq(true) })
    .orderBy('issue_date', 'desc')
    .limit(50)
    .get();

  // 获取每个处分的撤销申请和服务令/思想汇报进度
  const records = res.data;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    // 获取思想汇报完成数
    const thoughtRes = await db.collection('discipline_thought_reports')
      .where({ discipline_record_id: record.record_id, status: 'approved' })
      .count();
    record.thought_completed = thoughtRes.total;

    // 获取服务令完成小时数
    const serviceRes = await db.collection('discipline_service_records')
      .where({ discipline_record_id: record.record_id, status: 'approved' })
      .get();
    record.service_completed_hours = serviceRes.data.reduce((sum, r) => sum + (r.hours || 0), 0);

    // 获取撤销申请
    const revokeRes = await db.collection('revocation_applications')
      .where({ discipline_record_id: record.record_id })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
    record.latestRevocation = revokeRes.data.length > 0 ? revokeRes.data[0] : null;
  }

  return { success: true, data: records };
}

async function addDisciplineRecord(data, caller) {
  const { class_id, student_id, student_name, level_config_id, level_name, reason, issue_date, issuer, document_id, score_deduction, probation_months, thought_reports_required, service_hours_required, affects_excellence_award, semester_id } = data;
  if (!class_id || !student_id || !level_name || !reason) {
    return { success: false, message: '缺少必要参数' };
  }

  const record_id = generateId('dr');
  const now = db.serverDate();
  const issueDate = issue_date || getTodayStr();

  // 计算到期日期
  let expiration_date = null;
  if (probation_months > 0) {
    expiration_date = calcExpirationDate(issueDate, probation_months);
  }

  // 获取当前活跃处分（未撤销的），用于重置思想汇报和服务令的统计起点
  const activeRecords = await db.collection('discipline_records')
    .where({ student_id, status: 'active', is_deleted: _.neq(true) })
    .get();

  // 如果有旧处分未撤销，新处分的考察期从新处分生效日起重新统计
  // 这个逻辑在前端展示时处理

  const record = {
    record_id,
    class_id,
    student_id,
    student_name: student_name || '',
    level_config_id: level_config_id || '',
    discipline_level: level_name,
    reason,
    document_id: document_id || '',
    score_deduction: score_deduction || 0,
    issue_date: issueDate,
    issuer: issuer || '',
    status: 'active',
    is_revoked: false,
    probation_months: probation_months || 0,
    thought_reports_required: thought_reports_required || 0,
    service_hours_required: service_hours_required || 0,
    thought_completed: 0,
    service_completed_hours: 0,
    expiration_date,
    affects_excellence_award: affects_excellence_award !== false,
    semester_id: semester_id || '',
    created_by: caller.openid,
    is_deleted: false,
    created_at: now,
    updated_at: now
  };

  await db.collection('discipline_records').add({ data: record });

  if (score_deduction && score_deduction > 0) {
    try {
      const scoreRes = await cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'applyScoreChange',
          data: {
            student_id,
            class_id: class_id || '',
            semester_id: semester_id || '',
            score_change: -score_deduction,
            source_type: '处分扣分',
            item_id: 'discipline_deduction',
            item_name: `处分扣分：${level_name}`,
            rule_name: `处分扣分：${level_name}`,
            rule_code: 'DISCIPLINE',
            reason_detail: `处分扣分：${level_name} - ${reason}`,
            recorder_openid: caller.openid,
            recorder_name: issuer || '系统',
            date: issueDate
          }
        }
      });
      const scoreResult = scoreRes.result || {};
      if (scoreResult.success && scoreResult.data) {
        record.related_score_record_id = scoreResult.data.record_id;
        await db.collection('discipline_records')
          .where({ record_id })
          .update({ data: { related_score_record_id: scoreResult.data.record_id } });
      }
    } catch (err) {
      console.error('积分扣减失败:', err);
    }
  }

  try {
    await sendDisciplineNotification(class_id, student_id, student_name, level_name, reason, record_id);
  } catch (err) {
    console.error('通知发送失败:', err);
  }

  return { success: true, data: { record_id }, message: '处分记录添加成功' };
}

async function updateDisciplineRecord(data, caller) {
  const { record_id, reason, document_id, issuer, affects_excellence_award } = data;
  if (!record_id) return { success: false, message: '缺少记录ID' };

  const updateData = { updated_at: db.serverDate() };
  if (reason !== undefined) updateData.reason = reason;
  if (document_id !== undefined) updateData.document_id = document_id;
  if (issuer !== undefined) updateData.issuer = issuer;
  if (affects_excellence_award !== undefined) updateData.affects_excellence_award = affects_excellence_award;

  await db.collection('discipline_records')
    .where({ record_id })
    .update({ data: updateData });

  return { success: true, message: '更新成功' };
}

async function deleteDisciplineRecord(data, caller) {
  const { record_id } = data;
  if (!record_id) return { success: false, message: '缺少记录ID' };

  const now = db.serverDate();

  // 1. 查询处分记录，获取关联信息
  const recordRes = await db.collection('discipline_records')
    .where({ record_id, is_deleted: _.neq(true) })
    .limit(1)
    .get();

  if (!recordRes.data || recordRes.data.length === 0) {
    return { success: false, message: '记录不存在或已删除' };
  }

  const record = recordRes.data[0];
  const { student_id, score_deduction, related_score_record_id, class_id: recordClassId } = record;

  if (caller.role !== 'admin' && caller.classId !== recordClassId) {
    return { success: false, message: '无权删除其他班级的记录' };
  }

  // 2. 软删除处分记录
  await db.collection('discipline_records')
    .where({ record_id })
    .update({ data: { is_deleted: true, status: 'deleted', updated_at: now } });

  // 3. 恢复被扣分数 & 删除关联积分记录
  if (score_deduction && score_deduction > 0 && student_id) {
    try {
      // 删除关联的积分记录
      if (related_score_record_id) {
        // 按record_id删除
        const scoreRes = await db.collection('score_records')
          .where({ record_id: related_score_record_id })
          .limit(1)
          .get();
        if (scoreRes.data && scoreRes.data.length > 0) {
          await db.collection('score_records').doc(scoreRes.data[0]._id).remove();
        }
      } else {
        // 没有明确关联ID时，按source_record_id查找
        const scoreRes = await db.collection('score_records')
          .where({ source_record_id: record_id, source_type: '处分扣分' })
          .limit(5)
          .get();
        for (const sr of (scoreRes.data || [])) {
          await db.collection('score_records').doc(sr._id).remove();
        }
      }

      // 恢复学生积分（使用原子操作）
      await db.collection('students')
        .where({ student_id })
        .update({ data: { current_score: _.inc(score_deduction), updated_at: now } });
    } catch (err) {
      console.error('恢复积分失败:', err);
      // 不中断流程，积分恢复失败只记日志
    }
  }

  return { success: true, message: '删除成功，已恢复扣除的积分' };
}

async function getDisciplineDetail(data, caller) {
  const { record_id } = data;
  if (!record_id) return { success: false, message: '缺少记录ID' };

  const res = await db.collection('discipline_records')
    .where({ record_id })
    .get();

  if (res.data.length === 0) {
    return { success: false, message: '记录不存在' };
  }

  const record = res.data[0];

  // 获取思想汇报列表
  const thoughtRes = await db.collection('discipline_thought_reports')
    .where({ discipline_record_id: record_id })
    .orderBy('created_at', 'desc')
    .limit(20)
    .get();
  record.thoughtReports = thoughtRes.data;

  // 获取服务令记录
  const serviceRes = await db.collection('discipline_service_records')
    .where({ discipline_record_id: record_id })
    .orderBy('created_at', 'desc')
    .limit(20)
    .get();
  record.serviceRecords = serviceRes.data;

  // 获取撤销申请
  const revokeRes = await db.collection('revocation_applications')
    .where({ discipline_record_id: record_id })
    .orderBy('created_at', 'desc')
    .limit(10)
    .get();
  record.revocationApplications = revokeRes.data;

  return { success: true, data: record };
}

// ==================== 撤销申请 ====================

async function submitRevocationApplication(data, caller) {
  const { discipline_record_id, student_id, student_name, application_reason, supporting_materials, teacher_recommendation, student_self_reflection } = data;
  if (!discipline_record_id || !student_id || !application_reason) {
    return { success: false, message: '缺少必要参数' };
  }

  // 检查是否已有待审核的撤销申请
  const existing = await db.collection('revocation_applications')
    .where({ discipline_record_id, status: 'pending' })
    .count();

  if (existing.total > 0) {
    return { success: false, message: '已有待审核的撤销申请' };
  }

  const application_id = generateId('ra');
  const now = db.serverDate();

    await db.collection('revocation_applications').add({
    data: {
      application_id,
      discipline_record_id,
      student_id,
      student_name: student_name || '',
      application_date: getTodayStr(),
      application_reason,
      supporting_materials: supporting_materials || [],
      status: 'pending',
      reviewer_name: '',
      review_date: null,
      review_comments: '',
      teacher_recommendation: teacher_recommendation || '',
      student_self_reflection: student_self_reflection || '',
      created_by: caller.openid,
      created_at: now,
      updated_at: now
    }
  });

  // 通知班主任审核
  try {
    const recordRes = await db.collection('discipline_records')
      .where({ record_id: discipline_record_id })
      .get();
    if (recordRes.data.length > 0) {
      // 补充 class_id 到撤销申请记录
      const classId = recordRes.data[0].class_id;
      if (classId) {
        await db.collection('revocation_applications')
          .where({ application_id })
          .update({ data: { class_id: classId } });
      }
      await db.collection('notifications').add({
        data: {
          notification_id: generateId('ntf'),
          type: 'discipline_revoke',
          title: '撤销处分申请',
          content: `${student_name || '学生'}申请撤销${recordRes.data[0].discipline_level}处分`,
          target_type: 'head_teacher',
          class_id: recordRes.data[0].class_id,
          priority: 'important',
          action_type: 'view_detail',
          action_data: { discipline_record_id },
          sender_name: student_name || '学生',
          status: 'published',
          is_revoked: false,
          publish_time: now,
          created_at: now
        }
      });
    }
  } catch (err) {
    console.error('通知发送失败:', err);
  }

  return { success: true, data: { application_id }, message: '撤销申请已提交' };
}

async function getRevocationApplications(data, caller) {
  const { class_id, status, student_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  let query = {};
  if (status) query.status = status;
  if (student_id) query.student_id = student_id;

  // 先获取班级下所有处分记录ID
  const recordsRes = await db.collection('discipline_records')
    .where({ class_id, is_deleted: _.neq(true) })
    .field({ record_id: true })
    .limit(100)
    .get();

  const recordIds = recordsRes.data.map(r => r.record_id);
  if (recordIds.length === 0) {
    return { success: true, data: [] };
  }

  query.discipline_record_id = _.in(recordIds);

  const res = await db.collection('revocation_applications')
    .where(query)
    .orderBy('created_at', 'desc')
    .limit(50)
    .get();

  return { success: true, data: res.data };
}

async function reviewRevocationApplication(data, caller) {
  const { application_id, status, review_comments, reviewer_name } = data;
  if (!application_id || !status) return { success: false, message: '缺少必要参数' };

  if (!['approved', 'rejected'].includes(status)) {
    return { success: false, message: '无效的审核状态' };
  }

  const now = db.serverDate();

  await db.collection('revocation_applications')
    .where({ application_id })
    .update({
      data: {
        status,
        reviewer_name: reviewer_name || '',
        review_date: getTodayStr(),
        review_comments: review_comments || '',
        updated_at: now
      }
    });

  // 如果批准，更新处分记录状态
  if (status === 'approved') {
    const appRes = await db.collection('revocation_applications')
      .where({ application_id })
      .get();

    if (appRes.data.length > 0) {
      const app = appRes.data[0];
      await db.collection('discipline_records')
        .where({ record_id: app.discipline_record_id })
        .update({
          data: {
            is_revoked: true,
            status: 'revoked',
            revocation_date: getTodayStr(),
            revocation_reason: app.application_reason,
            updated_at: now
          }
        });

      // 通知学生
      try {
        await db.collection('notifications').add({
          data: {
            notification_id: generateId('ntf'),
            type: 'discipline_revoke',
            title: '处分撤销通知',
            content: `您的${app.discipline_record_id}处分已被撤销`,
            target_type: 'specific_user',
            target_user_id: app.student_id,
            class_id: '',
            priority: 'normal',
            action_type: 'view_detail',
            action_data: { discipline_record_id: app.discipline_record_id },
            sender_name: reviewer_name || '班主任',
            status: 'published',
            is_revoked: false,
            publish_time: now,
            created_at: now
          }
        });
      } catch (err) {
        console.error('通知发送失败:', err);
      }
    }
  }

  return { success: true, message: status === 'approved' ? '已批准撤销' : '已拒绝申请' };
}

async function getMyRevocationApplications(data, caller) {
  const { student_id } = data;
  if (!student_id) return { success: false, message: '缺少学号' };

  const res = await db.collection('revocation_applications')
    .where({ student_id })
    .orderBy('created_at', 'desc')
    .limit(20)
    .get();

  return { success: true, data: res.data };
}

// ==================== 思想汇报 / 服务令 ====================

async function submitThoughtReport(data, caller) {
  const { discipline_record_id, student_id, student_name, title, content, attachment_urls, report_month } = data;
  if (!discipline_record_id || !student_id || !content) {
    return { success: false, message: '缺少必要参数' };
  }

  const report_id = generateId('tr');
  const now = db.serverDate();

  await db.collection('discipline_thought_reports').add({
    data: {
      report_id,
      discipline_record_id,
      student_id,
      student_name: student_name || '',
      title: title || '思想汇报',
      content,
      attachment_urls: attachment_urls || [],
      report_month: report_month || getTodayStr().substring(0, 7),
      status: 'pending',
      reviewer_name: '',
      review_comments: '',
      reviewed_at: null,
      created_by: caller.openid,
      created_at: now,
      updated_at: now
    }
  });

  return { success: true, data: { report_id }, message: '思想汇报已提交' };
}

async function submitServiceRecord(data, caller) {
  const { discipline_record_id, student_id, student_name, service_type, hours, description, date, proof_images } = data;
  if (!discipline_record_id || !student_id || !hours) {
    return { success: false, message: '缺少必要参数' };
  }

  const service_id = generateId('sr');
  const now = db.serverDate();

  await db.collection('discipline_service_records').add({
    data: {
      service_id,
      discipline_record_id,
      student_id,
      student_name: student_name || '',
      service_type: service_type || '服务令',
      hours: Number(hours),
      description: description || '',
      date: date || getTodayStr(),
      proof_images: proof_images || [],
      status: 'pending',
      reviewer_name: '',
      review_comments: '',
      reviewed_at: null,
      created_by: caller.openid,
      created_at: now,
      updated_at: now
    }
  });

  return { success: true, data: { service_id }, message: '服务令记录已提交' };
}

async function getThoughtReports(data, caller) {
  const { discipline_record_id, status } = data;
  if (!discipline_record_id) return { success: false, message: '缺少处分记录ID' };

  let query = { discipline_record_id };
  if (status) query.status = status;

  const res = await db.collection('discipline_thought_reports')
    .where(query)
    .orderBy('created_at', 'desc')
    .limit(30)
    .get();

  return { success: true, data: res.data };
}

async function getServiceRecords(data, caller) {
  const { discipline_record_id, status } = data;
  if (!discipline_record_id) return { success: false, message: '缺少处分记录ID' };

  let query = { discipline_record_id };
  if (status) query.status = status;

  const res = await db.collection('discipline_service_records')
    .where(query)
    .orderBy('created_at', 'desc')
    .limit(30)
    .get();

  return { success: true, data: res.data };
}

// ==================== 统计 ====================

async function getDisciplineStats(data, caller) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const allRecords = await db.collection('discipline_records')
    .where({ class_id, is_deleted: _.neq(true) })
    .limit(100)
    .get();

  const records = allRecords.data;
  const total = records.length;
  const active = records.filter(r => r.status === 'active').length;
  const revoked = records.filter(r => r.status === 'revoked').length;

  // 按级别统计
  const byLevel = {};
  records.forEach(r => {
    const level = r.discipline_level || '未知';
    if (!byLevel[level]) byLevel[level] = { total: 0, active: 0, revoked: 0 };
    byLevel[level].total++;
    if (r.status === 'active') byLevel[level].active++;
    if (r.status === 'revoked') byLevel[level].revoked++;
  });

  return { success: true, data: { total, active, revoked, byLevel } };
}

// ==================== 辅助函数 ====================

async function sendDisciplineNotification(class_id, student_id, student_name, level_name, reason, record_id) {
  const now = db.serverDate();
  const title = `处分通知：${level_name}`;
  const content = `${student_name || '学生'}受到${level_name}处分，原因：${reason}`;

  // 通知学生
  await db.collection('notifications').add({
    data: {
      notification_id: generateId('ntf'),
      type: 'discipline',
      title,
      content,
      target_type: 'specific_user',
      target_user_id: student_id,
      class_id,
      priority: 'important',
      action_type: 'view_detail',
      action_data: { discipline_record_id: record_id },
      sender_name: '班主任',
      status: 'published',
      is_revoked: false,
      publish_time: now,
      created_at: now
    }
  });

  // 通知家长
  const parentRes = await db.collection('user_class_relation')
    .where({ student_id, role: 'parent', status: 'joined' })
    .limit(5)
    .get();

  for (const parent of parentRes.data) {
    await db.collection('notifications').add({
      data: {
        notification_id: generateId('ntf'),
        type: 'discipline',
        title: `孩子处分通知：${level_name}`,
        content,
        target_type: 'specific_user',
        target_user_id: parent.user_openid,
        class_id,
        priority: 'important',
        action_type: 'view_detail',
        action_data: { discipline_record_id: record_id },
        sender_name: '班主任',
        status: 'published',
        is_revoked: false,
        publish_time: now,
        created_at: now
      }
    });
  }
}

async function getRevocationApplications2(data, caller) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  // 查询所有撤销申请
  const appsRes = await db.collection('revocation_applications')
    .where({ class_id })
    .orderBy('application_date', 'desc')
    .limit(200)
    .get();

  const applications = appsRes.data || [];

  // 关联处分记录获取级别信息
  const recordIds = [...new Set(applications.map(a => a.discipline_record_id))];
  const recordsMap = {};

  if (recordIds.length > 0) {
    // 分批查询，每次最多20个
    for (let i = 0; i < recordIds.length; i += 20) {
      const batch = recordIds.slice(i, i + 20);
      const recordsRes = await db.collection('discipline_records')
        .where({ record_id: _.in(batch) })
        .limit(20)
        .get();
      for (const r of (recordsRes.data || [])) {
        recordsMap[r.record_id] = r;
      }
    }
  }

  // 合并数据
  const result = applications.map(app => {
    const record = recordsMap[app.discipline_record_id] || {};
    return {
      ...app,
      discipline_level: record.discipline_level || '',
      levelColor: record.levelColor || '#faad14',
      reason: record.reason || ''
    };
  });

  return { success: true, data: result };
}
