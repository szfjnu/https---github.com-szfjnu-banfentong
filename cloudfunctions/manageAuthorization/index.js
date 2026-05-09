// 系统授权管理云函数
// 功能：学生授权管理、批量授权、权限验证、管理干部权限CRUD
// 权限数据存储在 student_authorizations / student_leader_permission 集合

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const batchQuery = require('./utils/batchQuery');

const ALLOWED_MODULES = {
  score: { label: '积分管理', actions: ['read', 'write', 'approve'] },
  attendance: { label: '考勤管理', actions: ['read', 'write', 'approve'] },
  duty: { label: '值日管理', actions: ['read', 'write', 'approve'] },
  dorm: { label: '宿舍管理', actions: ['read', 'write', 'approve'] },
  volunteer: { label: '志愿服务', actions: ['read', 'write', 'approve'] },
  discipline: { label: '处分管理', actions: ['read', 'approve'] },
  notification: { label: '通知管理', actions: ['read', 'write'] }
};

const MODULE_PERMISSIONS = {
  SCORE_REGISTER: 'score_register',
  VOLUNTEER_SUBMIT: 'volunteer_submit',
  DORM_SCORE: 'dorm_score',
  DUTY_CHECK: 'duty_check',
  DUTY_ARRANGE: 'duty_arrange',
  ATTENDANCE_REGISTER: 'attendance_register'
};

const VALID_MODULE_CODES = Object.values(MODULE_PERMISSIONS);

const OPEN_ACTIONS = ['getMyPermissions', 'checkModulePermission'];

exports.main = async (event, context) => {
  const { action, data } = event;
  const { OPENID } = cloud.getWXContext();

  try {
    const userRes = await db.collection('users')
      .where({ _openid: OPENID })
      .limit(1)
      .get();

    if (!userRes.data || userRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const userRole = userRes.data[0].role;

    if (!OPEN_ACTIONS.includes(action)) {
      if (action === 'getStudentPermissions') {
        if (userRole !== 'admin' && userRole !== 'head_teacher') {
          return { success: false, message: '无权限操作' };
        }
      } else if (action === 'saveStudentPermission' || action === 'removeStudentPermission') {
        if (userRole !== 'admin' && userRole !== 'head_teacher') {
          return { success: false, message: '仅班主任或管理员可操作' };
        }
      } else {
        if (userRole !== 'admin' && userRole !== 'head_teacher') {
          return { success: false, message: '无权限操作' };
        }
      }
    }

    switch (action) {
      case 'getStudents': return await getStudents(data);
      case 'getAuthorizations': return await getAuthorizations(data);
      case 'updateStudentAuthorization': return await updateStudentAuthorization(data);
      case 'batchAuthorize': return await batchAuthorize(data);
      case 'removeAuthorization': return await removeAuthorization(data);
      case 'checkPermission': return await checkPermission(data);
      case 'getStudentPermissions': return await getStudentPermissions(data, OPENID);
      case 'saveStudentPermission': return await saveStudentPermission(data, OPENID);
      case 'removeStudentPermission': return await removeStudentPermission(data, OPENID);
      case 'getMyPermissions': return await getMyPermissions(data, OPENID);
      case 'checkModulePermission': return await checkModulePermission(data, OPENID);
      case 'migrateOldBindings': return await migrateOldBindings(data, OPENID);
      default:
        return { success: false, message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error(`manageAuthorization ${action} error:`, err);
    return { success: false, message: err.message || '操作失败' };
  }
};

async function getStudents(data) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const students = await batchQuery.getAllRecords('students', {
    class_id: class_id,
    status: _.neq('graduated')
  });

  return { success: true, data: students };
}

// 获取班级所有授权
async function getAuthorizations(data) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const auths = await batchQuery.getAllRecords('student_authorizations', { class_id });

  return { success: true, data: auths };
}

// 更新单个学生授权
async function updateStudentAuthorization(data) {
  const { class_id, student_id, student_name, permissions } = data;
  if (!class_id || !student_id) {
    return { success: false, message: '缺少必要参数' };
  }

  // 验证权限数据合法性
  const sanitizedPermissions = sanitizePermissions(permissions);

  const now = db.serverDate();

  // 查找是否已有授权记录
  const existing = await db.collection('student_authorizations')
    .where({ class_id, student_id })
    .limit(1)
    .get();

  if (existing.data && existing.data.length > 0) {
    await db.collection('student_authorizations')
      .doc(existing.data[0]._id)
      .update({
        data: {
          permissions: sanitizedPermissions,
          updated_at: now
        }
      });
  } else {
    await db.collection('student_authorizations').add({
      data: {
        auth_id: `auth_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
        class_id,
        student_id,
        student_name: student_name || '',
        permissions: sanitizedPermissions,
        created_at: now,
        updated_at: now
      }
    });
  }

  return { success: true, message: '授权更新成功' };
}

// 批量授权
async function batchAuthorize(data) {
  const { class_id, students, permissions } = data;
  if (!class_id || !students || students.length === 0) {
    return { success: false, message: '缺少必要参数' };
  }

  const sanitizedPermissions = sanitizePermissions(permissions);
  const now = db.serverDate();

  const tasks = students.map(student => {
    return (async () => {
      const existing = await db.collection('student_authorizations')
        .where({ class_id, student_id: student.student_id })
        .limit(1)
        .get();

      if (existing.data && existing.data.length > 0) {
        // 合并权限：新权限覆盖旧权限中相同的模块
        const existingPerms = existing.data[0].permissions || {};
        const mergedPerms = { ...existingPerms, ...sanitizedPermissions };

        await db.collection('student_authorizations')
          .doc(existing.data[0]._id)
          .update({
            data: {
              permissions: mergedPerms,
              updated_at: now
            }
          });
      } else {
        await db.collection('student_authorizations').add({
          data: {
            auth_id: `auth_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
            class_id,
            student_id: student.student_id,
            student_name: student.student_name || '',
            permissions: sanitizedPermissions,
            created_at: now,
            updated_at: now
          }
        });
      }
    })();
  });

  // 分批执行，每批5个
  for (let i = 0; i < tasks.length; i += 5) {
    const batch = tasks.slice(i, i + 5);
    await Promise.all(batch);
  }

  return { success: true, message: `已为 ${students.length} 名学生授权`, data: { count: students.length } };
}

// 移除授权
async function removeAuthorization(data) {
  const { class_id, student_id, modules } = data;
  if (!class_id || !student_id) {
    return { success: false, message: '缺少必要参数' };
  }

  const existing = await db.collection('student_authorizations')
    .where({ class_id, student_id })
    .limit(1)
    .get();

  if (!existing.data || existing.data.length === 0) {
    return { success: false, message: '授权记录不存在' };
  }

  if (modules && modules.length > 0) {
    // 移除指定模块的权限
    const permissions = { ...existing.data[0].permissions };
    modules.forEach(m => delete permissions[m]);

    await db.collection('student_authorizations')
      .doc(existing.data[0]._id)
      .update({
        data: {
          permissions,
          updated_at: db.serverDate()
        }
      });
  } else {
    // 移除全部权限
    await db.collection('student_authorizations')
      .doc(existing.data[0]._id)
      .remove();
  }

  return { success: true, message: '授权已移除' };
}

// 检查权限
async function checkPermission(data) {
  const { student_id, module, action } = data;
  if (!student_id || !module || !action) {
    return { success: false, message: '缺少必要参数' };
  }

  const res = await db.collection('student_authorizations')
    .where({ student_id })
    .limit(1)
    .get();

  if (!res.data || res.data.length === 0) {
    return { success: true, data: { authorized: false } };
  }

  const permissions = res.data[0].permissions || {};
  const moduleActions = permissions[module] || [];
  const authorized = moduleActions.includes(action);

  return { success: true, data: { authorized } };
}

// 权限数据清洗 - 只保留合法的模块和操作
function sanitizePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') return {};

  const sanitized = {};
  for (const [moduleKey, actions] of Object.entries(permissions)) {
    if (!ALLOWED_MODULES[moduleKey]) continue;
    if (!Array.isArray(actions)) continue;

    const validActions = actions.filter(a => ALLOWED_MODULES[moduleKey].actions.includes(a));
    if (validActions.length > 0) {
      sanitized[moduleKey] = validActions;
    }
  }
  return sanitized;
}

async function migrateOldBindings(data, OPENID) {
  const userRes = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0 || userRes.data[0].role !== 'admin') {
    return { success: false, message: '仅管理员可执行迁移' }
  }

  let migratedCount = 0
  let failedCount = 0
  let skippedCount = 0
  const failures = []

  try {
    const relations = await batchQuery.getAllRecords('user_class_relation', {
      role: db.RegExp({ regexp: '^(parent|student)$' })
    })

    for (const rel of relations) {
      if (!rel.student_id) {
        skippedCount++
        continue
      }

      const studentDoc = await db.collection('students').doc(rel.student_id).get().catch(() => null)
      if (studentDoc && studentDoc.data && studentDoc.data.student_id) {
        if (rel.student_id === studentDoc.data.student_id) {
          skippedCount++
          continue
        }
        await db.collection('user_class_relation').doc(rel._id).update({
          data: { student_id: studentDoc.data.student_id }
        })
        migratedCount++
      } else {
        const studentByField = await db.collection('students')
          .where({ student_id: rel.student_id })
          .limit(1).get()
        if (studentByField.data && studentByField.data.length > 0) {
          skippedCount++
          continue
        }
        failedCount++
        failures.push({ relation_id: rel._id, old_student_id: rel.student_id, reason: '找不到对应学生记录' })
      }
    }

    return {
      success: true,
      data: { migratedCount, failedCount, skippedCount, failures, totalProcessed: relations.length }
    }
  } catch (err) {
    console.error('migrateOldBindings失败:', err)
    return { success: false, message: err.message || '迁移失败' }
  }
}

async function getStudentPermissions(data, OPENID) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const permissions = await batchQuery.getAllRecords('student_leader_permission', { class_id });

  const studentIds = permissions.map(p => p.student_id).filter(Boolean);
  const studentMap = {};
  if (studentIds.length > 0) {
    const students = await batchQuery.getAllRecords('students', {
      student_id: _.in(studentIds)
    });
    students.forEach(s => { studentMap[s.student_id] = s; });
  }

  const result = permissions.map(p => {
    const student = studentMap[p.student_id] || {};
    return {
      student_id: p.student_id,
      student_name: student.name || student.student_name || p.student_name || '',
      is_leader: p.is_leader || false,
      permissions: p.permissions || [],
      updated_at: p.updated_at
    };
  });

  return { success: true, data: result };
}

async function saveStudentPermission(data, OPENID) {
  const { class_id, student_id, is_leader, permissions } = data;
  if (!class_id || !student_id) {
    return { success: false, message: '缺少必要参数' };
  }

  const sanitizedPermissions = (permissions || []).filter(p => VALID_MODULE_CODES.includes(p));

  const studentRes = await db.collection('students')
    .where({ student_id, class_id })
    .limit(1)
    .get();
  if (!studentRes.data || studentRes.data.length === 0) {
    return { success: false, message: '该学生不属于此班级' };
  }
  const studentName = studentRes.data[0].name || studentRes.data[0].student_name || '';

  const now = db.serverDate();

  const existing = await db.collection('student_leader_permission')
    .where({ class_id, student_id })
    .limit(1)
    .get();

  if (existing.data && existing.data.length > 0) {
    await db.collection('student_leader_permission')
      .doc(existing.data[0]._id)
      .update({
        data: {
          is_leader: is_leader !== undefined ? is_leader : existing.data[0].is_leader,
          permissions: sanitizedPermissions,
          updated_at: now
        }
      });
  } else {
    await db.collection('student_leader_permission').add({
      data: {
        student_id,
        student_name: studentName,
        class_id,
        is_leader: is_leader || false,
        permissions: sanitizedPermissions,
        granted_by: OPENID,
        granted_at: now,
        created_at: now,
        updated_at: now
      }
    });
  }

  return { success: true, data: { student_id, is_leader, permissions: sanitizedPermissions } };
}

async function removeStudentPermission(data, OPENID) {
  const { class_id, student_id } = data;
  if (!class_id || !student_id) {
    return { success: false, message: '缺少必要参数' };
  }

  const existing = await db.collection('student_leader_permission')
    .where({ class_id, student_id })
    .limit(1)
    .get();

  if (!existing.data || existing.data.length === 0) {
    return { success: false, message: '权限记录不存在' };
  }

  await db.collection('student_leader_permission')
    .doc(existing.data[0]._id)
    .update({
      data: {
        is_leader: false,
        permissions: [],
        updated_at: db.serverDate()
      }
    });

  return { success: true, message: '权限已撤销' };
}

async function getMyPermissions(data, OPENID) {
  const relRes = await db.collection('user_class_relation')
    .where({ _openid: OPENID })
    .limit(1)
    .get();

  if (!relRes.data || relRes.data.length === 0) {
    return { success: true, data: { is_leader: false, permissions: [] } };
  }

  const student_id = relRes.data[0].student_id;
  if (!student_id) {
    return { success: true, data: { is_leader: false, permissions: [] } };
  }

  const permRes = await db.collection('student_leader_permission')
    .where({ student_id })
    .limit(1)
    .get();

  if (!permRes.data || permRes.data.length === 0) {
    return { success: true, data: { is_leader: false, permissions: [] } };
  }

  return {
    success: true,
    data: {
      is_leader: permRes.data[0].is_leader || false,
      permissions: permRes.data[0].permissions || []
    }
  };
}

async function checkModulePermission(data, OPENID) {
  const { module_code } = data;
  if (!module_code) {
    return { success: false, message: '缺少模块代码' };
  }

  const userRes = await db.collection('users')
    .where({ _openid: OPENID })
    .limit(1)
    .get();

  if (!userRes.data || userRes.data.length === 0) {
    return { success: true, data: { hasPermission: false } };
  }

  const userRole = userRes.data[0].role;
  if (userRole === 'admin' || userRole === 'head_teacher') {
    return { success: true, data: { hasPermission: true } };
  }

  if (userRole !== 'student') {
    return { success: true, data: { hasPermission: false } };
  }

  const relRes = await db.collection('user_class_relation')
    .where({ _openid: OPENID })
    .limit(1)
    .get();

  if (!relRes.data || relRes.data.length === 0 || !relRes.data[0].student_id) {
    return { success: true, data: { hasPermission: false } };
  }

  const student_id = relRes.data[0].student_id;

  const permRes = await db.collection('student_leader_permission')
    .where({ student_id, is_leader: true })
    .limit(1)
    .get();

  if (!permRes.data || permRes.data.length === 0) {
    return { success: true, data: { hasPermission: false } };
  }

  const hasPermission = (permRes.data[0].permissions || []).includes(module_code);
  return { success: true, data: { hasPermission } };
}
