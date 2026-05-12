// 云函数：心灵树洞
// 功能：匿名发帖、回复、鼓励（点赞）、举报、管理
// 集合：treehole_posts / treehole_replies / treehole_hearts

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { getCallerInfo } = require('./utils/auth');

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const caller = await getCallerInfo(event, data?.class_id || data?.classId);

    switch (action) {
      case 'publishPost':
        return await publishPost(data, caller.openid);
      case 'getPosts':
        return await getPosts(data, caller.openid);
      case 'getPostDetail':
        return await getPostDetail(data, caller.openid);
      case 'replyPost':
        return await replyPost(data, caller.openid);
      case 'toggleHeart':
        return await toggleHeart(data, caller.openid);
      case 'reportPost':
        return await reportPost(data, caller.openid);
      case 'deletePost':
        return await deletePost(data, caller.openid);
      case 'hidePost':
        return await hidePost(data, caller.openid);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('treeHoleManager 错误:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};

/**
 * 发布帖子
 * 1. 校验内容长度和班级ID
 * 2. 匿名时 author_name 为空，非匿名时查询用户姓名
 */
async function publishPost(data, openId) {
  const { class_id, content, mood, is_anonymous } = data;

  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }
  if (!content || !content.trim()) {
    return { success: false, message: '内容不能为空' };
  }
  if (content.trim().length > 500) {
    return { success: false, message: '内容不能超过500字' };
  }

  const validMoods = ['happy', 'sad', 'anxious', 'angry', 'confused', 'peaceful', ''];
  if (mood && !validMoods.includes(mood)) {
    return { success: false, message: '心情标签无效' };
  }

  // 验证用户是否属于该班级
  let relationRes = await db.collection('user_class_relation')
    .where({ user_openid: openId, class_id: class_id })
    .limit(1)
    .get();

  if (!relationRes.data || relationRes.data.length === 0) {
    relationRes = await db.collection('user_class_relation')
      .where({ _openid: openId, class_id: class_id })
      .limit(1)
      .get();
  }

  if (!relationRes.data || relationRes.data.length === 0) {
    return { success: false, message: '您不属于该班级', code: 403 };
  }

  // 非匿名时获取用户姓名
  let authorName = '';
  const anonymous = is_anonymous !== false; // 默认匿名
  if (!anonymous) {
    const userRes = await db.collection('users')
      .where({ _openid: openId })
      .limit(1)
      .get();
    if (userRes.data && userRes.data.length > 0) {
      authorName = userRes.data[0].name || userRes.data[0].nickName || '';
    }
  }

  const now = db.serverDate();
  const postRes = await db.collection('treehole_posts').add({
    data: {
      class_id: class_id,
      content: content.trim(),
      mood: mood || '',
      is_anonymous: anonymous,
      author_id: openId,
      author_name: authorName,
      hearts_count: 0,
      replies_count: 0,
      is_reported: false,
      report_reason: '',
      reported_by: '',
      status: 'normal',
      created_at: now,
      updated_at: now
    }
  });

  return {
    success: true,
    message: '发布成功',
    data: { post_id: postRes._id }
  };
}

/**
 * 获取帖子列表
 * - 按 created_at 降序
 * - 分页加载
 * - 过滤已删除/已隐藏的帖子（普通用户）
 * - 管理员可见已举报帖子
 */
async function getPosts(data, openId) {
  const { class_id, page = 0, pageSize = 20, role = '' } = data;

  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }

  // 验证用户是否属于该班级
  let relationRes = await db.collection('user_class_relation')
    .where({ user_openid: openId, class_id: class_id })
    .limit(1)
    .get();

  if (!relationRes.data || relationRes.data.length === 0) {
    relationRes = await db.collection('user_class_relation')
      .where({ _openid: openId, class_id: class_id })
      .limit(1)
      .get();
  }

  if (!relationRes.data || relationRes.data.length === 0) {
    return { success: false, message: '您不属于该班级', code: 403 };
  }

  // 构建查询条件
  let query = { class_id: class_id };

  // 普通用户只看正常状态的帖子
  if (role !== 'head_teacher' && role !== 'admin') {
    query.status = 'normal';
    query.is_reported = _.neq(true);
  } else {
    // 管理员可看正常和已举报的（但不是已删除的）
    query.status = _.neq('deleted');
  }

  const skip = page * pageSize;
  const totalRes = await db.collection('treehole_posts')
    .where(query)
    .count();

  const res = await db.collection('treehole_posts')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  const posts = (res.data || []).map(post => {
    // 匿名帖子隐藏 author_id
    if (post.is_anonymous) {
      post.author_id = '';
      post.author_name = '';
    }
    return post;
  });

  // 查询当前用户对帖子的鼓励状态
  const postIds = posts.map(p => p._id);
  let heartMap = {};
  if (postIds.length > 0) {
    const heartRes = await db.collection('treehole_hearts')
      .where({
        post_id: _.in(postIds),
        user_id: openId
      })
      .get();
    (heartRes.data || []).forEach(h => {
      heartMap[h.post_id] = true;
    });
  }

  return {
    success: true,
    data: {
      posts: posts,
      total: totalRes.total,
      hasMore: (skip + pageSize) < totalRes.total,
      heartMap: heartMap
    }
  };
}

/**
 * 获取帖子详情（含回复列表）
 */
async function getPostDetail(data, openId) {
  const { post_id, class_id } = data;

  if (!post_id || !class_id) {
    return { success: false, message: '缺少帖子ID或班级ID' };
  }

  // 查询帖子
  const postRes = await db.collection('treehole_posts')
    .where({ _id: post_id, class_id: class_id })
    .limit(1)
    .get();

  if (!postRes.data || postRes.data.length === 0) {
    return { success: false, message: '帖子不存在' };
  }

  const post = postRes.data[0];

  // 匿名帖子隐藏 author_id
  if (post.is_anonymous) {
    post.author_id = '';
    post.author_name = '';
  }

  // 查询回复列表
  const repliesRes = await db.collection('treehole_replies')
    .where({ post_id: post_id })
    .orderBy('created_at', 'asc')
    .limit(100)
    .get();

  const replies = (repliesRes.data || []).map(r => {
    if (r.is_anonymous) {
      r.author_id = '';
      r.author_name = '';
    }
    return r;
  });

  // 查询当前用户是否已鼓励
  const heartRes = await db.collection('treehole_hearts')
    .where({ post_id: post_id, user_id: openId })
    .limit(1)
    .get();

  const hasHearted = heartRes.data && heartRes.data.length > 0;

  return {
    success: true,
    data: {
      post: post,
      replies: replies,
      hasHearted: hasHearted
    }
  };
}

/**
 * 回复帖子
 * 1. 校验帖子是否存在且未删除
 * 2. 教师回复自动标记 is_teacher
 * 3. 更新帖子 replies_count
 */
async function replyPost(data, openId) {
  const { post_id, class_id, content, is_anonymous } = data;

  if (!post_id || !class_id) {
    return { success: false, message: '缺少帖子ID或班级ID' };
  }
  if (!content || !content.trim()) {
    return { success: false, message: '回复内容不能为空' };
  }
  if (content.trim().length > 200) {
    return { success: false, message: '回复内容不能超过200字' };
  }

  // 验证帖子存在且未删除
  const postRes = await db.collection('treehole_posts')
    .where({ _id: post_id, class_id: class_id, status: _.neq('deleted') })
    .limit(1)
    .get();

  if (!postRes.data || postRes.data.length === 0) {
    return { success: false, message: '帖子不存在或已删除' };
  }

  // 判断是否教师
  const userRes = await db.collection('users')
    .where({ _openid: openId })
    .limit(1)
    .get();

  let isTeacher = false;
  let authorName = '';
  const anonymous = is_anonymous !== false;

  if (userRes.data && userRes.data.length > 0) {
    const userRole = userRes.data[0].role;
    isTeacher = userRole === 'head_teacher' || userRole === 'subject_teacher' || userRole === 'admin';
    if (!anonymous) {
      authorName = userRes.data[0].name || userRes.data[0].nickName || '';
    }
  }

  const now = db.serverDate();
  await db.collection('treehole_replies').add({
    data: {
      class_id: class_id,
      post_id: post_id,
      content: content.trim(),
      is_anonymous: anonymous,
      author_id: openId,
      author_name: authorName,
      is_teacher: isTeacher && !anonymous, // 匿名教师不显示教师标识
      created_at: now
    }
  });

  // 更新帖子回复数
  await db.collection('treehole_posts')
    .where({ _id: post_id })
    .update({
      data: {
        replies_count: _.inc(1),
        updated_at: db.serverDate()
      }
    });

  return {
    success: true,
    message: '回复成功'
  };
}

/**
 * 鼓励（点赞）/ 取消鼓励
 * 使用 treehole_hearts 集合去重
 */
async function toggleHeart(data, openId) {
  const { post_id, class_id } = data;

  if (!post_id || !class_id) {
    return { success: false, message: '缺少帖子ID或班级ID' };
  }

  // 验证帖子存在
  const postRes = await db.collection('treehole_posts')
    .where({ _id: post_id, class_id: class_id, status: 'normal' })
    .limit(1)
    .get();

  if (!postRes.data || postRes.data.length === 0) {
    return { success: false, message: '帖子不存在' };
  }

  // 检查是否已鼓励
  const heartRes = await db.collection('treehole_hearts')
    .where({ post_id: post_id, user_id: openId })
    .limit(1)
    .get();

  if (heartRes.data && heartRes.data.length > 0) {
    // 取消鼓励
    await db.collection('treehole_hearts')
      .where({ post_id: post_id, user_id: openId })
      .remove();

    await db.collection('treehole_posts')
      .where({ _id: post_id })
      .update({
        data: {
          hearts_count: _.inc(-1),
          updated_at: db.serverDate()
        }
      });

    return { success: true, data: { hasHearted: false } };
  } else {
    // 添加鼓励
    await db.collection('treehole_hearts').add({
      data: {
        post_id: post_id,
        user_id: openId,
        created_at: db.serverDate()
      }
    });

    await db.collection('treehole_posts')
      .where({ _id: post_id })
      .update({
        data: {
          hearts_count: _.inc(1),
          updated_at: db.serverDate()
        }
      });

    return { success: true, data: { hasHearted: true } };
  }
}

/**
 * 举报帖子
 */
async function reportPost(data, openId) {
  const { post_id, class_id, reason } = data;

  if (!post_id || !class_id) {
    return { success: false, message: '缺少帖子ID或班级ID' };
  }
  if (!reason || !reason.trim()) {
    return { success: false, message: '请填写举报原因' };
  }

  // 验证帖子存在
  const postRes = await db.collection('treehole_posts')
    .where({ _id: post_id, class_id: class_id })
    .limit(1)
    .get();

  if (!postRes.data || postRes.data.length === 0) {
    return { success: false, message: '帖子不存在' };
  }

  await db.collection('treehole_posts')
    .where({ _id: post_id })
    .update({
      data: {
        is_reported: true,
        report_reason: reason.trim(),
        reported_by: openId,
        updated_at: db.serverDate()
      }
    });

  return { success: true, message: '举报成功，管理员将尽快处理' };
}

/**
 * 删除帖子（仅管理员/班主任）
 */
async function deletePost(data, openId) {
  const { post_id, class_id } = data;

  if (!post_id || !class_id) {
    return { success: false, message: '缺少帖子ID或班级ID' };
  }

  // 验证身份
  const userRes = await db.collection('users')
    .where({ _openid: openId })
    .limit(1)
    .get();

  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户信息不存在' };
  }

  const userRole = userRes.data[0].role;
  if (userRole !== 'head_teacher' && userRole !== 'admin') {
    return { success: false, message: '仅班主任和管理员可删除帖子', code: 403 };
  }

  // 软删除
  await db.collection('treehole_posts')
    .where({ _id: post_id, class_id: class_id })
    .update({
      data: {
        status: 'deleted',
        updated_at: db.serverDate()
      }
    });

  return { success: true, message: '帖子已删除' };
}

/**
 * 隐藏/恢复帖子（仅管理员/班主任）
 */
async function hidePost(data, openId) {
  const { post_id, class_id, hide } = data;

  if (!post_id || !class_id) {
    return { success: false, message: '缺少帖子ID或班级ID' };
  }

  // 验证身份
  const userRes = await db.collection('users')
    .where({ _openid: openId })
    .limit(1)
    .get();

  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户信息不存在' };
  }

  const userRole = userRes.data[0].role;
  if (userRole !== 'head_teacher' && userRole !== 'admin') {
    return { success: false, message: '仅班主任和管理员可隐藏帖子', code: 403 };
  }

  const newStatus = hide ? 'hidden' : 'normal';

  await db.collection('treehole_posts')
    .where({ _id: post_id, class_id: class_id })
    .update({
      data: {
        status: newStatus,
        updated_at: db.serverDate()
      }
    });

  return { success: true, message: hide ? '帖子已隐藏' : '帖子已恢复' };
}
