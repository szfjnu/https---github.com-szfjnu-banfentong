class DimensionAdapterBase {
  constructor(config) {
    this.key = config.dimension_key || ''
    this.name = config.dimension_name || ''
    this.order = config.dimension_order || 0
    this.icon = config.icon || ''
    this.color = config.color || '#999'
    this.kpiFields = config.kpi_fields || []
    this.statusMapping = config.status_mapping || {}
    this.adapterConfig = config.adapter_config || {}
    this.collection = this.adapterConfig.collection || ''
  }

  async fetchClassData(db, classId, semesterId, timeRange) {
    throw new Error(`${this.key} adapter must implement fetchClassData`)
  }

  async fetchPersonalData(db, studentId, semesterId, timeRange) {
    throw new Error(`${this.key} adapter must implement fetchPersonalData`)
  }

  computeKPI(data) {
    throw new Error(`${this.key} adapter must implement computeKPI`)
  }

  computeTrend(data) {
    if (!data || !Array.isArray(data) || data.length < 2) {
      return { direction: 'stable', rate: 0, points: [] }
    }
    const points = data.map((d, i) => ({ index: i, value: d.value || d.score || d.count || 0 }))
    if (points.length < 2) return { direction: 'stable', rate: 0, points }

    const first = points[0].value
    const last = points[points.length - 1].value
    const diff = last - first
    const avg = points.reduce((s, p) => s + p.value, 0) / points.length
    const rate = avg !== 0 ? diff / Math.abs(avg) : 0

    let direction = 'stable'
    if (rate > 0.05) direction = 'up'
    else if (rate < -0.05) direction = 'down'

    return { direction, rate: Math.round(rate * 100) / 100, points }
  }

  normalizeScore(value, min, max) {
    if (max === min) return 50
    const normalized = ((value - min) / (max - min)) * 100
    return Math.max(0, Math.min(100, Math.round(normalized)))
  }

  formatDisplay(data) {
    return data
  }
}

module.exports = DimensionAdapterBase
