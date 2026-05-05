Component({
  properties: {
    layout: {
      type: Object,
      value: { rows: 6, cols: 8, special_positions: [] }
    },
    arrangement: {
      type: Object,
      value: { seat_map: {}, locked_seats: [] }
    },
    studentExtraInfo: {
      type: Object,
      value: {}
    },
    highlightSeat: {
      type: String,
      value: ''
    },
    mode: {
      type: String,
      value: 'view'
    },
    className: {
      type: String,
      value: ''
    }
  },

  data: {
    gridData: [],
    cellSize: 0,
    cols: 8,
    hasPodium: false,
    hasFrontDoor: false,
    hasBackDoor: false
  },

  observers: {
    'layout, arrangement, highlightSeat, studentExtraInfo': function () {
      this.buildGrid()
    }
  },

  lifetimes: {
    attached: function () {
      this.calcCellSize()
      this.buildGrid()
    }
  },

  methods: {
    calcCellSize: function () {
      const sysInfo = wx.getSystemInfoSync()
      const screenWidth = sysInfo.windowWidth
      const padding = 30
      const cols = this.data.layout.cols || 8
      const size = Math.floor((screenWidth - padding) / cols)
      this.setData({ cellSize: Math.min(size, 60), cols: cols })
    },

    buildGrid: function () {
      const { rows, cols, special_positions } = this.data.layout
      const seatMap = this.data.arrangement.seat_map || {}
      const lockedSeats = this.data.arrangement.locked_seats || []
      const highlight = this.data.highlightSeat
      const extraInfo = this.data.studentExtraInfo || {}

      const hasPodium = (special_positions || []).some(p => p.type === 'podium')
      const hasFrontDoor = (special_positions || []).some(p => p.type === 'front_door')
      const hasBackDoor = (special_positions || []).some(p => p.type === 'back_door')

      const specialMap = {}
      for (const sp of (special_positions || [])) {
        specialMap[`${sp.row}_${sp.col}`] = sp.type
      }

      const lockedSet = new Set(lockedSeats.map(l => `${l.row}_${l.col}`))

      const gridData = []
      for (let r = 1; r <= rows; r++) {
        const rowData = []
        for (let c = 1; c <= cols; c++) {
          const key = `${r}_${c}`
          const isSpecialPos = !!specialMap[key]
          const cell = {
            row: r,
            col: c,
            key: key,
            seatNo: r + '-' + c,
            isSpecial: isSpecialPos,
            specialType: specialMap[key] || '',
            studentId: '',
            studentName: '',
            gender: '',
            height: '',
            score: null,
            groupName: '',
            genderClass: '',
            isLocked: lockedSet.has(key),
            isHighlight: highlight === key,
            isEmpty: !seatMap[key] && !isSpecialPos
          }
          if (seatMap[key]) {
            cell.studentId = seatMap[key].student_id || ''
            cell.studentName = seatMap[key].student_name || ''
            cell.gender = seatMap[key].gender || ''
            cell.height = seatMap[key].height || ''
            cell.genderClass = cell.gender === '女' ? 'female' : (cell.gender === '男' ? 'male' : '')
            cell.isEmpty = false

            if (cell.studentId && extraInfo[cell.studentId]) {
              cell.score = extraInfo[cell.studentId].score
              cell.groupName = extraInfo[cell.studentId].groupName || ''
            }
          }
          rowData.push(cell)
        }
        gridData.push(rowData)
      }

      this.setData({ gridData, hasPodium, hasFrontDoor, hasBackDoor })
    },

    onSeatTap: function (e) {
      const { row, col } = e.currentTarget.dataset
      const key = `${row}_${col}`
      const gridData = this.data.gridData
      const cell = gridData[row - 1] && gridData[row - 1][col - 1]
      if (!cell) return

      this.triggerEvent('seatclick', {
        row, col, key,
        student_id: cell.studentId,
        student_name: cell.studentName,
        gender: cell.gender,
        height: cell.height,
        is_special: cell.isSpecial,
        special_type: cell.specialType,
        is_locked: cell.isLocked,
        is_empty: cell.isEmpty
      })
    },

    onSeatLongPress: function (e) {
      const { row, col } = e.currentTarget.dataset
      const key = `${row}_${col}`
      const gridData = this.data.gridData
      const cell = gridData[row - 1] && gridData[row - 1][col - 1]
      if (!cell) return

      this.triggerEvent('seatlongpress', {
        row, col, key,
        student_id: cell.studentId,
        student_name: cell.studentName,
        gender: cell.gender,
        is_special: cell.isSpecial,
        special_type: cell.specialType,
        is_locked: cell.isLocked
      })
    },

    exportImage: function () {
      return new Promise((resolve, reject) => {
        const query = wx.createSelectorQuery().in(this)
        query.select('#seatCanvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res || !res[0] || !res[0].node) {
              reject(new Error('Canvas节点获取失败'))
              return
            }

            const canvas = res[0].node
            const ctx = canvas.getContext('2d')
            const dpr = wx.getSystemInfoSync().pixelRatio

            const { rows, cols, special_positions } = this.data.layout
            const seatMap = this.data.arrangement.seat_map || {}
            const lockedSeats = this.data.arrangement.locked_seats || []
            const hasPodium = (special_positions || []).some(p => p.type === 'podium')

            const cellW = 60
            const cellH = 50
            const padding = 20
            const headerH = 30
            const podiumH = hasPodium ? 30 : 0

            const canvasW = padding * 2 + cols * cellW
            const canvasH = padding + headerH + podiumH + rows * cellH + padding

            canvas.width = canvasW * dpr
            canvas.height = canvasH * dpr
            ctx.scale(dpr, dpr)

            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvasW, canvasH)

            ctx.fillStyle = '#333333'
            ctx.font = 'bold 14px sans-serif'
            ctx.textAlign = 'center'
            const title = this.data.className ? `${this.data.className}座位表` : '座位表'
            ctx.fillText(title, canvasW / 2, padding + 14)

            let currentY = padding + headerH

            if (hasPodium) {
              ctx.fillStyle = '#1890ff'
              ctx.fillRect(padding, currentY, cols * cellW, podiumH - 4)
              ctx.fillStyle = '#ffffff'
              ctx.font = 'bold 14px sans-serif'
              ctx.textAlign = 'center'
              ctx.fillText('讲 台', canvasW / 2, currentY + podiumH / 2 + 2)
              currentY += podiumH
            }

            const lockedSet = new Set(lockedSeats.map(l => `${l.row}_${l.col}`))

            for (let r = 1; r <= rows; r++) {
              for (let c = 1; c <= cols; c++) {
                const x = padding + (c - 1) * cellW
                const y = currentY + (r - 1) * cellH
                const key = `${r}_${c}`

                ctx.strokeStyle = '#cccccc'
                ctx.lineWidth = 1
                ctx.strokeRect(x, y, cellW, cellH)

                if (seatMap[key]) {
                  const s = seatMap[key]
                  const gender = s.gender || ''
                  if (gender === '女') {
                    ctx.fillStyle = '#fce4ec'
                  } else if (gender === '男') {
                    ctx.fillStyle = '#e3f2fd'
                  } else if (lockedSet.has(key)) {
                    ctx.fillStyle = '#e8f5e9'
                  } else {
                    ctx.fillStyle = '#ffffff'
                  }
                  ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2)

                  ctx.fillStyle = '#333333'
                  ctx.font = 'bold 12px sans-serif'
                  ctx.textAlign = 'center'
                  const name = s.student_name || ''
                  ctx.fillText(name.length > 3 ? name.substring(0, 3) : name, x + cellW / 2, y + 16)

                  ctx.font = '10px sans-serif'
                  ctx.fillStyle = '#999999'
                  const seatNo = `${r}-${c}`
                  ctx.fillText(seatNo, x + cellW / 2, y + 26)

                  ctx.font = '10px sans-serif'
                  ctx.fillStyle = '#666666'
                  const heightText = s.height ? `${s.height}cm` : ''
                  if (heightText) {
                    ctx.fillText(heightText, x + cellW / 2, y + 38)
                  }

                  if (lockedSet.has(key)) {
                    ctx.fillStyle = '#4caf50'
                    ctx.font = '10px sans-serif'
                    ctx.fillText('🔒', x + cellW - 12, y + 10)
                  }
                } else {
                  ctx.font = '10px sans-serif'
                  ctx.fillStyle = '#cccccc'
                  ctx.textAlign = 'center'
                  const emptySeatNo = `${r}-${c}`
                  ctx.fillText(emptySeatNo, x + cellW / 2, y + cellH / 2)
                }
              }
            }

            wx.canvasToTempFilePath({
              canvas: canvas,
              success: (tmpRes) => {
                resolve(tmpRes.tempFilePath)
              },
              fail: (err) => {
                reject(err)
              }
            })
          })
      })
    },

    getGridData: function () {
      return this.data.gridData
    },

    setSeatStudent: function (row, col, studentId, studentName, gender, height) {
      const key = `gridData[${row - 1}][${col - 1}]`
      this.setData({
        [key + '.studentId']: studentId,
        [key + '.studentName']: studentName,
        [key + '.gender']: gender || '',
        [key + '.height']: height || '',
        [key + '.genderClass']: gender === '女' ? 'female' : (gender === '男' ? 'male' : ''),
        [key + '.isEmpty']: false
      })
    },

    clearSeatStudent: function (row, col) {
      const key = `gridData[${row - 1}][${col - 1}]`
      this.setData({
        [key + '.studentId']: '',
        [key + '.studentName']: '',
        [key + '.gender']: '',
        [key + '.height']: '',
        [key + '.genderClass']: '',
        [key + '.isEmpty']: true
      })
    }
  }
})
