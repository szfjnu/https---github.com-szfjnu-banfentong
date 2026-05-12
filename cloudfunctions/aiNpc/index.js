// 云函数：AI NPC 微聊陪伴 - 数据库操作
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const { getCallerInfo, AUTH_ERRORS } = require('./utils/auth')

// NPC 系统提示词字典
const SYSTEM_PROMPTS = {
  companion: {
    role: 'system',
    content: '你是一位温暖、善解人意的微聊陪伴伙伴。你的职责是倾听用户的心声，给予真诚的情感支持和鼓励。你应该用亲切、自然的语气交流，像朋友一样陪伴用户。不要过于正式或说教，而是用共情的方式回应。当用户遇到困难时，给予建设性的建议；当用户开心时，一起分享喜悦。回答要简洁温暖，一般不超过150字。'
  },
  study: {
    role: 'system',
    content: '你是一位专业、耐心的学业顾问。你擅长帮助学生制定学习计划、解答学习困惑、提供高效学习方法。你会根据学生的情况给出针对性的建议，帮助学生建立良好的学习习惯。回答要条理清晰、实用可行，一般不超过200字。'
  },
  counselor: {
    role: 'system',
    content: '你是一位温和、专业的心理辅导员。你善于倾听，能够识别学生的情绪状态，提供适当的心理疏导。当学生感到焦虑、压力或困惑时，你会用专业的心理学方法帮助他们调节情绪、建立积极心态。如果发现可能有严重心理问题的情况，你会温和地建议寻求专业帮助。回答要温暖有力量，一般不超过200字。'
  }
}

exports.main = async (event, context) => {
  const { action, npc_type, messages: newMessages } = event

  if (!npc_type) {
    return { success: false, message: '缺少 npc_type 参数' }
  }

  try {
    const caller = await getCallerInfo(event, event.classId || event.class_id)

    switch (action) {
      case 'getHistory':
        return await getHistory(caller.openid, npc_type)
      case 'saveMessages':
        return await saveMessages(caller.openid, npc_type, newMessages)
      case 'getSystemPrompt':
        return { success: true, data: { prompt: SYSTEM_PROMPTS[npc_type] || SYSTEM_PROMPTS.companion } }
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error('aiNpc 错误:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return { success: false, message: err.message || '操作失败' }
  }
}

// 获取聊天历史（最近 5 轮 = 10 条消息）
async function getHistory(openid, npc_type) {
  try {
    const res = await db.collection('chat_logs')
      .where({ user_id: openid, npc_type })
      .get()

    if (res.data.length === 0) {
      return { success: true, data: { messages: [] } }
    }

    const record = res.data[0]
    const messages = record.messages || []
    // 取最近 10 条消息（5 轮对话）
    const recentMessages = messages.slice(-10)

    return { success: true, data: { messages: recentMessages } }
  } catch (err) {
    console.error('获取历史失败:', err)
    return { success: false, message: '获取历史失败' }
  }
}

// 保存消息到 chat_logs
async function saveMessages(openid, npc_type, newMessages) {
  if (!newMessages || !Array.isArray(newMessages) || newMessages.length === 0) {
    return { success: false, message: '缺少消息数据' }
  }

  try {
    const res = await db.collection('chat_logs')
      .where({ user_id: openid, npc_type })
      .get()

    if (res.data.length === 0) {
      // 新建记录
      const messages = newMessages.slice(-20) // 限制最多 20 条
      await db.collection('chat_logs').add({
        data: {
          user_id: openid,
          npc_type,
          messages,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      })
    } else {
      // 更新已有记录
      const record = res.data[0]
      const currentMessages = record.messages || []
      const updatedMessages = [...currentMessages, ...newMessages]

      // 限制数组最大长度为 20
      const finalMessages = updatedMessages.slice(-20)

      await db.collection('chat_logs').doc(record._id).update({
        data: {
          messages: finalMessages,
          updated_at: db.serverDate()
        }
      })
    }

    return { success: true }
  } catch (err) {
    console.error('保存消息失败:', err)
    return { success: false, message: '保存消息失败' }
  }
}
