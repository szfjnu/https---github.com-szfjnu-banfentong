const scheduleValidator = require('./scheduleValidator')

function convert(cellMatrix, matrixMeta, options) {
  const {
    sectionGroups,
    weekDayColumns,
    subRowsPerSection,
    subRowMapping,
    headerRowCount
  } = matrixMeta

  const rows = []
  const allErrors = []
  let validCount = 0
  let invalidCount = 0
  let scheduleSeq = 1
  const dateStr = formatDate(new Date())

  for (const group of sectionGroups) {
    for (const wdCol of weekDayColumns) {
      const subRows = extractSubRows(
        cellMatrix,
        group.startRow,
        wdCol.colIndex,
        subRowsPerSection,
        subRowMapping,
        headerRowCount
      )

      const courseName = (subRows.course_name || '').trim()
      if (!courseName) continue

      const schedule = {
        schedule_id: `SCH-${dateStr}-${String(scheduleSeq).padStart(4, '0')}`,
        course_name: courseName,
        subject_name: courseName,
        class_name: (subRows.class_name || '').trim(),
        room: (subRows.room || '').trim(),
        campus: (subRows.campus || '').trim(),
        week_day: wdCol.weekDay,
        section: group.section,
        schedule_type: '课程',
        is_base: true,
        status: 'normal'
      }

      scheduleSeq++

      if (options && options.classId) schedule.class_id = options.classId
      if (options && options.className) schedule.class_name = schedule.class_name || options.className
      if (options && options.semesterName) schedule.semester_name = options.semesterName

      const validation = scheduleValidator.validateSchedule(schedule)
      if (validation.valid) {
        validCount++
      } else {
        invalidCount++
        allErrors.push(...validation.errors.map(e => `节${group.section}星期${wdCol.weekDay}: ${e}`))
      }

      rows.push({
        rowIndex: rows.length + 1,
        raw: subRows,
        schedule: validation.schedule,
        valid: validation.valid,
        errors: validation.errors
      })
    }
  }

  return {
    rows,
    validCount,
    invalidCount,
    errors: allErrors,
    formatType: 'matrix',
    meta: {
      sectionCount: sectionGroups.length,
      weekDayCount: weekDayColumns.length,
      totalCells: sectionGroups.length * weekDayColumns.length
    }
  }
}

function extractSubRows(cellMatrix, groupStartRow, colIndex, subRowsPerSection, subRowMapping, headerRowCount) {
  const result = {}
  const subRowStart = groupStartRow + 1

  for (let s = 0; s < subRowsPerSection; s++) {
    const rowIndex = subRowStart + s
    const fieldName = subRowMapping[s]
    if (!fieldName) continue

    if (rowIndex >= 0 && rowIndex < cellMatrix.length) {
      const row = cellMatrix[rowIndex]
      if (row && colIndex >= 0 && colIndex < row.length) {
        result[fieldName] = String(row[colIndex] || '').trim()
      }
    }
  }

  return result
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

module.exports = { convert, extractSubRows }
