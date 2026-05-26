/**
 * 班级成长管理模块 - 数据库集合初始化脚本
 * 用法：在云开发控制台执行，或通过 growthManager 云函数的 initGrowthCollections action 触发
 */
const COLLECTIONS = [
  {
    name: 'growth_dashboard_cache',
    indexes: [
      { keys: { class_id: 1, semester_id: 1, dimension: 1 }, name: 'idx_class_semester_dim' },
      { keys: { expires_at: 1 }, name: 'idx_expires' }
    ]
  },
  {
    name: 'growth_warnings',
    indexes: [
      { keys: { class_id: 1, semester_id: 1, status: 1 }, name: 'idx_class_semester_status' },
      { keys: { student_id: 1, warning_type: 1, status: 1 }, name: 'idx_student_type_status' },
      { keys: { warning_level: 1 }, name: 'idx_level' }
    ]
  },
  {
    name: 'growth_warning_rules',
    indexes: [
      { keys: { class_id: 1, warning_type: 1, is_active: 1 }, name: 'idx_class_type_active' }
    ]
  },
  {
    name: 'growth_management_advices',
    indexes: [
      { keys: { class_id: 1, semester_id: 1, created_at: -1 }, name: 'idx_class_semester_time' },
      { keys: { expires_at: 1 }, name: 'idx_expires' }
    ]
  },
  {
    name: 'growth_analytics',
    indexes: [
      { keys: { student_id: 1, semester_id: 1 }, name: 'idx_student_semester', unique: true },
      { keys: { expires_at: 1 }, name: 'idx_expires' }
    ]
  },
  {
    name: 'growth_suggestions',
    indexes: [
      { keys: { student_id: 1, semester_id: 1, created_at: -1 }, name: 'idx_student_semester_time' }
    ]
  },
  {
    name: 'growth_dimension_registry',
    indexes: [
      { keys: { dimension_key: 1 }, name: 'idx_key', unique: true },
      { keys: { is_active: 1, dimension_order: 1 }, name: 'idx_active_order' }
    ]
  },
  {
    name: 'batch_review_tasks',
    indexes: [
      { keys: { status: 1, created_at: -1 }, name: 'idx_status_time' },
      { keys: { class_id: 1, semester_id: 1 }, name: 'idx_class_semester' }
    ]
  }
]

const DEFAULT_DIMENSIONS = [
  {
    dimension_key: 'score',
    dimension_name: '积分',
    dimension_order: 1,
    is_active: true,
    icon: 'star',
    color: '#FFB800',
    kpi_fields: ['total_score', 'score_change', 'score_trend'],
    status_mapping: { up: '上升', down: '下降', stable: '稳定' },
    adapter_config: { collection: 'score_records', score_field: 'score_value' }
  },
  {
    dimension_key: 'attendance',
    dimension_name: '考勤',
    dimension_order: 2,
    is_active: true,
    icon: 'calendar',
    color: '#4CAF50',
    kpi_fields: ['attendance_rate', 'absent_count', 'late_count'],
    status_mapping: { normal: '正常', abnormal: '异常' },
    adapter_config: { collection: 'attendance_records' }
  },
  {
    dimension_key: 'duty',
    dimension_name: '值日',
    dimension_order: 3,
    is_active: true,
    icon: 'broom',
    color: '#2196F3',
    kpi_fields: ['duty_count', 'duty_score', 'completion_rate'],
    status_mapping: { completed: '已完成', pending: '待执行', missed: '缺勤' },
    adapter_config: { collection: 'duty_records' }
  },
  {
    dimension_key: 'grade',
    dimension_name: '成绩',
    dimension_order: 4,
    is_active: true,
    icon: 'book',
    color: '#9C27B0',
    kpi_fields: ['avg_score', 'max_score', 'min_score', 'pass_rate'],
    status_mapping: { excellent: '优秀', good: '良好', pass: '及格', fail: '不及格' },
    adapter_config: { collection: 'student_grades' }
  },
  {
    dimension_key: 'dorm',
    dimension_name: '宿舍',
    dimension_order: 5,
    is_active: true,
    icon: 'home',
    color: '#FF9800',
    kpi_fields: ['hygiene_score', 'discipline_score', 'overall_score'],
    status_mapping: { excellent: '优秀', good: '良好', poor: '待改进' },
    adapter_config: { collection: 'dorm_scores' }
  },
  {
    dimension_key: 'discipline',
    dimension_name: '处分',
    dimension_order: 6,
    is_active: true,
    icon: 'alert',
    color: '#F44336',
    kpi_fields: ['warning_count', 'serious_count', 'revoked_count'],
    status_mapping: { active: '生效中', revoked: '已撤销' },
    adapter_config: { collection: 'discipline_records' }
  },
  {
    dimension_key: 'volunteer',
    dimension_name: '志愿服务',
    dimension_order: 7,
    is_active: true,
    icon: 'heart',
    color: '#E91E63',
    kpi_fields: ['total_hours', 'activity_count', 'verified_count'],
    status_mapping: { verified: '已验证', pending: '待验证' },
    adapter_config: { collection: 'volunteer_records' }
  },
  {
    dimension_key: 'skill_cert',
    dimension_name: '技能证书',
    dimension_order: 8,
    is_active: true,
    icon: 'award',
    color: '#00BCD4',
    kpi_fields: ['cert_count', 'category_count'],
    status_mapping: { approved: '已通过', pending: '审核中' },
    adapter_config: { collection: 'skill_certs' }
  },
  {
    dimension_key: 'hero',
    dimension_name: '英雄台',
    dimension_order: 9,
    is_active: true,
    icon: 'trophy',
    color: '#FFD700',
    kpi_fields: ['hero_count'],
    status_mapping: {},
    adapter_config: { collection: 'hero_records' }
  },
  {
    dimension_key: 'spotlight',
    dimension_name: '聚光点',
    dimension_order: 10,
    is_active: true,
    icon: 'sun',
    color: '#FF6F00',
    kpi_fields: ['spotlight_count'],
    status_mapping: {},
    adapter_config: { collection: 'spotlight_records' }
  }
]

const DEFAULT_WARNING_RULES = [
  {
    warning_type: 'academic',
    warning_name: '学业预警',
    description: '成绩持续下降或低于及格线',
    is_active: true,
    rules: [
      { metric: 'avg_score', operator: '<', threshold: 60, level: 'red', label: '成绩低于60分' },
      { metric: 'score_trend', operator: '==', threshold: 'down', level: 'yellow', label: '成绩趋势下降' },
      { metric: 'pass_rate', operator: '<', threshold: 0.6, level: 'red', label: '及格率低于60%' }
    ]
  },
  {
    warning_type: 'behavioral',
    warning_name: '行为预警',
    description: '处分次数或积分扣减异常',
    is_active: true,
    rules: [
      { metric: 'warning_count', operator: '>=', threshold: 2, level: 'red', label: '累计2次及以上处分' },
      { metric: 'score_change', operator: '<', threshold: -20, level: 'yellow', label: '积分单周下降超20分' }
    ]
  },
  {
    warning_type: 'attendance',
    warning_name: '考勤预警',
    description: '缺勤或迟到频次异常',
    is_active: true,
    rules: [
      { metric: 'absent_count', operator: '>=', threshold: 3, level: 'red', label: '缺勤3次及以上' },
      { metric: 'late_count', operator: '>=', threshold: 5, level: 'yellow', label: '迟到5次及以上' },
      { metric: 'attendance_rate', operator: '<', threshold: 0.85, level: 'yellow', label: '出勤率低于85%' }
    ]
  },
  {
    warning_type: 'hygiene',
    warning_name: '卫生预警',
    description: '宿舍卫生评分持续偏低',
    is_active: true,
    rules: [
      { metric: 'hygiene_score', operator: '<', threshold: 60, level: 'red', label: '宿舍卫生低于60分' },
      { metric: 'hygiene_score', operator: '<', threshold: 70, level: 'yellow', label: '宿舍卫生低于70分' }
    ]
  },
  {
    warning_type: 'dormitory',
    warning_name: '宿舍纪律预警',
    description: '宿舍纪律评分偏低',
    is_active: true,
    rules: [
      { metric: 'discipline_score', operator: '<', threshold: 60, level: 'red', label: '宿舍纪律低于60分' },
      { metric: 'overall_score', operator: '<', threshold: 65, level: 'yellow', label: '宿舍综合低于65分' }
    ]
  }
]

module.exports = { COLLECTIONS, DEFAULT_DIMENSIONS, DEFAULT_WARNING_RULES }
