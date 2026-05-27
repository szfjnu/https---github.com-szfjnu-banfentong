const DimensionAdapterBase = require('./adapter-base')

class SkillCertAdapter extends DimensionAdapterBase {
  async fetchClassData(db, classId, semesterId) {
    const query = { class_id: classId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'skill_cert_records', query)
  }
  async fetchPersonalData(db, studentId, semesterId) {
    const query = { student_id: studentId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'skill_cert_records', query)
  }
  computeKPI(data) {
    if (!data || data.length === 0) return { cert_count: 0, category_count: 0 }
    const approved = data.filter(r => r.status === 'approved' || r.approve_status === 'approved')
    const categories = new Set(approved.map(r => r.category || r.cert_category))
    return { cert_count: approved.length, category_count: categories.size }
  }
  async _getAll(db, col, q) {
    let d = [], s = 0
    while (true) { const r = await db.collection(col).where(q).skip(s).limit(100).get(); d = d.concat(r.data); if (r.data.length < 100) break; s += 100 }
    return d
  }
}
module.exports = SkillCertAdapter
