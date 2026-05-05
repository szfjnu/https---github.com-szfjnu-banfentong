const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function log({ action, operator, dataCount, result, classId, fileId, errorMessage }) {
  try {
    await db.collection('feature_access_logs').add({
      data: {
        action,
        operator,
        dataCount,
        result,
        classId,
        fileId,
        errorMessage,
        timestamp: db.serverDate()
      }
    })
  } catch (e) {
    console.error('Logger write failed:', e)
  }
}

module.exports = { log }
