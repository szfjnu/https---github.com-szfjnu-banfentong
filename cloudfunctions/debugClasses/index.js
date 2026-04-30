// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const { action, phone, classCode } = event

    // 1. 查询所有 classes 记录（不带 status 过滤，查看实际数据）
    const allClasses = await db.collection('classes').get()

    // 2. 查询 status 为 active 的记录
    const activeClasses = await db.collection('classes')
      .where({ status: 'active' })
      .get()

    // 3. 按 creator_phone 查询（不带 status 过滤）
    let phoneQueryResult = []
    if (phone) {
      const phoneRes = await db.collection('classes')
        .where({ creator_phone: phone })
        .get()
      phoneQueryResult = phoneRes.data
    }

    // 4. 按 class_code 查询（不带 status 过滤）
    let codeQueryResult = []
    if (classCode) {
      const codeRes = await db.collection('classes')
        .where({ class_code: classCode })
        .get()
      codeQueryResult = codeRes.data
    }

    // 5. 返回所有班级数据（脱敏后）
    const allClassesSummary = allClasses.data.map(c => ({
      _id: c._id,
      class_name: c.class_name,
      class_code: c.class_code,
      creator_phone: c.creator_phone,
      creator_name: c.creator_name,
      status: c.status,
      has_status_field: c.status !== undefined,
      created_at: c.created_at
    }))

    return {
      success: true,
      stats: {
        totalCount: allClasses.data.length,
        activeCount: activeClasses.data.length,
        phoneQueryCount: phoneQueryResult.length,
        codeQueryCount: codeQueryResult.length
      },
      allClasses: allClassesSummary,
      phoneQueryResult: phoneQueryResult,
      codeQueryResult: codeQueryResult,
      message: '查询完成'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}
