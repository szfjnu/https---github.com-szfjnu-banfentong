const CACHE_PREFIX = 'growth_'

function getCache(key, maxAgeMs) {
  try {
    const fullKey = CACHE_PREFIX + key
    const cached = wx.getStorageSync(fullKey)
    if (!cached || !cached.timestamp || !cached.data) return null
    if (Date.now() - cached.timestamp > maxAgeMs) {
      wx.removeStorageSync(fullKey)
      return null
    }
    return cached.data
  } catch (e) {
    return null
  }
}

function setCache(key, data) {
  try {
    const fullKey = CACHE_PREFIX + key
    wx.setStorageSync(fullKey, { data, timestamp: Date.now() })
  } catch (e) {
    console.error('growth-cache setCache failed:', e)
  }
}

function removeCache(key) {
  try {
    wx.removeStorageSync(CACHE_PREFIX + key)
  } catch (e) {}
}

function clearAllCache() {
  try {
    const res = wx.getStorageInfoSync()
    for (const key of res.keys) {
      if (key.startsWith(CACHE_PREFIX)) {
        wx.removeStorageSync(key)
      }
    }
  } catch (e) {}
}

module.exports = { getCache, setCache, removeCache, clearAllCache }
