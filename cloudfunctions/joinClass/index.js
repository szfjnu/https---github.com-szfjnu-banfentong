// 云函数：班级加入相关操作（绕过客户端安全规则限制）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 支持的操作：
 * 1. searchByCode - 通过班级码查找班级
 * 2. searchByPhone - 通过创建者手机号查找班级
 * 3. getClassDetail - 获取班级详情（含学生数量）
 * 4. getStudents - 获取班级学生列表
 * 5. checkUserInClass - 检查用户是否已加入班级
 * 6. joinClass - 加入班级（创建关系记录+可选创建学生）
 * 7. getUserClasses - 获取用户已加入的班级列表
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, data } = event

  try {
    switch (action) {
      case 'searchByCode':
        return await searchByCode(data)
      case 'searchByPhone':
        return await searchByPhone(data)
      case 'getClassDetail':
        return await getClassDetail(data)
      case 'getStudents':
        return await getStudents(data)
      case 'checkUserInClass':
        return await checkUserInClass(openid, data)
      case 'joinClass':
        return await joinClass(openid, data)
      case 'getUserClasses':
        return await getUserClasses(openid, data)
      default:
        return { success: false, error: '未知操作' }
    }
  } catch (err) {
    console.error(`joinClass ${action} 失败:`, err)
    return { success: false, error: err.message || '操作失败' }
  }
}

// 通过班级码查找班级
async function searchByCode(data) {
  const { classCode } = data
  if (!classCode) {
    return { success: false, error: '请提供班级码' }
  }

  // 兼容无status字段的旧数据
  const res = await db.collection('classes')
    .where({
      class_code: classCode,
      status: _.in(['active', undefined, null, ''])
    })
    .limit(1)
    .get()

  if (res.data.length === 0) {
    // 尝试不带status过滤
    const res2 = await db.collection('classes')
      .where({ class_code: classCode })
      .limit(1)
      .get()

    if (res2.data.length === 0) {
      return { success: true, data: [] }
    }
    return { success: true, data: res2.data }
  }

  return { success: true, data: res.data }
}

// 通过创建者手机号查找班级
async function searchByPhone(data) {
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
    // 尝试不带status过滤
    const res2 = await db.collection('classes')
      .where({ creator_phone: phone })
      .get()

    return { success: true, data: res2.data }
  }

  return { success: true, data: res.data }
}

// 获取班级详情
async function getClassDetail(data) {
  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  const classRes = await db.collection('classes').doc(classId).get()

  // 统计学生人数
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

// 获取班级学生列表
async function getStudents(data) {
  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  const res = await db.collection('students')
    .where({ class_id: classId })
    .get()

  return { success: true, data: res.data }
}

// 检查用户是否已加入班级
async function checkUserInClass(openid, data) {
  const { classId } = data
  if (!classId) {
    return { success: false, error: '请提供班级ID' }
  }

  const res = await db.collection('user_class_relation')
    .where({
      user_openid: openid,
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

// 加入班级
async function joinClass(openid, data) {
  const { classId, role, studentId, addNew, formData } = data

  if (!classId || !role) {
    return { success: false, error: '缺少必要参数' }
  }

  // 1. 检查是否已加入
  const checkRes = await db.collection('user_class_relation')
    .where({
      user_openid: openid,
      class_id: classId,
      status: _.in(['joined', 'pending'])
    })
    .limit(1)
    .get()

  if (checkRes.data.length > 0) {
    return { success: false, error: '您已经加入了该班级，无需重复加入', alreadyJoined: true }
  }

  // 2. 如果是添加新学生（家长或学生角色）
  let finalStudentId = studentId
  if (addNew && (role === 'parent' || role === 'student') && formData) {
    // 检查是否已存在相同学号的学生
    const existStudentRes = await db.collection('students')
      .where({
        student_id: formData.student_id,
        class_id: classId
      })
      .limit(1)
      .get()

    if (existStudentRes.data.length > 0) {
      // 学号已存在，直接关联
      finalStudentId = existStudentRes.data[0]._id
    } else {
      // 创建新学生记录
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

      const studentRes = await db.collection('students').add({ data: studentData })
      finalStudentId = studentRes._id
    }
  }

  // 3. 创建用户班级关系
  const relationData = {
    user_openid: openid,
    class_id: classId,
    role: role,
    is_owner: false,
    status: 'joined',
    join_time: db.serverDate(),
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }

  if (role === 'student') {
    // 学生身份：关联学生记录
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

  // 4. 如果是班主任加入，自动为班级初始化学期
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
        console.log('已为班级自动初始化学期:', classId)
      }
    } catch (semErr) {
      console.error('自动初始化学期失败:', semErr)
    }
  }

  // 5. 获取班级信息用于返回
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

// 获取用户已加入的班级列表
async function getUserClasses(openid, data) {
  // 查询已加入的班级
  const joinedRes = await db.collection('user_class_relation')
    .where({
      user_openid: openid,
      status: 'joined'
    })
    .get()

  // 查询待审核的班级
  const pendingRes = await db.collection('user_class_relation')
    .where({
      user_openid: openid,
      status: 'pending'
    })
    .get()

  // 获取班级详情
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
