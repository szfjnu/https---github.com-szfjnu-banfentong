Component({
  properties: {
    hasMore: {
      type: Boolean,
      value: true
    },
    loadingMore: {
      type: Boolean,
      value: false
    },
    listLength: {
      type: Number,
      value: 0
    }
  },

  methods: {
    onLoadMore: function () {
      if (this.data.loadingMore || !this.data.hasMore) return
      this.triggerEvent('loadmore')
    }
  }
})
