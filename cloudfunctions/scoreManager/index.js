const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const { getCallerInfo, requireClassAccess, requireTeacher } = require('./utils/auth')
const { withTransaction } = require('./utils/transaction')
const { validateInput, SCHEMAS } = require('./utils/validator')

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
      case 'addLeaveRecord':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await addLeaveRecord(data, caller)
      case 'generateLeaveAttendanceRecords':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await generateLeaveAttendanceRecords(data, caller)
      case 'deleteLeaveRecord':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await deleteLeaveRecord(data, caller)
      case 'addStudentGroup':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await addStudentGroup(data, caller)
      case 'updateStudentGroup':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await updateStudentGroup(data, caller)
      case 'deleteStudentGroup':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await deleteStudentGroup(data, caller)
      case 'batchAddStudentGroups':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await batchAddStudentGroups(data, caller)
      case 'updateAttendanceRecord':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await updateAttendanceRecord(data, caller)
      case 'addAttendanceRecord':
        requireTeacher(caller)
        requireClassAccess(caller, data.class_id, ['head_teacher', 'subject_teacher', 'admin'])
        return await addAttendanceRecord(data, caller)
      case 'addVolunteerRecord':
        return await addVolunteerRecord(data, caller)
      case 'addScoreItem':
        requireTeacher(caller)
        return await addScoreItem(data, caller)
      case 'updateScoreItem':
        requireTeacher(caller)
        return await updateScoreItem(data, caller)
      case 'addScoreRecord':
        requireTeacher(caller)
        return await addScoreRecord(data, caller)
      case 'deleteScoreItem':
        requireTeacher(caller)
        return await deleteScoreItem(data, caller)
      case 'addScoreCategory':
        requireTeacher(caller)
        return await addScoreCategory(data, caller)
      case 'updateScoreCategory':
        requireTeacher(caller)
        return await updateScoreCategory(data, caller)
      case 'addGroup':
        requireTeacher(caller)
        return await addStudentGroup(data, caller)
      case 'updateGroup':
        requireTeacher(caller)
        return await updateStudentGroup(data, caller)
      case 'deleteGroup':
        requireTeacher(caller)
        return await deleteStudentGroup(data, caller)
      case 'submitAppeal':
        return await submitAppeal(data, caller)
      case 'createVersionSnapshot':
        requireTeacher(caller)
        return await createVersionSnapshot(data, caller)
      case 'createInitialVersion':
        requireTeacher(caller)
        return await createInitialVersion(data, caller)
      case 'rollbackVersion':
        requireTeacher(caller)
        return await rollbackVersion(data, caller)
      case 'getScores':
        return await getScores(data, caller)
      case 'getGroups':
        return await getGroups(data, caller)
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

async function addLeaveRecord(data, caller) {
  try {
    const now = db.serverDate()
    const recordData = {
      ...data,
      created_at: now
    }
    const res = await db.collection('leave_approval_records').add({ data: recordData })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addLeaveRecord失败:', err)
    return { success: false, message: err.message }
  }
}

async function generateLeaveAttendanceRecords(data, caller) {
  const { student_id, class_id, attendance_data } = data || {}
  if (!student_id || !class_id || !attendance_data) {
    return { success: false, message: '缺少必要参数: student_id, class_id, attendance_data' }
  }
  try {
    const now = db.serverDate()
    const records = Array.isArray(attendance_data) ? attendance_data : [attendance_data]
    const results = []
    for (const record of records) {
      const res = await db.collection('attendance_records').add({
        data: {
          student_id,
          class_id,
          ...record,
          source_type: 'leave',
          created_at: now
        }
      })
      results.push(res._id)
    }
    return { success: true, data: { added: results.length, ids: results } }
  } catch (err) {
    console.error('generateLeaveAttendanceRecords失败:', err)
    return { success: false, message: err.message }
  }
}

async function deleteLeaveRecord(data, caller) {
  const { recordId } = data || {}
  if (!recordId) return { success: false, message: '缺少必要参数: recordId' }
  try {
    await db.collection('leave_approval_records').doc(recordId).remove()
    return { success: true }
  } catch (err) {
    console.error('deleteLeaveRecord失败:', err)
    return { success: false, message: err.message }
  }
}

async function addStudentGroup(data, caller) {
  try {
    const now = db.serverDate()
    const groupData = {
      ...data,
      created_at: now
    }
    const res = await db.collection('student_groups').add({ data: groupData })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addStudentGroup失败:', err)
    return { success: false, message: err.message }
  }
}

async function updateStudentGroup(data, caller) {
  const { groupId, ...updateFields } = data || {}
  if (!groupId) return { success: false, message: '缺少必要参数: groupId' }
  try {
    await db.collection('student_groups').doc(groupId).update({ data: updateFields })
    return { success: true }
  } catch (err) {
    console.error('updateStudentGroup失败:', err)
    return { success: false, message: err.message }
  }
}

async function deleteStudentGroup(data, caller) {
  const { groupId } = data || {}
  if (!groupId) return { success: false, message: '缺少必要参数: groupId' }
  try {
    const now = db.serverDate()
    await db.collection('student_groups').doc(groupId).update({
      data: { is_deleted: true, updated_at: now }
    })
    return { success: true }
  } catch (err) {
    console.error('deleteStudentGroup失败:', err)
    return { success: false, message: err.message }
  }
}

async function batchAddStudentGroups(data, caller) {
  const { groups } = data || {}
  if (!groups || !Array.isArray(groups) || groups.length === 0) {
    return { success: false, message: '缺少必要参数: groups(非空数组)' }
  }
  try {
    const now = db.serverDate()
    const results = []
    for (const group of groups) {
      const res = await db.collection('student_groups').add({
        data: { ...group, created_at: now }
      })
      results.push(res._id)
    }
    return { success: true, data: { added: results.length, ids: results } }
  } catch (err) {
    console.error('batchAddStudentGroups失败:', err)
    return { success: false, message: err.message }
  }
}

async function updateAttendanceRecord(data, caller) {
  const { recordId, ...updateFields } = data || {}
  if (!recordId) return { success: false, message: '缺少必要参数: recordId' }
  try {
    const now = db.serverDate()
    const fields = { ...updateFields, updated_at: now }
    delete fields.classId
    await db.collection('attendance_records').doc(recordId).update({ data: fields })
    return { success: true }
  } catch (err) {
    console.error('updateAttendanceRecord失败:', err)
    return { success: false, message: err.message }
  }
}

async function addAttendanceRecord(data, caller) {
  try {
    const now = db.serverDate()
    const recordData = { ...data, created_at: now, updated_at: now }
    delete recordData.classId
    const res = await db.collection('attendance_records').add({ data: recordData })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addAttendanceRecord失败:', err)
    return { success: false, message: err.message }
  }
}

async function addVolunteerRecord(data, caller) {
  try {
    const now = db.serverDate()
    const recordData = { ...data, created_at: now, updated_at: now }
    const res = await db.collection('volunteer_records').add({ data: recordData })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addVolunteerRecord失败:', err)
    return { success: false, message: err.message }
  }
}

async function addScoreItem(data, caller) {
  try {
    const { itemData } = data
    if (!itemData) return { success: false, message: '缺少规则数据' }
    const now = db.serverDate()
    const res = await db.collection('score_items').add({
      data: { ...itemData, created_at: now, updated_at: now }
    })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addScoreItem失败:', err)
    return { success: false, message: err.message }
  }
}

async function updateScoreItem(data, caller) {
  try {
    const { itemId, updateData } = data
    if (!itemId) return { success: false, message: '缺少规则ID' }
    if (!updateData) return { success: false, message: '缺少更新数据' }
    const now = db.serverDate()
    await db.collection('score_items').doc(itemId).update({
      data: { ...updateData, updated_at: now }
    })
    return { success: true }
  } catch (err) {
    console.error('updateScoreItem失败:', err)
    return { success: false, message: err.message }
  }
}

async function addScoreRecord(data, caller) {
  if (!data) return { success: false, message: '缺少记录数据' }
  if (!data.student_id) return { success: false, message: '缺少必要参数: student_id' }

  try {
    return await withTransaction(async (tx) => {
      const now = db.serverDate()
      const recordData = {
        ...data,
        recorder_openid: caller.openid,
        created_at: now,
        updated_at: now
      }

      await tx.collection('score_records').add({ data: recordData })

      if (data.class_id && data.student_id) {
        const stuRes = await tx.collection('students')
          .where({ student_id: data.student_id, class_id: data.class_id })
          .limit(1)
          .get()

        if (stuRes.data && stuRes.data.length > 0) {
          const student = stuRes.data[0]
          const scoreBefore = student.current_score !== undefined && student.current_score !== null
            ? Number(student.current_score) : 100
          const changeValue = Number(data.score_change || data.score_value || 0)
          const scoreAfter = scoreBefore + changeValue

          await tx.collection('students').doc(student._id).update({
            data: { current_score: scoreAfter, updated_at: now }
          })
        }
      }

      return { success: true, data: { record_id: data.record_id || '' } }
    })
  } catch (err) {
    console.error('addScoreRecord失败:', err)
    return { success: false, message: err.message }
  }
}

async function deleteScoreItem(data, caller) {
  const { itemId } = data || {}
  if (!itemId) return { success: false, message: '缺少规则ID' }
  try {
    const now = db.serverDate()
    await db.collection('score_items').doc(itemId).update({
      data: { is_enabled: false, is_active: false, updated_at: now }
    })
    return { success: true }
  } catch (err) {
    console.error('deleteScoreItem失败:', err)
    return { success: false, message: err.message }
  }
}

async function addScoreCategory(data, caller) {
  const { categoryData } = data || {}
  if (!categoryData) return { success: false, message: '缺少分类数据' }
  try {
    const now = db.serverDate()
    const res = await db.collection('score_categories').add({
      data: { ...categoryData, created_at: now, updated_at: now }
    })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addScoreCategory失败:', err)
    return { success: false, message: err.message }
  }
}

async function updateScoreCategory(data, caller) {
  const { categoryId, updateData } = data || {}
  if (!categoryId) return { success: false, message: '缺少分类ID' }
  if (!updateData) return { success: false, message: '缺少更新数据' }
  try {
    const now = db.serverDate()
    await db.collection('score_categories').doc(categoryId).update({
      data: { ...updateData, updated_at: now }
    })
    return { success: true }
  } catch (err) {
    console.error('updateScoreCategory失败:', err)
    return { success: false, message: err.message }
  }
}

async function submitAppeal(data, caller) {
  if (!data) return { success: false, message: '缺少申诉数据' }
  if (!data.record_id) return { success: false, message: '缺少积分记录ID' }
  if (!data.appeal_reason) return { success: false, message: '缺少申诉理由' }
  try {
    const now = db.serverDate()
    const appealId = `APPEAL${Date.now()}${Math.random().toString(36).substr(2, 6)}`
    const appealData = {
      appeal_id: appealId,
      record_id: data.record_id,
      student_id: data.student_id || caller.studentId || '',
      student_name: data.student_name || '',
      class_id: data.class_id || caller.classId || '',
      appeal_type: data.appeal_type || 'score_error',
      appeal_reason: data.appeal_reason,
      original_score: data.original_score || 0,
      requested_score: data.requested_score || 0,
      evidence_urls: data.evidence_urls || [],
      deadline: data.deadline || '',
      appeal_status: '待审核',
      applicant_openid: caller.openid,
      created_at: now,
      updated_at: now
    }

    const res = await db.collection('score_appeals').add({ data: appealData })

    await db.collection('score_records').doc(data.record_id).update({
      data: { appeal_status: '申诉中', appeal_id: appealId, updated_at: now }
    })

    return { success: true, data: { appeal_id: appealId, _id: res._id } }
  } catch (err) {
    console.error('submitAppeal失败:', err)
    return { success: false, message: err.message }
  }
}

async function createVersionSnapshot(data, caller) {
  const { currentVersionId, versionData } = data || {}
  if (!versionData) return { success: false, message: '缺少版本数据' }
  try {
    const now = db.serverDate()

    if (currentVersionId) {
      await db.collection('score_rule_versions').doc(currentVersionId).update({
        data: { is_active: false, updated_at: now }
      })
    }

    const res = await db.collection('score_rule_versions').add({
      data: { ...versionData, created_at: now, updated_at: now }
    })

    return { success: true, data: { _id: res._id, version_id: versionData.version_id } }
  } catch (err) {
    console.error('createVersionSnapshot失败:', err)
    return { success: false, message: err.message }
  }
}

async function createInitialVersion(data, caller) {
  const { versionData } = data || {}
  if (!versionData) return { success: false, message: '缺少版本数据' }
  try {
    const now = db.serverDate()
    const res = await db.collection('score_rule_versions').add({
      data: { ...versionData, created_at: now, updated_at: now }
    })
    return { success: true, data: { _id: res._id, version_id: versionData.version_id } }
  } catch (err) {
    console.error('createInitialVersion失败:', err)
    return { success: false, message: err.message }
  }
}

async function rollbackVersion(data, caller) {
  const { versionId, ruleId, ruleName, ruleCode, scoreValue, categoryId, description } = data || {}
  if (!versionId) return { success: false, message: '缺少版本ID' }
  if (!ruleId) return { success: false, message: '缺少规则ID' }
  try {
    const now = db.serverDate()

    const curActiveRes = await db.collection('score_rule_versions')
      .where({ rule_id: ruleId, is_active: true })
      .limit(1)
      .get()

    if (curActiveRes.data && curActiveRes.data.length > 0) {
      await db.collection('score_rule_versions').doc(curActiveRes.data[0]._id).update({
        data: { is_active: false, updated_at: now }
      })
    }

    await db.collection('score_rule_versions').doc(versionId).update({
      data: { is_active: true, is_stable: true, updated_at: now }
    })

    const ruleRes = await db.collection('score_items')
      .where({ record_id: ruleId })
      .limit(1)
      .get()

    if (ruleRes.data && ruleRes.data.length > 0) {
      const updateFields = {}
      if (ruleName) updateFields.rule_name = ruleName
      if (ruleCode) updateFields.rule_code = ruleCode
      if (scoreValue !== undefined) updateFields.score_value = scoreValue
      if (categoryId) updateFields.rule_category = categoryId
      if (description !== undefined) updateFields.description = description
      updateFields.updated_at = now

      await db.collection('score_items').doc(ruleRes.data[0]._id).update({
        data: updateFields
      })
    }

    const rollbackVersionId = `VER${Date.now()}${Math.random().toString(36).substr(2, 6)}`
    await db.collection('score_rule_versions').add({
      data: {
        version_id: rollbackVersionId,
        rule_id: ruleId,
        version_number: 'rollback',
        rule_name: ruleName || '',
        rule_code: ruleCode || '',
        score_value: scoreValue || 0,
        category_id: categoryId || '',
        description: '版本回滚',
        change_description: `回滚至版本 ${versionId}`,
        changed_fields: [],
        previous_version: versionId,
        is_stable: false,
        is_active: true,
        created_by: caller.openid,
        created_by_name: caller.realName || '',
        created_at: now,
        updated_at: now
      }
    })

    return { success: true }
  } catch (err) {
    console.error('rollbackVersion失败:', err)
    return { success: false, message: err.message }
  }
}

async function getScores(data, caller) {
  const { class_id } = data || {}
  try {
    const effectiveClassId = class_id || caller.classId
    if (!effectiveClassId) return { success: false, message: '缺少班级ID' }

    const query = { class_id: effectiveClassId }
    let allRecords = []
    let batch = 0
    const batchSize = 100

    while (true) {
      const res = await db.collection('score_records')
        .where(query)
        .skip(batch * batchSize)
        .limit(batchSize)
        .get()

      if (!res.data || res.data.length === 0) break
      allRecords = allRecords.concat(res.data)
      if (res.data.length < batchSize) break
      batch++
      if (batch >= 20) break
    }

    const students = {}
    for (const record of allRecords) {
      const sid = record.student_id
      if (!sid) continue
      if (!students[sid]) {
        students[sid] = {
          student_id: sid,
          student_name: record.student_name || '',
          score: 100
        }
      }
      const change = Number(record.score_change || record.score_value || 0)
      if (!isNaN(change)) {
        students[sid].score += change
      }
    }

    const records = Object.values(students)
    return { success: true, data: { records } }
  } catch (err) {
    console.error('getScores失败:', err)
    return { success: false, message: err.message }
  }
}

async function getGroups(data, caller) {
  const { class_id } = data || {}
  try {
    const effectiveClassId = class_id || caller.classId
    if (!effectiveClassId) return { success: false, message: '缺少班级ID' }

    let allGroups = []
    let batch = 0
    const batchSize = 100

    while (true) {
      const res = await db.collection('student_groups')
        .where({ class_id: effectiveClassId, is_deleted: _.neq(true) })
        .skip(batch * batchSize)
        .limit(batchSize)
        .get()

      if (!res.data || res.data.length === 0) break
      allGroups = allGroups.concat(res.data)
      if (res.data.length < batchSize) break
      batch++
      if (batch >= 20) break
    }

    return { success: true, data: { groups: allGroups } }
  } catch (err) {
    console.error('getGroups失败:', err)
    return { success: false, message: err.message }
  }
}
