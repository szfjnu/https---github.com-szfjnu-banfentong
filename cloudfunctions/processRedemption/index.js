const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { getCallerInfo, requireRole, requireClassAccess, requireTeacherOrModule, requireClassCadre } = require('./utils/auth');
const { withTransaction } = require('./utils/transaction');
const { validateInput, SCHEMAS } = require('./utils/validator');

exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const caller = await getCallerInfo(event, data?.classId || data?.class_id || data?.itemData?.class_id || data?.updateData?.class_id);

    switch (action) {
      case 'submitRedemption':
        return await submitRedemption(data, caller);
      case 'cadreApprove':
        return await cadreApprove(data, caller);
      case 'teacherApprove':
        return await teacherApprove(data, caller);
      case 'rejectRedemption':
        return await rejectRedemption(data, caller);
      case 'confirmShip':
        return await confirmShip(data, caller);
      case 'confirmReceive':
        return await confirmReceive(data, caller);
      case 'processBidResult':
        await requireTeacherOrModule(caller, 'score');
        return await processBidResult(data, caller);
      case 'getMyRedemptions':
        return await getMyRedemptions(data, caller);
      case 'getRedemptionLedger':
        await requireTeacherOrModule(caller, 'score');
        return await getRedemptionLedger(data, caller);
      case 'deleteItem':
        requireClassAccess(caller, data.class_id, ['head_teacher', 'admin']);
        return await deleteItem(data, caller);
      case 'addProductWish':
        return await addProductWish(data, caller);
      case 'voteProductWish':
        return await voteProductWish(data, caller);
      case 'addItem':
        requireClassAccess(caller, data.itemData?.class_id || data.class_id, ['head_teacher', 'admin']);
        return await addItem(data, caller);
      case 'updateItem':
        requireClassAccess(caller, data.updateData?.class_id || data.class_id, ['head_teacher', 'admin']);
        return await updateItem(data, caller);
      case 'updateRequest':
        requireClassAccess(caller, data.classId, ['head_teacher', 'admin']);
        return await updateRequest(data, caller);
      case 'shipRedemption':
        return await confirmShip(data, caller);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('兑换处理错误:', err.message);
    return { success: false, message: err.message || '操作失败' };
  }
};

async function submitRedemption(data, caller) {
  const itemId = data.itemId || data.item_id || '';
  const bidScore = data.bidScore || data.bid_score || data.required_score || 0;
  const studentId = data.studentId || data.student_id || '';
  const studentName = data.studentName || data.student_name || '';
  const classId = data.classId || data.class_id || '';

  if (!itemId || !bidScore || !studentId || !classId) {
    return { success: false, message: '参数不完整' };
  }

  if (caller.classId !== classId && caller.role !== 'admin') {
    return { success: false, message: '无权在该班级提交兑换' };
  }

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

  const studentRes = await db.collection('students')
    .where({ student_id: studentId, class_id: classId })
    .limit(1)
    .get();

  if (!studentRes.data || studentRes.data.length === 0) {
    return { success: false, message: '学生信息不存在' };
  }

  const student = studentRes.data[0];
  const initialScore = student.initial_score || 100;
  const totalScore = student.current_score || 100;

  let redeemedTotal = 0;
  try {
    const redeemedRes = await db.collection('redemption_requests')
      .where({
        student_id: studentId,
        status: _.in(['待审批', '待班主任审批', '已通过', '已批准', '已中标', '已发货', '已收货'])
      })
      .get();
    redeemedTotal = (redeemedRes.data || []).reduce((sum, r) => sum + (r.bid_score || r.required_score || 0), 0);
  } catch (e) {}

  const redeemableScore = Math.max(0, totalScore - initialScore - redeemedTotal);
  if (redeemableScore < bidScore) {
    return { success: false, message: '可兑换积分不足' };
  }

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

async function cadreApprove(data, caller) {
  const { requestId, cadreName } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  const requestRes = await db.collection('redemption_requests').doc(requestId).get();
  const request = requestRes.data;

  if (request.class_id !== caller.classId && caller.role !== 'admin') {
    return { success: false, message: '无权操作该兑换请求' };
  }

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

async function teacherApprove(data, caller) {
  const { requestId, approverName } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  try {
    return await withTransaction(async (tx) => {
      const requestRes = await tx.collection('redemption_requests').doc(requestId).get();
      const request = requestRes.data;

      if (!request) {
        throw new Error('兑换请求不存在');
      }

      if (request.class_id !== caller.classId && caller.role !== 'admin') {
        throw new Error('无权操作该兑换请求');
      }

      if (request.status !== '待审批' && request.status !== '待班主任审批') {
        throw new Error('当前状态不可操作');
      }

      const score = request.bid_score || request.required_score || 0;
      if (score > 0) {
        const studentRes = await tx.collection('students')
          .where({ student_id: request.student_id, class_id: request.class_id })
          .limit(1)
          .get();

        if (!studentRes.data || studentRes.data.length === 0) {
          throw new Error('学生不存在');
        }

        const student = studentRes.data[0];
        const initialScore = student.initial_score || 100;
        const totalScore = student.current_score || 100;

        let redeemedTotal = 0;
        try {
          const redeemedRes = await tx.collection('redemption_requests')
            .where({
              student_id: request.student_id,
              status: _.in(['待审批', '待班主任审批', '已通过', '已批准', '已中标', '已发货', '已收货'])
            })
            .get();
          redeemedTotal = (redeemedRes.data || []).reduce((sum, r) => sum + (r.bid_score || r.required_score || 0), 0);
        } catch (e) {}

        const redeemableScore = Math.max(0, totalScore - initialScore - redeemedTotal);
        if (redeemableScore < score) {
          throw new Error('学生可兑换积分不足，无法完成审批');
        }
      }

      if (request.item_id) {
        const itemRes = await tx.collection('redemption_items')
          .where({ item_id: request.item_id, class_id: request.class_id })
          .limit(1)
          .get();

        if (itemRes.data && itemRes.data.length > 0) {
          const item = itemRes.data[0];
          if (item.quantity <= 0) {
            throw new Error('商品库存不足');
          }

          await tx.collection('redemption_items').doc(item._id).update({
            data: {
              quantity: _.inc(-1),
              updated_at: db.serverDate()
            }
          });
        }
      }

      await tx.collection('redemption_requests').doc(requestId).update({
        data: {
          status: '已通过',
          approver: approverName || '班主任',
          approver_openid: caller.openid,
          approval_time: db.serverDate(),
          shipping_status: 'pending',
          updated_at: db.serverDate()
        }
      });

      return { success: true, message: '批准成功，等待发货' };
    });
  } catch (err) {
    console.error('teacherApprove失败:', err);
    return { success: false, message: err.message };
  }
}

async function rejectRedemption(data, caller) {
  const { requestId, rejectReason, rejecterName } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  const requestRes = await db.collection('redemption_requests').doc(requestId).get();
  const request = requestRes.data;

  if (request.class_id !== caller.classId && caller.role !== 'admin') {
    return { success: false, message: '无权操作该兑换请求' };
  }

  await db.collection('redemption_requests').doc(requestId).update({
    data: {
      status: '已拒绝',
      reject_reason: rejectReason || '',
      approver: rejecterName || '审核人',
      approver_openid: caller.openid,
      approval_time: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return { success: true, message: '已拒绝' };
}

async function confirmShip(data, caller) {
  const { requestId } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  const requestRes = await db.collection('redemption_requests').doc(requestId).get();
  if (requestRes.data.class_id !== caller.classId && caller.role !== 'admin') {
    return { success: false, message: '无权操作' };
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

async function confirmReceive(data, caller) {
  const { requestId } = data;

  if (!requestId) {
    return { success: false, message: '参数不完整' };
  }

  const requestRes = await db.collection('redemption_requests').doc(requestId).get();
  const request = requestRes.data;

  if (request.student_id !== caller.studentId && request.class_id !== caller.classId && caller.role !== 'admin') {
    return { success: false, message: '无权操作' };
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

async function processBidResult(data, caller) {
  const { itemId, classId } = data;

  if (!itemId || !classId) {
    return { success: false, message: '参数不完整，缺少商品ID或班级ID' };
  }

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

  let itemQuery = { item_id: itemId, class_id: classId };
  const itemRes = await db.collection('redemption_items')
    .where(itemQuery)
    .limit(1)
    .get();

  if (!itemRes.data || itemRes.data.length === 0) {
    return { success: false, message: '商品不存在' };
  }

  const item = itemRes.data[0];
  const availableQuantity = item.quantity || 0;

  const winners = bidsRes.data.slice(0, availableQuantity);
  const losers = bidsRes.data.slice(availableQuantity);

  for (const winner of winners) {
    await db.collection('redemption_requests').doc(winner._id).update({
      data: {
        status: '已中标',
        bid_result: 'winning',
        updated_at: db.serverDate()
      }
    });
  }

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

async function getMyRedemptions(data, caller) {
  const { studentId, classId, status, page = 0, pageSize = 20 } = data;

  const effectiveClassId = classId || caller.classId;
  const effectiveStudentId = studentId || caller.studentId;

  if (!effectiveStudentId || !effectiveClassId) {
    return { success: false, message: '参数不完整' };
  }

  let query = { student_id: effectiveStudentId, class_id: effectiveClassId };
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

async function getRedemptionLedger(data, caller) {
  const { classId, status, page = 0, pageSize = 50 } = data;

  const effectiveClassId = classId || caller.classId;
  if (!effectiveClassId) {
    return { success: false, message: '缺少班级ID参数' };
  }

  let query = { class_id: effectiveClassId };
  if (status) {
    query.status = status;
  }

  const res = await db.collection('redemption_requests')
    .where(query)
    .orderBy('created_at', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  const statsRes = await db.collection('redemption_requests')
    .where({ class_id: effectiveClassId })
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

async function deleteItem(data, caller) {
  const { itemId, classId } = data;

  if (!itemId || !classId) {
    return { success: false, message: '参数不完整' };
  }

  const itemRes = await db.collection('redemption_items')
    .where({ item_id: itemId, class_id: classId })
    .limit(1)
    .get();

  if (!itemRes.data || itemRes.data.length === 0) {
    return { success: false, message: '商品不存在' };
  }

  const pendingRes = await db.collection('redemption_requests')
    .where({ item_id: itemId, class_id: classId, status: _.in(['待审批', '待班主任审批']) })
    .count();

  if (pendingRes.total > 0) {
    return { success: false, message: '该商品有待审批的兑换请求，无法删除' };
  }

  await db.collection('redemption_items').doc(itemRes.data[0]._id).remove();

  return { success: true, message: '商品已删除' };
}

async function addProductWish(data, caller) {
  const { name, description, expected_score, student_id, student_name, class_id } = data;

  if (!name || !expected_score || !class_id) {
    return { success: false, message: '参数不完整' };
  }

  const now = db.serverDate();
  await db.collection('product_wishes').add({
    data: {
      wish_id: `PW${Date.now()}`,
      name,
      description: description || '',
      expected_score: parseInt(expected_score),
      student_id: student_id || caller.studentId || '',
      student_name: student_name || '',
      class_id,
      status: 'pending',
      vote_count: 0,
      voters: [],
      created_at: now
    }
  });

  return { success: true, message: '提交成功' };
}

async function voteProductWish(data, caller) {
  const { wishId, student_id } = data;

  if (!wishId || !student_id) {
    return { success: false, message: '参数不完整' };
  }

  const wishRes = await db.collection('product_wishes').doc(wishId).get();
  const wish = wishRes.data;

  if (!wish) {
    return { success: false, message: '心愿不存在' };
  }

  if ((wish.voters || []).includes(student_id)) {
    return { success: false, message: '您已投过票' };
  }

  await db.collection('product_wishes').doc(wishId).update({
    data: {
      vote_count: _.inc(1),
      voters: _.push(student_id)
    }
  });

  return { success: true, message: '投票成功' };
}

async function addItem(data, caller) {
  const itemData = data.itemData || data;
  if (!itemData.name || !itemData.class_id) {
    return { success: false, message: '参数不完整' };
  }

  const now = db.serverDate();
  const itemId = itemData.item_id || `ITEM${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const record = {
    item_id: itemId,
    name: itemData.name,
    class_id: itemData.class_id,
    description: itemData.description || '',
    required_score: itemData.required_score || 0,
    quantity: itemData.quantity || 0,
    image_url: itemData.image_url || '',
    category: itemData.category || '',
    redemption_mode: itemData.redemption_mode || '直接兑换',
    status: itemData.status || '可兑换',
    bid_end_time: itemData.bid_end_time || null,
    bid_start_time: itemData.bid_start_time || null,
    created_by: caller.openid,
    created_at: now,
    updated_at: now
  };

  const res = await db.collection('redemption_items').add({ data: record });
  return { success: true, data: { _id: res._id, item_id: itemId }, message: '添加成功' };
}

async function updateItem(data, caller) {
  const { itemId, updateData } = data;
  if (!itemId) {
    return { success: false, message: '缺少物品ID' };
  }

  const itemRes = await db.collection('redemption_items')
    .where({ item_id: itemId, class_id: updateData?.class_id || data.class_id })
    .limit(1)
    .get();

  if (!itemRes.data || itemRes.data.length === 0) {
    const byIdRes = await db.collection('redemption_items').doc(itemId).get();
    if (!byIdRes.data) {
      return { success: false, message: '商品不存在' };
    }
  }

  const allowedFields = [
    'name', 'description', 'required_score', 'quantity', 'image_url',
    'category', 'redemption_mode', 'status', 'bid_end_time', 'bid_start_time', 'class_id'
  ];
  const filtered = {};
  const source = updateData || data;
  for (const key of allowedFields) {
    if (source[key] !== undefined) {
      filtered[key] = source[key];
    }
  }
  filtered.updated_at = db.serverDate();

  const docId = (itemRes.data && itemRes.data[0]?._id) || itemId;
  await db.collection('redemption_items').doc(docId).update({ data: filtered });
  return { success: true, message: '更新成功' };
}

async function updateRequest(data, caller) {
  const { requestId, ...updateFields } = data;
  if (!requestId) {
    return { success: false, message: '缺少请求ID' };
  }

  const requestRes = await db.collection('redemption_requests').doc(requestId).get();
  if (!requestRes.data) {
    return { success: false, message: '兑换请求不存在' };
  }

  const allowedFields = [
    'status', 'shipping_status', 'reject_reason', 'approver', 'approver_openid',
    'cadre_approver', 'note', 'tracking_number'
  ];
  const filtered = {};
  for (const key of allowedFields) {
    if (updateFields[key] !== undefined) {
      filtered[key] = updateFields[key];
    }
  }
  filtered.updated_at = db.serverDate();

  await db.collection('redemption_requests').doc(requestId).update({ data: filtered });
  return { success: true, message: '更新成功' };
}
