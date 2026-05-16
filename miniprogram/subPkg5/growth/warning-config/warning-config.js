const app = getApp()

Page({
  data: {
    rules: [],
    indicatorOptions: [
      { value: 'score', label: '平均成绩' },
      { value: 'discipline_count', label: '处分次数' },
      { value: 'attendance_rate', label: '出勤率(%)' },
      { value: 'moral_score', label: '德育积分' }
    ],
    operatorOptions: [
      { value: 'lt', label: '低于' },
      { value: 'lte', label: '不高于' },
      { value: 'gt', label: '高于' },
      { value: 'gte', label: '不低于' },
      { value: 'eq', label: '等于' }
    ],
    indicatorIndex: 0,
    operatorIndex: 0,
    thresholdValue: '',
    ruleDescription: '',
    editingIndex: -1
  },

  onLoad: function () {
    this.loadRules()
  },

  loadRules: async function () {
    try {
      const res = await this._callWithRetry('getWarnings', {})
      if (res.result && res.result.success) {
        this.setData({ rules: res.result.data.warning_rules || [] })
      }
    } catch (err) {
      console.error('加载规则失败:', err)
      wx.showToast({ title: '加载规则失败，请重试', icon: 'none' })
    }
  },

  _callWithRetry: async function (action, data, retries) {
    retries = retries || 1
    try {
      return await wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: action, data: data }
      })
    } catch (err) {
      if (retries > 0) {
        console.warn(`云函数${action}调用失败，${2}秒后重试...`, err)
        await new Promise(resolve => setTimeout(resolve, 2000))
        return await this._callWithRetry(action, data, retries - 1)
      }
      throw err
    }
  },

  onIndicatorChange: function (e) {
    this.setData({ indicatorIndex: Number(e.detail.value) })
  },

  onOperatorChange: function (e) {
    this.setData({ operatorIndex: Number(e.detail.value) })
  },

  onThresholdInput: function (e) {
    this.setData({ thresholdValue: e.detail.value })
  },

  onDescriptionInput: function (e) {
    this.setData({ ruleDescription: e.detail.value })
  },

  onEditRule: function (e) {
    const idx = e.currentTarget.dataset.index
    const rule = this.data.rules[idx]
    if (!rule) return

    const indicatorIndex = this.data.indicatorOptions.findIndex(o => o.value === rule.indicator)
    const operatorIndex = this.data.operatorOptions.findIndex(o => o.value === rule.operator)

    this.setData({
      editingIndex: idx,
      indicatorIndex: indicatorIndex >= 0 ? indicatorIndex : 0,
      operatorIndex: operatorIndex >= 0 ? operatorIndex : 0,
      thresholdValue: String(rule.threshold),
      ruleDescription: rule.description || ''
    })
  },

  onCancelEdit: function () {
    this.setData({
      editingIndex: -1,
      indicatorIndex: 0,
      operatorIndex: 0,
      thresholdValue: '',
      ruleDescription: ''
    })
  },

  onSaveRule: async function () {
    const indicator = this.data.indicatorOptions[this.data.indicatorIndex].value
    const operator = this.data.operatorOptions[this.data.operatorIndex].value
    const threshold = Number(this.data.thresholdValue)
    const description = this.data.ruleDescription

    if (isNaN(threshold)) {
      wx.showToast({ title: '请输入有效阈值', icon: 'none' })
      return
    }

    const rule = {
      indicator,
      operator,
      threshold,
      description,
      enabled: true,
      notify_roles: ['teacher']
    }

    if (this.data.editingIndex >= 0) {
      const existingRule = this.data.rules[this.data.editingIndex]
      if (existingRule) rule.rule_id = existingRule.rule_id
    }

    wx.showLoading({ title: '保存中...' })
    try {
      const res = await this._callWithRetry('saveWarningRules', { rules: [rule] })
      if (res.result && res.result.success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.onCancelEdit()
        this.loadRules()
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '保存失败', icon: 'none' })
      }
    } catch (err) {
      console.error('保存规则失败:', err)
      wx.showToast({ title: '网络异常', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onToggleRule: function (e) {
    const ruleId = e.currentTarget.dataset.id
    const enabled = e.detail.value
    const rules = this.data.rules.map(r => {
      if (r.rule_id === ruleId) return { ...r, enabled }
      return r
    })
    this.setData({ rules })

    const changedRule = rules.find(r => r.rule_id === ruleId)
    if (changedRule) {
      wx.cloud.callFunction({
        name: 'growthManager',
        data: { action: 'saveWarningRules', data: { rules: [changedRule] } }
      }).catch(err => console.error('更新规则状态失败:', err))
    }
  },

  onDeleteRule: function (e) {
    const ruleId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定删除该预警规则？',
      success: (res) => {
        if (res.confirm) {
          const rules = this.data.rules.filter(r => r.rule_id !== ruleId)
          this.setData({ rules })
        }
      }
    })
  },

  preventBubble: function () {}
})
