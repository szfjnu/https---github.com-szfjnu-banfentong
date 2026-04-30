// 用户中心与通知系统云函数
// 功能：个人设置管理、统一通知接收与发布、消息推送

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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
  const { OPENID } = cloud.getWXContext();

  try {
    switch (action) {
      // ========== 用户信息 ==========
      case 'getUserProfile': return await getUserProfile(data, OPENID);
      case 'updateUserProfile': return await updateUserProfile(data, OPENID);

      // ========== 用户设置 ==========
      case 'getUserSettings': return await getUserSettings(OPENID);
      case 'updateUserSettings': return await updateUserSettings(data, OPENID);
      case 'updateNotificationPreference': return await updateNotificationPreference(data, OPENID);

      // ========== 通知发布（管理员/教师） ==========
      case 'publishNotification': return await publishNotification(data, OPENID);
      case 'recallNotification': return await recallNotification(data, OPENID);
      case 'getPublishedNotifications': return await getPublishedNotifications(data, OPENID);

      // ========== 通知接收（所有用户） ==========
      case 'getNotifications': return await getNotifications(data, OPENID);
      case 'getNotificationDetail': return await getNotificationDetail(data, OPENID);
      case 'markAsRead': return await markAsRead(data, OPENID);
      case 'markAllAsRead': return await markAllAsRead(data, OPENID);
      case 'getUnreadCount': return await getUnreadCount(data, OPENID);
      case 'toggleStar': return await toggleStar(data, OPENID);
      case 'deleteNotification': return await deleteNotification(data, OPENID);

      // ========== 系统通知（由其他模块调用） ==========
      case 'sendSystemNotification': return await sendSystemNotification(data);

      // ========== 通知类型定义 ==========
      case 'getNotificationTypes': return { success: true, data: NOTIFICATION_TYPES };

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
  const res = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();

  if (!res.data || res.data.length === 0) {
    return { success: false, message: '用户不存在' };
  }

  const user = res.data[0];
  // 获取班级信息
  let classInfo = null;
  if (user.class_name) {
    const classRes = await db.collection('classes')
      .where({ class_name: user.class_name, status: 'active' })
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

  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();

  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户不存在' };
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

  await db.collection('notifications').add({ data: notificationData });

  // 创建用户通知关联记录
  await createUserNotifications(notification_id, class_id, target_type, target_ids, openid, now);

  return { success: true, data: { notification_id } };
}

// 创建用户通知关联
async function createUserNotifications(notificationId, classId, targetType, targetIds, senderOpenid, now) {
  const batchPromises = [];
  const userQuery = {};

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
