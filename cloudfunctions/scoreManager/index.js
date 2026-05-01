const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event

  switch (action) {
    case 'getScoreItems':
      return await getScoreItems(data)
    case 'getScoreCategories':
      return await getScoreCategories(data)
    case 'getScoreRecords':
      return await getScoreRecords(data)
    default:
      return { success: false, message: '未知操作' }
  }
}

async function getScoreItems(data) {
  const { classId, semesterId } = data || {}

  try {
    let conditions = []

    let newQuery = { record_type: 'rule', is_enabled: _.neq(false) }
    let oldQuery = { record_type: _.exists(false), is_active: true }

    if (classId) {
      newQuery.class_id = _.in([classId, '', null])
      oldQuery.class_id = _.in([classId, '', null])
    }

    if (semesterId) {
      newQuery.semester_id = _.in([semesterId, '', null])
      oldQuery.semester_id = _.in([semesterId, '', null])
    }

    conditions.push(newQuery, oldQuery)

    const res = await db.collection('score_items')
      .where(_.or(conditions))
      .orderBy('created_at', 'desc')
      .limit(1000)
      .get()

    return { success: true, data: res.data }
  } catch (err) {
    console.error('getScoreItems失败:', err)
    return { success: false, message: err.message }
  }
}

async function getScoreCategories(data) {
  const { classId } = data || {}

  try {
    let queryConditions

    if (classId) {
      queryConditions = _.or([
        { class_id: _.exists(false) },
        { class_id: '' },
        { class_id: classId }
      ])
    } else {
      queryConditions = {}
    }

    const res = await db.collection('score_categories')
      .where(queryConditions)
      .where({ is_active: true })
      .orderBy('sort_order', 'asc')
      .limit(200)
      .get()

    return { success: true, data: res.data }
  } catch (err) {
    console.error('getScoreCategories失败:', err)
    return { success: false, message: err.message }
  }
}

async function getScoreRecords(data) {
  const { classId, studentId, page, pageSize, needAll } = data || {}
  const p = page || 1
  const ps = pageSize || 20

  try {
    let conditions = []

    const baseMatch = {}
    if (classId) baseMatch.class_id = classId
    if (studentId) baseMatch.student_id = studentId

    conditions.push({
      record_type: 'record',
      status: '已确认',
      ...baseMatch
    })
    conditions.push({
      approval_status: '已通过',
      ...baseMatch
    })
    conditions.push({
      approval_status: _.exists(false),
      record_type: _.exists(false),
      ...baseMatch
    })

    const query = _.or(conditions)

    if (needAll) {
      const res = await db.collection('score_records')
        .where(query)
        .orderBy('created_at', 'desc')
        .limit(1000)
        .get()
      return { success: true, data: res.data, total: res.data.length }
    }

    const countRes = await db.collection('score_records')
      .where(query)
      .count()

    const res = await db.collection('score_records')
      .where(query)
      .orderBy('created_at', 'desc')
      .skip((p - 1) * ps)
      .limit(ps)
      .get()

    return {
      success: true,
      data: res.data,
      total: countRes.total,
      page: p,
      pageSize: ps
    }
  } catch (err) {
    console.error('getScoreRecords失败:', err)
    return { success: false, message: err.message }
  }
}
