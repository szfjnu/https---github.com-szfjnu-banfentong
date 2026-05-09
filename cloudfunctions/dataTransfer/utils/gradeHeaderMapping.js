const mappingConfig = require('./gradeHeaderMapping.json')

function resolve(headers) {
  const fieldIndex = {}
  const fields = Object.keys(mappingConfig)

  for (const field of fields) {
    fieldIndex[field] = -1
  }

  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i]).trim().toLowerCase()
    for (const field of fields) {
      if (fieldIndex[field] !== -1) continue
      const aliases = mappingConfig[field].aliases
      for (const alias of aliases) {
        if (alias.toLowerCase() === header) {
          fieldIndex[field] = i
          break
        }
      }
    }
  }

  return fieldIndex
}

function getExportHeaders() {
  const headers = []
  const fields = Object.keys(mappingConfig)
  for (const field of fields) {
    headers.push({ field, label: mappingConfig[field].label })
  }
  return headers
}

module.exports = { resolve, getExportHeaders }
