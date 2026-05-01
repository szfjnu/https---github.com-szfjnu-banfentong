const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const OPENID = cloud.getWXContext().OPENID

  switch (action) {
    case 'updateSemester': return await updateSemester(data)
    case 'addSemester': return await addSemester(data, OPENID)
    case 'setCurrentSemester': return await setCurrentSemester(data)
    case 'getSemesterConfig': return await getSemesterConfig(data)
    case 'initClassSemester': return await initClassSemester(data)
    case 'deleteSemester': return await deleteSemester(data)
    default: return { success: false, message: '未知操作' }
  }
}

async function updateSemester(data) {
  const { _id, ...updateData } = data
  if (!_id) return { success: false, message: '缺少学期ID' }

  const allowedFields = [
    'semester_name', 'start_date', 'end_date', 'initial_score',
    'dorm_initial_score', 'dorm_conversion_ratio', 'dorm_warning_threshold',
    'dorm_critical_threshold', 'description', 'is_current', 'status',
    'is_initialized', 'class_id'
  ]
  const filteredData = {}
  for (const key of allowedFields) {
    if (updateData[key] !== undefined) {
      filteredData[key] = updateData[key]
    }
  }
  filteredData.updated_at = db.serverDate()

  try {
    await db.collection('semesters').doc(_id).update({ data: filteredData })
    return { success: true }
  } catch (err) {
    console.error('updateSemester error:', err)
    return { success: false, message: err.message || '更新失败' }
  }
}

async function addSemester(data, openid) {
  const required = ['semester_name', 'start_date', 'end_date']
  for (const field of required) {
    if (!data[field]) return { success: false, message: `缺少必填字段: ${field}` }
  }

  // 重复检查：同一班级下不允许存在同名+同起止日期的学期
  try {
    const dupCheck = await db.collection('semesters')
      .where({
        semester_name: data.semester_name,
        start_date: data.start_date,
        end_date: data.end_date,
        class_id: data.class_id || ''
      })
      .limit(1)
      .get()
    if (dupCheck.data && dupCheck.data.length > 0) {
      return { success: false, message: '该班级已存在同名且起止日期相同的学期，请勿重复创建' }
    }
  } catch (checkErr) {
    console.error('重复检查失败:', checkErr)
  }

  const now = db.serverDate()
  const semesterData = {
    semester_name: data.semester_name,
    start_date: data.start_date,
    end_date: data.end_date,
    status: data.status || 'pending',
    is_current: data.is_current || false,
    initial_score: data.initial_score || 100,
    dorm_initial_score: data.dorm_initial_score || 100,
    dorm_conversion_ratio: data.dorm_conversion_ratio || 0.3,
    dorm_warning_threshold: data.dorm_warning_threshold || 60,
    dorm_critical_threshold: data.dorm_critical_threshold || 40,
    description: data.description || '',
    is_initialized: data.is_initialized || false,
    class_id: data.class_id || '',
    created_at: now,
    updated_at: now
  }

  try {
    const res = await db.collection('semesters').add({ data: semesterData })
    return { success: true, data: { _id: res._id } }
  } catch (err) {
    console.error('addSemester error:', err)
    return { success: false, message: err.message || '添加失败' }
  }
}

async function setCurrentSemester(data) {
  const { semester_id, class_id } = data
  if (!semester_id) return { success: false, message: '缺少学期ID' }

  try {
    const now = db.serverDate()
    const query = {}
    if (class_id) query.class_id = class_id

    const allRes = await db.collection('semesters').where(query).get()
    for (const sem of (allRes.data || [])) {
      if (sem._id !== semester_id && sem.is_current) {
        await db.collection('semesters').doc(sem._id).update({
          data: { is_current: false, status: 'inactive', updated_at: now }
        })
      }
    }

    await db.collection('semesters').doc(semester_id).update({
      data: { is_current: true, status: 'active', updated_at: now }
    })

    return { success: true }
  } catch (err) {
    console.error('setCurrentSemester error:', err)
    return { success: false, message: err.message || '设置失败' }
  }
}

async function getSemesterConfig(data) {
  const { class_id } = data

  try {
    if (class_id) {
      const res = await db.collection('semesters')
        .where({ class_id, is_current: true })
        .limit(1)
        .get()

      if (res.data && res.data.length > 0) {
        return { success: true, data: res.data[0] }
      }

      const allRes = await db.collection('semesters')
        .where({ class_id, status: 'active' })
        .limit(1)
        .get()

      if (allRes.data && allRes.data.length > 0) {
        return { success: true, data: allRes.data[0] }
      }
    }

    const globalRes = await db.collection('semesters')
      .where({ is_current: true })
      .limit(1)
      .get()

    if (globalRes.data && globalRes.data.length > 0) {
      return { success: true, data: globalRes.data[0] }
    }

    const globalActiveRes = await db.collection('semesters')
      .where({ status: 'active' })
      .limit(1)
      .get()

    if (globalActiveRes.data && globalActiveRes.data.length > 0) {
      return { success: true, data: globalActiveRes.data[0] }
    }

    return { success: false, message: '未找到当前学期配置' }
  } catch (err) {
    console.error('getSemesterConfig error:', err)
    return { success: false, message: err.message || '获取失败' }
  }
}

async function initClassSemester(data) {
  const { class_id } = data
  if (!class_id) return { success: false, message: '缺少class_id' }

  try {
    const existRes = await db.collection('semesters')
      .where({ class_id, status: 'active' })
      .limit(1)
      .get()

    if (existRes.data && existRes.data.length > 0) {
      return { success: true, data: existRes.data[0], message: '该班级已有活跃学期' }
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

    const serverNow = db.serverDate()
    const semesterData = {
      semester_name: semesterName,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      is_current: true,
      ...defaults,
      description: '班级初始化自动创建',
      is_initialized: true,
      class_id: class_id,
      created_at: serverNow,
      updated_at: serverNow
    }

    const res = await db.collection('semesters').add({ data: semesterData })
    return { success: true, data: { _id: res._id, ...semesterData }, message: '学期初始化成功' }
  } catch (err) {
    console.error('initClassSemester error:', err)
    return { success: false, message: err.message || '初始化失败' }
  }
}

async function deleteSemester(data) {
  const { semester_id } = data
  if (!semester_id) return { success: false, message: '缺少学期ID' }

  try {
    // 检查是否为当前激活学期
    const semRes = await db.collection('semesters').doc(semester_id).get()
    if (!semRes.data) return { success: false, message: '学期不存在' }

    if (semRes.data.is_current || semRes.data.status === 'active') {
      return { success: false, message: '当前激活学期不可删除，请先切换到其他学期' }
    }

    await db.collection('semesters').doc(semester_id).remove()
    return { success: true, message: '删除成功' }
  } catch (err) {
    console.error('deleteSemester error:', err)
    return { success: false, message: err.message || '删除失败' }
  }
}
