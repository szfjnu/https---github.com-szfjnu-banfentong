const DimensionAdapterBase = require('./adapter-base')

class VolunteerAdapter extends DimensionAdapterBase {
  async fetchClassData(db, classId, semesterId) {
    const query = { class_id: classId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'volunteer_records', query)
  }
  async fetchPersonalData(db, studentId, semesterId) {
    const query = { student_id: studentId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'volunteer_records', query)
  }
  computeKPI(data) {
    if (!data || data.length === 0) return { total_hours: 0, activity_count: 0, verified_count: 0 }
    const hours = data.reduce((s, r) => s + (r.hours || r.service_hours || 0), 0)
    const verified = data.filter(r => r.status === 'verified' || r.is_verified).length
    return {
      total_hours: Math.round(hours * 100) / 100,
      activity_count: data.length,
      verified_count: verified
    }
  }
  async _getAll(db, col, q) {
    let d = [], s = 0
    while (true) { const r = await db.collection(col).where(q).skip(s).limit(100).get(); d = d.concat(r.data); if (r.data.length < 100) break; s += 100 }
    return d
  }
}
module.exports = VolunteerAdapter
