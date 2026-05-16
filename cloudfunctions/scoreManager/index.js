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
      case 'initScoreRules':
        requireTeacher(caller)
        return await initScoreRules(data, caller)
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

  const changeValue = Math.round(Number(score_change) * 100) / 100
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

async function initScoreRules(data, caller) {
  const { class_id, semester_id } = data || {}
  const effectiveClassId = class_id || caller.classId
  if (!effectiveClassId) return { success: false, message: '缺少班级ID' }

  let effectiveSemesterId = semester_id || ''
  if (!effectiveSemesterId) {
    try {
      let semesterQuery = { status: 'active' }
      if (effectiveClassId) semesterQuery = { class_id: effectiveClassId, status: 'active' }
      const semesterRes = await db.collection('semesters').where(semesterQuery).limit(1).get()
      if (semesterRes.data.length === 0 && effectiveClassId) {
        const fallbackRes = await db.collection('semesters').where({ status: 'active' }).limit(1).get()
        if (fallbackRes.data.length > 0) semesterRes.data = fallbackRes.data
      }
      if (semesterRes.data.length > 0) effectiveSemesterId = semesterRes.data[0]._id
    } catch (err) {
      console.error('获取学期失败:', err)
    }
  }

  const existingRules = await db.collection('score_items')
    .where({ class_id: effectiveClassId, record_type: 'rule' })
    .count()

  if (existingRules.total > 0) {
    return { success: false, message: '当前班级已有积分规则，无法重复初始化。请先删除现有规则。' }
  }

  const DEFAULT_RULES = [
    { rule_code: 'AD022', rule_name: '课堂互动奖', rule_category: '课堂表现', category: '课堂表现', category_id: 'classroom_performance', score_value: 1, description: '课堂上主动回答问题、上台演示或提出有价值问题，每次加1分。' },
    { rule_code: 'AD023', rule_name: '课堂专注奖', rule_category: '课堂表现', category: '课堂表现', category_id: 'classroom_performance', score_value: 2, description: '整周课堂表现良好，无睡觉、玩手机、闲聊记录，获任课老师提名，加2分。' },
    { rule_code: 'AD024', rule_name: '实训规范奖', rule_category: '课堂表现', category: '课堂表现', category_id: 'classroom_performance', score_value: 1, description: '专业实训课操作规范、设备维护良好，获实训老师特别表扬，每次加1分。' },
    { rule_code: 'AD020', rule_name: '作业卓越奖', rule_category: '作业完成', category: '作业完成', category_id: 'homework', score_value: 1, description: '作业按时提交且质量优秀（获老师批注"优"或表扬），每次加1分。' },
    { rule_code: 'AD021', rule_name: '作业全勤奖', rule_category: '作业完成', category: '作业完成', category_id: 'homework', score_value: 1, description: '连续一周所有学科作业按时提交，无缺交漏交，加1分。' },
    { rule_code: 'MI020', rule_name: '作业迟交罚', rule_category: '作业完成', category: '作业完成', category_id: 'homework', score_value: -1, description: '未按时提交作业，每缺一次扣1分；抄袭作业双倍扣分（-2）。' },
    { rule_code: 'AD030', rule_name: '金牌小组奖', rule_category: '小组协作', category: '小组协作', category_id: 'group_collaboration', score_value: 3, description: '所在小组在周/月评比中获得"优秀小组"称号，全体成员加3分。' },
    { rule_code: 'AD031', rule_name: '协作互助奖', rule_category: '小组协作', category: '小组协作', category_id: 'group_collaboration', score_value: 2, description: '主动帮助组内困难同学，经组长提名，班委确认，加2分。' },
    { rule_code: 'MI030', rule_name: '团队拖后腿罚', rule_category: '小组协作', category: '小组协作', category_id: 'group_collaboration', score_value: -2, description: '因个人原因导致小组被扣分或评比失败，每次扣2分。' },
    { rule_code: 'AD007', rule_name: '文明宿舍奖', rule_category: '宿舍卫生', category: '宿舍卫生', category_id: 'dorm_hygiene', score_value: 1, description: '宿舍获评校级周/月"文明宿舍"，全体成员加1/3分；获学期文明宿舍加5分。' },
    { rule_code: 'AD008', rule_name: '内务进步奖', rule_category: '宿舍卫生', category: '宿舍卫生', category_id: 'dorm_hygiene', score_value: 1, description: '个人内务或宿舍整体卫生较上周有明显进步，获宿管老师点名表扬，加1分。' },
    { rule_code: 'MI017', rule_name: '标识不规范罚', rule_category: '宿舍卫生', category: '宿舍卫生', category_id: 'dorm_hygiene', score_value: -3, description: '未按学校要求张贴宿舍门牌照片，或床位标签缺失，每次扣3分。' },
    { rule_code: 'MI003b', rule_name: '仪容仪表罚(宿舍）', rule_category: '宿舍纪律', category: '宿舍纪律', category_id: 'dorm_discipline', score_value: -3, description: '不穿校服、不按要求穿校服、穿拖鞋进入教学区/宿舍公共区，每次扣3分。' },
    { rule_code: 'MI012b', rule_name: '言语冲突罚（宿舍）', rule_category: '宿舍纪律', category: '宿舍纪律', category_id: 'dorm_discipline', score_value: -20, description: '使用粗言秽语辱骂攻击他人，引发矛盾，或顶撞管理人员/老师，每次扣20分。' },
    { rule_code: 'AD003', rule_name: '劳动满分奖', rule_category: '劳动卫生', category: '劳动卫生', category_id: 'hygiene', score_value: 1, description: '班级大扫除或卫生值日获得学校检查满分，所在小组/值日生每人加1分。' },
    { rule_code: 'AD009', rule_name: '劳动修复奖', rule_category: '劳动卫生', category: '劳动卫生', category_id: 'hygiene', score_value: 2, description: '针对轻微违纪，通过连续3天主动承担宿舍/教室公共区域深度清洁，经核实加2分。' },
    { rule_code: 'MI040', rule_name: '值日失职罚', rule_category: '劳动卫生', category: '劳动卫生', category_id: 'hygiene', score_value: -2, description: '卫生值日逃跑、敷衍了事导致班级被扣分，当事人每次扣2分。' },
    { rule_code: 'MI041', rule_name: '礼仪缺失罚', rule_category: '文明礼仪', category: '文明礼仪', category_id: 'etiquette', score_value: -2, description: '见到师长不问好、公共场所大声喧哗、乱扔垃圾，每次扣2分。' },
    { rule_code: 'AD009', rule_name: '文明礼貌奖', rule_category: '文明礼仪', category: '文明礼仪', category_id: 'etiquette', score_value: 1, description: '受到学校、老师公开表扬（如拾金不昧、主动问好、让座等），每次加1-2分。' },
    { rule_code: 'MI003a', rule_name: '仪容仪表罚', rule_category: '文明礼仪', category: '文明礼仪', category_id: 'etiquette', score_value: -1, description: '不穿校服、不按要求穿校服、穿拖鞋进入教学区/宿舍公共区，每次扣1分。' },
    { rule_code: 'MI012', rule_name: '言语冲突罚', rule_category: '文明礼仪', category: '文明礼仪', category_id: 'etiquette', score_value: -10, description: '使用粗言秽语辱骂攻击他人，引发矛盾，或顶撞教学管理人员/老师，每次扣10分。' },
    { rule_code: 'AD032', rule_name: '班级服务奖', rule_category: '班级贡献', category: '班级贡献', category_id: 'class_contribution', score_value: 2, description: '担任班干部、课代表或临时负责人，工作认真负责，每周/每月考核合格加2-3分。' },
    { rule_code: 'AD033', rule_name: '公物维护奖', rule_category: '班级贡献', category: '班级贡献', category_id: 'class_contribution', score_value: 1, description: '主动维修班级公物、整理图书角、美化教室环境，每次加1分。' },
    { rule_code: 'AD015', rule_name: '志愿服务奖', rule_category: '班级贡献', category: '班级贡献', category_id: 'class_contribution', score_value: 4, description: '参加校内外志愿服务（如图书馆、社区服务、大型活动协助），每4小时或每次大型活动加4分。' },
    { rule_code: 'AD034', rule_name: '特殊贡献奖', rule_category: '班级贡献', category: '班级贡献', category_id: 'class_contribution', score_value: 5, description: '为班级争取校级及以上荣誉，或在突发事件中维护班级利益，酌情加5分。' },
    { rule_code: 'AD040', rule_name: '赛事参与奖', rule_category: '文体活动', category: '文体活动', category_id: 'sports_arts', score_value: 2, description: '代表班级或学校参加校级及以上体育、文艺、技能竞赛（无论获奖与否），每次加2分。' },
    { rule_code: 'AD041', rule_name: '竞技获奖奖', rule_category: '文体活动', category: '文体活动', category_id: 'sports_arts', score_value: 5, description: '在校级比赛中获前三名/一二等奖加3分；获市级及以上奖项加5分。' },
    { rule_code: 'AD042', rule_name: '文艺表演奖', rule_category: '文体活动', category: '文体活动', category_id: 'sports_arts', score_value: 3, description: '在学校晚会、艺术节中进行个人或集体节目表演，每次加3分。' },
    { rule_code: 'AD043', rule_name: '社团活跃奖', rule_category: '文体活动', category: '文体活动', category_id: 'sports_arts', score_value: 2, description: '加入学校社团并积极参与活动，月度全勤且表现积极，每月加2分。' },
    { rule_code: 'AD044', rule_name: '组织策划奖', rule_category: '文体活动', category: '文体活动', category_id: 'sports_arts', score_value: 4, description: '成功组织或策划班级/校级文体活动（如班会表演、篮球赛），主要负责人加4分。' },
    { rule_code: 'MI042', rule_name: '活动缺席罚', rule_category: '文体活动', category: '文体活动', category_id: 'sports_arts', score_value: -3, description: '报名参加了集体文体活动无故缺席或不配合排练，每次扣3分。' }
  ]

  const now = db.serverDate()
  const effectiveDate = now
  let created = 0

  for (const rule of DEFAULT_RULES) {
    try {
      const recordId = `RULE-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
      await db.collection('score_items').add({
        data: {
          record_id: recordId,
          record_type: 'rule',
          rule_code: rule.rule_code,
          rule_name: rule.rule_name,
          rule_category: rule.rule_category,
          category: rule.category,
          category_id: rule.category_id,
          score_value: rule.score_value,
          description: rule.description,
          is_enabled: true,
          priority: 1,
          icon_name: 'star',
          class_id: effectiveClassId,
          semester_id: effectiveSemesterId,
          effective_date: effectiveDate,
          expiry_date: null,
          created_by: caller.openid,
          updated_by: caller.openid,
          created_at: now,
          updated_at: now
        }
      })
      created++
    } catch (err) {
      console.error(`创建规则失败 [${rule.rule_code}]:`, err)
    }
  }

  return { success: true, message: `初始化完成，共创建${created}条规则`, data: { count: created } }
}
