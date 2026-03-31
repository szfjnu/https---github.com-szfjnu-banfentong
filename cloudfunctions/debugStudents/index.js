// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 查询students集合的所有数据
    const res = await db.collection('students').get()
    
    // 返回第一条记录的字段信息
    if (res.data.length > 0) {
      const firstRecord = res.data[0]
      return {
        success: true,
        data: res.data,
        firstRecordFields: Object.keys(firstRecord),
        firstRecord: firstRecord
      }
    } else {
      return {
        success: false,
        message: 'students集合为空'
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}
