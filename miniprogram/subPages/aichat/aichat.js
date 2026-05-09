// pages/aichat/aichat.js
// 微聊陪伴 - AI 聊天页面
const app = getApp()

Page({
  data: {
    npcType: 'companion',
    npcList: [
      { key: 'companion', name: '陪伴伙伴', icon: '💬', desc: '温暖倾听，真诚陪伴' },
      { key: 'study', name: '学业顾问', icon: '📚', desc: '学习方法，规划指导' },
      { key: 'counselor', name: '心理辅导员', icon: '🧡', desc: '心理疏导，情绪调节' }
    ],
    currentNpc: null,
    messages: [], // {role, content, displayContent}
    inputText: '',
    sending: false,
    canSend: false,
    loading: true,
    scrollToView: '',
    showNpcPicker: false
  },

  onLoad: function (options) {
    const npcType = options.type || 'companion'
    this.initNpc(npcType)
  },

  onShow: function () {
    // 页面显示时滚动到底部
    this.scrollToBottom()
  },

  // 初始化 NPC
  initNpc: async function (npcType) {
    const npcList = this.data.npcList
    const currentNpc = npcList.find(n => n.key === npcType) || npcList[0]

    this.setData({
      npcType: currentNpc.key,
      currentNpc,
      messages: [],
      loading: true
    })

    wx.setNavigationBarTitle({ title: currentNpc.name })

    try {
      // 从云函数获取历史记录
      const res = await wx.cloud.callFunction({
        name: 'aiNpc',
        data: {
          action: 'getHistory',
          npc_type: currentNpc.key
        }
      })

      const result = res.result || {}
      if (result.success) {
        const historyMessages = (result.data.messages || []).map(msg => ({
          role: msg.role,
          content: msg.content,
          displayContent: msg.content
        }))
        this.setData({ messages: historyMessages })
      }
    } catch (err) {
      console.error('加载历史失败:', err)
    }

    this.setData({ loading: false })
    this.scrollToBottom()
  },

  // 切换 NPC 选择器
  toggleNpcPicker: function () {
    this.setData({ showNpcPicker: !this.data.showNpcPicker })
  },

  // 选择 NPC
  selectNpc: function (e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.npcType) {
      this.setData({ showNpcPicker: false })
      return
    }
    this.setData({ showNpcPicker: false })
    this.initNpc(key)
  },

  // 输入内容
  onInputChange: function (e) {
    const inputText = e.detail.value
    this.setData({
      inputText: inputText,
      canSend: inputText.trim().length > 0 && !this.data.sending
    })
  },

  // 发送消息
  sendMessage: async function () {
    const { inputText, sending, npcType, messages } = this.data
    const text = inputText.trim()

    if (!text || sending) return

    // 添加用户消息
    const userMsg = { role: 'user', content: text, displayContent: text }
    const newMessages = [...messages, userMsg]
    this.setData({
      messages: newMessages,
      inputText: '',
      sending: true,
      canSend: false
    })
    this.scrollToBottom()

    try {
      // 构建 AI 请求的 messages
      const systemPrompt = this.getSystemPrompt(npcType)
      const aiMessages = [systemPrompt]
      // 添加历史消息（最近 5 轮 = 10 条）
      const historySlice = messages.slice(-10)
      historySlice.forEach(msg => {
        aiMessages.push({ role: msg.role, content: msg.content })
      })
      // 添加当前用户消息
      aiMessages.push({ role: 'user', content: text })

      // 调用 AI 流式接口
      const model = wx.cloud.extend.AI.createModel('hunyuan-exp')
      const res = await model.streamText({
        data: {
          model: 'hunyuan-turbos-latest',
          messages: aiMessages
        }
      })

      // 添加 AI 回复占位
      const assistantMsg = { role: 'assistant', content: '', displayContent: '' }
      const withAssistant = [...newMessages, assistantMsg]
      this.setData({ messages: withAssistant })
      this.scrollToBottom()

      // 流式接收文本，实现打字机效果
      let fullContent = ''
      for await (let str of res.textStream) {
        fullContent += str
        // 更新最后一条消息的显示内容
        const updated = [...this.data.messages]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: fullContent,
          displayContent: fullContent
        }
        this.setData({ messages: updated })
        this.scrollToBottom()
      }

      // 流式完成，保存消息到数据库
      await wx.cloud.callFunction({
        name: 'aiNpc',
        data: {
          action: 'saveMessages',
          npc_type: npcType,
          messages: [
            { role: 'user', content: text },
            { role: 'assistant', content: fullContent }
          ]
        }
      })

    } catch (err) {
      console.error('AI 调用失败:', err)
      wx.showToast({ title: '发送失败，请重试', icon: 'none' })
      // 移除占位的 assistant 消息
      const filtered = this.data.messages.filter((_, i) => i < this.data.messages.length - 1)
      this.setData({ messages: filtered })
    } finally {
      this.setData({ sending: false, canSend: this.data.inputText.trim().length > 0 })
      this.scrollToBottom()
    }
  },

  // 获取系统提示词
  getSystemPrompt: function (npcType) {
    const prompts = {
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
    return prompts[npcType] || prompts.companion
  },

  // 滚动到底部
  scrollToBottom: function () {
    setTimeout(() => {
      wx.createSelectorQuery()
        .select('.chat-bottom')
        .boundingClientRect()
        .selectViewport()
        .scrollOffset()
        .exec(res => {
          if (res && res[0] && res[1]) {
            wx.pageScrollTo({
              scrollTop: res[1].scrollTop + res[0].top - 100,
              duration: 300
            })
          }
        })
    }, 100)
  },

  // 清空聊天
  clearChat: function () {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有聊天记录吗？此操作不可恢复。',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ messages: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  }
})
