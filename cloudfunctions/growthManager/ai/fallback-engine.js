const FALLBACK_TEMPLATES = {
  management_advice: (data) => {
    const { kpi, warnings } = data
    const warningCount = warnings ? warnings.length : 0
    return {
      overall_trend: '基于当前数据，班级整体运行平稳。建议持续关注各维度数据变化趋势。',
      focus_students: warningCount > 0
        ? `当前有${warningCount}条预警，建议重点关注预警学生，及时沟通了解情况。`
        : '当前无预警，班级运行良好。建议关注处于临界值的学生。',
      strategy_optimization: '建议：1.每周回顾各维度数据变化；2.对预警学生制定个性化帮扶方案；3.发挥优秀学生榜样作用。',
      generated_by_ai: false
    }
  },

  student_review: (data) => {
    const { studentName, dimensions } = data
    const dimNames = dimensions ? Object.values(dimensions).map(d => d.name || '').filter(n => n).join('、') : '各维度'
    return {
      academic_performance: `${studentName || '该学生'}在学业方面表现需结合具体数据评估，建议关注成绩趋势变化。`,
      behavior_performance: '行为表现整体需结合考勤、值日、处分等维度综合评估。',
      highlights: `在${dimNames}方面均有参与记录，建议发掘闪光点并予以鼓励。`,
      improvement_areas: '建议关注相对薄弱的维度，制定针对性提升计划。',
      expectations: '下阶段期望：保持优势维度表现，在薄弱维度争取进步。',
      generated_by_ai: false
    }
  },

  dev_advice: (data) => {
    const { studentName } = data
    return {
      strength_enhancement: `${studentName || '该学生'}的优势维度建议继续深化，可参加相关拓展活动。`,
      weakness_improvement: '薄弱维度建议制定每日/每周小目标，循序渐进提升。',
      action_path: '近期建议：1.与老师沟通制定提升计划；2.利用优势带动薄弱项；3.坚持每日复盘。',
      generated_by_ai: false
    }
  },

  suggestions: (data) => {
    return {
      content: `针对${data.warningType || '该类型'}预警，建议关注当前指标变化，制定针对性改进措施。`,
      generated_by_ai: false
    }
  }
}

async function generateWithFallback(cloud, templateKey, data, aiCaller) {
  try {
    const promptTemplates = require('./prompt-templates')
    const { systemPrompt, userPrompt } = promptTemplates.buildPrompt(templateKey, data)
    const result = await aiCaller.callAI(cloud, systemPrompt, userPrompt)
    return { ...result, generated_by_ai: true }
  } catch (err) {
    console.warn(`AI生成失败(key=${templateKey})，启用降级策略:`, err.message)

    const fallbackFn = FALLBACK_TEMPLATES[templateKey]
    if (fallbackFn) {
      return fallbackFn(data)
    }

    return {
      content: '数据不足或AI服务暂时不可用，请稍后再试。',
      generated_by_ai: false,
      fallback_reason: err.code || err.message
    }
  }
}

module.exports = { generateWithFallback, FALLBACK_TEMPLATES }
