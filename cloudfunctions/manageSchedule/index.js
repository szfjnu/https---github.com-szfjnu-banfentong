const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const SECTION_NAMES = ['', '第一节课', '第二节课', '第三节课', '第四节课', '第五节课', '第六节课', '第七节课']
const WEEK_DAY_NAMES = ['', '星期一', '星期二', '星期三', '星期四', '星期五']
const MAX_LIMIT = 100
const BATCH_SIZE = 50
const WRITE_ROLES = ['admin', 'head_teacher']

exports.main = async (event, context) => {
  const { action, data } = event
  const OPENID = cloud.getWXContext().OPENID

  switch (action) {
    case 'getSchedule': return await getSchedule(data, OPENID)
    case 'importSchedule': return await importSchedule(data, OPENID)
    case 'updateSchedule': return await updateSchedule(data, OPENID)
    case 'deleteSchedule': return await deleteSchedule(data, OPENID)
    case 'ensureCollection': return await ensureCollection()
    case 'fixMissingIsBase': return await fixMissingIsBase(data, OPENID)
    default: return { success: false, message: '未知操作' }
  }
}

async function getAllRecords(collection, query, orderBy) {
  let allData = []
  let skip = 0
  let q = db.collection(collection).where(query).skip(skip).limit(MAX_LIMIT)
  if (orderBy) {
    q = db.collection(collection).where(query).orderBy(orderBy.field, orderBy.order).skip(skip).limit(MAX_LIMIT)
  }
  while (true) {
    let res
    if (orderBy) {
      res = await db.collection(collection).where(query).orderBy(orderBy.field, orderBy.order).skip(skip).limit(MAX_LIMIT).get()
    } else {
      res = await db.collection(collection).where(query).skip(skip).limit(MAX_LIMIT).get()
    }
    allData = allData.concat(res.data)
    if (res.data.length < MAX_LIMIT) break
    skip += MAX_LIMIT
  }
  return allData
}

async function ensureCollectionFn() {
  const collections = ['schedules', 'schedule_overrides']
  const result = {}
  for (const name of collections) {
    try {
      await db.collection(name).limit(1).get()
      result[name] = true
    } catch (err) {
      if (err.message && err.message.includes('not exist')) {
        try {
          await db.createCollection(name)
          result[name] = true
          console.log(`集合${name}创建成功`)
        } catch (createErr) {
          result[name] = false
          console.error(`集合${name}创建失败:`, createErr)
        }
      } else {
        result[name] = true
      }
    }
  }
  return result
}

async function ensureCollection() {
  const result = await ensureCollectionFn()
  return { success: true, data: result }
}

function mergeSchedule(baseRecords, overrides) {
  const overrideMap = {}
  for (const ov of overrides) {
    const key = `${ov.week_day}_${ov.section}`
    overrideMap[key] = ov
  }

  return baseRecords.map(base => {
    const key = `${base.week_day}_${base.section}`
    const override = overrideMap[key]

    if (!override) {
      return { ...base, is_override: false }
    }

    return {
      ...base,
      course_name: override.course_name || base.course_name,
      subject_name: override.subject_name || base.subject_name,
      teacher_name: override.teacher_name !== undefined ? override.teacher_name : base.teacher_name,
      room: override.room || base.room,
      building: override.building || base.building,
      campus: override.campus || base.campus,
      schedule_type: override.schedule_type || base.schedule_type,
      status: override.status,
      remark: override.remark || base.remark,
      is_override: true
    }
  })
}

async function getSchedule(data, openid) {
  const { class_id, class_name, semester_name, week_day, week_number, course_view_type, is_base } = data || {}

  await ensureCollectionFn()

  const baseQuery = {}
  if (class_name) baseQuery.class_name = class_name
  if (class_id) baseQuery.class_id = class_id
  if (semester_name) baseQuery.semester_name = semester_name
  if (is_base !== undefined) {
    baseQuery.is_base = is_base
  }

  let baseRecords = await getAllRecords('schedules', baseQuery, { field: 'section', order: 'asc' })

  if (week_number) {
    const overrideQuery = {}
    if (class_name) overrideQuery.class_name = class_name
    if (class_id) overrideQuery.class_id = class_id
    if (semester_name) overrideQuery.semester_name = semester_name
    overrideQuery.override_week = week_number

    const overrides = await getAllRecords('schedule_overrides', overrideQuery)
    baseRecords = mergeSchedule(baseRecords, overrides)
  }

  let result = baseRecords

  if (week_day) {
    result = result.filter(r => r.week_day === week_day)
  }

  if (course_view_type === 'teacher' && openid) {
    const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
    const teacherName = (userRes.data && userRes.data.length > 0) ? (userRes.data[0].realName || userRes.data[0].name || userRes.data[0].nickName || '') : ''
    result = result.filter(r => {
      if (r.teacher_openid && r.teacher_openid === openid) return true
      if (teacherName && r.teacher_name === teacherName) return true
      return false
    })
  }

  result.sort((a, b) => (a.section || 0) - (b.section || 0))

  return { success: true, data: result }
}

async function checkWritePermission(openid) {
  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) return false
  const userRole = userRes.data[0].role
  return WRITE_ROLES.includes(userRole)
}

async function importSchedule(data, openid) {
  const { records, semester_name, is_base, class_id } = data || {}

  if (!await checkWritePermission(openid)) {
    return { success: false, message: '无操作权限，仅管理员和班主任可导入' }
  }

  await ensureCollectionFn()

  if (!records || !Array.isArray(records) || records.length === 0) {
    return { success: false, message: '导入数据为空' }
  }

  const markIsBase = is_base !== undefined ? is_base : true
  let successCount = 0
  let failedCount = 0
  const failDetails = []

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    for (const record of batch) {
      const errors = []

      if (!record.schedule_id) errors.push('schedule_id字段缺失')
      if (!record.class_name) errors.push('class_name字段缺失')
      if (!record.course_name && !record.subject_name) errors.push('course_name/subject_name字段缺失')
      if (record.week_day === undefined || record.week_day === null) errors.push('week_day字段缺失')
      if (record.section === undefined || record.section === null) errors.push('section字段缺失')

      if (!errors.length) {
        if (record.week_day < 1 || record.week_day > 5) errors.push('week_day超出范围1-5')
        if (record.section < 1 || record.section > 7) errors.push('section超出范围1-7')
      }

      if (errors.length) {
        failedCount++
        failDetails.push({
          schedule_id: record.schedule_id || `第${i + batch.indexOf(record) + 1}条`,
          reason: errors.join('; ')
        })
        continue
      }

      record.subject_name = record.subject_name || record.course_name
      record.course_name = record.course_name || record.subject_name
      record.week_day_name = WEEK_DAY_NAMES[record.week_day] || ''
      record.section_name = SECTION_NAMES[record.section] || ''
      if (record.start_time && record.end_time) {
        record.time_range = record.start_time + '-' + record.end_time
      }
      record.status = record.status || 'normal'
      record.schedule_type = record.schedule_type || '课程'
      record.is_base = markIsBase
      record.semester_name = record.semester_name || semester_name || ''
      if (class_id) record.class_id = class_id
      if (markIsBase && (!record.remark || record.remark === '第2周' || record.remark === '第3周')) {
        record.remark = '基础'
      }

      if (record.teacher_name && !record.teacher_openid) {
        try {
          const teacherRes = await db.collection('users')
            .where(_.or([
              { realName: record.teacher_name },
              { name: record.teacher_name },
              { nickName: record.teacher_name }
            ]))
            .limit(1)
            .get()
          if (teacherRes.data && teacherRes.data.length > 0) {
            record.teacher_openid = teacherRes.data[0]._openid
          }
        } catch (e) {
          console.error('查找教师openid失败:', e)
        }
      }

      const now = Date.now()
      record.updatedAt = now
      if (!record.createdAt) record.createdAt = now

      try {
        const existRes = await db.collection('schedules')
          .where({ schedule_id: record.schedule_id })
          .limit(1)
          .get()

        if (existRes.data && existRes.data.length > 0) {
          const docId = existRes.data[0]._id
          const { _id, ...updateData } = record
          await db.collection('schedules').doc(docId).update({ data: updateData })
        } else {
          const { _id, ...addData } = record
          await db.collection('schedules').add({ data: addData })
        }
        successCount++
      } catch (err) {
        failedCount++
        failDetails.push({ schedule_id: record.schedule_id, reason: err.message || '写入失败' })
        console.error(`导入记录${record.schedule_id}失败:`, err)
      }
    }
  }

  return {
    success: true,
    data: {
      total: records.length,
      success: successCount,
      failed: failedCount,
      failDetails
    }
  }
}

async function updateSchedule(data, openid) {
  const { class_name, class_id, semester_name, override_week, overrides } = data || {}

  if (!await checkWritePermission(openid)) {
    return { success: false, message: '无操作权限，仅管理员和班主任可微调' }
  }

  await ensureCollectionFn()

  if (!override_week || !overrides || !Array.isArray(overrides) || overrides.length === 0) {
    return { success: false, message: '缺少必要参数' }
  }

  const baseQuery = {}
  if (class_name) baseQuery.class_name = class_name
  if (class_id) baseQuery.class_id = class_id
  if (semester_name) baseQuery.semester_name = semester_name

  const baseCount = await db.collection('schedules').where(baseQuery).count()
  if (baseCount.total === 0) {
    return { success: false, message: '请先导入基础课程表' }
  }

  let updatedCount = 0
  const now = Date.now()

  for (const ov of overrides) {
    const { schedule_id, week_day, section, ...overrideFields } = ov

    if (!week_day || !section) {
      console.error('覆盖项缺少week_day或section:', ov)
      continue
    }

    const existQuery = {}
    if (class_name) existQuery.class_name = class_name
    if (class_id) existQuery.class_id = class_id
    if (semester_name) existQuery.semester_name = semester_name
    existQuery.override_week = override_week
    existQuery.week_day = week_day
    existQuery.section = section

    try {
      const existRes = await db.collection('schedule_overrides')
        .where(existQuery)
        .limit(1)
        .get()

      const overrideData = {
        schedule_id: schedule_id || '',
        ...existQuery,
        ...overrideFields,
        remark: overrideFields.remark || `第${override_week}周`,
        updatedAt: now
      }

      if (overrideFields.status === 'cancelled' && !overrideData.course_name && !overrideData.subject_name) {
        const baseRes = await db.collection('schedules')
          .where({ schedule_id: schedule_id, is_base: true })
          .limit(1)
          .get()
        if (baseRes.data && baseRes.data.length > 0) {
          const base = baseRes.data[0]
          overrideData.course_name = overrideData.course_name || base.course_name
          overrideData.subject_name = overrideData.subject_name || base.subject_name
          overrideData.teacher_name = overrideData.teacher_name !== undefined ? overrideData.teacher_name : base.teacher_name
          overrideData.room = overrideData.room || base.room
          overrideData.building = overrideData.building || base.building
        }
      }

      if (existRes.data && existRes.data.length > 0) {
        const docId = existRes.data[0]._id
        await db.collection('schedule_overrides').doc(docId).update({ data: overrideData })
      } else {
        overrideData.createdAt = now
        await db.collection('schedule_overrides').add({ data: overrideData })
      }
      updatedCount++
    } catch (err) {
      console.error(`更新覆盖项失败:`, err)
    }
  }

  return { success: true, data: { updatedCount } }
}

async function deleteSchedule(data, openid) {
  const { type, schedule_id, override_id, class_name, class_id, semester_name } = data || {}

  if (!await checkWritePermission(openid)) {
    return { success: false, message: '无操作权限' }
  }

  await ensureCollectionFn()

  try {
    if (type === 'base') {
      if (!schedule_id) return { success: false, message: '缺少schedule_id' }

      const res = await db.collection('schedules')
        .where({ schedule_id })
        .limit(1)
        .get()

      if (!res.data || res.data.length === 0) {
        return { success: false, message: '记录不存在' }
      }

      await db.collection('schedules').doc(res.data[0]._id).remove()

      const overrideQuery = { schedule_id }
      if (class_name) overrideQuery.class_name = class_name
      if (class_id) overrideQuery.class_id = class_id
      if (semester_name) overrideQuery.semester_name = semester_name

      const overrides = await getAllRecords('schedule_overrides', overrideQuery)
      for (const ov of overrides) {
        await db.collection('schedule_overrides').doc(ov._id).remove()
      }

      return { success: true, message: '删除成功' }
    }

    if (type === 'override') {
      if (!override_id) return { success: false, message: '缺少override_id' }

      await db.collection('schedule_overrides').doc(override_id).remove()
      return { success: true, message: '删除成功' }
    }

    return { success: false, message: '未知删除类型' }
  } catch (err) {
    console.error('删除失败:', err)
    return { success: false, message: err.message || '删除失败' }
  }
}

async function fixMissingIsBase(data, openid) {
  if (!await checkWritePermission(openid)) {
    return { success: false, message: '无操作权限' }
  }

  const { class_id } = data || {}
  const query = {}
  if (class_id) query.class_id = class_id

  const allRecords = await getAllRecords('schedules', query)
  let fixedCount = 0
  const now = Date.now()

  for (const record of allRecords) {
    if (record.is_base === undefined || record.is_base === null) {
      try {
        await db.collection('schedules').doc(record._id).update({
          data: { is_base: true, updatedAt: now }
        })
        fixedCount++
      } catch (err) {
        console.error(`修复记录${record._id}失败:`, err)
      }
    }

    if (record.teacher_name && !record.teacher_openid) {
      try {
        const teacherRes = await db.collection('users')
          .where(_.or([
            { realName: record.teacher_name },
            { name: record.teacher_name },
            { nickName: record.teacher_name }
          ]))
          .limit(1)
          .get()
        if (teacherRes.data && teacherRes.data.length > 0) {
          await db.collection('schedules').doc(record._id).update({
            data: { teacher_openid: teacherRes.data[0]._openid, updatedAt: now }
          })
          fixedCount++
        }
      } catch (err) {
        console.error(`修复teacher_openid失败:`, err)
      }
    }
  }

  return { success: true, data: { total: allRecords.length, fixed: fixedCount } }
}
