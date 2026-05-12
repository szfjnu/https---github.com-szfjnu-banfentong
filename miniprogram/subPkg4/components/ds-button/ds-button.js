Component({
  properties: {
    type: {
      type: String,
      value: 'default'
    },
    size: {
      type: String,
      value: 'md'
    },
    block: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    },
    loading: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onTap(e) {
      if (this.data.disabled || this.data.loading) return
      this.triggerEvent('tap', e.detail)
    }
  }
})
