const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { getCallerInfo, requireClassAccess, requireTeacher } = require('../utils/auth')
const { withTransaction } = require('../utils/transaction')
const { validateInput, SCHEMAS } = require('../utils/validator')

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    const caller = await getCallerInfo(event, data?.classId || data?.class_id)

    switch (action) {
      case 'getScoreItems':
        requireTeacher(caller)
        return await getScoreItems(data, caller)
      case 'getScoreCategories':
        requireTeacher(caller)
        return await getScoreCategories(data, caller)
      case 'getScoreRecords':
        return await getScoreRecords(data, caller)
      case 'applyScoreChange':
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await applyScoreChange(data, caller)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (err) {
    console.error(`scoreManager ${action} 失败:`, err.message)
    return { success: false, message: err.message }
  }
}

async function getScoreItems(data, caller) {
  const { classId, semesterId } = data || {}

  try {
    let conditions = []
    const effectiveClassId = classId || caller.classId

    let newQuery = { record_type: 'rule', is_enabled: _.neq(false) }
    let oldQuery = { record_type: _.exists(false), is_active: true }

    if (effectiveClassId) {
      newQuery.class_id = _.in([effectiveClassId, '', null])
      oldQuery.class_id = _.in([effectiveClassId, '', null])
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

async function getScoreCategories(data, caller) {
  const { classId } = data || {}

  try {
    const effectiveClassId = classId || caller.classId
    let queryConditions

    if (effectiveClassId) {
      queryConditions = _.or([
        { class_id: _.exists(false) },
        { class_id: '' },
        { class_id: effectiveClassId }
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

async function getScoreRecords(data, caller) {
  const { classId, studentId, page, pageSize, needAll } = data || {}
  const p = page || 1
  const ps = pageSize || 20

  try {
    let conditions = []
    const effectiveClassId = classId || caller.classId

    const baseMatch = {}
    if (effectiveClassId) baseMatch.class_id = effectiveClassId
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

async function applyScoreChange(data, caller) {
  const {
    student_id, class_id, semester_id,
    score_change, source_type, item_name, reason_detail,
    item_id, rule_id, rule_name, rule_code, rule_version,
    recorder_name, date
  } = data || {}

  if (!student_id || score_change === undefined || score_change === null) {
    return { success: false, message: '缺少必要参数: student_id, score_change' }
  }

  const validation = validateInput(
    { class_id, student_id, score_change },
    SCHEMAS.scoreChange
  )
  if (!validation.valid) {
    return { success: false, message: validation.errors.join('; ') }
  }

  const changeValue = Number(score_change)
  if (isNaN(changeValue)) {
    return { success: false, message: 'score_change 必须为数字' }
  }

  try {
    return await withTransaction(async (tx) => {
      const now = db.serverDate()
      const stuRes = await tx.collection('students')
        .where({ student_id, class_id })
        .limit(1)
        .get()

      if (!stuRes.data || stuRes.data.length === 0) {
        throw new Error(`未找到学生: ${student_id}`)
      }

      const student = stuRes.data[0]
      const scoreBefore = student.current_score !== undefined && student.current_score !== null
        ? Number(student.current_score) : 100
      const scoreAfter = scoreBefore + changeValue

      const recordId = `SR${Date.now()}${Math.random().toString(36).substr(2, 9)}`

      const recordData = {
        record_id: recordId,
        record_type: 'record',
        student_id,
        student_name: student.name || student.student_name || '',
        class_id: class_id || student.class_id || '',
        semester_id: semester_id || '',
        item_id: item_id || '',
        item_name: item_name || '',
        rule_id: rule_id || '',
        rule_name: rule_name || item_name || '',
        rule_code: rule_code || '',
        rule_version: rule_version || 1,
        rule_category: source_type || '',
        score_change: changeValue,
        score_value: changeValue,
        score_before: scoreBefore,
        score_after: scoreAfter,
        score_type: changeValue >= 0 ? '加分' : '扣分',
        reason_detail: reason_detail || '',
        date: date || '',
        recorder_openid: caller.openid,
        recorder_name: recorder_name || '',
        source_type: source_type || '',
        approval_status: '已通过',
        status: '已确认',
        created_at: now,
        updated_at: now
      }

      await tx.collection('score_records').add({ data: recordData })

      await tx.collection('students').doc(student._id).update({
        data: {
          current_score: scoreAfter,
          updated_at: now
        }
      })

      return {
        success: true,
        data: {
          record_id: recordId,
          score_before: scoreBefore,
          score_after: scoreAfter,
          score_change: changeValue
        }
      }
    })
  } catch (err) {
    console.error('applyScoreChange失败:', err)
    return { success: false, message: err.message }
  }
}
