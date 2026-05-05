Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    desc: {
      type: String,
      value: ''
    },
    extra: {
      type: String,
      value: ''
    },
    clickable: {
      type: Boolean,
      value: false
    },
    arrow: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onTap(e) {
      if (this.data.clickable) {
        this.triggerEvent('tap', e.detail)
      }
    }
  }
})
