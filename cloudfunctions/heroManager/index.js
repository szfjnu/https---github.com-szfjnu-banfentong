// 云函数：英雄台
// 功能：颁发荣誉、查看荣誉墙、喝彩、撤销荣誉
// 集合：hero_honors / hero_cheers / hero_templates

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { getCallerInfo } = require('../utils/auth');

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const caller = await getCallerInfo(event, data?.class_id || data?.classId);

    switch (action) {
      case 'awardHonor':
        return await awardHonor(data, caller.openid);
      case 'getHonorWall':
        return await getHonorWall(data, caller.openid);
      case 'getMyHonors':
        return await getMyHonors(data, caller.openid);
      case 'toggleCheer':
        return await toggleCheer(data, caller.openid);
      case 'revokeHonor':
        return await revokeHonor(data, caller.openid);
      case 'pinHonor':
        return await pinHonor(data, caller.openid);
      case 'getTemplates':
        return await getTemplates(data, caller.openid);
      case 'saveTemplate':
        return await saveTemplate(data, caller.openid);
      case 'getHonorStats':
        return await getHonorStats(data, caller.openid);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('heroManager 错误:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};

/**
 * 颁发荣誉（仅班主任/管理员）
 * 1. 验证身份权限
 * 2. 验证学生属于本班
 * 3. 写入 hero_honors 集合
 * 4. 支持批量颁发（多学生同一荣誉）
 */
async function awardHonor(data, openId) {
  const { class_id, student_id, student_name, honor_type, title, description, icon, period, awarded_by_name } = data;

  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }
  if (!student_id) {
    return { success: false, message: '缺少学生ID' };
  }
  if (!honor_type) {
    return { success: false, message: '缺少荣誉类型' };
  }
  if (!title || !title.trim()) {
    return { success: false, message: '荣誉标题不能为空' };
  }

  const validTypes = ['academic', 'behavior', 'volunteer', 'progress', 'special'];
  if (!validTypes.includes(honor_type)) {
    return { success: false, message: '荣誉类型无效' };
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
    return { success: false, message: '仅班主任和管理员可颁发荣誉', code: 403 };
  }

  // 支持批量颁发：student_id 可以是逗号分隔的字符串或数组
  let studentIds = [];
  let studentNames = [];
  if (typeof student_id === 'string') {
    studentIds = student_id.split(',').map(s => s.trim()).filter(Boolean);
    studentNames = (student_name || '').split(',').map(s => s.trim());
  } else if (Array.isArray(student_id)) {
    studentIds = student_id;
    studentNames = Array.isArray(student_name) ? student_name : [];
  }

  if (studentIds.length === 0) {
    return { success: false, message: '学生ID不能为空' };
  }

  // 验证学生属于本班
  const studentsRes = await db.collection('students')
    .where({
      student_id: _.in(studentIds),
      class_id: class_id
    })
    .get();

  const validStudentIds = (studentsRes.data || []).map(s => s.student_id);

  const now = db.serverDate();
  const successList = [];
  const failList = [];

  for (let i = 0; i < studentIds.length; i++) {
    const sid = studentIds[i];
    if (!validStudentIds.includes(sid)) {
      failList.push({ student_id: sid, reason: '学生不存在于本班' });
      continue;
    }

    // 获取学生姓名（优先使用参数，否则从数据库查）
    const student = studentsRes.data.find(s => s.student_id === sid);
    const name = studentNames[i] || (student ? (student.name || student.student_name || '') : '');

    try {
      const honorRes = await db.collection('hero_honors').add({
        data: {
          class_id: class_id,
          student_id: sid,
          student_name: name,
          honor_type: honor_type,
          title: title.trim(),
          description: (description || '').trim(),
          icon: icon || getDefaultIcon(honor_type),
          awarded_by: openId,
          awarded_by_name: awarded_by_name || '',
          cheers_count: 0,
          period: period || '',
          is_pinned: false,
          status: 'normal',
          created_at: now,
          updated_at: now
        }
      });

      successList.push({ honor_id: honorRes._id, student_id: sid, student_name: name });
    } catch (err) {
      failList.push({ student_id: sid, reason: '写入失败: ' + err.message });
    }
  }

  return {
    success: true,
    message: `颁发完成：成功${successList.length}条，失败${failList.length}条`,
    data: {
      successCount: successList.length,
      failCount: failList.length,
      successList: successList,
      failList: failList
    }
  };
}

// 根据荣誉类型获取默认图标
function getDefaultIcon(honorType) {
  const iconMap = {
    academic: 'trophy',
    behavior: 'star',
    volunteer: 'heart',
    progress: 'rocket',
    special: 'crown'
  };
  return iconMap[honorType] || 'medal';
}

/**
 * 获取荣誉墙（全班荣誉列表）
 * - 按 is_pinned 降序 + created_at 降序排列
 * - 可按 honor_type 和 period 筛选
 * - 分页加载
 */
async function getHonorWall(data, openId) {
  const { class_id, honor_type, period, page = 0, pageSize = 20 } = data;

  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }

  // 验证用户属于该班级
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
  let query = { class_id: class_id, status: 'normal' };
  if (honor_type) {
    query.honor_type = honor_type;
  }
  if (period) {
    query.period = period;
  }

  const skip = page * pageSize;
  const totalRes = await db.collection('hero_honors').where(query).count();

  // 先查置顶的，再查非置顶的，合并返回
  let pinnedHonors = [];
  if (page === 0) {
    const pinnedRes = await db.collection('hero_honors')
      .where({ ...query, is_pinned: true })
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();
    pinnedHonors = pinnedRes.data || [];
  }

  const res = await db.collection('hero_honors')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  let honors = res.data || [];

  // 第一页时合并置顶荣誉（去重）
  if (page === 0 && pinnedHonors.length > 0) {
    const pinnedIds = new Set(pinnedHonors.map(h => h._id));
    const nonPinned = honors.filter(h => !pinnedIds.has(h._id));
    honors = [...pinnedHonors, ...nonPinned];
  }

  // 查询当前用户的喝彩状态
  const honorIds = honors.map(h => h._id);
  let cheerMap = {};
  if (honorIds.length > 0) {
    const cheerRes = await db.collection('hero_cheers')
      .where({ honor_id: _.in(honorIds), user_id: openId })
      .get();
    (cheerRes.data || []).forEach(c => {
      cheerMap[c.honor_id] = true;
    });
  }

  return {
    success: true,
    data: {
      honors: honors,
      total: totalRes.total,
      hasMore: (skip + pageSize) < totalRes.total,
      cheerMap: cheerMap
    }
  };
}

/**
 * 获取我的荣誉（学生/家长）
 */
async function getMyHonors(data, openId) {
  const { class_id, student_id } = data;

  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }
  if (!student_id) {
    return { success: false, message: '缺少学生ID' };
  }

  const res = await db.collection('hero_honors')
    .where({
      class_id: class_id,
      student_id: student_id,
      status: 'normal'
    })
    .orderBy('created_at', 'desc')
    .limit(100)
    .get();

  const honors = res.data || [];

  // 按类型分组统计
  const typeCount = {};
  honors.forEach(h => {
    typeCount[h.honor_type] = (typeCount[h.honor_type] || 0) + 1;
  });

  return {
    success: true,
    data: {
      honors: honors,
      total: honors.length,
      typeCount: typeCount
    }
  };
}

/**
 * 喝彩 / 取消喝彩
 */
async function toggleCheer(data, openId) {
  const { honor_id, class_id } = data;

  if (!honor_id || !class_id) {
    return { success: false, message: '缺少参数' };
  }

  // 验证荣誉存在
  const honorRes = await db.collection('hero_honors')
    .where({ _id: honor_id, class_id: class_id, status: 'normal' })
    .limit(1)
    .get();

  if (!honorRes.data || honorRes.data.length === 0) {
    return { success: false, message: '荣誉不存在' };
  }

  // 检查是否已喝彩
  const cheerRes = await db.collection('hero_cheers')
    .where({ honor_id: honor_id, user_id: openId })
    .limit(1)
    .get();

  if (cheerRes.data && cheerRes.data.length > 0) {
    // 取消喝彩
    await db.collection('hero_cheers')
      .where({ honor_id: honor_id, user_id: openId })
      .remove();

    await db.collection('hero_honors')
      .where({ _id: honor_id })
      .update({ data: { cheers_count: _.inc(-1), updated_at: db.serverDate() } });

    return { success: true, data: { hasCheered: false } };
  } else {
    // 添加喝彩
    await db.collection('hero_cheers').add({
      data: {
        honor_id: honor_id,
        user_id: openId,
        created_at: db.serverDate()
      }
    });

    await db.collection('hero_honors')
      .where({ _id: honor_id })
      .update({ data: { cheers_count: _.inc(1), updated_at: db.serverDate() } });

    return { success: true, data: { hasCheered: true } };
  }
}

/**
 * 撤销荣誉（仅班主任/管理员）
 */
async function revokeHonor(data, openId) {
  const { honor_id, class_id } = data;

  if (!honor_id || !class_id) {
    return { success: false, message: '缺少参数' };
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
    return { success: false, message: '仅班主任和管理员可撤销荣誉', code: 403 };
  }

  await db.collection('hero_honors')
    .where({ _id: honor_id, class_id: class_id })
    .update({
      data: {
        status: 'revoked',
        updated_at: db.serverDate()
      }
    });

  return { success: true, message: '荣誉已撤销' };
}

/**
 * 置顶/取消置顶荣誉（仅班主任/管理员）
 */
async function pinHonor(data, openId) {
  const { honor_id, class_id, pin } = data;

  if (!honor_id || !class_id) {
    return { success: false, message: '缺少参数' };
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
    return { success: false, message: '仅班主任和管理员可置顶', code: 403 };
  }

  await db.collection('hero_honors')
    .where({ _id: honor_id, class_id: class_id })
    .update({
      data: {
        is_pinned: !!pin,
        updated_at: db.serverDate()
      }
    });

  return { success: true, message: pin ? '已置顶' : '已取消置顶' };
}

/**
 * 获取荣誉模板列表
 */
async function getTemplates(data, openId) {
  const { class_id } = data;

  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }

  const res = await db.collection('hero_templates')
    .where({ class_id: class_id })
    .orderBy('honor_type', 'asc')
    .limit(50)
    .get();

  // 追加系统默认模板
  const defaultTemplates = [
    { honor_type: 'academic', title: '月度学霸', description: '本月学业成绩优异', icon: 'trophy' },
    { honor_type: 'academic', title: '单科之王', description: '某科目成绩班级第一', icon: 'trophy' },
    { honor_type: 'behavior', title: '礼仪之星', description: '行为规范，礼貌待人', icon: 'star' },
    { honor_type: 'behavior', title: '课堂之星', description: '课堂表现积极，专注认真', icon: 'star' },
    { honor_type: 'volunteer', title: '志愿先锋', description: '积极参与志愿服务活动', icon: 'heart' },
    { honor_type: 'volunteer', title: '服务达人', description: '热心服务班级和同学', icon: 'heart' },
    { honor_type: 'progress', title: '进步达人', description: '成绩或行为有明显进步', icon: 'rocket' },
    { honor_type: 'progress', title: '逆袭之星', description: '从低谷走向进步', icon: 'rocket' },
    { honor_type: 'special', title: '全勤之星', description: '本月无迟到早退缺席', icon: 'crown' },
    { honor_type: 'special', title: '特别贡献', description: '为班级做出特别贡献', icon: 'crown' }
  ];

  const customTemplates = (res.data || []).map(t => ({
    honor_type: t.honor_type,
    title: t.title,
    description: t.description || '',
    icon: t.icon || 'medal',
    _id: t._id
  }));

  return {
    success: true,
    data: {
      templates: [...defaultTemplates, ...customTemplates]
    }
  };
}

/**
 * 保存自定义模板（仅班主任/管理员）
 */
async function saveTemplate(data, openId) {
  const { class_id, honor_type, title, description, icon } = data;

  if (!class_id || !honor_type || !title) {
    return { success: false, message: '缺少必要参数' };
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
    return { success: false, message: '仅班主任和管理员可创建模板', code: 403 };
  }

  await db.collection('hero_templates').add({
    data: {
      class_id: class_id,
      honor_type: honor_type,
      title: title.trim(),
      description: (description || '').trim(),
      icon: icon || 'medal',
      created_by: openId,
      created_at: db.serverDate()
    }
  });

  return { success: true, message: '模板已保存' };
}

/**
 * 获取荣誉统计（各类别数量）
 */
async function getHonorStats(data, openId) {
  const { class_id, period } = data;

  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }

  let query = { class_id: class_id, status: 'normal' };
  if (period) {
    query.period = period;
  }

  const res = await db.collection('hero_honors')
    .where(query)
    .get();

  const honors = res.data || [];

  // 按类型统计
  const typeCount = {};
  const typeStudentSet = {};
  honors.forEach(h => {
    typeCount[h.honor_type] = (typeCount[h.honor_type] || 0) + 1;
    if (!typeStudentSet[h.honor_type]) typeStudentSet[h.honor_type] = new Set();
    typeStudentSet[h.honor_type].add(h.student_id);
  });

  // 转换为学生人数
  const typeStudentCount = {};
  Object.keys(typeStudentSet).forEach(k => {
    typeStudentCount[k] = typeStudentSet[k].size;
  });

  // 总计
  const totalHonors = honors.length;
  const totalStudents = new Set(honors.map(h => h.student_id)).size;

  return {
    success: true,
    data: {
      typeCount: typeCount,
      typeStudentCount: typeStudentCount,
      totalHonors: totalHonors,
      totalStudents: totalStudents
    }
  };
}
