const AI_TIMEOUT = 15000
const RETRY_DELAY = 30000
const MAX_RETRIES = 1

let aiInstance = null

function getAI(cloud) {
  if (!aiInstance) {
    try {
      aiInstance = cloud.ai()
    } catch (e) {
      console.error('cloud.ai()初始化失败:', e.message)
      aiInstance = null
    }
  }
  return aiInstance
}

async function callAI(cloud, systemPrompt, userPrompt, options = {}) {
  const model = options.model || 'deepseek-r1-0528'
  const timeout = options.timeout || AI_TIMEOUT
  const maxRetries = options.maxRetries || MAX_RETRIES

  const ai = getAI(cloud)
  if (!ai) {
    const err = new Error('AI服务未初始化')
    err.code = 'AI_NOT_AVAILABLE'
    throw err
  }

  let lastError = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        ai.chat({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI调用超时')), timeout))
      ])

      if (!result || !result.choices || !result.choices[0] || !result.choices[0].message) {
        throw new Error('AI返回格式异常')
      }

      return {
        content: result.choices[0].message.content,
        model,
        generated_by_ai: true,
        timestamp: Date.now()
      }
    } catch (err) {
      lastError = err
      if (err.message && err.message.includes('429')) {
        if (attempt < maxRetries) {
          console.log(`AI限流，${RETRY_DELAY / 1000}秒后重试...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
          continue
        }
      }
      if (err.message === 'AI调用超时') {
        err.code = 'AI_TIMEOUT'
        break
      }
    }
  }

  lastError.code = lastError.code || 'AI_ERROR'
  throw lastError
}

module.exports = { callAI, getAI }
