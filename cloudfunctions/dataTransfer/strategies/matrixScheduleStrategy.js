const XLSX = require('xlsx')
const cloudStorage = require('../utils/cloudStorage')
const formatDetector = require('../utils/formatDetector')
const mergeCellProcessor = require('../utils/mergeCellProcessor')
const matrixConverter = require('../utils/matrixConverter')

async function parseSchedule(fileID, options) {
  const buffer = await cloudStorage.download(fileID)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const formatResult = formatDetector.detectScheduleFormat(workbook)
  if (formatResult.formatType !== 'matrix') {
    throw new Error('Excel格式未识别为矩阵格式课表')
  }

  const cellMatrix = mergeCellProcessor.processMerges(sheet)

  if (!cellMatrix || cellMatrix.length === 0) {
    return { headers: [], fieldIndex: {}, rows: [], validCount: 0, invalidCount: 0, errors: [] }
  }

  const result = matrixConverter.convert(cellMatrix, formatResult.meta, options)

  for (const row of result.rows) {
    if (row.valid && options) {
      if (options.classId) row.schedule.class_id = options.classId
      if (options.className) row.schedule.class_name = row.schedule.class_name || options.className
      if (options.semesterName) row.schedule.semester_name = options.semesterName
    }
  }

  return {
    headers: [],
    fieldIndex: {},
    rows: result.rows,
    validCount: result.validCount,
    invalidCount: result.invalidCount,
    errors: result.errors,
    formatType: 'matrix',
    matrixMeta: result.meta
  }
}

module.exports = { parseSchedule }
