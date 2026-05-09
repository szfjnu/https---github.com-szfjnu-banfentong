const XLSX = require('xlsx')
const cloudStorage = require('../utils/cloudStorage')
const headerMapping = require('../utils/headerMapping')
const scheduleHeaderMapping = require('../utils/scheduleHeaderMapping')
const gradeHeaderMapping = require('../utils/gradeHeaderMapping')
const validator = require('../utils/validator')
const scheduleValidator = require('../utils/scheduleValidator')

async function parse(fileID, options) {
  const buffer = await cloudStorage.download(fileID)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' })

  if (rawData.length === 0) {
    return {
      headers: [],
      fieldIndex: {},
      rows: [],
      validCount: 0,
      invalidCount: 0,
      errors: []
    }
  }

  const headers = Object.keys(rawData[0])
  const fieldIndex = headerMapping.resolve(headers)

  const rows = []
  const allErrors = []
  let validCount = 0
  let invalidCount = 0

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    const student = {}
    const fields = Object.keys(fieldIndex)
    for (const field of fields) {
      const colKey = headers[fieldIndex[field]]
      if (fieldIndex[field] !== -1 && colKey && row[colKey] !== undefined) {
        student[field] = row[colKey]
      }
    }
    const validation = validator.validateStudent(student)
    if (validation.valid) {
      validCount++
    } else {
      invalidCount++
      allErrors.push(...validation.errors.map(e => `第${i + 2}行: ${e}`))
    }
    rows.push({
      rowIndex: i + 2,
      raw: row,
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

async function generate(data, options) {
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, options.sheetName || 'Sheet1')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  const timestamp = Date.now()
  const fileName = options.fileName || `export_${timestamp}.xlsx`
  const { fileID } = await cloudStorage.upload(buffer, fileName)
  const downloadURL = await cloudStorage.getDownloadURL(fileID)

  return { fileID, downloadURL, fileName }
}

async function parseSchedule(fileID, options) {
  const buffer = await cloudStorage.download(fileID)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' })

  if (rawData.length === 0) {
    return { headers: [], fieldIndex: {}, rows: [], validCount: 0, invalidCount: 0, errors: [] }
  }

  const headers = Object.keys(rawData[0])
  const fieldIndex = scheduleHeaderMapping.resolve(headers)

  const rows = []
  const allErrors = []
  let validCount = 0
  let invalidCount = 0

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    const schedule = {}
    const fields = Object.keys(fieldIndex)
    for (const field of fields) {
      const colKey = headers[fieldIndex[field]]
      if (fieldIndex[field] !== -1 && colKey && row[colKey] !== undefined) {
        schedule[field] = row[colKey]
      }
    }
    const validation = scheduleValidator.validateSchedule(schedule)
    if (validation.valid) {
      validCount++
    } else {
      invalidCount++
      allErrors.push(...validation.errors.map(e => `第${i + 2}行: ${e}`))
    }
    rows.push({
      rowIndex: i + 2,
      raw: row,
      schedule: validation.schedule,
      valid: validation.valid,
      errors: validation.errors
    })
  }

  return { headers, fieldIndex, rows, validCount, invalidCount, errors: allErrors }
}

async function parseGrade(fileID, options) {
  const buffer = await cloudStorage.download(fileID)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' })

  if (rawData.length === 0) {
    return { headers: [], fieldIndex: {}, rows: [], validCount: 0, invalidCount: 0, errors: [] }
  }

  const headers = Object.keys(rawData[0])
  const fieldIndex = gradeHeaderMapping.resolve(headers)

  if (fieldIndex.student_id === -1 || fieldIndex.score === -1) {
    const missing = []
    if (fieldIndex.student_id === -1) missing.push('学号')
    if (fieldIndex.score === -1) missing.push('分数')
    return {
      headers, fieldIndex, rows: [], validCount: 0, invalidCount: rawData.length,
      errors: [`缺少必填列: ${missing.join('、')}`]
    }
  }

  const defaultSubject = (options && options.subject) || ''
  const rows = []
  const allErrors = []
  let validCount = 0
  let invalidCount = 0

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    const grade = {}
    const fields = Object.keys(fieldIndex)
    for (const field of fields) {
      const colKey = headers[fieldIndex[field]]
      if (fieldIndex[field] !== -1 && colKey && row[colKey] !== undefined) {
        grade[field] = String(row[colKey]).trim()
      }
    }

    if (!grade.subject && defaultSubject) {
      grade.subject = defaultSubject
    }

    const errors = []
    if (!grade.student_id) errors.push('学号为空')
    if (!grade.score || isNaN(Number(grade.score))) errors.push('分数无效')
    if (grade.score && !isNaN(Number(grade.score))) {
      const scoreVal = Number(grade.score)
      if (scoreVal < 0 || scoreVal > 150) errors.push('分数超出范围(0-150)')
    }

    if (errors.length === 0) {
      grade.score = Number(grade.score)
      validCount++
    } else {
      invalidCount++
      allErrors.push(...errors.map(e => `第${i + 2}行: ${e}`))
    }

    rows.push({
      rowIndex: i + 2,
      raw: row,
      grade: grade,
      valid: errors.length === 0,
      errors: errors
    })
  }

  return { headers, fieldIndex, rows, validCount, invalidCount, errors: allErrors }
}

module.exports = { parse, generate, parseSchedule, parseGrade }
