function processMerges(sheet) {
  if (!sheet || !sheet['!ref']) return []

  const XLSX = require('xlsx')
  const range = XLSX.utils.decode_range(sheet['!ref'])
  const matrix = buildBaseMatrix(sheet, range)

  const merges = sheet['!merges']
  if (!merges || !Array.isArray(merges) || merges.length === 0) {
    return matrix
  }

  for (const merge of merges) {
    if (!merge.s || !merge.e) continue
    if (merge.e.r < merge.s.r || merge.e.c < merge.s.c) continue

    const startVal = matrix[merge.s.r] && matrix[merge.s.r][merge.s.c]
    if (startVal === undefined || startVal === null || String(startVal).trim() === '') continue

    for (let r = merge.s.r; r <= merge.e.r; r++) {
      if (r > range.e.r) break
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (c > range.e.c) break
        if (r === merge.s.r && c === merge.s.c) continue
        if (!matrix[r]) matrix[r] = []
        if (!matrix[r][c] || String(matrix[r][c]).trim() === '') {
          matrix[r][c] = startVal
        }
      }
    }
  }

  return matrix
}

function buildBaseMatrix(sheet, range) {
  const XLSX = require('xlsx')
  if (!range) {
    if (!sheet['!ref']) return []
    range = XLSX.utils.decode_range(sheet['!ref'])
  }

  const matrix = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[cellRef]
      row.push(cell && cell.v !== undefined && cell.v !== null ? String(cell.v) : '')
    }
    matrix.push(row)
  }

  return matrix
}

function buildMergeMap(merges) {
  const map = new Map()
  if (!merges || !Array.isArray(merges)) return map

  for (const merge of merges) {
    if (!merge.s || !merge.e) continue
    const rowSpan = merge.e.r - merge.s.r + 1
    const colSpan = merge.e.c - merge.s.c + 1

    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        const key = `${r},${c}`
        map.set(key, {
          startRow: merge.s.r,
          startCol: merge.s.c,
          endRow: merge.e.r,
          endCol: merge.e.c,
          isOrigin: r === merge.s.r && c === merge.s.c,
          rowSpan,
          colSpan
        })
      }
    }
  }

  return map
}

module.exports = { processMerges, buildBaseMatrix, buildMergeMap }
