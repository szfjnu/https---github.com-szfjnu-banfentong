Component({
  properties: {
    label: {
      type: String,
      value: ''
    },
    placeholder: {
      type: String,
      value: ''
    },
    type: {
      type: String,
      value: 'text'
    },
    value: {
      type: String,
      value: ''
    },
    disabled: {
      type: Boolean,
      value: false
    },
    maxlength: {
      type: Number,
      value: 140
    }
  },

  data: {
    focused: false
  },

  methods: {
    onFocus() {
      this.setData({ focused: true })
      this.triggerEvent('focus')
    },

    onBlur(e) {
      this.setData({ focused: false })
      this.triggerEvent('blur', e.detail)
    },

    onInput(e) {
      this.triggerEvent('input', e.detail)
    },

    onChange(e) {
      this.triggerEvent('change', e.detail)
    }
  }
})
