function initChart(canvas, ctx, width, height, echarts) {
  const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: wx.getSystemInfoSync().pixelRatio })
  canvas.setChart = canvas.setChart || function () {}
  canvas.setChart(chart)
  return chart
}

Component({
  properties: {
    classId: { type: String, value: '' },
    role: { type: String, value: '' },
    canWrite: { type: Boolean, value: false }
  },

  data: {
    dimensionTabs: ['积分', '考勤', '卫生'],
    selectedDimension: '积分',
    kpiCards: [],
    trendData: null,
    gradeRank: [],
    loading: true,
    ec: { onInit: null }
  },

  lifetimes: {
    attached: function () {
      if (this.properties.classId) {
        this.loadData()
      }
    }
  },

  methods: {
    loadData: async function () {
      if (!this.properties.classId) return
      this.setData({ loading: true })
      try {
        const res = await wx.cloud.callFunction({
          name: 'growthManager',
          data: {
            action: 'getClassOverview',
            data: { class_id: this.properties.classId, dimension: this.data.selectedDimension }
          }
        })
        if (res.result && res.result.success) {
          const d = res.result.data
          this.setData({
            kpiCards: d.kpiCards || [],
            gradeRank: d.gradeRank || [],
            loading: false
          })
          if (d.trend && d.trend.length > 0) {
            this.buildTrendChart(d.trend)
          } else {
            this.setData({ trendData: null, loading: false })
          }
        } else {
          this.setData({ loading: false })
        }
      } catch (err) {
        console.error('加载总览数据失败:', err)
        this.setData({ loading: false })
      }
    },

    buildTrendChart: function (trendData) {
      const months = trendData.map(t => t.month || t.label)
      const values = trendData.map(t => t.value || t.score || 0)
      const option = {
        tooltip: { trigger: 'axis', formatter: '{b}: {c}' },
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: months, axisLabel: { fontSize: 10, rotate: 30 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
        series: [{
          type: 'line',
          data: values,
          smooth: true,
          lineStyle: { width: 2, color: '#667eea' },
          itemStyle: { color: '#667eea' },
          areaStyle: { color: 'rgba(102,126,234,0.15)' }
        }]
      }
      const ec = { onInit: null }
      ec.onInit = function (canvas, ctx, width, height, echarts) {
        const chart = initChart(canvas, ctx, width, height, echarts)
        chart.setOption(option)
        return chart
      }
      this.setData({ ec, trendData: { xAxis: months, seriesData: values } })
    },

    onDimensionChange: function (e) {
      const dim = e.currentTarget.dataset.dim
      this.setData({ selectedDimension: dim })
      this.loadData()
    },

    onWarningCountClick: function () {
      this.triggerEvent('warningclick')
    },

    refresh: function () {
      this.loadData()
    }
  }
})