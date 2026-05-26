const scheduleHeaderMapping = require('./scheduleHeaderMapping')

const WEEK_DAY_PATTERNS = [
  { pattern: /^星期[一二三四五六日]$/, map: { '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6, '星期日': 7 } },
  { pattern: /^周[一二三四五六日]$/, map: { '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7 } },
  { pattern: /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i, map: { 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 7 } }
]

const SECTION_PATTERN = /第(\d+)节课?/

function detectScheduleFormat(workbook) {
  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { formatType: 'flat', confidence: 0, meta: {} }
  }
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const XLSX = require('xlsx')
  const rawData = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' })

  if (!rawData || rawData.length === 0) {
    return { formatType: 'flat', confidence: 0, meta: {} }
  }

  const flatScore = detectFlatFormat(rawData)
  const matrixResult = detectMatrixFormat(rawData, sheet)

  if (flatScore >= 2) {
    return { formatType: 'flat', confidence: flatScore, meta: {} }
  }

  if (matrixResult.score >= 2) {
    const meta = extractMatrixMeta(rawData, sheet, matrixResult)
    return { formatType: 'matrix', confidence: matrixResult.score, meta }
  }

  return { formatType: 'flat', confidence: 0, meta: {} }
}

function detectFlatFormat(rawData) {
  let score = 0
  if (!rawData || rawData.length === 0) return score

  const headers = Object.keys(rawData[0])
  const headerLower = headers.map(h => h.toLowerCase().trim())

  const flatIndicators = [
    ['schedule_id', '课表编号', '课程编号', '排课id'],
    ['week_day', '星期', '周几'],
    ['section', '节次', '第几节']
  ]

  for (const indicators of flatIndicators) {
    if (indicators.some(ind => headerLower.some(h => h.includes(ind.toLowerCase())))) {
      score++
    }
  }

  return score
}

function detectMatrixFormat(rawData, sheet) {
  let score = 0
  const weekDayCols = []
  const sectionRows = []

  if (!rawData || rawData.length === 0) {
    return { score, weekDayCols, sectionRows }
  }

  const checkRows = rawData.slice(0, 3)
  for (const row of checkRows) {
    const values = Object.values(row).map(v => String(v).trim())
    for (const val of values) {
      for (const wp of WEEK_DAY_PATTERNS) {
        if (wp.pattern.test(val)) {
          const weekDay = wp.map[val] || wp.map[val.toLowerCase()]
          if (weekDay && !weekDayCols.find(w => w.label === val)) {
            weekDayCols.push({ label: val, weekDay })
          }
        }
      }
    }
  }
  if (weekDayCols.length >= 3) score++

  const firstColKey = Object.keys(rawData[0])[0]
  for (let i = 0; i < Math.min(rawData.length, 40); i++) {
    const val = String(rawData[i][firstColKey] || '').trim()
    const match = val.match(SECTION_PATTERN)
    if (match) {
      const section = Number(match[1])
      if (section >= 1 && section <= 9) {
        sectionRows.push({ rowIndex: i, section, label: val })
      }
    }
  }
  if (sectionRows.length >= 1) score++

  if (sectionRows.length >= 1 && rawData.length >= sectionRows.length * 4) {
    score++
  }

  return { score, weekDayCols, sectionRows }
}

function extractMatrixMeta(rawData, sheet, matrixResult) {
  const meta = {
    headerRowCount: 1,
    sectionColumnIndex: 0,
    weekDayColumns: [],
    sectionGroups: [],
    subRowsPerSection: 4,
    subRowMapping: { 0: 'course_name', 1: 'class_name', 2: 'room', 3: 'campus' }
  }

  if (!rawData || rawData.length === 0) return meta

  const headerRow = rawData[0]
  const headers = Object.keys(headerRow)

  for (let i = 0; i < headers.length; i++) {
    const val = String(headerRow[headers[i]]).trim()
    for (const wp of WEEK_DAY_PATTERNS) {
      if (wp.pattern.test(val)) {
        const weekDay = wp.map[val] || wp.map[val.toLowerCase()]
        if (weekDay && !meta.weekDayColumns.find(w => w.colIndex === i)) {
          meta.weekDayColumns.push({ colIndex: i, weekDay, label: val })
        }
      }
    }
  }

  if (meta.weekDayColumns.length === 0 && matrixResult.weekDayCols.length > 0) {
    const colOffset = headers.length > 0 ? 1 : 0
    for (let i = 0; i < 7; i++) {
      if (i + colOffset < headers.length) {
        meta.weekDayColumns.push({ colIndex: i + colOffset, weekDay: i + 1, label: '' })
      }
    }
  }

  const firstColKey = headers[0] || ''
  const sectionGroups = []
  for (let i = 0; i < rawData.length; i++) {
    const val = String(rawData[i][firstColKey] || '').trim()
    const match = val.match(SECTION_PATTERN)
    if (match) {
      const section = Number(match[1])
      if (section >= 1 && section <= 9) {
        sectionGroups.push({ section, startRow: i, label: val })
      }
    }
  }
  meta.sectionGroups = sectionGroups

  if (sectionGroups.length > 0) {
    const subRowAliases = scheduleHeaderMapping._matrixSubRowAliases || {}
    const detectedMapping = {}
    let hasSubRowLabels = false

    const firstGroupStartRow = sectionGroups[0].startRow
    for (let s = 0; s < meta.subRowsPerSection; s++) {
      const subRowIdx = firstGroupStartRow + 1 + s
      if (subRowIdx >= rawData.length) break
      const subRowVal = String(rawData[subRowIdx][firstColKey] || '').trim()
      if (!subRowVal) continue

      for (const [fieldName, config] of Object.entries(subRowAliases)) {
        if (config.aliases && config.aliases.some(alias => alias === subRowVal)) {
          detectedMapping[s] = fieldName
          hasSubRowLabels = true
          break
        }
      }
    }

    if (hasSubRowLabels && Object.keys(detectedMapping).length > 0) {
      meta.subRowMapping = detectedMapping
    }
  }

  return meta
}

module.exports = { detectScheduleFormat, detectFlatFormat, detectMatrixFormat, extractMatrixMeta }
