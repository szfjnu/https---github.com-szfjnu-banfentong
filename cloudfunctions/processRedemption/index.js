// cloudfunctions/processRedemption/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/**
 * 兑换处理云函数
 * 支持直接兑换和投标兑换两种模式
 * 支持班委初审 → 班主任终审 → 发货 → 收货的完整流程
 */
exports.main = async (event, context) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();

  try {
    switch (action) {
      case 'submitRedemption':
        return await submitRedemption(data, wxContext);
      case 'cadreApprove':
        return await cadreApprove(data, wxContext);
      case 'teacherApprove':
        return await teacherApprove(data, wxContext);
      case 'rejectRedemption':
        return await rejectRedemption(data, wxContext);
      case 'confirmShip':
        return await confirmShip(data, wxContext);
      case 'confirmReceive':
        return await confirmReceive(data, wxContext);
      case 'processBidResult':
        return await processBidResult(data, wxContext);
      case 'getMyRedemptions':
        return await getMyRedemptions(data, wxContext);
      case 'getRedemptionLedger':
        return await getRedemptionLedger(data, wxContext);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('兑换处理错误:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};

/**
 * 提交兑换申请
 * 直接兑换：提交后等待审批
 * 投标兑换：提交投标，截止后自动比价
 */
async function submitRedemption(data, wxContext) {
  const { itemId, bidScore, studentId, studentName, classId } = data;

  if (!itemId || !bidScore || !studentId || !classId) {
    return { success: false, message: '参数不完整' };
  }

  // 获取商品信息（验证班级归属）
  const itemRes = await db.collection('redemption_items')
    .where({ item_id: itemId, class_id: classId })
    .limit(1)
    .get();

  if (!itemRes.data || itemRes.data.length === 0) {
    return { success: false, message: '商品不存在' };
  }

  const item = itemRes.data[0];

  if (item.status !== '可兑换') {
    return { success: false, message: '商品不可兑换' };
  }

  if (item.quantity <= 0) {
    return { success: false, message: '商品库存不足' };
  }

  if (bidScore < item.required_score) {
    return { success: false, message: `投标积分不能低于${item.required_score}` };
  }

  // 检查学生积分是否足够
  const studentRes = await db.collection('students')
    .where({ student_id: studentId, class_id: classId })
    .limit(1)
    .get();

  if (!studentRes.data || studentRes.data.length === 0) {
    return { success: false, message: '学生信息不存在' };
  }

  const student = studentRes.data[0];
  if ((student.current_score || 100) < bidScore) {
    return { success: false, message: '积分不足' };
  }

  // 检查是否已经对该商品提交过申请（班级维度隔离）
  const existRes = await db.collection('redemption_requests')
    .where({
      item_id: itemId,
      student_id: studentId,
      class_id: classId,
      status: _.in(['待审批', '待班主任审批', '已通过'])
    })
    .count();

  if (existRes.total > 0) {
    return { success: false, message: '您已提交过该商品的兑换申请' };
  }

  // 创建兑换请求
  const requestId = `RR${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const now = db.serverDate();

  const requestData = {
    request_id: requestId,
    item_id: itemId,
    item_name: item.name,
    student_id: studentId,
    student_name: studentName || student.name || '',
    class_name: student.class_name || '',
    class_id: classId,
    required_score: item.required_score,
    redemption_mode: item.redemption_mode || '直接兑换',
    bid_score: bidScore,
    bid_time: now,
    status: '待审批',
    shipping_status: 'pending',
    created_at: now,
    updated_at: now
  };

  // 投标模式：设置截止时间相关
  if (item.redemption_mode === '投标模式' && item.bid_end_time) {
    requestData.bid_end_time = item.bid_end_time;
  }

  await db.collection('redemption_requests').add({ data: requestData });

  return {
    success: true,
    message: item.redemption_mode === '投标模式' ? '投标成功' : '兑换申请已提交',
    data: { request_id: requestId }
  };
}

/**
 * 班委初审通过
 */
async function cadreApprove(data, wxContext) {
  const { requestId, cadreName } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  const requestRes = await db.collection('redemption_requests').doc(requestId).get();
  const request = requestRes.data;

  if (request.status !== '待审批') {
    return { success: false, message: '当前状态不可操作' };
  }

  await db.collection('redemption_requests').doc(requestId).update({
    data: {
      status: '待班主任审批',
      cadre_approver: cadreName || '班委',
      cadre_approval_time: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return { success: true, message: '初审通过，已推送至班主任审批' };
}

/**
 * 班主任终审批准
 */
async function teacherApprove(data, wxContext) {
  const { requestId, approverName } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  const requestRes = await db.collection('redemption_requests').doc(requestId).get();
  const request = requestRes.data;

  if (request.status !== '待审批' && request.status !== '待班主任审批') {
    return { success: false, message: '当前状态不可操作' };
  }

  // 扣除学生积分
  const score = request.bid_score || request.required_score || 0;
  if (score > 0) {
    await db.collection('students')
      .where({
        student_id: request.student_id,
        class_id: request.class_id
      })
      .update({
        data: {
          current_score: _.inc(-score),
          updated_at: db.serverDate()
        }
      });
  }

  // 更新商品库存（班级维度验证）
  if (request.item_id) {
    const itemRes = await db.collection('redemption_items')
      .where({ item_id: request.item_id, class_id: request.class_id })
      .limit(1)
      .get();

    if (itemRes.data && itemRes.data.length > 0) {
      await db.collection('redemption_items').doc(itemRes.data[0]._id).update({
        data: {
          quantity: _.inc(-1),
          updated_at: db.serverDate()
        }
      });
    }
  }

  // 更新兑换请求状态
  await db.collection('redemption_requests').doc(requestId).update({
    data: {
      status: '已通过',
      approver: approverName || '班主任',
      approval_time: db.serverDate(),
      shipping_status: 'pending',
      updated_at: db.serverDate()
    }
  });

  return { success: true, message: '批准成功，等待发货' };
}

/**
 * 拒绝兑换
 */
async function rejectRedemption(data, wxContext) {
  const { requestId, rejectReason, rejecterName } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  await db.collection('redemption_requests').doc(requestId).update({
    data: {
      status: '已拒绝',
      reject_reason: rejectReason || '',
      approver: rejecterName || '审核人',
      approval_time: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return { success: true, message: '已拒绝' };
}

/**
 * 确认发货
 */
async function confirmShip(data, wxContext) {
  const { requestId } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  await db.collection('redemption_requests').doc(requestId).update({
    data: {
      status: '已发货',
      shipping_status: 'shipped',
      shipped_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return { success: true, message: '已确认发货' };
}

/**
 * 确认收货
 */
async function confirmReceive(data, wxContext) {
  const { requestId } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  await db.collection('redemption_requests').doc(requestId).update({
    data: {
      status: '已收货',
      shipping_status: 'received',
      received_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return { success: true, message: '已确认收货' };
}

/**
 * 处理投标结果（定时任务调用）
 * 投标截止后，自动选出最高投标者中标
 */
async function processBidResult(data, wxContext) {
  const { itemId, classId } = data;

  if (!itemId || !classId) {
    return { success: false, message: '参数不完整，缺少商品ID或班级ID' };
  }

  const now = new Date();

  // 获取该商品的所有有效投标（强制班级维度隔离）
  const bidQuery = {
    item_id: itemId,
    class_id: classId,
    redemption_mode: '投标模式',
    status: '待审批'
  };

  const bidsRes = await db.collection('redemption_requests')
    .where(bidQuery)
    .orderBy('bid_score', 'desc')
    .get();

  if (!bidsRes.data || bidsRes.data.length === 0) {
    return { success: false, message: '没有有效投标' };
  }

  // 获取商品库存（强制班级维度隔离）
  let itemQuery = { item_id: itemId };
  if (classId) itemQuery.class_id = classId;
  const itemRes = await db.collection('redemption_items')
    .where(itemQuery)
    .limit(1)
    .get();

  if (!itemRes.data || itemRes.data.length === 0) {
    return { success: false, message: '商品不存在' };
  }

  const item = itemRes.data[0];
  const availableQuantity = item.quantity || 0;

  // 按投标积分从高到低选出中标者
  const winners = bidsRes.data.slice(0, availableQuantity);
  const losers = bidsRes.data.slice(availableQuantity);

  // 处理中标者
  for (const winner of winners) {
    await db.collection('redemption_requests').doc(winner._id).update({
      data: {
        status: '已中标',
        bid_result: 'winning',
        updated_at: db.serverDate()
      }
    });
  }

  // 处理未中标者
  for (const loser of losers) {
    await db.collection('redemption_requests').doc(loser._id).update({
      data: {
        status: '未中标',
        bid_result: 'lost',
        updated_at: db.serverDate()
      }
    });
  }

  return {
    success: true,
    message: `投标结果已处理：${winners.length}人中标，${losers.length}人未中标`,
    data: { winners: winners.length, losers: losers.length }
  };
}

/**
 * 获取我的兑换记录
 */
async function getMyRedemptions(data, wxContext) {
  const { studentId, classId, status, page = 0, pageSize = 20 } = data;

  if (!studentId || !classId) {
    return { success: false, message: '参数不完整' };
  }

  let query = { student_id: studentId, class_id: classId };
  if (status) {
    query.status = status;
  }

  const res = await db.collection('redemption_requests')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  return {
    success: true,
    data: res.data || []
  };
}

/**
 * 获取兑换管理台账
 */
async function getRedemptionLedger(data, wxContext) {
  const { classId, status, page = 0, pageSize = 50 } = data;

  if (!classId) {
    return { success: false, message: '缺少班级ID参数' };
  }

  let query = { class_id: classId };
  if (status) {
    query.status = status;
  }

  const res = await db.collection('redemption_requests')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  // 统计
  const statsRes = await db.collection('redemption_requests')
    .where({ class_id: classId })
    .get();

  const allRequests = statsRes.data || [];
  const stats = {
    pendingCount: allRequests.filter(r => r.status === '待审批' || r.status === '待班主任审批').length,
    approvedCount: allRequests.filter(r => r.status === '已通过').length,
    shippedCount: allRequests.filter(r => r.status === '已发货' || r.status === '已收货').length,
    totalScore: allRequests
      .filter(r => ['已通过', '已发货', '已收货'].includes(r.status))
      .reduce((sum, r) => sum + (r.bid_score || r.required_score || 0), 0)
  };

  return {
    success: true,
    data: res.data || [],
    stats
  };
}
