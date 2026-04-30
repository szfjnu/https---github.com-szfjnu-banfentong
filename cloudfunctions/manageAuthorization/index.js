// 系统授权管理云函数
// 功能：学生授权管理、批量授权、权限验证
// 权限数据存储在 student_authorizations 集合

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 允许授权的模块和操作定义（白名单）
const ALLOWED_MODULES = {
  score: { label: '积分管理', actions: ['read', 'write', 'approve'] },
  attendance: { label: '考勤管理', actions: ['read', 'write', 'approve'] },
  duty: { label: '值日管理', actions: ['read', 'write', 'approve'] },
  dorm: { label: '宿舍管理', actions: ['read', 'write', 'approve'] },
  volunteer: { label: '志愿服务', actions: ['read', 'write', 'approve'] },
  discipline: { label: '处分管理', actions: ['read', 'approve'] },
  notification: { label: '通知管理', actions: ['read', 'write'] }
};

exports.main = async (event, context) => {
  const { action, data } = event;
  const { OPENID } = cloud.getWXContext();

  try {
    // 权限验证：只有管理员和班主任可以操作
    const userRes = await db.collection('users')
      .where({ _openid: OPENID })
      .limit(1)
      .get();

    if (!userRes.data || userRes.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const userRole = userRes.data[0].role;
    if (userRole !== 'admin' && userRole !== 'head_teacher') {
      return { success: false, message: '无权限操作' };
    }

    switch (action) {
      case 'getAuthorizations': return await getAuthorizations(data);
      case 'updateStudentAuthorization': return await updateStudentAuthorization(data);
      case 'batchAuthorize': return await batchAuthorize(data);
      case 'removeAuthorization': return await removeAuthorization(data);
      case 'checkPermission': return await checkPermission(data);
      default:
        return { success: false, message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error(`manageAuthorization ${action} error:`, err);
    return { success: false, message: err.message || '操作失败' };
  }
};

// 获取班级所有授权
async function getAuthorizations(data) {
  const { class_id } = data;
  if (!class_id) return { success: false, message: '缺少班级ID' };

  const res = await db.collection('student_authorizations')
    .where({ class_id })
    .limit(200)
    .get();

  return { success: true, data: res.data || [] };
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
