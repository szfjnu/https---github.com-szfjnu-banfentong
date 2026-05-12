const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const { getCallerInfo, requireTeacher, requireAdmin } = require('../utils/auth')

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    const caller = await getCallerInfo(event, data?.classId || data?.class_id)

    switch (action) {
      case 'searchByCode':
        return await searchByCode(data, caller)
      case 'searchByPhone':
        return await searchByPhone(data, caller)
      case 'getClassDetail':
        return await getClassDetail(data, caller)
      case 'getStudents':
        return await getStudents(data, caller)
      case 'checkUserInClass':
        return await checkUserInClass(caller, data)
      case 'joinClass':
        return await joinClass(caller, data)
      case 'getUserClasses':
        return await getUserClasses(caller, data)
      case 'updateClass':
        return await updateClass(data, caller)
      case 'createClass':
        return await createClass(data, caller)
      case 'deleteClass':
        return await deleteClass(data, caller)
      case 'markClassGraduated':
        return await markClassGraduated(data, caller)
      case 'transferClass':
        return await transferClass(data, caller)
      case 'dissolveClass':
        return await dissolveClass(data, caller)
      default:
        return { success: false, error: '未知操作' }
    }
  } catch (err) {
    console.error(`joinClass ${action} 失败:`, err)
    return { success: false, error: err.message || '操作失败' }
  }
}

async function searchByCode(data, caller) {
  const { classCode } = data
  if (!classCode) {
    return { success: false, error: '请提供班级码' }
  }

  const res = await db.collection('classes')
    .where({
      class_code: classCode,
      status: _.in(['active', undefined, null, ''])
    })
    .limit(1)
    .get()

  if (res.data.length === 0) {
    const res2 = await db.collection('classes')
      .where({ class_code: classCode })
      .limit(1)
      .get()

    if (res2.data.length === 0) {
      return { success: true, data: [] }
    }
    return { success: true, data: res2.data.map(sanitizeClassData) }
  }

  return { success: true, data: res.data.map(sanitizeClassData) }
}

function sanitizeClassData(classData) {
  const { class_name, class_code, class_id, _id, creator_name, grade_name, status } = classData
  return { class_name, class_code, class_id: class_id || _id, _id, creator_name, grade_name, status }
}

async function searchByPhone(data, caller) {
  const { phone } = data
  if (!phone) {
    return { success: false, error: '请提供手机号' }
  }

  const res = await db.collection('classes')
    .where({
      creator_phone: phone,
      status: _.in(['active', undefined, null, ''])
    })
    .get()

  if (res.data.length === 0) {
    const res2 = await db.collection('classes')
      .where({ creator_phone: phone })
      .get()

    return { success: true, data: res2.data.map(sanitizeClassData) }
  }

  return { success: true, data: res.data.map(sanitizeClassData) }
}

async function getClassDetail(data, caller) {
  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  const isMember = caller.classId === classId || caller.role === 'admin'
  if (!isMember) {
    const memberCheck = await db.collection('user_class_relation')
      .where({
        user_openid: caller.openid,
        class_id: classId,
        status: 'joined'
      })
      .limit(1)
      .get()
    if (!memberCheck.data || memberCheck.data.length === 0) {
      return { success: false, error: '无权访问该班级详情' }
    }
  }

  const classRes = await db.collection('classes').doc(classId).get()

  const studentCountRes = await db.collection('students')
    .where({ class_id: classId })
    .count()

  return {
    success: true,
    data: {
      ...classRes.data,
      studentCount: studentCountRes.total
    }
  }
}

async function getStudents(data, caller) {
  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  const isMember = caller.classId === classId || caller.role === 'admin'
  if (!isMember) {
    const memberCheck = await db.collection('user_class_relation')
      .where({
        user_openid: caller.openid,
        class_id: classId,
        status: 'joined'
      })
      .limit(1)
      .get()
    if (!memberCheck.data || memberCheck.data.length === 0) {
      return { success: false, error: '无权访问该班级学生列表' }
    }
  }

  const allData = []
  let skip = 0
  const limit = 100
  let hasMore = true
  while (hasMore) {
    const res = await db.collection('students')
      .where({ class_id: classId })
      .field({ student_id: true, name: true, student_name: true, class_id: true })
      .skip(skip)
      .limit(limit)
      .get()
    allData.push(...res.data)
    if (res.data.length < limit) {
      hasMore = false
    } else {
      skip += limit
    }
  }

  return { success: true, data: allData }
}

async function checkUserInClass(caller, data) {
  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  const res = await db.collection('user_class_relation')
    .where({
      user_openid: caller.openid,
      class_id: classId,
      status: _.in(['joined', 'pending'])
    })
    .limit(1)
    .get()

  return {
    success: true,
    data: res.data,
    isInClass: res.data.length > 0
  }
}

async function joinClass(caller, data) {
  const { classId, role, studentId, addNew, formData } = data

  if (!classId || !role) {
    return { success: false, error: '缺少必要参数' }
  }

  const checkRes = await db.collection('user_class_relation')
    .where({
      user_openid: caller.openid,
      class_id: classId,
      status: _.in(['joined', 'pending'])
    })
    .limit(1)
    .get()

  if (checkRes.data.length > 0) {
    return { success: false, error: '您已经加入了该班级，无需重复加入', alreadyJoined: true }
  }

  let finalStudentId = studentId
  if (addNew && (role === 'parent' || role === 'student') && formData) {
    const existStudentRes = await db.collection('students')
      .where({
        student_id: formData.student_id,
        class_id: classId
      })
      .limit(1)
      .get()

    if (existStudentRes.data.length > 0) {
      const existStudent = existStudentRes.data[0]
      if (!existStudent.student_id) {
        return { success: false, message: '该学生信息异常，缺少学号，无法绑定' }
      }
      finalStudentId = existStudent.student_id
    } else {
      const studentData = {
        name: formData.student_name,
        student_id: formData.student_id,
        class_id: classId,
        current_score: 100,
        initial_score: 100,
        dorm_score: 100,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }

      await db.collection('students').add({ data: studentData })
      if (!formData.student_id) {
        return { success: false, message: '学生学号不能为空' }
      }
      finalStudentId = formData.student_id
    }
  }

  const relationData = {
    user_openid: caller.openid,
    class_id: classId,
    role: role,
    is_owner: false,
    status: 'joined',
    join_time: db.serverDate(),
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }

  if (role === 'student') {
    relationData.student_id = finalStudentId
    relationData.apply_info = { name: formData.student_name }
  } else if (role === 'parent') {
    relationData.student_id = finalStudentId
    if (formData && formData.relation) {
      relationData.apply_info = { relation: formData.relation }
    }
  } else if (role === 'teacher') {
    relationData.apply_info = {}
    if (formData) {
      if (formData.teacher_name) relationData.apply_info.name = formData.teacher_name
      if (formData.subject) relationData.apply_info.subject = formData.subject
    }
  }

  await db.collection('user_class_relation').add({ data: relationData })

  if (role === 'head_teacher' || role === 'teacher') {
    try {
      const existSemesterRes = await db.collection('semesters')
        .where({ class_id: classId, status: 'active' })
        .limit(1)
        .get()

      if (existSemesterRes.data.length === 0) {
        const now = new Date()
        const year = now.getFullYear()
        let semesterName, startDate, endDate

        if (now.getMonth() >= 8) {
          semesterName = `${year}-${year + 1}第一学期`
          startDate = new Date(year, 8, 1)
          endDate = new Date(year + 1, 1, 15)
        } else {
          semesterName = `${year - 1}-${year}第二学期`
          startDate = new Date(year - 1, 1, 16)
          endDate = new Date(year, 6, 30)
        }

        let defaults = {
          initial_score: 100,
          dorm_initial_score: 100,
          dorm_conversion_ratio: 0.3,
          dorm_warning_threshold: 60,
          dorm_critical_threshold: 40
        }

        const globalRes = await db.collection('semesters')
          .where({ status: 'active' })
          .limit(1)
          .get()

        if (globalRes.data && globalRes.data.length > 0) {
          const g = globalRes.data[0]
          defaults = {
            initial_score: g.initial_score || 100,
            dorm_initial_score: g.dorm_initial_score || 100,
            dorm_conversion_ratio: g.dorm_conversion_ratio || 0.3,
            dorm_warning_threshold: g.dorm_warning_threshold || 60,
            dorm_critical_threshold: g.dorm_critical_threshold || 40
          }
        }

        await db.collection('semesters').add({
          data: {
            semester_name: semesterName,
            name: semesterName,
            start_date: startDate,
            end_date: endDate,
            status: 'active',
            is_current: true,
            ...defaults,
            description: '班主任加入班级时自动创建',
            is_initialized: true,
            class_id: classId,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
          }
        })
      }
    } catch (semErr) {
      console.error('自动初始化学期失败:', semErr)
    }
  }

  const classRes = await db.collection('classes').doc(classId).get()

  return {
    success: true,
    data: {
      classId: classId,
      className: classRes.data.class_name,
      role: role,
      studentId: finalStudentId
    }
  }
}

async function getUserClasses(caller, data) {
  const joinedRes = await db.collection('user_class_relation')
    .where({
      user_openid: caller.openid,
      status: 'joined'
    })
    .get()

  const pendingRes = await db.collection('user_class_relation')
    .where({
      user_openid: caller.openid,
      status: 'pending'
    })
    .get()

  const joinedClasses = []
  for (const relation of joinedRes.data) {
    try {
      const classRes = await db.collection('classes').doc(relation.class_id).get()
      if (classRes.data) {
        joinedClasses.push({
          ...classRes.data,
          role: relation.role,
          is_owner: relation.is_owner || false,
          student_id: relation.student_id || null,
          relation_id: relation._id
        })
      }
    } catch (err) {
      console.error('获取班级详情失败:', relation.class_id, err)
    }
  }

  const pendingClasses = []
  for (const relation of pendingRes.data) {
    try {
      const classRes = await db.collection('classes').doc(relation.class_id).get()
      if (classRes.data) {
        pendingClasses.push({
          ...classRes.data,
          role: relation.role,
          is_owner: relation.is_owner || false,
          student_id: relation.student_id || null,
          relation_id: relation._id
        })
      }
    } catch (err) {
      console.error('获取班级详情失败:', relation.class_id, err)
    }
  }

  return {
    success: true,
    data: {
      joined: joinedClasses,
      pending: pendingClasses
    }
  }
}

async function updateClass(data, caller) {
  requireTeacher(caller)

  const { classId, class_name, class_code, ...rest } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  const updateData = { updated_at: db.serverDate() }
  if (class_name) updateData.class_name = class_name
  if (class_code) updateData.class_code = class_code
  const allowedFields = ['grade_name', 'creator_name', 'creator_phone', 'description', 'status']
  for (const field of allowedFields) {
    if (rest[field] !== undefined) updateData[field] = rest[field]
  }

  await db.collection('classes').doc(classId).update({ data: updateData })

  return { success: true, data: { classId } }
}

async function createClass(data, caller) {
  requireTeacher(caller)

  const { class_name, class_code, creator_phone, creator_name, grade_name, description } = data
  if (!class_name || !class_code) {
    return { success: false, error: '请提供班级名称和班级码' }
  }

  const existRes = await db.collection('classes')
    .where({ class_code })
    .limit(1)
    .get()

  if (existRes.data.length > 0) {
    return { success: false, error: '该班级码已存在' }
  }

  const classData = {
    class_name,
    class_code,
    creator_phone: creator_phone || '',
    creator_name: creator_name || '',
    grade_name: grade_name || '',
    description: description || '',
    status: 'active',
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }

  const addRes = await db.collection('classes').add({ data: classData })

  return { success: true, data: { classId: addRes._id, class_name, class_code } }
}

async function deleteClass(data, caller) {
  requireAdmin(caller)

  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  await db.collection('classes').doc(classId).remove()

  return { success: true, data: { classId } }
}

async function markClassGraduated(data, caller) {
  requireTeacher(caller)

  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  await db.collection('classes').doc(classId).update({
    data: { status: 'graduated', updated_at: db.serverDate() }
  })

  return { success: true, data: { classId, status: 'graduated' } }
}

async function transferClass(data, caller) {
  requireTeacher(caller)

  const { classId, newCreatorPhone } = data
  if (!classId || !newCreatorPhone) {
    return { success: false, error: '请提供班级ID和新创建者手机号' }
  }

  await db.collection('classes').doc(classId).update({
    data: { creator_phone: newCreatorPhone, updated_at: db.serverDate() }
  })

  return { success: true, data: { classId, newCreatorPhone } }
}

async function dissolveClass(data, caller) {
  requireAdmin(caller)

  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  const allStudents = []
  let skip = 0
  const limit = 100
  let hasMore = true
  while (hasMore) {
    const res = await db.collection('students')
      .where({ class_id: classId })
      .skip(skip)
      .limit(limit)
      .get()
    allStudents.push(...res.data)
    if (res.data.length < limit) {
      hasMore = false
    } else {
      skip += limit
    }
  }

  const deletePromises = allStudents.map(s =>
    db.collection('students').doc(s._id).remove()
  )
  await Promise.all(deletePromises)

  await db.collection('classes').doc(classId).remove()

  try {
    const settingsRes = await db.collection('class_settings')
      .where({ class_id: classId })
      .get()
    const settingDeletePromises = settingsRes.data.map(s =>
      db.collection('class_settings').doc(s._id).remove()
    )
    await Promise.all(settingDeletePromises)
  } catch (err) {
    console.error('删除class_settings失败:', err)
  }

  try {
    const relationRes = await db.collection('user_class_relation')
      .where({ class_id: classId })
      .get()
    const relationDeletePromises = relationRes.data.map(r =>
      db.collection('user_class_relation').doc(r._id).remove()
    )
    await Promise.all(relationDeletePromises)
  } catch (err) {
    console.error('删除user_class_relation失败:', err)
  }

  return { success: true, data: { classId, dissolvedStudents: allStudents.length } }
}
