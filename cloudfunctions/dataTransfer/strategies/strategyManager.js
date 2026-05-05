const excelStrategy = require('./excelStrategy')
const csvStrategy = require('./csvStrategy')

function getStrategy(format) {
  if (format === 'excel') return excelStrategy
  if (format === 'csv') return csvStrategy
  throw new Error(`不支持的格式: ${format}`)
}

function detectFormat(fileName) {
  const ext = fileName.toLowerCase().split('.').pop()
  if (['xlsx', 'xls'].includes(ext)) return 'excel'
  if (['csv', 'txt'].includes(ext)) return 'csv'
  throw new Error(`无法识别的文件格式: ${ext}`)
}

module.exports = { getStrategy, detectFormat }
