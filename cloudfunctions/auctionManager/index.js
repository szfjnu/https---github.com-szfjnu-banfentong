const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 分类映射
const CATEGORIES = {
  privilege: '特权卡',
  gift: '实物礼品',
  coupon: '兑换券',
  service: '服务类',
  other: '其他'
}

// 验证用户班级身份
async function verifyUser(openid, classId) {
  let rel = await db.collection('user_class_relation')
    .where({ user_openid: openid, class_id: classId })
    .count()
  if (rel.total === 0) {
    rel = await db.collection('user_class_relation')
      .where({ _openid: openid, class_id: classId })
      .count()
  }
  return rel.total > 0
}

async function getUserRole(openid, classId) {
  let rel = await db.collection('user_class_relation')
    .where({ user_openid: openid, class_id: classId })
    .get()
  if (rel.data.length === 0) {
    rel = await db.collection('user_class_relation')
      .where({ _openid: openid, class_id: classId })
      .get()
  }
  if (rel.data.length === 0) return null
  return rel.data[0].role || 'student'
}

async function getUserName(openid, classId) {
  let rel = await db.collection('user_class_relation')
    .where({ user_openid: openid, class_id: classId })
    .get()
  if (rel.data.length === 0) {
    rel = await db.collection('user_class_relation')
      .where({ _openid: openid, class_id: classId })
      .get()
  }
  if (rel.data.length === 0) return '未知'
  return rel.data[0].real_name || '匿名'
}

// 获取用户当前积分
async function getUserScore(openid, classId) {
  const scoreRes = await db.collection('scores')
    .where({ user_id: openid, class_id: classId })
    .get()
  if (scoreRes.data.length === 0) return 0
  return scoreRes.data[0].total_score || 0
}

// 扣除积分
async function deductScore(openid, classId, amount) {
  const scoreRes = await db.collection('scores')
    .where({ user_id: openid, class_id: classId })
    .get()
  if (scoreRes.data.length === 0) return false
  const scoreDoc = scoreRes.data[0]
  if ((scoreDoc.total_score || 0) < amount) return false
  await db.collection('scores').doc(scoreDoc._id).update({
    data: { total_score: _.inc(-amount) }
  })
  return true
}

// 退还积分
async function refundScore(openid, classId, amount) {
  const scoreRes = await db.collection('scores')
    .where({ user_id: openid, class_id: classId })
    .get()
  if (scoreRes.data.length === 0) return
  await db.collection('scores').doc(scoreRes.data[0]._id).update({
    data: { total_score: _.inc(amount) }
  })
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, classId } = event

  if (!classId) return { code: 400, msg: '缺少 classId' }

  const isMember = await verifyUser(openid, classId)
  if (!isMember) return { code: 403, msg: '无权操作此班级' }

  const role = await getUserRole(openid, classId)

  switch (action) {
    case 'createItem': return createItem(event, openid, role)
    case 'getItems': return getItems(event, openid)
    case 'getItemDetail': return getItemDetail(event, openid)
    case 'placeBid': return placeBid(event, openid)
    case 'redeemItem': return redeemItem(event, openid)
    case 'getMyBids': return getMyBids(event, openid)
    case 'getMyRedemptions': return getMyRedemptions(event, openid)
    case 'cancelItem': return cancelItem(event, openid, role)
    case 'fulfillRedemption': return fulfillRedemption(event, openid, role)
    case 'settleAuction': return settleAuction(event, openid, role)
    case 'getBidHistory': return getBidHistory(event)
    case 'getUserBalance': return getUserBalance(event, openid)
    default: return { code: 400, msg: '未知 action' }
  }
}

// 创建拍品
async function createItem(event, openid, role) {
  if (role !== 'admin' && role !== 'teacher' && role !== 'head_teacher') {
    return { code: 403, msg: '仅教师可发布拍品' }
  }

  const { classId, title, description, image, type, category, startingPrice, buyoutPrice, totalStock, maxPerUser, startTime, endTime } = event

  if (!title || !description || !type || !category || !startingPrice) {
    return { code: 400, msg: '缺少必填字段' }
  }

  if (!['auction', 'exchange'].includes(type)) return { code: 400, msg: '无效类型' }
  if (!CATEGORIES[category]) return { code: 400, msg: '无效分类' }

  const sellerName = await getUserName(openid, classId)

  const now = new Date()
  const start = startTime ? new Date(startTime) : now
  const end = endTime ? new Date(endTime) : new Date(now.getTime() + 7 * 24 * 3600 * 1000)

  let status = 'upcoming'
  if (start <= now) status = 'active'

  const item = {
    title,
    description,
    image: image || '',
    type,
    category,
    starting_price: Number(startingPrice),
    current_price: type === 'auction' ? Number(startingPrice) : Number(startingPrice),
    buyout_price: buyoutPrice ? Number(buyoutPrice) : null,
    total_stock: type === 'exchange' ? (totalStock || -1) : 1,
    remaining_stock: type === 'exchange' ? (totalStock || -1) : 1,
    max_per_user: maxPerUser || 1,
    seller_id: openid,
    seller_name: sellerName,
    class_id: classId,
    status,
    start_time: start,
    end_time: end,
    winner_id: '',
    winner_name: '',
    bid_count: 0,
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }

  const res = await db.collection('auction_items').add({ data: item })
  return { code: 0, msg: '发布成功', data: { _id: res._id } }
}

// 获取拍品列表
async function getItems(event, openid) {
  const { classId, type, category, status, page = 1, pageSize = 10 } = event

  let where = { class_id: classId }

  if (type) where.type = type
  if (category && category !== 'all') where.category = category
  if (status) {
    where.status = status
  } else {
    where.status = _.in(['upcoming', 'active', 'ended'])
  }

  const countRes = await db.collection('auction_items').where(where).count()
  const total = countRes.total

  const res = await db.collection('auction_items')
    .where(where)
    .orderBy('created_at', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 查询用户竞拍状态
  let myBidItemIds = {}
  if (res.data.length > 0) {
    const itemIds = res.data.map(i => i._id)
    const bidRes = await db.collection('auction_bids')
      .where({ item_id: _.in(itemIds), user_id: openid, status: _.in(['pending', 'winning', 'won']) })
      .get()
    bidRes.data.forEach(b => {
      myBidItemIds[b.item_id] = b.status
    })
  }

  const items = res.data.map(item => ({
    ...item,
    category_label: CATEGORIES[item.category] || item.category,
    my_bid_status: myBidItemIds[item._id] || '',
    is_owner: item.seller_id === openid
  }))

  return {
    code: 0,
    data: { items, total, page, pageSize, hasMore: page * pageSize < total }
  }
}

// 获取详情
async function getItemDetail(event, openid) {
  const { itemId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const res = await db.collection('auction_items').doc(itemId).get()
  const item = res.data

  if (item.class_id !== event.classId) return { code: 403, msg: '无权查看' }

  // 查询用户竞拍状态
  const bidRes = await db.collection('auction_bids')
    .where({ item_id: itemId, user_id: openid })
    .orderBy('created_at', 'desc')
    .limit(1)
    .get()

  // 查询竞拍前3名
  let topBids = []
  if (item.type === 'auction') {
    const topRes = await db.collection('auction_bids')
      .where({ item_id: itemId, status: _.in(['pending', 'winning', 'won']) })
      .orderBy('bid_price', 'desc')
      .limit(3)
      .get()
    topBids = topRes.data
  }

  item.category_label = CATEGORIES[item.category] || item.category
  item.my_bid = bidRes.data.length > 0 ? bidRes.data[0] : null
  item.top_bids = topBids
  item.is_owner = item.seller_id === openid

  // 获取用户余额
  const balance = await getUserScore(openid, event.classId)
  item.my_balance = balance

  return { code: 0, data: item }
}

// 出价（竞拍型）
async function placeBid(event, openid) {
  const { itemId, classId, bidPrice } = event

  if (!itemId || !bidPrice) return { code: 400, msg: '缺少必填字段' }
  const price = Number(bidPrice)
  if (price <= 0) return { code: 400, msg: '出价必须大于0' }

  const itemRes = await db.collection('auction_items').doc(itemId).get()
  const item = itemRes.data

  if (item.type !== 'auction') return { code: 400, msg: '该商品非竞拍型' }
  if (item.status !== 'active') return { code: 400, msg: '商品不在竞拍中' }
  if (new Date() > item.end_time) return { code: 400, msg: '竞拍已结束' }
  if (item.seller_id === openid) return { code: 400, msg: '不能竞拍自己发布的商品' }
  if (price <= item.current_price) return { code: 400, msg: `出价必须高于当前价 ${item.current_price}` }

  // 检查积分余额
  const balance = await getUserScore(openid, classId)
  if (balance < price) return { code: 400, msg: `积分不足，当前余额 ${balance}` }

  // 检查限购
  const existingBids = await db.collection('auction_bids')
    .where({ item_id: itemId, user_id: openid, status: _.in(['pending', 'winning']) })
    .count()

  if (existingBids.total >= item.max_per_user) {
    return { code: 400, msg: `每人最多出价 ${item.max_per_user} 次` }
  }

  const userName = await getUserName(openid, classId)

  // 退还上一个最高出价者的积分
  const prevWinning = await db.collection('auction_bids')
    .where({ item_id: itemId, status: 'winning' })
    .get()

  if (prevWinning.data.length > 0) {
    const prev = prevWinning.data[0]
    await refundScore(prev.user_id, classId, prev.bid_price)
    await db.collection('auction_bids').doc(prev._id).update({
      data: { status: 'pending' }
    })
  }

  // 扣除当前出价者积分
  const deducted = await deductScore(openid, classId, price)
  if (!deducted) return { code: 400, msg: '积分扣除失败，余额可能已变化' }

  // 创建出价记录
  await db.collection('auction_bids').add({
    data: {
      item_id: itemId,
      user_id: openid,
      user_name: userName,
      bid_price: price,
      class_id: classId,
      status: 'winning',
      created_at: db.serverDate()
    }
  })

  // 更新拍品当前价
  await db.collection('auction_items').doc(itemId).update({
    data: {
      current_price: price,
      bid_count: _.inc(1),
      updated_at: db.serverDate()
    }
  })

  return { code: 0, msg: '出价成功', data: { current_price: price } }
}

// 直兑
async function redeemItem(event, openid) {
  const { itemId, classId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const itemRes = await db.collection('auction_items').doc(itemId).get()
  const item = itemRes.data

  if (item.type !== 'exchange') return { code: 400, msg: '该商品非直兑型' }
  if (item.status !== 'active') return { code: 400, msg: '商品不可兑换' }
  if (item.seller_id === openid) return { code: 400, msg: '不能兑换自己的商品' }

  // 检查库存
  if (item.remaining_stock !== -1 && item.remaining_stock <= 0) {
    return { code: 400, msg: '已兑完' }
  }

  // 检查限购
  const myRedemptions = await db.collection('auction_redemptions')
    .where({ item_id: itemId, user_id: openid, status: _.in(['pending', 'fulfilled']) })
    .count()

  if (myRedemptions.total >= item.max_per_user) {
    return { code: 400, msg: `每人限兑 ${item.max_per_user} 次` }
  }

  const price = item.buyout_price || item.starting_price

  // 检查积分
  const balance = await getUserScore(openid, classId)
  if (balance < price) return { code: 400, msg: `积分不足，需 ${price}，余额 ${balance}` }

  // 扣除积分
  const deducted = await deductScore(openid, classId, price)
  if (!deducted) return { code: 400, msg: '积分扣除失败' }

  const userName = await getUserName(openid, classId)

  // 创建兑换记录
  await db.collection('auction_redemptions').add({
    data: {
      item_id: itemId,
      user_id: openid,
      user_name: userName,
      price,
      class_id: classId,
      status: 'pending',
      fulfilled_at: null,
      created_at: db.serverDate()
    }
  })

  // 更新库存
  const updateData = {
    bid_count: _.inc(1),
    updated_at: db.serverDate()
  }
  if (item.remaining_stock !== -1) {
    updateData.remaining_stock = _.inc(-1)
    // 如果库存变为0，自动结束
    if (item.remaining_stock - 1 <= 0) {
      updateData.status = 'ended'
    }
  }
  await db.collection('auction_items').doc(itemId).update({ data: updateData })

  return { code: 0, msg: '兑换成功' }
}

// 我的竞拍
async function getMyBids(event, openid) {
  const { classId, page = 1, pageSize = 20 } = event

  const res = await db.collection('auction_bids')
    .where({ user_id: openid, class_id: classId })
    .orderBy('created_at', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 补充拍品信息
  const bids = []
  for (const bid of res.data) {
    try {
      const itemRes = await db.collection('auction_items').doc(bid.item_id).get()
      bids.push({
        ...bid,
        item_title: itemRes.data.title,
        item_image: itemRes.data.image,
        item_status: itemRes.data.status,
        item_type: itemRes.data.type
      })
    } catch (e) {
      bids.push(bid)
    }
  }

  return { code: 0, data: bids }
}

// 我的兑换
async function getMyRedemptions(event, openid) {
  const { classId, page = 1, pageSize = 20 } = event

  const res = await db.collection('auction_redemptions')
    .where({ user_id: openid, class_id: classId })
    .orderBy('created_at', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  const redemptions = []
  for (const r of res.data) {
    try {
      const itemRes = await db.collection('auction_items').doc(r.item_id).get()
      redemptions.push({
        ...r,
        item_title: itemRes.data.title,
        item_image: itemRes.data.image
      })
    } catch (e) {
      redemptions.push(r)
    }
  }

  return { code: 0, data: redemptions }
}

// 取消拍品
async function cancelItem(event, openid, role) {
  const { itemId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const itemRes = await db.collection('auction_items').doc(itemId).get()
  const item = itemRes.data

  if (item.seller_id !== openid && role !== 'admin' && role !== 'head_teacher') {
    return { code: 403, msg: '无权取消' }
  }

  if (item.status === 'cancelled') return { code: 400, msg: '已取消' }

  // 退还所有出价者的积分
  const bidsRes = await db.collection('auction_bids')
    .where({ item_id: itemId, status: _.in(['pending', 'winning']) })
    .get()

  for (const bid of bidsRes.data) {
    await refundScore(bid.user_id, item.class_id, bid.bid_price)
    await db.collection('auction_bids').doc(bid._id).update({
      data: { status: 'refunded' }
    })
  }

  // 退还未兑现的兑换积分
  const redemptionsRes = await db.collection('auction_redemptions')
    .where({ item_id: itemId, status: 'pending' })
    .get()

  for (const r of redemptionsRes.data) {
    await refundScore(r.user_id, item.class_id, r.price)
    await db.collection('auction_redemptions').doc(r._id).update({
      data: { status: 'cancelled' }
    })
  }

  await db.collection('auction_items').doc(itemId).update({
    data: { status: 'cancelled', updated_at: db.serverDate() }
  })

  return { code: 0, msg: '已取消并退还积分' }
}

// 兑现兑换
async function fulfillRedemption(event, openid, role) {
  const { redemptionId } = event
  if (!redemptionId) return { code: 400, msg: '缺少 redemptionId' }

  if (role !== 'admin' && role !== 'teacher' && role !== 'head_teacher') {
    return { code: 403, msg: '仅教师可兑现' }
  }

  await db.collection('auction_redemptions').doc(redemptionId).update({
    data: { status: 'fulfilled', fulfilled_at: db.serverDate() }
  })

  return { code: 0, msg: '已兑现' }
}

// 结算竞拍（手动或到期自动）
async function settleAuction(event, openid, role) {
  const { itemId } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  if (role !== 'admin' && role !== 'teacher' && role !== 'head_teacher') {
    return { code: 403, msg: '仅教师可结算' }
  }

  const itemRes = await db.collection('auction_items').doc(itemId).get()
  const item = itemRes.data

  if (item.type !== 'auction') return { code: 400, msg: '非竞拍型' }
  if (item.status !== 'active') return { code: 400, msg: '状态不可结算' }

  // 找最高出价
  const topBidRes = await db.collection('auction_bids')
    .where({ item_id: itemId, status: 'winning' })
    .orderBy('bid_price', 'desc')
    .limit(1)
    .get()

  if (topBidRes.data.length > 0) {
    const winner = topBidRes.data[0]
    // 中标
    await db.collection('auction_bids').doc(winner._id).update({
      data: { status: 'won' }
    })
    // 其余未中标者退还积分
    const otherBidsRes = await db.collection('auction_bids')
      .where({ item_id: itemId, status: 'pending' })
      .get()
    for (const bid of otherBidsRes.data) {
      await refundScore(bid.user_id, item.class_id, bid.bid_price)
      await db.collection('auction_bids').doc(bid._id).update({
        data: { status: 'refunded' }
      })
    }
    // 更新拍品
    await db.collection('auction_items').doc(itemId).update({
      data: {
        status: 'ended',
        winner_id: winner.user_id,
        winner_name: winner.user_name,
        updated_at: db.serverDate()
      }
    })
  } else {
    // 无人出价
    await db.collection('auction_items').doc(itemId).update({
      data: { status: 'ended', updated_at: db.serverDate() }
    })
  }

  return { code: 0, msg: '结算完成' }
}

// 出价历史
async function getBidHistory(event) {
  const { itemId, page = 1, pageSize = 20 } = event
  if (!itemId) return { code: 400, msg: '缺少 itemId' }

  const res = await db.collection('auction_bids')
    .where({ item_id: itemId })
    .orderBy('bid_price', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 隐藏出价者ID
  const bids = res.data.map(b => ({
    ...b,
    user_id: b.user_id === event.openid ? b.user_id : undefined
  }))

  return { code: 0, data: bids }
}

// 获取用户余额
async function getUserBalance(event, openid) {
  const { classId } = event
  const balance = await getUserScore(openid, classId)
  return { code: 0, data: { balance } }
}
