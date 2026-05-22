const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const { getCallerInfo, requireRole, requireClassAccess, requireTeacherOrModule, AUTH_ERRORS } = require('./utils/auth')

const CATEGORIES = {
  textbook: '教材书籍',
  electronics: '电子数码',
  daily: '生活用品',
  sports: '运动器材',
  clothing: '服饰鞋包',
  other: '其他'
}

const CONDITIONS = {
  new: '全新',
  'like-new': '几乎全新',
  good: '轻微使用痕迹',
  fair: '明显使用痕迹',
  poor: '仍可使用'
}

exports.main = async (event, context) => {
  const { action, classId } = event

  if (!classId) return { code: 400, msg: '缺少 classId' }

  try {
    const caller = await getCallerInfo(event, classId)
    const { openid, role, realName } = caller

    switch (action) {
      case 'publishItem': return publishItem(event, caller)
      case 'getItems': return getItems(event, openid, classId)
      case 'getItemDetail': return getItemDetail(event, openid, classId)
      case 'updateItem': return updateItem(event, caller)
      case 'deleteItem': return deleteItem(event, caller)
      case 'toggleWant': return toggleWant(event, openid, classId)
      case 'reserveItem': return reserveItem(event, openid)
      case 'markSold': return markSold(event, openid)
      case 'getMyItems': return getMyItems(event, openid, classId)
      case 'addMessage': return addMessage(event, caller)
      case 'getMessages': return getMessages(event)
      case 'reportItem': return reportItem(event, openid, classId)
      case 'handleReport': return handleReport(event, caller)
      default: return { code: 400, msg: '未知 action' }
    }
  } catch (err) {
    if (Object.values(AUTH_ERRORS).includes(err.code)) {
      const msgMap = {
        [AUTH_ERRORS.NO_OPENID]: '未获取到用户身份',
        [AUTH_ERRORS.NO_CLASS]: '用户未加入任何班级',
        [AUTH_ERRORS.NO_ACCESS]: '无权操作此班级',
        [AUTH_ERRORS.ROLE_DENIED]: err.message,
        [AUTH_ERRORS.CLASS_DENIED]: '无权访问该班级数据'
      }
      return { code: 403, msg: msgMap[err.code] || err.message }
    }
    console.error('fleaMarketManager error:', err)
    return { code: 500, msg: '服务器错误' }
  }
}

async function publishItem(event, caller) {
  const { classId, title, description, category, price, originalPrice, condition, images, sellerContact, tags } = event
  const { openid, realName, avatarUrl } = caller

  if (!title || !description || !category || price === undefined || !condition) {
    return { code: 400, msg: '缺少必填字段' }
  }

  if (!CATEGORIES[category]) return { code: 400, msg: '无效分类' }
  if (!CONDITIONS[condition]) return { code: 400, msg: '无效成色' }

  const sellerName = realName

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
    seller_avatar: avatarUrl || '',
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

async function getItems(event, openid, classId) {
  const { category, status, keyword, page = 1, pageSize = 10 } = event

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

async function getItemDetail(event, openid, classId) {
  const { itemId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const res = await db.collection('flea_items').doc(itemId).get()
  const item = res.data

  if (item.class_id !== classId) return { code: 403, msg: '无权查看' }

  await db.collection('flea_items').doc(itemId).update({
    data: { view_count: _.inc(1) }
  })

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

async function updateItem(event, caller) {
  await requireTeacherOrModule(caller, 'flea_market')

  const { itemId, title, description, category, price, originalPrice, condition, images, sellerContact, tags } = event
  const { openid } = caller

  if (!itemId) return { code: 400, msg: '缺少 itemId' }

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

async function deleteItem(event, caller) {
  await requireTeacherOrModule(caller, 'flea_market')

  const { itemId } = event
  const { openid, role } = caller
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const itemRes = await db.collection('flea_items').doc(itemId).get()
  const item = itemRes.data

  if (item.seller_id !== openid && role !== 'admin' && role !== 'teacher') {
    return { code: 403, msg: '无权删除' }
  }

  await db.collection('flea_items').doc(itemId).update({
    data: { status: 'removed', updated_at: db.serverDate() }
  })

  return { code: 0, msg: '已删除' }
}

async function toggleWant(event, openid, classId) {
  const { itemId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const existRes = await db.collection('flea_wants')
    .where({ item_id: itemId, user_id: openid })
    .get()

  if (existRes.data.length > 0) {
    await db.collection('flea_wants').doc(existRes.data[0]._id).remove()
    await db.collection('flea_items').doc(itemId).update({
      data: { want_count: _.inc(-1) }
    })
    return { code: 0, msg: '已取消', data: { wanted: false } }
  } else {
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

async function getMyItems(event, openid, classId) {
  const { status, page = 1, pageSize = 10 } = event

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

async function addMessage(event, caller) {
  const { itemId, classId, content } = event
  const { openid, realName } = caller

  if (!itemId || !content) return { code: 400, msg: '缺少必填字段' }

  const senderName = realName

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

async function reportItem(event, openid, classId) {
  const { itemId, reason, detail } = event

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

async function handleReport(event, caller) {
  await requireTeacherOrModule(caller, 'flea_market')

  const { reportId, action: reportAction } = event

  if (!reportId) return { code: 400, msg: '缺少 reportId' }

  const validActions = ['resolved', 'dismissed']
  if (!validActions.includes(reportAction)) return { code: 400, msg: '无效操作' }

  await db.collection('flea_reports').doc(reportId).update({
    data: { status: reportAction }
  })

  if (reportAction === 'resolved') {
    const reportRes = await db.collection('flea_reports').doc(reportId).get()
    await db.collection('flea_items').doc(reportRes.data.item_id).update({
      data: { status: 'removed', updated_at: db.serverDate() }
    })
  }

  return { code: 0, msg: '处理完成' }
}
