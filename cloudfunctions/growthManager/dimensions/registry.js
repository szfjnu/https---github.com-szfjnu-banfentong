const ScoreAdapter = require('./score-adapter')
const AttendanceAdapter = require('./attendance-adapter')
const DutyAdapter = require('./duty-adapter')
const GradeAdapter = require('./grade-adapter')
const DormAdapter = require('./dorm-adapter')
const DisciplineAdapter = require('./discipline-adapter')
const VolunteerAdapter = require('./volunteer-adapter')
const SkillCertAdapter = require('./skill-cert-adapter')
const HeroAdapter = require('./hero-adapter')
const SpotlightAdapter = require('./spotlight-adapter')

const ADAPTER_MAP = {
  score: ScoreAdapter,
  attendance: AttendanceAdapter,
  duty: DutyAdapter,
  grade: GradeAdapter,
  dorm: DormAdapter,
  discipline: DisciplineAdapter,
  volunteer: VolunteerAdapter,
  skill_cert: SkillCertAdapter,
  hero: HeroAdapter,
  spotlight: SpotlightAdapter
}

const DEFAULT_CONFIGS = {
  score: { dimension_key: 'score', dimension_name: '积分', dimension_order: 1, icon: 'star', color: '#FFB800', kpi_fields: ['total_score', 'score_change', 'score_trend'], status_mapping: { up: '上升', down: '下降', stable: '稳定' }, adapter_config: { collection: 'score_records' } },
  attendance: { dimension_key: 'attendance', dimension_name: '考勤', dimension_order: 2, icon: 'calendar', color: '#4CAF50', kpi_fields: ['attendance_rate', 'absent_count', 'late_count'], status_mapping: { normal: '正常', abnormal: '异常' }, adapter_config: { collection: 'attendance_records' } },
  duty: { dimension_key: 'duty', dimension_name: '值日', dimension_order: 3, icon: 'broom', color: '#2196F3', kpi_fields: ['duty_count', 'duty_score', 'completion_rate'], status_mapping: {}, adapter_config: { collection: 'duty_records' } },
  grade: { dimension_key: 'grade', dimension_name: '成绩', dimension_order: 4, icon: 'book', color: '#9C27B0', kpi_fields: ['avg_score', 'max_score', 'min_score', 'pass_rate'], status_mapping: { excellent: '优秀', good: '良好', pass: '及格', fail: '不及格' }, adapter_config: { collection: 'student_grades' } },
  dorm: { dimension_key: 'dorm', dimension_name: '宿舍', dimension_order: 5, icon: 'home', color: '#FF9800', kpi_fields: ['hygiene_score', 'discipline_score', 'overall_score'], status_mapping: {}, adapter_config: { collection: 'dorm_scores' } },
  discipline: { dimension_key: 'discipline', dimension_name: '处分', dimension_order: 6, icon: 'alert', color: '#F44336', kpi_fields: ['warning_count', 'serious_count', 'revoked_count'], status_mapping: { active: '生效中', revoked: '已撤销' }, adapter_config: { collection: 'discipline_records' } },
  volunteer: { dimension_key: 'volunteer', dimension_name: '志愿服务', dimension_order: 7, icon: 'heart', color: '#E91E63', kpi_fields: ['total_hours', 'activity_count', 'verified_count'], status_mapping: {}, adapter_config: { collection: 'volunteer_records' } },
  skill_cert: { dimension_key: 'skill_cert', dimension_name: '技能证书', dimension_order: 8, icon: 'award', color: '#00BCD4', kpi_fields: ['cert_count', 'category_count'], status_mapping: {}, adapter_config: { collection: 'skill_certs' } },
  hero: { dimension_key: 'hero', dimension_name: '英雄台', dimension_order: 9, icon: 'trophy', color: '#FFD700', kpi_fields: ['hero_count'], status_mapping: {}, adapter_config: { collection: 'hero_records' } },
  spotlight: { dimension_key: 'spotlight', dimension_name: '聚光点', dimension_order: 10, icon: 'sun', color: '#FF6F00', kpi_fields: ['spotlight_count'], status_mapping: {}, adapter_config: { collection: 'spotlight_records' } }
}

let adapterInstances = null

function getAdapter(dimensionKey, config) {
  const AdapterClass = ADAPTER_MAP[dimensionKey]
  if (!AdapterClass) return null
  const mergedConfig = config || DEFAULT_CONFIGS[dimensionKey] || { dimension_key: dimensionKey }
  return new AdapterClass(mergedConfig)
}

function getAllAdapters(configs) {
  const result = {}
  for (const [key, AdapterClass] of Object.entries(ADAPTER_MAP)) {
    const config = (configs && configs[key]) || DEFAULT_CONFIGS[key]
    result[key] = new AdapterClass(config)
  }
  return result
}

function getActiveAdapters(configs) {
  const all = getAllAdapters(configs)
  const result = {}
  for (const [key, adapter] of Object.entries(all)) {
    if (adapter.constructor !== undefined) {
      result[key] = adapter
    }
  }
  return result
}

async function loadAdaptersFromDB(db) {
  let allData = [], skip = 0
  while (true) {
    const res = await db.collection('growth_dimension_registry').where({ is_active: true }).orderBy('dimension_order', 'asc').skip(skip).limit(100).get()
    allData = allData.concat(res.data)
    if (res.data.length < 100) break
    skip += 100
  }

  const result = {}
  for (const config of allData) {
    const adapter = getAdapter(config.dimension_key, config)
    if (adapter) result[config.dimension_key] = adapter
  }

  for (const [key, config] of Object.entries(DEFAULT_CONFIGS)) {
    if (!result[key]) {
      result[key] = getAdapter(key, config)
    }
  }

  return result
}

module.exports = { getAdapter, getAllAdapters, getActiveAdapters, loadAdaptersFromDB, ADAPTER_MAP, DEFAULT_CONFIGS }
