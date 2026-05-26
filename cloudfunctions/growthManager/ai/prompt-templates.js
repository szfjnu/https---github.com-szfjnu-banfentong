const TEMPLATES = {
  management_advice: {
    name: '班级管理建议',
    systemPrompt: '你是一位经验丰富的班主任管理顾问。请基于提供的班级数据，给出专业、具体、可操作的管理建议。建议分为三段：1.整体趋势研判（班级各维度数据趋势分析）2.重点关注学生（需要特别关注的学生及原因）3.管理策略优化（具体可行的改进建议）。请用简洁专业的语言，避免空泛表述，每个建议点不超过2句话。',
    buildUserPrompt: (data) => {
      const { kpi, warnings, studentSummary, dimensionTrends } = data
      let prompt = `【班级数据总览】\n`
      if (kpi) {
        prompt += `班级均分: ${kpi.avg_score || 'N/A'}, 活跃学生数: ${kpi.active_count || 'N/A'}, 预警人数: ${kpi.warning_count || 'N/A'}, 优良率: ${kpi.excellent_rate || 'N/A'}%\n`
      }
      if (dimensionTrends) {
        prompt += `\n【各维度趋势】\n`
        for (const [dim, trend] of Object.entries(dimensionTrends)) {
          prompt += `${dim}: 方向=${trend.direction || 'N/A'}, 速率=${trend.rate || 'N/A'}\n`
        }
      }
      if (warnings && warnings.length > 0) {
        prompt += `\n【当前预警】(共${warnings.length}条)\n`
        warnings.slice(0, 10).forEach(w => {
          prompt += `- ${w.student_name || '学生'}: ${w.label || w.warning_type} (${w.warning_level}级)\n`
        })
      }
      if (studentSummary) {
        prompt += `\n【学生概要】\n`
        studentSummary.slice(0, 15).forEach(s => {
          prompt += `- ${s.student_name || '学生'}: 积分=${s.total_score || 0}, 考勤率=${s.attendance_rate || 'N/A'}%\n`
        })
      }
      return prompt
    }
  },

  student_review: {
    name: '学生阶段性评语',
    systemPrompt: '你是一位资深班主任，擅长撰写学生评语。请基于学生多维数据，生成客观、鼓励性的阶段性评语。评语应包含：1.学业表现评价 2.行为表现评价 3.闪光点与进步 4.待改进方面 5.下阶段期望。语气温暖但客观，避免泛泛而谈，每个方面2-3句话，结合具体数据。',
    buildUserPrompt: (data) => {
      const { studentName, dimensions, timeRange } = data
      let prompt = `【学生评语生成】\n学生姓名: ${studentName || '该学生'}\n`
      if (timeRange) prompt += `时间段: ${timeRange}\n`
      prompt += `\n【各维度数据】\n`
      if (dimensions) {
        for (const [key, dim] of Object.entries(dimensions)) {
          prompt += `${dim.name || key}: ${JSON.stringify(dim.kpi || {})}\n`
        }
      }
      return prompt
    }
  },

  dev_advice: {
    name: '个性化发展建议',
    systemPrompt: '你是一位专业的学生发展顾问。请基于学生的深度数据分析结果和各维度表现，生成个性化发展规划建议。建议分为三段：1.优势强化（识别学生优势维度，给出深化建议）2.短板补齐（识别薄弱维度，给出具体改进方法）3.行动路径（给出1-3条可执行的近期行动建议）。请具体可操作，避免空泛建议，每条建议不超过2句话。',
    buildUserPrompt: (data) => {
      const { studentName, analysis, dimensions } = data
      let prompt = `【个性化发展建议】\n学生姓名: ${studentName || '该学生'}\n`
      if (analysis) {
        if (analysis.trend) prompt += `\n【趋势分析】\n${JSON.stringify(analysis.trend)}\n`
        if (analysis.correlation) prompt += `\n【关联分析】显著相关: ${JSON.stringify(analysis.correlation.significant_pairs || [])}\n`
        if (analysis.cluster) prompt += `\n【聚类归属】${analysis.cluster.description || 'N/A'}\n`
      }
      if (dimensions) {
        prompt += `\n【各维度得分】\n`
        for (const [key, dim] of Object.entries(dimensions)) {
          prompt += `${dim.name || key}: ${dim.normalized_score || 'N/A'}/100\n`
        }
      }
      return prompt
    }
  },

  suggestions: {
    name: '改进建议',
    systemPrompt: '你是一位数据分析顾问。请基于预警数据和异常指标，给出针对性的改进建议。建议应具体、可量化、有时限，避免泛泛而谈。',
    buildUserPrompt: (data) => {
      const { warningType, currentValue, threshold, studentName } = data
      return `【改进建议】\n预警类型: ${warningType}\n学生: ${studentName || 'N/A'}\n当前值: ${currentValue}\n阈值: ${threshold}\n请给出具体改进建议。`
    }
  }
}

function getTemplate(templateKey) {
  return TEMPLATES[templateKey] || null
}

function buildPrompt(templateKey, data) {
  const template = TEMPLATES[templateKey]
  if (!template) return null
  return {
    systemPrompt: template.systemPrompt,
    userPrompt: template.buildUserPrompt(data)
  }
}

module.exports = { TEMPLATES, getTemplate, buildPrompt }
