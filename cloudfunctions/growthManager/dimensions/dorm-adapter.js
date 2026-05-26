const DimensionAdapterBase = require('./adapter-base')

class DormAdapter extends DimensionAdapterBase {
  async fetchClassData(db, classId, semesterId) {
    const query = { class_id: classId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'dorm_scores', query)
  }
  async fetchPersonalData(db, studentId, semesterId) {
    const query = { student_id: studentId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'dorm_scores', query)
  }
  computeKPI(data) {
    if (!data || data.length === 0) return { hygiene_score: 0, discipline_score: 0, overall_score: 0 }
    const hygiene = data.reduce((s, r) => s + (r.hygiene_score || 0), 0) / data.length
    const discipline = data.reduce((s, r) => s + (r.discipline_score || 0), 0) / data.length
    const overall = data.reduce((s, r) => s + (r.overall_score || r.total_score || 0), 0) / data.length
    return {
      hygiene_score: Math.round(hygiene * 100) / 100,
      discipline_score: Math.round(discipline * 100) / 100,
      overall_score: Math.round(overall * 100) / 100
    }
  }
  async _getAll(db, col, q) {
    let d = [], s = 0
    while (true) { const r = await db.collection(col).where(q).skip(s).limit(100).get(); d = d.concat(r.data); if (r.data.length < 100) break; s += 100 }
    return d
  }
}
module.exports = DormAdapter
