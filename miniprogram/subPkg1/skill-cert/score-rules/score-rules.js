const app = getApp()

const COMPETITION_LEVELS = [
  { key: 'school', label: '校级' },
  { key: 'city', label: '市级' },
  { key: 'province', label: '省级' },
  { key: 'national', label: '国家级' }
]

const CERTIFICATE_CATEGORIES = [
  { key: 'vocational', label: '职业资格类' },
  { key: 'skill_level', label: '技能等级类' },
  { key: 'specialty', label: '专项能力类' },
  { key: 'other', label: '其他类' }
]

Page({
  data: {
    loading: true,
    editing: false,
    rules: null,
    displayCompetition: [],
    displayCertificate: [],
    editValues: {}
  },

  onLoad() {
    this.loadRules()
  },

  async loadRules() {
    this.setData({ loading: true })
    try {
      const classId = app.globalData.classId || ''
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'getSkillCertScoreRules',
          data: { class_id: classId }
        }
      })
      const result = res.result || {}
      if (result.success) {
        const rules = result.data
        this.setData({
          rules,
          displayCompetition: this.formatRules(rules.competition, COMPETITION_LEVELS),
          displayCertificate: this.formatRules(rules.certificate, CERTIFICATE_CATEGORIES),
          loading: false
        })
      } else {
        wx.showToast({ title: result.message || '加载失败', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (err) {
      console.error('loadRules错误:', err)
      this.setData({ loading: false })
    }
  },

  formatRules(ruleMap, definitions) {
    return definitions.map(def => {
      const rule = ruleMap && ruleMap[def.key] ? ruleMap[def.key] : { value: 0, source: 'system_default' }
      return {
        key: def.key,
        label: def.label,
        value: rule.value,
        source: rule.source,
        sourceLabel: rule.source === 'class_rule' ? '班级规则' : '系统默认'
      }
    })
  },

  onEdit() {
    const editValues = {}
    this.data.displayCompetition.forEach(r => { editValues['competition_' + r.key] = r.value })
    this.data.displayCertificate.forEach(r => { editValues['certificate_' + r.key] = r.value })
    this.setData({ editing: true, editValues })
  },

  onCancel() {
    this.setData({ editing: false, editValues: {} })
  },

  onValueInput(e) {
    const field = e.currentTarget.dataset.field
    const val = e.detail.value
    this.setData({ ['editValues.' + field]: val })
  },

  async onSave() {
    const editValues = this.data.editValues
    const competition = {}
    const certificate = {}

    COMPETITION_LEVELS.forEach(def => {
      const val = parseInt(editValues['competition_' + def.key])
      if (!isNaN(val) && val > 0) competition[def.key] = val
    })

    CERTIFICATE_CATEGORIES.forEach(def => {
      const val = parseInt(editValues['certificate_' + def.key])
      if (!isNaN(val) && val > 0) certificate[def.key] = val
    })

    wx.showLoading({ title: '保存中' })
    try {
      const classId = app.globalData.classId || ''
      const res = await wx.cloud.callFunction({
        name: 'growthManager',
        data: {
          action: 'saveSkillCertScoreRules',
          data: { class_id: classId, rules: { competition, certificate } }
        }
      })
      const result = res.result || {}
      wx.hideLoading()
      if (result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.setData({ editing: false, editValues: {} })
        this.loadRules()
      } else {
        wx.showToast({ title: result.message || '保存失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})