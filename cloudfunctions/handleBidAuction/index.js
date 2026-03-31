// 云函数:积分兑换投标处理
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, item_id, student_id, bid_score } = event

  if (action === 'submitBid') {
    return await submitBid(item_id, student_id, bid_score)
  } else if (action === 'cancelBid') {
    return await cancelBid(item_id, student_id)
  } else if (action === 'determineWinner') {
    return await determineWinner(item_id)
  }
}

// 提交投标
async function submitBid(item_id, student_id, bid_score) {
  try {
    // 1. 检查物品是否在投标期内
    const itemRes = await db.collection('redemption_items').doc(item_id).get()
    if (!itemRes.data) {
      return { success: false, message: '物品不存在' }
    }

    const item = itemRes.data
    const now = new Date()

    if (item.redemption_mode !== '投标模式') {
      return { success: false, message: '该物品不支持投标模式' }
    }

    if (now < new Date(item.bid_start_time) || now > new Date(item.bid_end_time)) {
      return { success: false, message: '不在投标时间内' }
    }

    // 2. 检查学生当前积分是否足够
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

    // 3. 检查是否已经投标
    const existingBidRes = await db.collection('redemption_requests').where({
      item_id: item_id,
      student_id: student_id,
      redemption_mode: '投标',
      status: _.in(['待审批', '已中标'])
    }).get()

    if (existingBidRes.data.length > 0) {
      return { success: false, message: '您已经投标过了' }
    }

    // 4. 创建投标记录
    await db.collection('redemption_requests').add({
      data: {
        item_id: item_id,
        student_id: student_id,
        redemption_mode: '投标',
        bid_score: bid_score,
        bid_time: now,
        status: '待审批',
        is_winner: false,
        created_at: now
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

// 取消投标
async function cancelBid(item_id, student_id) {
  try {
    // 1. 检查是否在投标截止前
    const itemRes = await db.collection('redemption_items').doc(item_id).get()
    if (!itemRes.data) {
      return { success: false, message: '物品不存在' }
    }

    const item = itemRes.data
    const now = new Date()

    if (now > new Date(item.bid_end_time)) {
      return { success: false, message: '投标已截止,无法取消' }
    }

    // 2. 查找并取消投标记录
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

// 确定中标者
async function determineWinner(item_id) {
  try {
    // 1. 获取物品信息
    const itemRes = await db.collection('redemption_items').doc(item_id).get()
    if (!itemRes.data) {
      return { success: false, message: '物品不存在' }
    }

    const item = itemRes.data

    // 2. 获取所有投标记录
    const bidsRes = await db.collection('redemption_requests').where({
      item_id: item_id,
      redemption_mode: '投标',
      status: '待审批'
    }).orderBy('bid_score', 'desc')
      .orderBy('bid_time', 'asc')
      .get()

    if (bidsRes.data.length === 0) {
      return { success: false, message: '没有有效投标' }
    }

    // 3. 确定中标者(最高分,相同则按时间先后)
    const winnerBid = bidsRes.data[0]

    // 4. 更新投标记录
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

    // 5. 扣除中标学生积分
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

      // 6. 创建积分记录
      await db.collection('score_records').add({
        data: {
          student_id: winnerBid.student_id,
          item_id: 'REDEMPTION',
          score_change: -winnerBid.bid_score,
          reason_detail: `积分兑换: ${item.name}`,
          date: now,
          recorder_name: '系统自动',
          recorder_openid: 'system',
          semester_id: item.semester_id,
          source_type: '积分兑换',
          approval_status: '已通过',
          created_at: now
        }
      })
    }

    // 7. 更新物品状态
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

// 计算积分等级
function calculateScoreLevel(score) {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 70) return '中等'
  if (score >= 60) return '及格'
  return '不及格'
}
