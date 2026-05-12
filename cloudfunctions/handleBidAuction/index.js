// 云函数:积分兑换投标处理
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const { getCallerInfo, requireClassAccess, requireTeacher, AUTH_ERRORS } = require('./utils/auth')

exports.main = async (event, context) => {
  const { action, item_id, student_id, bid_score, class_id } = event

  try {
    const caller = await getCallerInfo(event, class_id)

    if (action === 'submitBid') {
      return await submitBid(item_id, student_id, bid_score, class_id, caller)
    } else if (action === 'cancelBid') {
      return await cancelBid(item_id, student_id, class_id, caller)
    } else if (action === 'determineWinner') {
      requireClassAccess(caller, class_id, ['head_teacher', 'subject_teacher', 'admin'])
      return await determineWinner(item_id, class_id, caller)
    } else {
      return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('投标操作失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return { success: false, message: err.message || '操作失败' }
  }
}

async function submitBid(item_id, student_id, bid_score, class_id, caller) {
  try {
    const itemQuery = { _id: item_id };
    if (class_id) itemQuery.class_id = class_id;
    const itemRes = await db.collection('redemption_items').where(itemQuery).limit(1).get()
    if (!itemRes.data || itemRes.data.length === 0) {
      return { success: false, message: '物品不存在' }
    }

    const item = itemRes.data[0]
    const now = new Date()

    if (item.redemption_mode !== '投标模式') {
      return { success: false, message: '该物品不支持投标模式' }
    }

    if (now < new Date(item.bid_start_time) || now > new Date(item.bid_end_time)) {
      return { success: false, message: '不在投标时间内' }
    }

    const studentRes = await db.collection('students').where({
      student_id: student_id
    }).get()

    if (studentRes.data.length === 0) {
      return { success: false, message: '学生不存在' }
    }

    const student = studentRes.data[0]
    if (student.current_score < bid_score) {
      return { success: false, message: '积分不足' }
    }

    const existingBidRes = await db.collection('redemption_requests').where({
      item_id: item_id,
      student_id: student_id,
      redemption_mode: '投标',
      status: _.in(['待审批', '已中标'])
    }).get()

    if (existingBidRes.data.length > 0) {
      return { success: false, message: '您已经投标过了' }
    }

    await db.collection('redemption_requests').add({
      data: {
        item_id: item_id,
        student_id: student_id,
        redemption_mode: '投标',
        bid_score: bid_score,
        bid_time: now,
        status: '待审批',
        is_winner: false,
        created_at: now,
        class_id: class_id
      }
    })

    return {
      success: true,
      message: '投标成功'
    }

  } catch (err) {
    console.error('提交投标失败:', err)
    return { success: false, message: `投标失败: ${err.message}` }
  }
}

async function cancelBid(item_id, student_id, class_id, caller) {
  try {
    const itemQuery = { _id: item_id };
    if (class_id) itemQuery.class_id = class_id;
    const itemRes = await db.collection('redemption_items').where(itemQuery).limit(1).get()
    if (!itemRes.data || itemRes.data.length === 0) {
      return { success: false, message: '物品不存在' }
    }

    const item = itemRes.data[0]
    const now = new Date()

    if (now > new Date(item.bid_end_time)) {
      return { success: false, message: '投标已截止,无法取消' }
    }

    const bidRes = await db.collection('redemption_requests').where({
      item_id: item_id,
      student_id: student_id,
      redemption_mode: '投标',
      status: '待审批'
    }).get()

    if (bidRes.data.length === 0) {
      return { success: false, message: '未找到投标记录' }
    }

    await db.collection('redemption_requests').doc(bidRes.data[0]._id).update({
      data: {
        status: '已取消',
        cancellation_time: now
      }
    })

    return {
      success: true,
      message: '投标已取消'
    }

  } catch (err) {
    console.error('取消投标失败:', err)
    return { success: false, message: `取消失败: ${err.message}` }
  }
}

async function determineWinner(item_id, class_id, caller) {
  try {
    const itemQuery = { _id: item_id };
    if (class_id) itemQuery.class_id = class_id;
    const itemRes = await db.collection('redemption_items').where(itemQuery).limit(1).get()
    if (!itemRes.data || itemRes.data.length === 0) {
      return { success: false, message: '物品不存在' }
    }

    const item = itemRes.data[0]

    let bidQuery = {
      item_id: item_id,
      redemption_mode: '投标',
      status: '待审批'
    };
    if (class_id) bidQuery.class_id = class_id;
    const bidsRes = await db.collection('redemption_requests').where(bidQuery).orderBy('bid_score', 'desc')
      .orderBy('bid_time', 'asc')
      .get()

    if (bidsRes.data.length === 0) {
      return { success: false, message: '没有有效投标' }
    }

    const winnerBid = bidsRes.data[0]

    const now = new Date()
    const updatePromises = bidsRes.data.map(async (bid) => {
      const isWinner = bid._id === winnerBid._id
      await db.collection('redemption_requests').doc(bid._id).update({
        data: {
          status: isWinner ? '已中标' : '未中标',
          is_winner: isWinner,
          approval_time: now
        }
      })
    })

    await Promise.all(updatePromises)

    if (winnerBid.bid_score > 0) {
      await db.collection('students').where({
        student_id: winnerBid.student_id
      }).update({
        data: {
          current_score: _.inc(-winnerBid.bid_score),
          score_level: calculateScoreLevel(_.inc(-winnerBid.bid_score)),
          updated_at: now
        }
      })

      await db.collection('score_records').add({
        data: {
          student_id: winnerBid.student_id,
          item_id: 'REDEMPTION',
          score_change: -winnerBid.bid_score,
          reason_detail: `积分兑换: ${item.name}`,
          date: now,
          recorder_name: '系统自动',
          recorder_openid: caller.openid,
          semester_id: item.semester_id,
          source_type: '积分兑换',
          approval_status: '已通过',
          created_at: now
        }
      })
    }

    await db.collection('redemption_items').doc(item_id).update({
      data: {
        status: '已兑换',
        winner_id: winnerBid.student_id,
        winner_bid_score: winnerBid.bid_score,
        updated_at: now
      }
    })

    return {
      success: true,
      message: '投标已结束,中标者已确定',
      data: {
        winner_id: winnerBid.student_id,
        winner_bid_score: winnerBid.bid_score
      }
    }

  } catch (err) {
    console.error('确定中标者失败:', err)
    return { success: false, message: `操作失败: ${err.message}` }
  }
}

function calculateScoreLevel(score) {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 70) return '中等'
  if (score >= 60) return '及格'
  return '不及格'
}
