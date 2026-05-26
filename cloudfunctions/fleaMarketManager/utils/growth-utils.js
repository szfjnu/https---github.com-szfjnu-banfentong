const MAX_LIMIT = 100

function normalizeClassId(data) {
  if (!data) return {}
  const classId = data.class_id || data.classId || ''
  return {
    class_id: classId,
    classId: classId
  }
}

function buildSemesterQuery(classId, semesterId) {
  const query = {}
  if (classId) query.class_id = classId
  if (semesterId) query.semester_id = semesterId
  return query
}

function enforceStudentFilter(caller, query) {
  if (!query) query = {}
  if (caller.role === 'student') {
    query.student_id = caller.studentId
  } else if (caller.role === 'parent') {
    query.student_id = caller.studentId
  }
  return query
}

async function paginatedQuery(db, collection, query, options = {}) {
  const { orderBy, limit, skip } = options
  const maxResults = limit || MAX_LIMIT
  let allData = []
  let currentSkip = skip || 0
  let remaining = maxResults

  while (remaining > 0) {
    const batchSize = Math.min(remaining, MAX_LIMIT)
    let q = db.collection(collection).where(query).skip(currentSkip).limit(batchSize)

    if (orderBy) {
      q = db.collection(collection).where(query).orderBy(orderBy.field, orderBy.order).skip(currentSkip).limit(batchSize)
    }

    const res = await q.get()
    allData = allData.concat(res.data)
    if (res.data.length < batchSize) break
    currentSkip += batchSize
    remaining -= res.data.length
  }

  return allData
}

function buildTimeRangeQuery(timeRange) {
  if (!timeRange) return {}
  const query = {}
  if (timeRange.start_time || timeRange.startTime) {
    query.created_at = query.created_at || {}
    query.created_at = db.command.gte(timeRange.start_time || timeRange.startTime)
  }
  if (timeRange.end_time || timeRange.endTime) {
    query.created_at = query.created_at || {}
    query.created_at = db.command.lte(timeRange.end_time || timeRange.endTime)
  }
  return query
}

module.exports = {
  MAX_LIMIT,
  normalizeClassId,
  buildSemesterQuery,
  enforceStudentFilter,
  paginatedQuery,
  buildTimeRangeQuery
}
