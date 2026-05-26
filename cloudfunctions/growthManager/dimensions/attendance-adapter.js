const DimensionAdapterBase = require('./adapter-base')

class AttendanceAdapter extends DimensionAdapterBase {
  async fetchClassData(db, classId, semesterId) {
    const query = { class_id: classId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'attendance_records', query)
  }

  async fetchPersonalData(db, studentId, semesterId) {
    const query = { student_id: studentId }
    if (semesterId) query.semester_id = semesterId
    return this._getAll(db, 'attendance_records', query)
  }

  computeKPI(data) {
    if (!data || data.length === 0) return { attendance_rate: 0, absent_count: 0, late_count: 0 }
    const total = data.length
    const absent = data.filter(r => r.status === 'absent' || r.status === '缺勤').length
    const late = data.filter(r => r.status === 'late' || r.status === '迟到').length
    const rate = total > 0 ? Math.round(((total - absent) / total) * 10000) / 100 : 0
    return { attendance_rate: rate, absent_count: absent, late_count: late }
  }

  async _getAll(db, col, q) {
    let d = [], s = 0
    while (true) { const r = await db.collection(col).where(q).skip(s).limit(100).get(); d = d.concat(r.data); if (r.data.length < 100) break; s += 100 }
    return d
  }
}

module.exports = AttendanceAdapter
