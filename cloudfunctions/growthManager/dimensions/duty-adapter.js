const DimensionAdapterBase = require('./adapter-base')

class DutyAdapter extends DimensionAdapterBase {
  async fetchClassData(db, classId, semesterId) {
    const query = { class_id: classId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'duty_records', query)
  }
  async fetchPersonalData(db, studentId, semesterId) {
    const query = { student_id: studentId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'duty_records', query)
  }
  computeKPI(data) {
    if (!data || data.length === 0) return { duty_count: 0, duty_score: 0, completion_rate: 0 }
    const total = data.length
    const completed = data.filter(r => r.status === 'completed' || r.status === '已完成').length
    const score = data.reduce((s, r) => s + (r.score || r.duty_score || 0), 0)
    const rate = total > 0 ? Math.round((completed / total) * 10000) / 100 : 0
    return { duty_count: total, duty_score: score, completion_rate: rate }
  }
  async _getAll(db, col, q) {
    let d = [], s = 0
    while (true) { const r = await db.collection(col).where(q).skip(s).limit(100).get(); d = d.concat(r.data); if (r.data.length < 100) break; s += 100 }
    return d
  }
}
module.exports = DutyAdapter
