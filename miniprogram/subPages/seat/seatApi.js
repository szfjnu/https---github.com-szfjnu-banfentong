const callSeat = async function (action, data) {
  const res = await wx.cloud.callFunction({
    name: 'manageSeat',
    data: { action, data }
  })
  if (res.result && res.result.success) {
    return res.result
  }
  throw new Error((res.result && res.result.message) || '操作失败')
}

module.exports = {
  ensureCollection: () => callSeat('ensureCollection', {}),

  getLayout: (classId) => callSeat('getLayout', { class_id: classId }),

  saveLayout: (classId, rows, cols, specialPositions, force) =>
    callSeat('saveLayout', { class_id: classId, rows, cols, special_positions: specialPositions, force }),

  getArrangement: (classId) => callSeat('getArrangement', { class_id: classId }),

  getStudentsForArrange: (classId) => callSeat('getStudentsForArrange', { class_id: classId }),

  randomArrange: (classId) => callSeat('randomArrange', { class_id: classId }),

  groupArrange: (classId) => callSeat('groupArrange', { class_id: classId }),

  manualArrange: (classId, assignments) =>
    callSeat('manualArrange', { class_id: classId, assignments }),

  getRotateConfig: (classId) => callSeat('getRotateConfig', { class_id: classId }),

  saveRotateConfig: (classId, direction, period, step) =>
    callSeat('saveRotateConfig', { class_id: classId, direction, period, step }),

  executeRotate: (classId, direction, step) =>
    callSeat('executeRotate', { class_id: classId, direction, step }),

  lockSeat: (classId, row, col, studentId, studentName) =>
    callSeat('lockSeat', { class_id: classId, row, col, student_id: studentId, student_name: studentName }),

  unlockSeat: (classId, row, col) =>
    callSeat('unlockSeat', { class_id: classId, row, col }),

  acquireLock: (classId) => callSeat('acquireLock', { class_id: classId }),

  releaseLock: (classId) => callSeat('releaseLock', { class_id: classId }),

  getHistoryList: (classId, page, pageSize) =>
    callSeat('getHistoryList', { class_id: classId, page, page_size: pageSize }),

  getHistoryDetail: (historyId) => callSeat('getHistoryDetail', { history_id: historyId })
}
