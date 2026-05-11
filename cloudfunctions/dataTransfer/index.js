const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const { VALID_ACTIONS } = require('./config/constants')
const { importStudentHandler } = require('./handlers/importStudent')
const { exportStudentHandler } = require('./handlers/exportStudent')
const { exportScoreRecordsHandler } = require('./handlers/exportScoreRecords')
const { exportAttendanceHandler } = require('./handlers/exportAttendance')
const { importScheduleHandler } = require('./handlers/importSchedule')
const { importGradeHandler } = require('./handlers/importGrade')

const { getCallerInfo, requireTeacher, AUTH_ERRORS } = require('../utils/auth')

const IMPORT_ACTIONS = ['importStudent', 'importSchedule', 'importGrade']

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    if (!action || !VALID_ACTIONS.includes(action)) {
      return {
        success: false,
        message: `无效的操作: ${action || '空'}`
      }
    }

    const classId = data && data.class_id
    const caller = await getCallerInfo(event, classId)

    if (IMPORT_ACTIONS.includes(action)) {
      requireTeacher(caller)
    }

    let result
    switch (action) {
      case 'importStudent':
        result = await importStudentHandler(data || {}, caller.openid)
        break
      case 'exportStudent':
        result = await exportStudentHandler(data || {}, caller.openid)
        break
      case 'exportScoreRecords':
        result = await exportScoreRecordsHandler(data || {}, caller.openid)
        break
      case 'exportAttendance':
        result = await exportAttendanceHandler(data || {}, caller.openid)
        break
      case 'importSchedule':
        result = await importScheduleHandler(data || {}, caller.openid)
        break
      case 'importGrade':
        result = await importGradeHandler(data || {}, caller.openid)
        break
      default:
        result = { success: false, message: `未处理的操作: ${action}` }
    }

    return result
  } catch (e) {
    console.error(`dataTransfer error [${action}]:`, e)
    if (e.code && Object.values(AUTH_ERRORS).includes(e.code)) {
      return { success: false, message: e.message, code: e.code }
    }
    return {
      success: false,
      message: e.message || '操作失败'
    }
  }
}
