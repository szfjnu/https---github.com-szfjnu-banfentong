const cloudStorage = require('../utils/cloudStorage')
const headerMapping = require('../utils/headerMapping')
const validator = require('../utils/validator')

async function parse(fileID, options) {
  const buffer = await cloudStorage.download(fileID)
  const text = buffer.toString('utf-8')
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')

  if (lines.length === 0) {
    return {
      headers: [],
      fieldIndex: {},
      rows: [],
      validCount: 0,
      invalidCount: 0,
      errors: []
    }
  }

  const headerLine = lines[0]
  const separator = headerLine.includes('\t') ? '\t' : ','
  const headers = headerLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''))
  const fieldIndex = headerMapping.resolve(headers)

  const rows = []
  const allErrors = []
  let validCount = 0
  let invalidCount = 0

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator).map(v => v.trim().replace(/^"|"$/g, ''))
    const student = {}
    const fields = Object.keys(fieldIndex)
    for (const field of fields) {
      if (fieldIndex[field] !== -1 && values[fieldIndex[field]] !== undefined) {
        student[field] = values[fieldIndex[field]]
      }
    }
    const validation = validator.validateStudent(student)
    if (validation.valid) {
      validCount++
    } else {
      invalidCount++
      allErrors.push(...validation.errors.map(e => `第${i + 1}行: ${e}`))
    }
    rows.push({
      rowIndex: i + 1,
      raw: values,
      student: validation.student,
      valid: validation.valid,
      errors: validation.errors
    })
  }

  return {
    headers,
    fieldIndex,
    rows,
    validCount,
    invalidCount,
    errors: allErrors
  }
}

async function generate() {
  throw new Error('CSV策略不支持导出')
}

module.exports = { parse, generate }
