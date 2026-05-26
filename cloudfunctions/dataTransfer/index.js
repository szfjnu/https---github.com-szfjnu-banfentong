const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { VALID_ACTIONS } = require('./config/constants')
const { importStudentHandler } = require('./handlers/importStudent')
const { exportStudentHandler } = require('./handlers/exportStudent')
const { exportScoreRecordsHandler } = require('./handlers/exportScoreRecords')
const { exportAttendanceHandler } = require('./handlers/exportAttendance')
const { importScheduleHandler } = require('./handlers/importSchedule')
const { importGradeHandler } = require('./handlers/importGrade')

const { getCallerInfo, requireTeacher, requireAdmin, AUTH_ERRORS } = require('./utils/auth')
const { checkPermission } = require('./utils/permission')

const IMPORT_ACTIONS = ['importStudent', 'importStudents', 'importSchedule', 'importGrade']
const DATA_TRANSFER_ACTIONS = ['importStudent', 'importStudents', 'importSchedule', 'importGrade', 'exportStudent', 'exportScoreRecords', 'exportAttendance']

const DEFAULT_TRANSFER_PERMISSIONS = {
  importStudent: false,
  importStudents: false,
  importSchedule: false,
  importGrade: false,
  exportStudent: false,
  exportScoreRecords: false,
  exportAttendance: false
}

async function getTransferPermissions() {
  try {
    const res = await db.collection('system_config')
      .doc('transfer_permissions')
      .get()
    if (res.data && res.data.permissions) {
      const perms = { ...DEFAULT_TRANSFER_PERMISSIONS, ...res.data.permissions }
      perms.importSchedule = false
      perms.importGrade = false
      return perms
    }
  } catch (err) {
    console.log('[dataTransfer] transfer_permissions config not found, using defaults')
  }
  return { ...DEFAULT_TRANSFER_PERMISSIONS }
}

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    if (!action || !VALID_ACTIONS.includes(action)) {
      if (action === 'saveTransferConfig') {
        if (!data || !data.permissions) {
          return { success: false, message: '缺少permissions参数' }
        }
        await db.collection('system_config')
          .doc('transfer_permissions')
          .set({
            data: {
              permissions: data.permissions,
              updated_at: db.serverDate()
            }
          })
        return { success: true, message: '配置保存成功' }
      }
      return {
        success: false,
        message: `无效的操作: ${action || '空'}`
      }
    }

    const classIdFromData = (data && data.class_id) || (data && data.classId)
    const caller = await getCallerInfo(event, classIdFromData)
    const classId = classIdFromData || caller.classId

    if (IMPORT_ACTIONS.includes(action)) {
      requireTeacher(caller)
    }

    if (DATA_TRANSFER_ACTIONS.includes(action)) {
      const perms = await getTransferPermissions()
      if (perms[action]) {
        const permResult = await checkPermission(caller.openid, classId)
        if (!permResult.hasPermission) {
          if (permResult.reason === 'not_advanced_member') {
            const err = new Error('该操作需要高级会员权限')
            err.code = 'PERMISSION_ADVANCED_REQUIRED'
            throw err
          }
          const err = new Error('权限不足: ' + (permResult.reason || ''))
          err.code = AUTH_ERRORS.ROLE_DENIED
          throw err
        }
      }
    }

    let result
    switch (action) {
      case 'importStudent':
        result = await importStudentHandler(data || {}, caller.openid)
        break
      case 'importStudents':
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
