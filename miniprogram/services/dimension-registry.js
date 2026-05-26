const growthCache = require('../utils/growth-cache')
const CACHE_KEY = 'dimension_registry'
const CACHE_TTL = 30 * 60 * 1000

let cachedDimensions = null

async function getDimensions() {
  if (cachedDimensions) return cachedDimensions

  const cached = growthCache.getCache(CACHE_KEY, CACHE_TTL)
  if (cached) {
    cachedDimensions = cached
    return cached
  }

  try {
    const res = await wx.cloud.callFunction({
      name: 'growthManager',
      data: {
        action: 'getGrowthWarningRules',
        data: {}
      }
    })
    if (res.result && res.result.success) {
      cachedDimensions = DEFAULT_DIMENSIONS
      growthCache.setCache(CACHE_KEY, DEFAULT_DIMENSIONS)
      return DEFAULT_DIMENSIONS
    }
  } catch (e) {}

  cachedDimensions = DEFAULT_DIMENSIONS
  return DEFAULT_DIMENSIONS
}

function getDimensionByKey(key) {
  return DEFAULT_DIMENSIONS.find(d => d.key === key) || null
}

function getActiveDimensions() {
  return DEFAULT_DIMENSIONS.filter(d => d.is_active !== false)
}

const DEFAULT_DIMENSIONS = [
  { key: 'score', name: '积分', icon: 'star', color: '#FFB800', order: 1, is_active: true },
  { key: 'attendance', name: '考勤', icon: 'calendar', color: '#4CAF50', order: 2, is_active: true },
  { key: 'duty', name: '值日', icon: 'broom', color: '#2196F3', order: 3, is_active: true },
  { key: 'grade', name: '成绩', icon: 'book', color: '#9C27B0', order: 4, is_active: true },
  { key: 'dorm', name: '宿舍', icon: 'home', color: '#FF9800', order: 5, is_active: true },
  { key: 'discipline', name: '处分', icon: 'alert', color: '#F44336', order: 6, is_active: true },
  { key: 'volunteer', name: '志愿服务', icon: 'heart', color: '#E91E63', order: 7, is_active: true },
  { key: 'skill_cert', name: '技能证书', icon: 'award', color: '#00BCD4', order: 8, is_active: true },
  { key: 'hero', name: '英雄台', icon: 'trophy', color: '#FFD700', order: 9, is_active: true },
  { key: 'spotlight', name: '聚光点', icon: 'sun', color: '#FF6F00', order: 10, is_active: true }
]

module.exports = { getDimensions, getDimensionByKey, getActiveDimensions, DEFAULT_DIMENSIONS }
