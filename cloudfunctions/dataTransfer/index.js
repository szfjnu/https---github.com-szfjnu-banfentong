const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const { VALID_ACTIONS } = require('./config/constants')
const { importStudentHandler } = require('./handlers/importStudent')
const { exportStudentHandler } = require('./handlers/exportStudent')
const { exportScoreRecordsHandler } = require('./handlers/exportScoreRecords')
const { exportAttendanceHandler } = require('./handlers/exportAttendance')
const { importScheduleHandler } = require('./handlers/importSchedule')
const { importGradeHandler } = require('./handlers/importGrade')

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID || event.OPENID || ''

  try {
    if (!action || !VALID_ACTIONS.includes(action)) {
      return {
        success: false,
        message: `无效的操作: ${action || '空'}`
      }
    }

    let result
    switch (action) {
      case 'importStudent':
        result = await importStudentHandler(data || {}, OPENID)
        break
      case 'exportStudent':
        result = await exportStudentHandler(data || {}, OPENID)
        break
      case 'exportScoreRecords':
        result = await exportScoreRecordsHandler(data || {}, OPENID)
        break
      case 'exportAttendance':
        result = await exportAttendanceHandler(data || {}, OPENID)
        break
      case 'importSchedule':
        result = await importScheduleHandler(data || {}, OPENID)
        break
      case 'importGrade':
        result = await importGradeHandler(data || {}, OPENID)
        break
      default:
        result = { success: false, message: `未处理的操作: ${action}` }
    }

    return result
  } catch (e) {
    console.error(`dataTransfer error [${action}]:`, e)
    return {
      success: false,
      message: e.message || '操作失败'
    }
  }
}
