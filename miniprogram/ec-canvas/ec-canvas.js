let echarts = null

function wrapAsComponent() {
  Component({
    properties: {
      ec: {
        type: Object
      }
    },

    data: {
      isUseNew: true
    },

    lifetimes: {
      attached: function () {
        this.init()
      }
    },

    methods: {
      init: function () {
        const query = wx.createSelectorQuery().in(this)
        query.select('.ec-canvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res || !res[0] || !res[0].node) return
            const canvasNode = res[0].node
            const canvasWidth = res[0].width
            const canvasHeight = res[0].height
            const ctx = canvasNode.getContext('2d')

            if (!echarts) return

            const bindbindTouchStart = this.bindTouchStart.bind(this)
            const bindbindTouchMove = this.bindTouchMove.bind(this)
            const bindbindTouchEnd = this.bindTouchEnd.bind(this)

            canvasNode.bindbindTouchStart = bindbindTouchStart
            canvasNode.bindbindTouchMove = bindbindTouchMove
            canvasNode.bindbindTouchEnd = bindbindTouchEnd

            if (this.data.ec && typeof this.data.ec.onInit === 'function') {
              this.chart = this.data.ec.onInit(canvasNode, ctx, canvasWidth, canvasHeight, echarts)
            }
          })
      },

      bindTouchStart: function (e) {
        if (this.chart && e.touches.length > 0) {
          this.chart._zr.handler.dispatch('mousedown', getEchartsEvent(e.touches[0]))
          this.chart._zr.handler.dispatch('mousemove', getEchartsEvent(e.touches[0]))
          this.chart._zr.handler.processGesture(wrapTouch(e, 'start'), 'bindTouchStart')
        }
      },

      bindTouchMove: function (e) {
        if (this.chart && e.touches.length > 0) {
          this.chart._zr.handler.dispatch('mousemove', getEchartsEvent(e.touches[0]))
          this.chart._zr.handler.processGesture(wrapTouch(e, 'change'), 'bindTouchMove')
        }
      },

      bindTouchEnd: function (e) {
        if (this.chart) {
          this.chart._zr.handler.dispatch('mouseup', getEchartsEvent(e.changedTouches[0]))
          this.chart._zr.handler.processGesture(wrapTouch(e, 'end'), 'bindTouchEnd')
        }
      },

      setOption: function (option) {
        if (this.chart) this.chart.setOption(option)
      },

      getChart: function () {
        return this.chart
      }
    }
  })
}

function getEchartsEvent(touch) {
  return { zrX: touch.x, zrY: touch.y }
}

function wrapTouch(e, type) {
  return { touches: e.touches, changedTouches: e.changedTouches, touchType: type, zrX: e.touches[0] ? e.touches[0].x : 0, zrY: e.touches[0] ? e.touches[0].y : 0 }
}

try {
  echarts = require('./echarts.min.js')
} catch (e) {
  console.warn('echarts.min.js not found, chart will not work')
}

wrapAsComponent()
