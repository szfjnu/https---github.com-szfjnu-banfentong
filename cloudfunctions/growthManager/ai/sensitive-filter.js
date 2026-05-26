const RANK_PATTERNS = [
  /排名第?\d+名?/g,
  /排名\s*\d+/g,
  /第?\d+名/g,
  /班级第?\d+/g,
  /年级第?\d+/g
]

const NAME_REPLACE = '***'

function filterStudentNames(text, currentStudentName, otherNames) {
  if (!text || !otherNames || otherNames.length === 0) return text

  let filtered = text
  for (const name of otherNames) {
    if (name && name !== currentStudentName && name.length >= 2) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filtered = filtered.replace(new RegExp(escaped, 'g'), NAME_REPLACE)
    }
  }
  return filtered
}

function filterRankInfo(text) {
  if (!text) return text
  let filtered = text
  for (const pattern of RANK_PATTERNS) {
    filtered = filtered.replace(pattern, '[排名信息已隐藏]')
  }
  return filtered
}

function filterCrossClassComparison(text) {
  if (!text) return text
  return text.replace(/其他班级|别的班级|外班/g, '[跨班级信息已隐藏]')
}

function filterInappropriateExpressions(text) {
  if (!text) return text
  const inappropriatePatterns = [
    { pattern: /差生|问题学生/g, replacement: '需要更多关注的学生' },
    { pattern: /后进生/g, replacement: '进步空间较大的学生' },
    { pattern: /差劲|糟糕/g, replacement: '有待提升' }
  ]
  let filtered = text
  for (const { pattern, replacement } of inappropriatePatterns) {
    filtered = filtered.replace(pattern, replacement)
  }
  return filtered
}

function filter(text, options = {}) {
  if (!text || typeof text !== 'string') return text

  let result = text

  if (options.otherNames) {
    result = filterStudentNames(result, options.currentStudentName, options.otherNames)
  }

  result = filterRankInfo(result)
  result = filterCrossClassComparison(result)
  result = filterInappropriateExpressions(result)

  return result
}

module.exports = { filter, filterStudentNames, filterRankInfo, filterCrossClassComparison, filterInappropriateExpressions }
