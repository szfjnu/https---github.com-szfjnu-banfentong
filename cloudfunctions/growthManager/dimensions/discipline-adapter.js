const DimensionAdapterBase = require('./adapter-base')

class DisciplineAdapter extends DimensionAdapterBase {
  async fetchClassData(db, classId, semesterId) {
    const query = { class_id: classId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'discipline_records', query)
  }
  async fetchPersonalData(db, studentId, semesterId) {
    const query = { student_id: studentId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'discipline_records', query)
  }
  computeKPI(data) {
    if (!data || data.length === 0) return { warning_count: 0, serious_count: 0, revoked_count: 0 }
    const warning = data.filter(r => r.level === 'warning' || r.discipline_level === '警告').length
    const serious = data.filter(r => r.level === 'serious' || r.discipline_level === '严重').length
    const revoked = data.filter(r => r.status === 'revoked' || r.is_revoked).length
    return { warning_count: warning, serious_count: serious, revoked_count: revoked }
  }
  async _getAll(db, col, q) {
    let d = [], s = 0
    while (true) { const r = await db.collection(col).where(q).skip(s).limit(100).get(); d = d.concat(r.data); if (r.data.length < 100) break; s += 100 }
    return d
  }
}
module.exports = DisciplineAdapter
