// 用户中心与通知系统云函数
// 功能：个人设置管理、统一通知接收与发布、消息推送

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { getCallerInfo, requireClassAccess, requireTeacher, requireAdmin } = require('./utils/auth');

// 生成唯一ID
function generateId(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

// 通知类型定义（可扩展）
const NOTIFICATION_TYPES = {
  system: { label: '系统通知', icon: '📢', color: '#1890ff' },
  discipline: { label: '处分通知', icon: '⚠️', color: '#ff4d4f' },
  discipline_revoke: { label: '撤销处分', icon: '✅', color: '#52c41a' },
  grade: { label: '成绩通知', icon: '📝', color: '#722ed1' },
  transfer: { label: '转段监控', icon: '🎓', color: '#13c2c2' },
  treehole: { label: '树洞消息', icon: '🌳', color: '#fa8c16' },
  market: { label: '咸鱼市场', icon: '🛒', color: '#eb2f96' },
  score: { label: '积分变动', icon: '⭐', color: '#faad14' },
  attendance: { label: '考勤提醒', icon: '📋', color: '#2f54eb' },
  duty: { label: '值日提醒', icon: '🧹', color: '#13c2c2' },
  dorm: { label: '宿舍通知', icon: '🏠', color: '#faad14' },
  volunteer: { label: '志愿服务', icon: '🤝', color: '#52c41a' },
  approval: { label: '审批通知', icon: '✍️', color: '#1890ff' },
  birthday: { label: '生日祝福', icon: '🎂', color: '#ff85c0' },
  weather: { label: '天气提醒', icon: '🌤️', color: '#69c0ff' },
  semester: { label: '学期通知', icon: '📅', color: '#722ed1' }
};

// 通知目标类型
const TARGET_TYPES = {
  all_class: '全班成员',
  all_student: '全班学生',
  all_parent: '全班家长',
  all_teacher: '全体教师',
  specific_student: '指定学生',
  specific_parent: '指定家长',
  specific_teacher: '指定教师'
};

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    if (action === 'initUserMembership') {
      const openid = cloud.getWXContext().OPENID
      return await initUserMembershipDirect(openid)
    }

    const caller = await getCallerInfo(event, data?.class_id || data?.classId);

    switch (action) {
      case 'updateUser': return await updateUser(data, caller);
      case 'initUserMembership': return await initUserMembershipDirect(caller.openid);
      case 'getUserProfile': return await getUserProfile(data, caller);
      case 'updateUserProfile': return await updateUserProfile(data, caller);

      case 'getUserSettings': return await getUserSettings(caller);
      case 'updateUserSettings': return await updateUserSettings(data, caller);
      case 'updateNotificationPreference': return await updateNotificationPreference(data, caller);

      case 'publishNotification': requireClassAccess(caller, data.class_id, ['head_teacher', 'admin']); return await publishNotification(data, caller);
      case 'recallNotification': requireTeacher(caller); return await recallNotification(data, caller);
      case 'getPublishedNotifications': return await getPublishedNotifications(data, caller);

      case 'getNotifications': return await getNotifications(data, caller);
      case 'getNotificationDetail': return await getNotificationDetail(data, caller);
      case 'markAsRead': return await markAsRead(data, caller);
      case 'markAllAsRead': return await markAllAsRead(data, caller);
      case 'getUnreadCount': return await getUnreadCount(data, caller);
      case 'toggleStar': return await toggleStar(data, caller);
      case 'deleteNotification': return await deleteNotification(data, caller);

      case 'sendSystemNotification': requireTeacher(caller); return await sendSystemNotification(data, caller);

      case 'getNotificationTypes': return { success: true, data: NOTIFICATION_TYPES };

      case 'updateStudentInfo': return await updateStudentInfo(data, caller);
      case 'getStudentDetail': return await getStudentDetail(data, caller);
      case 'getAccessibleStudents': return await getAccessibleStudents(data, caller);

      case 'getClassInfo': return await getClassInfo(data, caller);

      case 'listUsers': requireAdmin(caller); return await listUsers(data);
      case 'updateUserRole': requireAdmin(caller); return await updateUserRole(data, caller);
      case 'updateUserMembership': requireAdmin(caller); return await updateUserMembership(data, caller);
      case 'getPermissionAuditLog': requireAdmin(caller); return await getPermissionAuditLog(data);

      default:
        return { success: false, message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error(`manageUserCenter ${action} error:`, err);
    return { success: false, message: err.message || '操作失败' };
  }
};

// ==================== 用户信息 ====================

async function getUserProfile(data, openid) {
  let res = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();

  if (!res.data || res.data.length === 0) {
    res = await db.collection('users')
      .where({ user_id: openid })
      .limit(1)
      .get();
  }

  if (!res.data || res.data.length === 0) {
    res = await db.collection('users')
      .where({ openid: openid })
      .limit(1)
      .get();
  }

  if (!res.data || res.data.length === 0) {
    return { success: false, message: '用户不存在' };
  }

  const user = res.data[0];

  // 获取用户角色（从 user_class_relation 集合）
  let role = user.role || '';
  if (!role) {
    const relationRes = await db.collection('user_class_relation')
      .where({
        user_openid: openid,
        status: 'joined'
      })
      .limit(1)
      .get();
    if (relationRes.data && relationRes.data.length > 0) {
      role = relationRes.data[0].role || '';
    }
    if (!role) {
      const relationRes2 = await db.collection('user_class_relation')
        .where({
          _openid: openid,
          status: 'joined'
        })
        .limit(1)
        .get();
      if (relationRes2.data && relationRes2.data.length > 0) {
        role = relationRes2.data[0].role || '';
      }
    }
  }

  // 获取班级信息
  let classInfo = null;
  let classId = user.class_id || '';
  let className = user.class_name || '';

  if (!classId && role) {
    const relForClass = await db.collection('user_class_relation')
      .where({ user_openid: openid, status: 'joined' })
      .limit(1)
      .get();
    if (relForClass.data && relForClass.data.length > 0) {
      classId = relForClass.data[0].class_id || classId;
    }
  }

  if (classId && !className) {
    try {
      const classByIdRes = await db.collection('classes').doc(classId).get();
      if (classByIdRes.data) {
        className = classByIdRes.data.class_name || '';
        classInfo = classByIdRes.data;
      }
    } catch (e) {}
  }

  if (className && !classInfo) {
    const classRes = await db.collection('classes')
      .where({ class_name: className, status: 'active' })
      .limit(1)
      .get();
    if (classRes.data && classRes.data.length > 0) {
      classInfo = classRes.data[0];
    }
  }

  return {
    success: true,
    data: {
      ...user,
      role: role || user.role || '',
      class_id: classId || user.class_id || '',
      class_name: className || user.class_name || '',
      classInfo,
      membershipLevel: user.membership?.level || 'free',
      membershipStatus: user.membership?.status || 'active'
    }
  };
}

async function updateUserProfile(data, openid) {
  const { nickname, avatarUrl, phone, email } = data;
  const updateData = { updated_at: db.serverDate() };
  if (nickname !== undefined) updateData.nickname = nickname;
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
  if (phone !== undefined) updateData.phone = phone;
  if (email !== undefined) updateData.email = email;

  let userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();

  if (!userRes.data || userRes.data.length === 0) {
    userRes = await db.collection('users')
      .where({ user_id: openid })
      .limit(1)
      .get();
  }

  if (!userRes.data || userRes.data.length === 0) {
    userRes = await db.collection('users')
      .where({ openid: openid })
      .limit(1)
      .get();
  }

  if (!userRes.data || userRes.data.length === 0) {
    const addData = {
      _openid: openid,
      user_id: openid,
      ...updateData,
      created_at: db.serverDate()
    };
    if (nickname !== undefined) addData.nickname = nickname;
    await db.collection('users').add({ data: addData });
    return { success: true };
  }

  await db.collection('users').doc(userRes.data[0]._id).update({ data: updateData });
  return { success: true };
}

// ==================== 用户设置 ====================

async function getUserSettings(openid) {
  const res = await db.collection('user_settings')
    .where({ user_openid: openid })
    .limit(1)
    .get();

  if (res.data && res.data.length > 0) {
    return { success: true, data: res.data[0] };
  }

  // 创建默认设置
  const defaultSettings = {
    user_openid: openid,
    notification_preferences: {
      system: { enabled: true, push: true },
      discipline: { enabled: true, push: true },
      discipline_revoke: { enabled: true, push: true },
      grade: { enabled: true, push: true },
      transfer: { enabled: true, push: true },
      treehole: { enabled: true, push: false },
      market: { enabled: true, push: false },
      score: { enabled: true, push: true },
      attendance: { enabled: true, push: true },
      duty: { enabled: true, push: true },
      dorm: { enabled: true, push: true },
      volunteer: { enabled: true, push: true },
      approval: { enabled: true, push: true },
      birthday: { enabled: true, push: false },
      weather: { enabled: true, push: false },
      semester: { enabled: true, push: true }
    },
    privacy_settings: {
      show_score_to_parent: true,
      show_attendance_to_parent: true,
      show_dorm_to_parent: true,
      show_volunteer_to_parent: true
    },
    display_settings: {
      dark_mode: false,
      font_size: 'medium',
      language: 'zh-CN'
    },
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  };

  await db.collection('user_settings').add({ data: defaultSettings });
  return { success: true, data: defaultSettings };
}

async function updateUserSettings(data, openid) {
  const { notification_preferences, privacy_settings, display_settings } = data;

  const res = await db.collection('user_settings')
    .where({ user_openid: openid })
    .limit(1)
    .get();

  const updateData = { updated_at: db.serverDate() };
  if (notification_preferences) updateData.notification_preferences = notification_preferences;
  if (privacy_settings) updateData.privacy_settings = privacy_settings;
  if (display_settings) updateData.display_settings = display_settings;

  if (res.data && res.data.length > 0) {
    await db.collection('user_settings').doc(res.data[0]._id).update({ data: updateData });
  } else {
    await db.collection('user_settings').add({
      data: {
        user_openid: openid,
        notification_preferences: notification_preferences || {},
        privacy_settings: privacy_settings || {},
        display_settings: display_settings || {},
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
  }

  return { success: true };
}

async function updateNotificationPreference(data, openid) {
  const { type, enabled, push } = data;
  if (!type) return { success: false, message: '缺少通知类型' };

  const res = await db.collection('user_settings')
    .where({ user_openid: openid })
    .limit(1)
    .get();

  if (res.data && res.data.length > 0) {
    const settings = res.data[0];
    const prefs = settings.notification_preferences || {};
    if (!prefs[type]) prefs[type] = { enabled: true, push: true };
    if (enabled !== undefined) prefs[type].enabled = enabled;
    if (push !== undefined) prefs[type].push = push;

    await db.collection('user_settings').doc(res.data[0]._id).update({
      data: {
        notification_preferences: prefs,
        updated_at: db.serverDate()
      }
    });
  }

  return { success: true };
}

// ==================== 通知发布 ====================

async function publishNotification(data, openid) {
  const {
    type, title, content, summary, class_id,
    target_type, target_ids, priority, action_type, action_data,
    expire_time
  } = data;

  if (!type || !title || !content || !class_id) {
    return { success: false, message: '缺少必要参数（type, title, content, class_id）' };
  }

  if (!NOTIFICATION_TYPES[type]) {
    return { success: false, message: `不支持的通知类型: ${type}` };
  }

  // 获取发送者信息
  const senderRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();
  const sender = senderRes.data && senderRes.data.length > 0 ? senderRes.data[0] : {};
  const sender_name = sender.nickname || data.sender_name || '系统';
  const sender_role = sender.role || 'admin';

  const notification_id = generateId('ntf');
  const now = db.serverDate();

  const notificationData = {
    notification_id,
    type,
    title,
    content,
    summary: summary || title.substring(0, 50),
    sender_id: openid,
    sender_name,
    sender_role,
    class_id,
    target_type: target_type || 'all_class',
    target_ids: target_ids || [],
    priority: priority || 'normal',
    action_type: action_type || '',
    action_data: action_data || {},
    status: 'published',
    publish_time: now,
    expire_time: expire_time || null,
    read_count: 0,
    created_at: now,
    updated_at: now
  };

  await ensureCollection('notifications');
  await db.collection('notifications').add({ data: notificationData });

  // 创建用户通知关联记录
  await createUserNotifications(notification_id, class_id, target_type, target_ids, openid, now);

  return { success: true, data: { notification_id } };
}

// 创建用户通知关联
async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).limit(1).get();
  } catch (err) {
    if (err.message && (err.message.includes('no such collection') || err.message.includes('not exist'))) {
      await db.createCollection(collectionName);
      console.log(`集合 ${collectionName} 已自动创建`);
    } else {
      throw err;
    }
  }
}

async function createUserNotifications(notificationId, classId, targetType, targetIds, senderOpenid, now) {
  const batchPromises = [];
  const userQuery = {};

  await ensureCollection('user_notifications');

  switch (targetType) {
    case 'all_class': {
      // 获取班级所有成员
      const relRes = await db.collection('user_class_relation')
        .where({ class_id: classId, status: 'joined' })
        .limit(1000)
        .get();
      
      for (const rel of (relRes.data || [])) {
        batchPromises.push(
          db.collection('user_notifications').add({
            data: {
              user_notification_id: generateId('unt'),
              notification_id: notificationId,
              user_openid: rel.user_openid,
              student_id: rel.student_id || '',
              class_id: classId,
              is_read: false,
              read_time: null,
              is_starred: false,
              is_deleted: false,
              created_at: now
            }
          })
        );
      }
      break;
    }
    case 'all_student': {
      const relRes = await db.collection('user_class_relation')
        .where({ class_id: classId, status: 'joined', role: 'student' })
        .limit(500)
        .get();
      
      for (const rel of (relRes.data || [])) {
        batchPromises.push(
          db.collection('user_notifications').add({
            data: {
              user_notification_id: generateId('unt'),
              notification_id: notificationId,
              user_openid: rel.user_openid,
              student_id: rel.student_id || '',
              class_id: classId,
              is_read: false,
              read_time: null,
              is_starred: false,
              is_deleted: false,
              created_at: now
            }
          })
        );
      }
      break;
    }
    case 'all_parent': {
      const relRes = await db.collection('user_class_relation')
        .where({ class_id: classId, status: 'joined', role: 'parent' })
        .limit(500)
        .get();
      
      for (const rel of (relRes.data || [])) {
        batchPromises.push(
          db.collection('user_notifications').add({
            data: {
              user_notification_id: generateId('unt'),
              notification_id: notificationId,
              user_openid: rel.user_openid,
              student_id: rel.student_id || '',
              class_id: classId,
              is_read: false,
              read_time: null,
              is_starred: false,
              is_deleted: false,
              created_at: now
            }
          })
        );
      }
      break;
    }
    case 'specific_student':
    case 'specific_parent':
    case 'specific_teacher': {
      for (const tid of (targetIds || [])) {
        if (tid.openid) {
          batchPromises.push(
            db.collection('user_notifications').add({
              data: {
                user_notification_id: generateId('unt'),
                notification_id: notificationId,
                user_openid: tid.openid,
                student_id: tid.student_id || '',
                class_id: classId,
                is_read: false,
                read_time: null,
                is_starred: false,
                is_deleted: false,
                created_at: now
              }
            })
          );
        }
      }
      break;
    }
  }

  // 并行执行
  if (batchPromises.length > 0) {
    // 分批处理，每批20个
    for (let i = 0; i < batchPromises.length; i += 20) {
      const batch = batchPromises.slice(i, i + 20);
      await Promise.all(batch);
    }
  }

  return batchPromises.length;
}

async function recallNotification(data, openid) {
  const { notification_id } = data;
  if (!notification_id) return { success: false, message: '缺少通知ID' };

  const res = await db.collection('notifications')
    .where({ notification_id })
    .limit(1)
    .get();

  if (!res.data || res.data.length === 0) {
    return { success: false, message: '通知不存在' };
  }

  // 检查权限：只有发送者可以撤回
  if (res.data[0].sender_id !== openid) {
    return { success: false, message: '无权撤回此通知' };
  }

  await db.collection('notifications').doc(res.data[0]._id).update({
    data: { status: 'recalled', updated_at: db.serverDate() }
  });

  return { success: true };
}

async function getPublishedNotifications(data, openid) {
  const { class_id, type, status, page, pageSize } = data;
  const query = { sender_id: openid };
  if (class_id) query.class_id = class_id;
  if (type) query.type = type;
  if (status) query.status = status;

  const res = await db.collection('notifications')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip((page || 0) * (pageSize || 20))
    .limit(pageSize || 20)
    .get();

  const countRes = await db.collection('notifications').where(query).count();

  return {
    success: true,
    data: {
      list: res.data || [],
      total: countRes.total,
      page: page || 0,
      pageSize: pageSize || 20
    }
  };
}

// ==================== 通知接收 ====================

async function getNotifications(data, openid) {
  const { type, is_read, is_starred, page, pageSize } = data;

  const query = { user_openid: openid, is_deleted: _.neq(true) };
  if (type) query.type = type;
  if (is_read !== undefined) query.is_read = is_read;
  if (is_starred !== undefined) query.is_starred = is_starred;

  // 先查user_notifications，再关联notifications
  const userNtfRes = await db.collection('user_notifications')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip((page || 0) * (pageSize || 20))
    .limit(pageSize || 20)
    .get();

  const userNotifications = userNtfRes.data || [];

  // 关联查询通知详情
  const notifications = [];
  for (const unt of userNotifications) {
    const ntfRes = await db.collection('notifications')
      .where({ notification_id: unt.notification_id, status: 'published' })
      .limit(1)
      .get();

    if (ntfRes.data && ntfRes.data.length > 0) {
      const ntf = ntfRes.data[0];
      const typeInfo = NOTIFICATION_TYPES[ntf.type] || NOTIFICATION_TYPES.system;
      notifications.push({
        ...ntf,
        _user_notification_id: unt._id,
        user_notification_id: unt.user_notification_id,
        is_read: unt.is_read,
        read_time: unt.read_time,
        is_starred: unt.is_starred,
        typeLabel: typeInfo.label,
        typeIcon: typeInfo.icon,
        typeColor: typeInfo.color
      });
    }
  }

  const countRes = await db.collection('user_notifications').where(query).count();

  return {
    success: true,
    data: {
      list: notifications,
      total: countRes.total,
      page: page || 0,
      pageSize: pageSize || 20
    }
  };
}

async function getNotificationDetail(data, openid) {
  const { notification_id, user_notification_id } = data;

  // 查询通知详情
  let notification = null;
  if (notification_id) {
    const ntfRes = await db.collection('notifications')
      .where({ notification_id })
      .limit(1)
      .get();
    if (ntfRes.data && ntfRes.data.length > 0) {
      notification = ntfRes.data[0];
    }
  }

  if (!notification) {
    return { success: false, message: '通知不存在' };
  }

  // 查询用户通知关联
  const untQuery = { user_openid: openid, notification_id: notification.notification_id };
  if (user_notification_id) untQuery.user_notification_id = user_notification_id;

  const untRes = await db.collection('user_notifications')
    .where(untQuery)
    .limit(1)
    .get();

  const userNtf = untRes.data && untRes.data.length > 0 ? untRes.data[0] : null;
  const typeInfo = NOTIFICATION_TYPES[notification.type] || NOTIFICATION_TYPES.system;

  // 自动标记为已读
  if (userNtf && !userNtf.is_read) {
    await db.collection('user_notifications').doc(userNtf._id).update({
      data: { is_read: true, read_time: db.serverDate() }
    });
  }

  return {
    success: true,
    data: {
      ...notification,
      is_read: userNtf ? true : true,
      is_starred: userNtf ? userNtf.is_starred : false,
      typeLabel: typeInfo.label,
      typeIcon: typeInfo.icon,
      typeColor: typeInfo.color
    }
  };
}

async function markAsRead(data, openid) {
  const { user_notification_id } = data;
  if (!user_notification_id) return { success: false, message: '缺少通知ID' };

  const res = await db.collection('user_notifications')
    .where({ user_notification_id, user_openid: openid })
    .limit(1)
    .get();

  if (res.data && res.data.length > 0) {
    await db.collection('user_notifications').doc(res.data[0]._id).update({
      data: { is_read: true, read_time: db.serverDate() }
    });
  }

  return { success: true };
}

async function markAllAsRead(data, openid) {
  const { type } = data;
  const query = { user_openid: openid, is_read: false, is_deleted: _.neq(true) };

  const res = await db.collection('user_notifications')
    .where(query)
    .limit(500)
    .get();

  let count = 0;
  for (const unt of (res.data || [])) {
    // 如果指定了类型，检查通知类型
    if (type) {
      const ntfRes = await db.collection('notifications')
        .where({ notification_id: unt.notification_id, type })
        .limit(1)
        .get();
      if (!ntfRes.data || ntfRes.data.length === 0) continue;
    }

    await db.collection('user_notifications').doc(unt._id).update({
      data: { is_read: true, read_time: db.serverDate() }
    });
    count++;
  }

  return { success: true, data: { count } };
}

async function getUnreadCount(data, openid) {
  const query = { user_openid: openid, is_read: false, is_deleted: _.neq(true) };
  const res = await db.collection('user_notifications').where(query).count();

  // 按类型分组统计
  const typeCounts = {};
  const userNtfRes = await db.collection('user_notifications')
    .where(query)
    .limit(500)
    .get();

  for (const unt of (userNtfRes.data || [])) {
    const ntfRes = await db.collection('notifications')
      .where({ notification_id: unt.notification_id })
      .limit(1)
      .get();
    if (ntfRes.data && ntfRes.data.length > 0) {
      const ntfType = ntfRes.data[0].type;
      typeCounts[ntfType] = (typeCounts[ntfType] || 0) + 1;
    }
  }

  return {
    success: true,
    data: {
      total: res.total,
      typeCounts
    }
  };
}

async function toggleStar(data, openid) {
  const { user_notification_id } = data;
  if (!user_notification_id) return { success: false, message: '缺少通知ID' };

  const res = await db.collection('user_notifications')
    .where({ user_notification_id, user_openid: openid })
    .limit(1)
    .get();

  if (res.data && res.data.length > 0) {
    const current = res.data[0].is_starred || false;
    await db.collection('user_notifications').doc(res.data[0]._id).update({
      data: { is_starred: !current }
    });
    return { success: true, data: { is_starred: !current } };
  }

  return { success: false, message: '通知不存在' };
}

async function deleteNotification(data, openid) {
  const { user_notification_id } = data;
  if (!user_notification_id) return { success: false, message: '缺少通知ID' };

  const res = await db.collection('user_notifications')
    .where({ user_notification_id, user_openid: openid })
    .limit(1)
    .get();

  if (res.data && res.data.length > 0) {
    await db.collection('user_notifications').doc(res.data[0]._id).update({
      data: { is_deleted: true }
    });
  }

  return { success: true };
}

// ==================== 系统通知（供其他模块调用） ====================

async function sendSystemNotification(data) {
  const {
    type, title, content, summary, class_id,
    target_type, target_ids, priority, action_type, action_data,
    sender_name, expire_time
  } = data;

  if (!type || !title || !content || !class_id) {
    return { success: false, message: '缺少必要参数' };
  }

  const notification_id = generateId('ntf');
  const now = db.serverDate();

  const notificationData = {
    notification_id,
    type,
    title,
    content,
    summary: summary || title.substring(0, 50),
    sender_id: 'system',
    sender_name: sender_name || '系统',
    sender_role: 'system',
    class_id,
    target_type: target_type || 'all_class',
    target_ids: target_ids || [],
    priority: priority || 'normal',
    action_type: action_type || '',
    action_data: action_data || {},
    status: 'published',
    publish_time: now,
    expire_time: expire_time || null,
    read_count: 0,
    created_at: now,
    updated_at: now
  };

  await db.collection('notifications').add({ data: notificationData });

  // 创建用户通知关联
  const count = await createUserNotifications(notification_id, class_id, target_type || 'all_class', target_ids || [], 'system', now);

  return { success: true, data: { notification_id, recipient_count: count } };
}

// ==================== 学生信息管理 ====================

async function updateStudentInfo(data, openid) {
  const { _id, operation_type, ...updateData } = data;
  console.log('[updateStudentInfo] 操作场景:', operation_type || '未指定', '学生ID:', _id);
  if (!_id) return { success: false, message: '缺少学生记录ID' };

  const allowedRoles = ['admin', 'head_teacher', 'class_teacher'];
  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();

  let userRole = '';
  let userId = '';
  if (userRes.data && userRes.data.length > 0) {
    userRole = userRes.data[0].role || '';
    userId = userRes.data[0]._id;
  }
  console.log('[updateStudentInfo] 用户信息:', { 
    openid, 
    userRole: userRole || '空', 
    userRoleRaw: userRes.data && userRes.data[0] ? userRes.data[0].role : 'undefined',
    userId, 
    userRecordFound: userRes.data && userRes.data.length > 0 
  });

  let isAdminOrTeacher = allowedRoles.includes(userRole);
  console.log('[updateStudentInfo] 管理员/教师权限检查:', { isAdminOrTeacher, userRole });
  if (!isAdminOrTeacher) {
    const relRes = await db.collection('user_class_relation')
      .where({ user_openid: openid, role: _.in(['head_teacher', 'class_teacher', 'admin']), status: 'joined' })
      .limit(1)
      .get();
    if (relRes.data && relRes.data.length > 0) {
      isAdminOrTeacher = true;
    }
  }

  let isSelfOrParent = false;
  
  console.log('[updateStudentInfo] 开始学生/家长权限验证:', { userRole, shouldCheck: userRole === 'student' || userRole === 'parent' || userRole === '' });
  
  if (userRole === 'student' || userRole === 'parent' || userRole === '') {
    try {
      const docRes = await db.collection('students').doc(_id).get().catch(() => null);
      let studentRecord = docRes && docRes.data ? docRes.data : null;
      console.log('[updateStudentInfo] 查询学生记录 (通过doc):', { found: !!studentRecord, _id });
      
      if (!studentRecord) {
        const byStudentId = await db.collection('students').where({ student_id: _id }).limit(1).get();
        studentRecord = byStudentId.data && byStudentId.data.length > 0 ? byStudentId.data[0] : null;
        console.log('[updateStudentInfo] 查询学生记录 (通过student_id):', { found: !!studentRecord, student_id: _id });
      }
      if (!studentRecord) {
        const byOpenid = await db.collection('students').where({ _openid: _id }).limit(1).get();
        studentRecord = byOpenid.data && byOpenid.data.length > 0 ? byOpenid.data[0] : null;
        console.log('[updateStudentInfo] 查询学生记录 (通过_openid):', { found: !!studentRecord, _openid: _id });
      }
      if (studentRecord) {
        if (userRole === 'student' || userRole === '') {
          const studentOpenidMatch = 
            studentRecord._openid === openid ||
            studentRecord.user_openid === openid ||
            studentRecord.openid === openid;
          
          const studentIdMatch = 
            studentRecord.student_id === userId ||
            (userRes.data && userRes.data[0] && userRes.data[0].student_id && studentRecord.student_id === userRes.data[0].student_id);
          
          if (studentOpenidMatch || studentIdMatch) {
            isSelfOrParent = true;
            console.log('[updateStudentInfo] 学生本人权限验证通过:', {
              openid,
              studentRecordOpenid: studentRecord._openid,
              studentRecordUserOpenid: studentRecord.user_openid,
              studentRecordOpenid2: studentRecord.openid,
              studentId: studentRecord.student_id,
              userId,
              userRole: userRole || '未知'
            });
          } else if (userRole === 'student') {
            console.warn('[updateStudentInfo] 学生openid不匹配:', {
              currentOpenid: openid,
              studentRecordOpenid: studentRecord._openid,
              studentRecordUserOpenid: studentRecord.user_openid,
              studentRecordOpenid2: studentRecord.openid,
              studentId: studentRecord.student_id,
              userId
            });
          }
        }
        if (userRole === 'parent' || (userRole === '' && !isSelfOrParent)) {
          const studentIdVal = studentRecord.student_id;
          if (studentIdVal) {
            let relCheck = await db.collection('user_class_relation')
              .where({ user_openid: openid, student_id: studentIdVal, status: 'joined' })
              .limit(1)
              .get();
            
            if (!relCheck.data || relCheck.data.length === 0) {
              relCheck = await db.collection('user_class_relation')
                .where({ _openid: openid, student_id: studentIdVal, status: 'joined' })
                .limit(1)
                .get();
            }
            
            if ((!relCheck.data || relCheck.data.length === 0) && userId) {
              relCheck = await db.collection('user_class_relation')
                .where({ user_id: userId, student_id: studentIdVal, status: 'joined' })
                .limit(1)
                .get();
            }
            
            if (relCheck.data && relCheck.data.length > 0) {
              isSelfOrParent = true;
              console.log('[updateStudentInfo] 家长权限验证通过:', {
                parentOpenid: openid,
                parentId: userId,
                studentId: studentIdVal,
                relationRecord: relCheck.data[0]._id,
                userRole: userRole || '未知'
              });
            } else if (userRole === 'parent') {
              console.warn('[updateStudentInfo] 家长绑定关系未找到:', {
                parentOpenid: openid,
                parentId: userId,
                studentId: studentIdVal
              });
            }
          } else {
            console.warn('[updateStudentInfo] 学生记录缺少student_id:', studentRecord._id);
          }
        }
      } else {
        console.warn('[updateStudentInfo] 未找到学生记录:', _id);
      }
    } catch (e) {
      console.error('updateStudentInfo self-check error:', e);
    }
  }

  console.log('[updateStudentInfo] 权限检查结果:', { isAdminOrTeacher, isSelfOrParent, hasPermission: isAdminOrTeacher || isSelfOrParent });

  if (!isAdminOrTeacher && !isSelfOrParent) {
    return { success: false, message: '无权限修改学生信息' };
  }

  let allowedFields;
  if (isAdminOrTeacher) {
    allowedFields = [
      'name', 'gender', 'date_of_birth', 'ethnicity', 'political_status',
      'enrollment_date', 'phone_number', 'parent_phone_number', 'home_address',
      'is_boarding', 'position', 'class_name', 'class_id'
    ];
  } else {
    allowedFields = [
      'date_of_birth', 'ethnicity', 'political_status',
      'enrollment_date', 'phone_number', 'parent_phone_number', 'home_address',
      'is_boarding'
    ];
  }

  if (updateData.dorm_info !== undefined) {
    return { success: false, message: '住宿信息请通过宿舍同步接口(dormSyncManager)更新' };
  }

  const filteredData = {};
  for (const key of allowedFields) {
    if (updateData[key] !== undefined) {
      filteredData[key] = updateData[key];
    }
  }
  filteredData.updated_at = db.serverDate();

  if (Object.keys(filteredData).length <= 1) {
    return { success: false, message: '没有可更新的字段' };
  }

  try {
    let studentDocId = _id;
    const docRes = await db.collection('students').doc(_id).get().catch(() => null);
    if (!docRes) {
      const byOpenid = await db.collection('students')
        .where({ user_openid: _id })
        .limit(1)
        .get();
      if (byOpenid.data && byOpenid.data.length > 0) {
        studentDocId = byOpenid.data[0]._id;
      } else {
        const byOpenid2 = await db.collection('students')
          .where({ _openid: _id })
          .limit(1)
          .get();
        if (byOpenid2.data && byOpenid2.data.length > 0) {
          studentDocId = byOpenid2.data[0]._id;
        } else {
          return { success: false, message: '找不到学生记录' };
        }
      }
    }

    await db.collection('students').doc(studentDocId).update({ data: filteredData });
    console.log('[updateStudentInfo] 数据库更新成功，使用云函数管理员权限:', {
      studentDocId,
      updatedFields: Object.keys(filteredData),
      operator: openid,
      userRole: userRole || '未知',
      isAdminOrTeacher,
      isSelfOrParent
    });
    return { success: true };
  } catch (err) {
    console.error('[updateStudentInfo] 更新失败:', {
      error: err.message,
      stack: err.stack,
      studentDocId: studentDocId || _id,
      operator: openid,
      userRole: userRole || '未知'
    });
    return { success: false, message: err.message || '更新失败' };
  }
}

async function getStudentDetail(data, openid) {
  const { target_student_id, operation_type } = data;
  console.log('[getStudentDetail] 操作场景:', operation_type || '未指定', '目标学生ID:', target_student_id);
  
  if (!target_student_id) {
    return { success: false, message: '缺少目标学生ID' };
  }

  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();

  let userRole = '';
  let userId = '';
  if (userRes.data && userRes.data.length > 0) {
    userRole = userRes.data[0].role || '';
    userId = userRes.data[0]._id;
  }

  if (!userRole) {
    const relRes = await db.collection('user_class_relation')
      .where({ user_openid: openid, status: 'joined' })
      .limit(1)
      .get();
    if (relRes.data && relRes.data.length > 0) {
      userRole = relRes.data[0].role || '';
    }
  }

  console.log('[getStudentDetail] 访问者信息:', { openid, userRole: userRole || '未知', userId });

  let studentRecord = null;
  let studentDocId = target_student_id;

  const docRes = await db.collection('students').doc(target_student_id).get().catch(() => null);
  if (docRes && docRes.data) {
    studentRecord = docRes.data;
  } else {
    const byStudentId = await db.collection('students')
      .where({ student_id: target_student_id })
      .limit(1)
      .get();
    if (byStudentId.data && byStudentId.data.length > 0) {
      studentRecord = byStudentId.data[0];
      studentDocId = studentRecord._id;
    }
  }

  if (!studentRecord) {
    console.warn('[getStudentDetail] 未找到学生记录:', target_student_id);
    return { success: false, message: '未找到学生记录' };
  }

  console.log('[getStudentDetail] 找到学生记录:', { studentDocId, student_id: studentRecord.student_id });

  let permission_level = 'no_access';
  const allowedRoles = ['admin', 'head_teacher', 'class_teacher'];

  if (allowedRoles.includes(userRole)) {
    permission_level = 'full_access';
    console.log('[getStudentDetail] 管理员/教师权限:', { userRole, permission_level });
  } else if (userRole === 'student' || userRole === 'parent' || userRole === '') {
    if (userRole === 'student' || userRole === '') {
      const studentOpenidMatch = 
        studentRecord._openid === openid ||
        studentRecord.user_openid === openid ||
        studentRecord.openid === openid;
      
      const studentIdMatch = 
        studentRecord.student_id === userId ||
        (userRes.data && userRes.data[0] && userRes.data[0].student_id && studentRecord.student_id === userRes.data[0].student_id);

      if (studentOpenidMatch || studentIdMatch) {
        permission_level = 'full_access';
        console.log('[getStudentDetail] 学生本人权限:', { permission_level });
      } else if (userRole === 'student') {
        permission_level = 'partial_access';
        console.log('[getStudentDetail] 学生查看其他学生:', { permission_level });
      }
    }

    if (userRole === 'parent' || (userRole === '' && permission_level === 'no_access')) {
      const studentIdVal = studentRecord.student_id;
      if (studentIdVal) {
        let relCheck = await db.collection('user_class_relation')
          .where({ user_openid: openid, student_id: studentIdVal, status: 'joined' })
          .limit(1)
          .get();
        
        if (!relCheck.data || relCheck.data.length === 0) {
          relCheck = await db.collection('user_class_relation')
            .where({ _openid: openid, student_id: studentIdVal, status: 'joined' })
            .limit(1)
            .get();
        }
        
        if ((!relCheck.data || relCheck.data.length === 0) && userId) {
          relCheck = await db.collection('user_class_relation')
            .where({ user_id: userId, student_id: studentIdVal, status: 'joined' })
            .limit(1)
            .get();
        }
        
        if (relCheck.data && relCheck.data.length > 0) {
          permission_level = 'full_access';
          console.log('[getStudentDetail] 家长查看绑定学生:', { permission_level });
        } else if (userRole === 'parent') {
          permission_level = 'no_access';
          console.log('[getStudentDetail] 家长查看非绑定学生:', { permission_level });
        }
      }
    }
  }

  console.log('[getStudentDetail] 最终权限级别:', { permission_level });

  if (permission_level === 'no_access') {
    return { 
      success: false, 
      message: '无权限查看该学生详情',
      permission_level: 'no_access'
    };
  }

  const sensitiveFields = ['phone_number', 'parent_phone_number', 'home_address', 'id_card_number', 'dorm_info'];
  
  let responseData;
  if (permission_level === 'partial_access') {
    responseData = { ...studentRecord };
    sensitiveFields.forEach(field => {
      if (responseData[field] !== undefined) {
        responseData[field] = '***';
      }
    });
    console.log('[getStudentDetail] 数据脱敏完成，隐藏字段:', sensitiveFields.filter(f => studentRecord[f] !== undefined));
  } else {
    responseData = studentRecord;
    console.log('[getStudentDetail] 返回完整数据');
  }

  return {
    success: true,
    data: responseData,
    permission_level: permission_level
  };
}

async function getAccessibleStudents(data, openid) {
  console.log('[getAccessibleStudents] 开始权限预判断, openid:', openid);

  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();

  let userRole = '';
  let userId = '';
  let userStudentId = '';
  
  if (userRes.data && userRes.data.length > 0) {
    userRole = userRes.data[0].role || '';
    userId = userRes.data[0]._id;
    userStudentId = userRes.data[0].student_id || '';
  }

  if (!userRole) {
    const relRes = await db.collection('user_class_relation')
      .where({ user_openid: openid, status: 'joined' })
      .limit(1)
      .get();
    if (relRes.data && relRes.data.length > 0) {
      userRole = relRes.data[0].role || '';
    }
  }

  console.log('[getAccessibleStudents] 访问者信息:', { openid, userRole: userRole || '未知', userId, userStudentId });

  const allowedRoles = ['admin', 'head_teacher', 'class_teacher'];
  
  if (allowedRoles.includes(userRole)) {
    const allStudentsRes = await db.collection('students')
      .field({ student_id: true, _id: true })
      .limit(1000)
      .get();
    
    const accessibleIds = allStudentsRes.data.map(s => s.student_id || s._id);
    
    console.log('[getAccessibleStudents] 管理员/教师权限，可访问所有学生:', accessibleIds.length);
    
    return {
      success: true,
      permission_type: 'all',
      accessible_student_ids: accessibleIds,
      message: '可访问所有学生'
    };
  }
  
  if (userRole === 'student' || userRole === '') {
    if (userStudentId) {
      console.log('[getAccessibleStudents] 学生权限，仅可访问自己:', userStudentId);
      
      return {
        success: true,
        permission_type: 'self_only',
        accessible_student_ids: [userStudentId],
        message: '仅可访问自己的信息'
      };
    }
    
    const studentRes = await db.collection('students')
      .where({
        _openid: openid
      })
      .limit(1)
      .get();
    
    if (studentRes.data && studentRes.data.length > 0) {
      const studentId = studentRes.data[0].student_id;
      console.log('[getAccessibleStudents] 通过openid找到学生记录，仅可访问自己:', studentId);
      
      return {
        success: true,
        permission_type: 'self_only',
        accessible_student_ids: [studentId],
        message: '仅可访问自己的信息'
      };
    }
    
    console.warn('[getAccessibleStudents] 未找到学生记录，无权限访问任何学生');
    
    return {
      success: true,
      permission_type: 'none',
      accessible_student_ids: [],
      message: '无权限访问任何学生信息'
    };
  }
  
  if (userRole === 'parent') {
    const relRes = await db.collection('user_class_relation')
      .where({
        user_openid: openid,
        role: 'parent',
        status: 'joined'
      })
      .field({ student_id: true })
      .get();
    
    const boundStudentIds = relRes.data.map(r => r.student_id).filter(id => id);
    
    console.log('[getAccessibleStudents] 家长权限，可访问绑定学生:', boundStudentIds);
    
    return {
      success: true,
      permission_type: 'bound_students',
      accessible_student_ids: boundStudentIds,
      message: `可访问${boundStudentIds.length}个绑定学生`
    };
  }
  
  console.warn('[getAccessibleStudents] 未知角色，无权限访问任何学生');
  
  return {
    success: true,
    permission_type: 'none',
    accessible_student_ids: [],
    message: '无权限访问任何学生信息'
  };
}

async function getClassInfo(data, caller) {
  const { classId } = data || {}
  if (!classId) return { success: false, message: '缺少必要参数: classId' }
  try {
    const res = await db.collection('classes').doc(classId).get()
    if (!res.data) return { success: false, message: '班级不存在' }
    return { success: true, data: res.data }
  } catch (err) {
    console.error('getClassInfo error:', err)
    return { success: false, message: err.message || '获取班级信息失败' }
  }
}

// ==================== 用户权限管理（Admin） ====================

async function listUsers(data) {
  const { page = 1, pageSize = 20, role = '', search = '' } = data;
  const skip = (page - 1) * pageSize;

  try {
    let userQuery = db.collection('users');
    let whereCond = {};
    if (search) {
      whereCond = _.or([
        { name: db.RegExp({ regexp: search, options: 'i' }) },
        { _openid: db.RegExp({ regexp: search, options: 'i' }) }
      ]);
    }

    const countRes = await userQuery.where(whereCond).count();
    const total = countRes.total || 0;

    const userRes = await userQuery.where(whereCond).skip(skip).limit(pageSize).get();
    const users = userRes.data || [];

    const openids = users.map(u => u._openid);
    if (openids.length === 0) {
      return { success: true, data: { users: [], total } };
    }

    const relationRes = await db.collection('user_class_relation')
      .where({ user_openid: _.in(openids), status: 'joined' })
      .get();

    const classIds = [...new Set(relationRes.data.map(r => r.class_id))];
    let classMap = {};
    if (classIds.length > 0) {
      const classRes = await db.collection('classes')
        .where({ _id: _.in(classIds) })
        .get();
      (classRes.data || []).forEach(c => { classMap[c._id] = c.name || c.class_name || ''; });
    }

    const result = users.map(u => {
      const relations = relationRes.data.filter(r => r.user_openid === u._openid);
      const classes = relations.map(r => ({
        classId: r.class_id,
        className: classMap[r.class_id] || '',
        role: r.role,
        studentId: r.student_id || ''
      }));
      const primaryRole = relations.length > 0 ? relations[0].role : 'student';
      return {
        openid: u._openid,
        name: u.name || u.nick_name || '',
        avatarUrl: u.avatar_url || u.avatarUrl || '',
        primaryRole,
        membership: u.membership || {},
        classes
      };
    });

    const filtered = role ? result.filter(u => u.primaryRole === role) : result;

    return { success: true, data: { users: filtered, total } };
  } catch (err) {
    console.error('listUsers error:', err);
    return { success: false, message: err.message || '获取用户列表失败' };
  }
}

async function updateUserRole(data, caller) {
  const { targetOpenid, classId, newRole } = data;
  if (!targetOpenid || !classId || !newRole) {
    return { success: false, message: '缺少必要参数' };
  }

  try {
    const relRes = await db.collection('user_class_relation')
      .where({ user_openid: targetOpenid, class_id: classId })
      .limit(1)
      .get();

    if (!relRes.data || relRes.data.length === 0) {
      return { success: false, message: '未找到该用户的班级关系' };
    }

    const oldRelation = relRes.data[0];
    const oldRole = oldRelation.role;

    if (oldRole === newRole) {
      return { success: true, message: '角色未变化' };
    }

    await db.collection('user_class_relation').doc(oldRelation._id).update({
      data: { role: newRole }
    });

    const targetUserRes = await db.collection('users')
      .where({ _openid: targetOpenid })
      .limit(1)
      .get();
    const targetName = (targetUserRes.data && targetUserRes.data[0]) ? (targetUserRes.data[0].name || '') : '';

    await db.collection('permission_audit_logs').add({
      data: {
        operator_openid: caller.openid,
        operator_name: caller.realName || '',
        target_openid: targetOpenid,
        target_name: targetName,
        action: 'updateRole',
        old_value: { role: oldRole },
        new_value: { role: newRole },
        class_id: classId,
        created_at: db.serverDate()
      }
    });

    return { success: true, message: '角色更新成功' };
  } catch (err) {
    console.error('updateUserRole error:', err);
    return { success: false, message: err.message || '更新角色失败' };
  }
}

async function updateUserMembership(data, caller) {
  const { targetOpenid, isAdvanced, level } = data;
  if (!targetOpenid) {
    return { success: false, message: '缺少必要参数' };
  }

  try {
    const userRes = await db.collection('users')
      .where({ _openid: targetOpenid })
      .limit(1)
      .get();

    if (!userRes.data || userRes.data.length === 0) {
      return { success: false, message: '未找到该用户' };
    }

    const oldUser = userRes.data[0];
    const oldMembership = oldUser.membership || {};
    const newMembership = {
      is_advanced: !!isAdvanced,
      level: level || 1
    };

    await db.collection('users').doc(oldUser._id).update({
      data: { membership: newMembership }
    });

    await db.collection('permission_audit_logs').add({
      data: {
        operator_openid: caller.openid,
        operator_name: caller.realName || '',
        target_openid: targetOpenid,
        target_name: oldUser.name || '',
        action: 'updateMembership',
        old_value: { membership: oldMembership },
        new_value: { membership: newMembership },
        class_id: '',
        created_at: db.serverDate()
      }
    });

    return { success: true, message: '会员更新成功' };
  } catch (err) {
    console.error('updateUserMembership error:', err);
    return { success: false, message: err.message || '更新会员失败' };
  }
}

async function getPermissionAuditLog(data) {
  const { targetOpenid, page = 1, pageSize = 50 } = data;
  const skip = (page - 1) * pageSize;

  try {
    let whereCond = {};
    if (targetOpenid) {
      whereCond = { target_openid: targetOpenid };
    }

    const res = await db.collection('permission_audit_logs')
      .where(whereCond)
      .orderBy('created_at', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();

    return { success: true, data: res.data || [] };
  } catch (err) {
    console.error('getPermissionAuditLog error:', err);
    if (err.errCode === -502005) {
      return { success: true, data: [] };
    }
    return { success: false, message: err.message || '获取审计日志失败' };
  }
}

async function updateUser(data, caller) {
  const { userId, ...fields } = data;
  if (!userId) {
    return { success: false, message: '缺少用户ID' };
  }

  try {
    const userRes = await db.collection('users').doc(userId).get();
    const targetUser = userRes.data;

    if (!targetUser) {
      return { success: false, message: '用户不存在' };
    }

    if (caller.openid !== targetUser._openid && caller.role !== 'admin') {
      return { success: false, message: '无权修改该用户信息' };
    }

    const allowedFields = ['nickname', 'avatarUrl', 'phone', 'email', 'real_name'];
    const updateData = { updated_at: db.serverDate() };
    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        updateData[field] = fields[field];
      }
    }

    await db.collection('users').doc(userId).update({ data: updateData });
    return { success: true, message: '用户信息更新成功' };
  } catch (err) {
    console.error('updateUser error:', err);
    return { success: false, message: err.message || '更新用户失败' };
  }
}

async function initUserMembershipDirect(openid) {
  try {
    const existRes = await db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get();

    if (existRes.data && existRes.data.length > 0) {
      const user = existRes.data[0];
      if (user.membership && user.membership.level) {
        return { success: true, isNew: false, message: '会员已存在' };
      }
      await db.collection('users').doc(user._id).update({
        data: {
          membership: { level: 1, is_advanced: false, type: 'free' },
          updated_at: db.serverDate()
        }
      });
      return { success: true, isNew: false, message: '会员初始化成功' };
    }

    await db.collection('users').add({
      data: {
        _openid: openid,
        user_openid: openid,
        openid: openid,
        role: 'user',
        nickname: '微信用户',
        is_active: true,
        membership: { level: 1, is_advanced: false, type: 'free' },
        membership_usage: {},
        membership_permissions: {},
        last_login: db.serverDate(),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    return { success: true, isNew: true, message: '用户及会员初始化成功' };
  } catch (err) {
    console.error('initUserMembershipDirect error:', err);
    return { success: false, message: err.message || '初始化会员失败' };
  }
}
