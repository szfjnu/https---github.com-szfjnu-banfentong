const DEFAULT_RULES = {
  academic: [
    { metric: 'avg_score', operator: '<', threshold: 60, level: 'red', label: '成绩低于60分' },
    { metric: 'score_trend', operator: '==', threshold: 'down', level: 'yellow', label: '成绩趋势下降' }
  ],
  behavioral: [
    { metric: 'warning_count', operator: '>=', threshold: 2, level: 'red', label: '累计2次及以上处分' },
    { metric: 'score_change', operator: '<', threshold: -20, level: 'yellow', label: '积分单周下降超20分' }
  ],
  attendance: [
    { metric: 'absent_count', operator: '>=', threshold: 3, level: 'red', label: '缺勤3次及以上' },
    { metric: 'late_count', operator: '>=', threshold: 5, level: 'yellow', label: '迟到5次及以上' },
    { metric: 'attendance_rate', operator: '<', threshold: 85, level: 'yellow', label: '出勤率低于85%' }
  ],
  hygiene: [
    { metric: 'hygiene_score', operator: '<', threshold: 60, level: 'red', label: '宿舍卫生低于60分' }
  ],
  dormitory: [
    { metric: 'discipline_score', operator: '<', threshold: 60, level: 'red', label: '宿舍纪律低于60分' },
    { metric: 'overall_score', operator: '<', threshold: 65, level: 'yellow', label: '宿舍综合低于65分' }
  ]
}

function evaluateRule(rule, kpiData) {
  const value = kpiData[rule.metric]
  if (value === undefined || value === null) return false

  const threshold = rule.threshold
  switch (rule.operator) {
    case '<': return value < threshold
    case '<=': return value <= threshold
    case '>': return value > threshold
    case '>=': return value >= threshold
    case '==': return value === threshold || String(value) === String(threshold)
    case '!=': return value !== threshold && String(value) !== String(threshold)
    default: return false
  }
}

async function detect(db, classId, semesterId, studentKpiMap, options = {}) {
  const { warningRules } = options
  const _ = db.command

  let rules = warningRules
  if (!rules) {
    try {
      let allData = [], skip = 0
      while (true) {
        const res = await db.collection('growth_warning_rules').where({ is_active: true }).skip(skip).limit(100).get()
        allData = allData.concat(res.data)
        if (res.data.length < 100) break
        skip += 100
      }
      rules = allData.length > 0 ? allData : Object.entries(DEFAULT_RULES).map(([type, rules]) => ({
        warning_type: type, rules, is_active: true
      }))
    } catch (e) {
      rules = Object.entries(DEFAULT_RULES).map(([type, rules]) => ({
        warning_type: type, rules, is_active: true
      }))
    }
  }

  const newWarnings = []
  const updatedWarnings = []

  for (const [studentId, kpiData] of Object.entries(studentKpiMap)) {
    for (const ruleGroup of rules) {
      if (!ruleGroup.is_active && ruleGroup.is_active !== undefined) continue
      const type = ruleGroup.warning_type
      const subRules = ruleGroup.rules || []

      for (const rule of subRules) {
        if (!evaluateRule(rule, kpiData)) continue

        const existingQuery = {
          student_id: studentId,
          warning_type: type,
          status: _.or(['pending', 'confirmed']),
          metric: rule.metric
        }
        if (classId) existingQuery.class_id = classId
        if (semesterId) existingQuery.semester_id = semesterId

        try {
          const existing = await db.collection('growth_warnings').where(existingQuery).limit(1).get()
          const now = Date.now()

          if (existing.data && existing.data.length > 0) {
            await db.collection('growth_warnings').doc(existing.data[0]._id).update({
              data: {
                warning_level: rule.level,
                label: rule.label,
                current_value: kpiData[rule.metric],
                threshold: rule.threshold,
                updated_at: now
              }
            })
            updatedWarnings.push({ student_id: studentId, warning_type: type, level: rule.level, label: rule.label, action: 'updated' })
          } else {
            const warning = {
              student_id: studentId,
              student_name: kpiData.student_name || '',
              class_id: classId,
              semester_id: semesterId,
              warning_type: type,
              warning_level: rule.level,
              metric: rule.metric,
              label: rule.label,
              current_value: kpiData[rule.metric],
              threshold: rule.threshold,
              operator: rule.operator,
              status: 'pending',
              created_at: now,
              updated_at: now
            }
            await db.collection('growth_warnings').add({ data: warning })
            newWarnings.push({ student_id: studentId, warning_type: type, level: rule.level, label: rule.label, action: 'created' })
          }
        } catch (e) {
          console.error('预警写入失败:', e)
        }
      }
    }
  }

  return {
    detected_count: newWarnings.length + updatedWarnings.length,
    new_warnings: newWarnings,
    updated_warnings: updatedWarnings
  }
}

module.exports = { detect, evaluateRule, DEFAULT_RULES }
