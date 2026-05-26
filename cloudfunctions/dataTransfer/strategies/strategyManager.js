const excelStrategy = require('./excelStrategy')
const csvStrategy = require('./csvStrategy')
const matrixScheduleStrategy = require('./matrixScheduleStrategy')
const formatDetector = require('../utils/formatDetector')
const XLSX = require('xlsx')
const cloudStorage = require('../utils/cloudStorage')

function getStrategy(format) {
  if (format === 'excel') return excelStrategy
  if (format === 'csv') return csvStrategy
  if (format === 'matrix') return matrixScheduleStrategy
  throw new Error(`不支持的格式: ${format}`)
}

function detectFormat(fileName) {
  const ext = fileName.toLowerCase().split('.').pop()
  if (['xlsx', 'xls'].includes(ext)) return 'excel'
  if (['csv', 'txt'].includes(ext)) return 'csv'
  throw new Error(`无法识别的文件格式: ${ext}`)
}

async function detectScheduleFormat(fileID) {
  const buffer = await cloudStorage.download(fileID)
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const result = formatDetector.detectScheduleFormat(workbook)
  return { ...result, workbook }
}

module.exports = { getStrategy, detectFormat, detectScheduleFormat }
