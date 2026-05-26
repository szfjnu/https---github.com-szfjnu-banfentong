const DimensionAdapterBase = require('./adapter-base')

class ScoreAdapter extends DimensionAdapterBase {
  async fetchClassData(db, classId, semesterId, timeRange) {
    const _ = db.command
    const query = { class_id: classId }
    if (semesterId) query.semester_id = semesterId
    const records = await this._getAllRecords(db, 'score_records', query)
    return records
  }

  async fetchPersonalData(db, studentId, semesterId, timeRange) {
    const query = { student_id: studentId }
    if (semesterId) query.semester_id = semesterId
    const records = await this._getAllRecords(db, 'score_records', query)
    return records
  }

  computeKPI(data) {
    if (!data || data.length === 0) return { total_score: 0, score_change: 0, score_trend: 'stable' }
    const total = data.reduce((sum, r) => sum + (r.score_value || r.score || 0), 0)
    const sorted = [...data].sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
    const recentCount = Math.min(5, sorted.length)
    const olderCount = Math.min(5, Math.max(0, sorted.length - recentCount))
    const recentAvg = sorted.slice(-recentCount).reduce((s, r) => s + (r.score_value || r.score || 0), 0) / recentCount
    const olderAvg = olderCount > 0 ? sorted.slice(0, olderCount).reduce((s, r) => s + (r.score_value || r.score || 0), 0) / olderCount : recentAvg
    const change = Math.round((recentAvg - olderAvg) * 100) / 100
    let trend = 'stable'
    if (change > 1) trend = 'up'
    else if (change < -1) trend = 'down'
    return { total_score: total, score_change: change, score_trend: trend }
  }

  async _getAllRecords(db, collection, query) {
    let allData = [], skip = 0
    while (true) {
      const res = await db.collection(collection).where(query).skip(skip).limit(100).get()
      allData = allData.concat(res.data)
      if (res.data.length < 100) break
      skip += 100
    }
    return allData
  }
}

module.exports = ScoreAdapter
