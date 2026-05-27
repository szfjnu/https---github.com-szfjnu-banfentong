const DimensionAdapterBase = require('./adapter-base')

class GradeAdapter extends DimensionAdapterBase {
  async fetchClassData(db, classId, semesterId) {
    const query = { class_id: classId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'grades', query)
  }
  async fetchPersonalData(db, studentId, semesterId) {
    const query = { student_id: studentId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'grades', query)
  }
  computeKPI(data) {
    if (!data || data.length === 0) return { avg_score: 0, max_score: 0, min_score: 0, pass_rate: 0 }
    const scores = data.map(r => r.score || r.grade_score || 0).filter(s => s > 0)
    if (scores.length === 0) return { avg_score: 0, max_score: 0, min_score: 0, pass_rate: 0 }
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length
    const max = Math.max(...scores)
    const min = Math.min(...scores)
    const pass = scores.filter(s => s >= 60).length
    return {
      avg_score: Math.round(avg * 100) / 100,
      max_score: max,
      min_score: min,
      pass_rate: Math.round((pass / scores.length) * 10000) / 100
    }
  }
  async _getAll(db, col, q) {
    let d = [], s = 0
    while (true) { const r = await db.collection(col).where(q).skip(s).limit(100).get(); d = d.concat(r.data); if (r.data.length < 100) break; s += 100 }
    return d
  }
}
module.exports = GradeAdapter
