const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 分类映射
const CATEGORIES = {
  textbook: '教材书籍',
  electronics: '电子数码',
  daily: '生活用品',
  sports: '运动器材',
  clothing: '服饰鞋包',
  other: '其他'
}

// 成色映射
const CONDITIONS = {
  new: '全新',
  'like-new': '几乎全新',
  good: '轻微使用痕迹',
  fair: '明显使用痕迹',
  poor: '仍可使用'
}

// 验证用户班级身份
async function verifyUser(openid, classId) {
  const rel = await db.collection('user_class_relation')
    .where({ user_id: openid, class_id: classId })
    .count()
  return rel.total > 0
}

// 获取用户角色
async function getUserRole(openid, classId) {
  const rel = await db.collection('user_class_relation')
    .where({ user_id: openid, class_id: classId })
    .get()
  if (rel.data.length === 0) return null
  return rel.data[0].role || 'student'
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, classId } = event

  if (!classId) return { code: 400, msg: '缺少 classId' }

  // 验证身份
  const isMember = await verifyUser(openid, classId)
  if (!isMember) return { code: 403, msg: '无权操作此班级' }

  const role = await getUserRole(openid, classId)

  switch (action) {
    case 'publishItem': return publishItem(event, openid)
    case 'getItems': return getItems(event, openid)
    case 'getItemDetail': return getItemDetail(event, openid)
    case 'updateItem': return updateItem(event, openid)
    case 'deleteItem': return deleteItem(event, openid, role)
    case 'toggleWant': return toggleWant(event, openid)
    case 'reserveItem': return reserveItem(event, openid)
    case 'markSold': return markSold(event, openid)
    case 'getMyItems': return getMyItems(event, openid)
    case 'addMessage': return addMessage(event, openid)
    case 'getMessages': return getMessages(event)
    case 'reportItem': return reportItem(event, openid)
    case 'handleReport': return handleReport(event, openid, role)
    default: return { code: 400, msg: '未知 action' }
  }
}

// 发布商品
async function publishItem(event, openid) {
  const { classId, title, description, category, price, originalPrice, condition, images, sellerContact, tags } = event

  if (!title || !description || !category || price === undefined || !condition) {
    return { code: 400, msg: '缺少必填字段' }
  }

  if (!CATEGORIES[category]) return { code: 400, msg: '无效分类' }
  if (!CONDITIONS[condition]) return { code: 400, msg: '无效成色' }

  // 获取卖家信息
  const userRes = await db.collection('user_class_relation')
    .where({ user_id: openid, class_id: classId })
    .get()
  if (userRes.data.length === 0) return { code: 403, msg: '非班级成员' }

  const sellerName = userRes.data[0].real_name || '匿名'

  const item = {
    title,
    description,
    category,
    price: Number(price),
    original_price: originalPrice ? Number(originalPrice) : null,
    condition,
    images: images || [],
    seller_id: openid,
    seller_name: sellerName,
    seller_contact: sellerContact || '',
    class_id: classId,
    status: 'on_sale',
    view_count: 0,
    want_count: 0,
    reserved_for: '',
    sold_to: '',
    tags: tags || [],
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }

  const res = await db.collection('flea_items').add({ data: item })
  return { code: 0, msg: '发布成功', data: { _id: res._id } }
}

// 获取商品列表
async function getItems(event, openid) {
  const { classId, category, status, keyword, page = 1, pageSize = 10 } = event

  let where = { class_id: classId }

  if (category && category !== 'all') {
    where.category = category
  }
  if (status) {
    where.status = status
  } else {
    where.status = _.in(['on_sale', 'reserved'])
  }
  if (keyword) {
    where.title = db.RegExp({ regexp: keyword, options: 'i' })
  }

  const countRes = await db.collection('flea_items').where(where).count()
  const total = countRes.total

  const res = await db.collection('flea_items')
    .where(where)
    .orderBy('created_at', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 查询用户想要的商品
  let wantItemIds = []
  if (res.data.length > 0) {
    const itemIds = res.data.map(i => i._id)
    const wantRes = await db.collection('flea_wants')
      .where({ item_id: _.in(itemIds), user_id: openid })
      .get()
    wantItemIds = wantRes.data.map(w => w.item_id)
  }

  const items = res.data.map(item => ({
    ...item,
    category_label: CATEGORIES[item.category] || item.category,
    condition_label: CONDITIONS[item.condition] || item.condition,
    is_wanted: wantItemIds.includes(item._id),
    is_owner: item.seller_id === openid
  }))

  return {
    code: 0,
    data: { items, total, page, pageSize, hasMore: page * pageSize < total }
  }
}

// 获取商品详情
async function getItemDetail(event, openid) {
  const { itemId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const res = await db.collection('flea_items').doc(itemId).get()
  const item = res.data

  // 验证班级
  if (item.class_id !== event.classId) return { code: 403, msg: '无权查看' }

  // 增加浏览量
  await db.collection('flea_items').doc(itemId).update({
    data: { view_count: _.inc(1) }
  })

  // 查询想要状态
  const wantRes = await db.collection('flea_wants')
    .where({ item_id: itemId, user_id: openid })
    .count()

  item.category_label = CATEGORIES[item.category] || item.category
  item.condition_label = CONDITIONS[item.condition] || item.condition
  item.is_wanted = wantRes.total > 0
  item.is_owner = item.seller_id === openid
  item.view_count += 1

  return { code: 0, data: item }
}

// 更新商品
async function updateItem(event, openid) {
  const { itemId, title, description, category, price, originalPrice, condition, images, sellerContact, tags } = event

  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  // 验证所有者
  const itemRes = await db.collection('flea_items').doc(itemId).get()
  if (itemRes.data.seller_id !== openid) return { code: 403, msg: '只能编辑自己的商品' }

  const updateData = { updated_at: db.serverDate() }
  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description
  if (category !== undefined) updateData.category = category
  if (price !== undefined) updateData.price = Number(price)
  if (originalPrice !== undefined) updateData.original_price = Number(originalPrice)
  if (condition !== undefined) updateData.condition = condition
  if (images !== undefined) updateData.images = images
  if (sellerContact !== undefined) updateData.seller_contact = sellerContact
  if (tags !== undefined) updateData.tags = tags

  await db.collection('flea_items').doc(itemId).update({ data: updateData })
  return { code: 0, msg: '更新成功' }
}

// 删除商品（卖家自己或管理员）
async function deleteItem(event, openid, role) {
  const { itemId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const itemRes = await db.collection('flea_items').doc(itemId).get()
  const item = itemRes.data

  if (item.seller_id !== openid && role !== 'admin' && role !== 'teacher') {
    return { code: 403, msg: '无权删除' }
  }

  // 软删除
  await db.collection('flea_items').doc(itemId).update({
    data: { status: 'removed', updated_at: db.serverDate() }
  })

  return { code: 0, msg: '已删除' }
}

// 切换想要
async function toggleWant(event, openid) {
  const { itemId, classId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const existRes = await db.collection('flea_wants')
    .where({ item_id: itemId, user_id: openid })
    .get()

  if (existRes.data.length > 0) {
    // 取消想要
    await db.collection('flea_wants').doc(existRes.data[0]._id).remove()
    await db.collection('flea_items').doc(itemId).update({
      data: { want_count: _.inc(-1) }
    })
    return { code: 0, msg: '已取消', data: { wanted: false } }
  } else {
    // 添加想要
    await db.collection('flea_wants').add({
      data: {
        item_id: itemId,
        user_id: openid,
        class_id: classId,
        created_at: db.serverDate()
      }
    })
    await db.collection('flea_items').doc(itemId).update({
      data: { want_count: _.inc(1) }
    })
    return { code: 0, msg: '已想要', data: { wanted: true } }
  }
}

// 预留商品（卖家操作）
async function reserveItem(event, openid) {
  const { itemId, buyerId } = event
  if (!itemId || !buyerId) return { code: 400, msg: '缺少参数' }

  const itemRes = await db.collection('flea_items').doc(itemId).get()
  if (itemRes.data.seller_id !== openid) return { code: 403, msg: '只有卖家可预留' }
  if (itemRes.data.status !== 'on_sale') return { code: 400, msg: '商品状态不可预留' }

  await db.collection('flea_items').doc(itemId).update({
    data: {
      status: 'reserved',
      reserved_for: buyerId,
      updated_at: db.serverDate()
    }
  })

  return { code: 0, msg: '已预留' }
}

// 标记成交
async function markSold(event, openid) {
  const { itemId, buyerId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const itemRes = await db.collection('flea_items').doc(itemId).get()
  if (itemRes.data.seller_id !== openid) return { code: 403, msg: '只有卖家可标记成交' }

  await db.collection('flea_items').doc(itemId).update({
    data: {
      status: 'sold',
      sold_to: buyerId || itemRes.data.reserved_for || '',
      updated_at: db.serverDate()
    }
  })

  return { code: 0, msg: '已标记成交' }
}

// 我的发布
async function getMyItems(event, openid) {
  const { classId, status, page = 1, pageSize = 10 } = event

  let where = { seller_id: openid, class_id: classId }
  if (status) where.status = status

  const countRes = await db.collection('flea_items').where(where).count()
  const res = await db.collection('flea_items')
    .where(where)
    .orderBy('created_at', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  const items = res.data.map(item => ({
    ...item,
    category_label: CATEGORIES[item.category] || item.category,
    condition_label: CONDITIONS[item.condition] || item.condition
  }))

  return {
    code: 0,
    data: { items, total: countRes.total, page, pageSize }
  }
}

// 添加留言
async function addMessage(event, openid) {
  const { itemId, classId, content } = event

  if (!itemId || !content) return { code: 400, msg: '缺少必填字段' }

  // 获取用户名
  const userRes = await db.collection('user_class_relation')
    .where({ user_id: openid, class_id: classId })
    .get()
  const senderName = userRes.data.length > 0 ? (userRes.data[0].real_name || '匿名') : '匿名'

  await db.collection('flea_messages').add({
    data: {
      item_id: itemId,
      sender_id: openid,
      sender_name: senderName,
      content,
      class_id: classId,
      created_at: db.serverDate()
    }
  })

  return { code: 0, msg: '留言成功' }
}

// 获取留言
async function getMessages(event) {
  const { itemId, page = 1, pageSize = 20 } = event

  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const res = await db.collection('flea_messages')
    .where({ item_id: itemId })
    .orderBy('created_at', 'asc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return { code: 0, data: res.data }
}

// 举报商品
async function reportItem(event, openid) {
  const { itemId, classId, reason, detail } = event

  if (!itemId || !reason) return { code: 400, msg: '缺少必填字段' }

  await db.collection('flea_reports').add({
    data: {
      item_id: itemId,
      reporter_id: openid,
      reason,
      detail: detail || '',
      class_id: classId,
      status: 'pending',
      created_at: db.serverDate()
    }
  })

  return { code: 0, msg: '举报已提交' }
}

// 处理举报（管理员）
async function handleReport(event, openid, role) {
  const { reportId, action: reportAction } = event

  if (role !== 'admin' && role !== 'teacher') return { code: 403, msg: '无权操作' }
  if (!reportId) return { code: 400, msg: '缺少 reportId' }

  const validActions = ['resolved', 'dismissed']
  if (!validActions.includes(reportAction)) return { code: 400, msg: '无效操作' }

  await db.collection('flea_reports').doc(reportId).update({
    data: { status: reportAction }
  })

  // 如果确认违规，下架商品
  if (reportAction === 'resolved') {
    const reportRes = await db.collection('flea_reports').doc(reportId).get()
    await db.collection('flea_items').doc(reportRes.data.item_id).update({
      data: { status: 'removed', updated_at: db.serverDate() }
    })
  }

  return { code: 0, msg: '处理完成' }
}
