const RULES = {
  required: (value) => {
    if (value === undefined || value === null || value === '') return '此字段为必填项'
    return null
  },
  number: (value) => {
    if (value !== undefined && value !== null && isNaN(Number(value))) return '必须为数字'
    return null
  },
  positiveNumber: (value) => {
    if (value !== undefined && value !== null) {
      const num = Number(value)
      if (isNaN(num) || num <= 0) return '必须为正数'
    }
    return null
  },
  nonNegativeNumber: (value) => {
    if (value !== undefined && value !== null) {
      const num = Number(value)
      if (isNaN(num) || num < 0) return '必须为非负数'
    }
    return null
  },
  integer: (value) => {
    if (value !== undefined && value !== null && !Number.isInteger(Number(value))) return '必须为整数'
    return null
  },
  maxLength: (max) => (value) => {
    if (value && String(value).length > max) return `长度不能超过${max}个字符`
    return null
  },
  minLength: (min) => (value) => {
    if (value !== undefined && value !== null && String(value).length < min) return `长度不能少于${min}个字符`
    return null
  },
  inRange: (min, max) => (value) => {
    if (value !== undefined && value !== null) {
      const num = Number(value)
      if (isNaN(num) || num < min || num > max) return `必须在${min}到${max}之间`
    }
    return null
  },
  oneOf: (values) => (value) => {
    if (value !== undefined && !values.includes(value)) return `必须是以下值之一: ${values.join(', ')}`
    return null
  },
  dateStr: (value) => {
    if (value && isNaN(Date.parse(value))) return '日期格式无效'
    return null
  },
  objectId: (value) => {
    if (value && !/^[a-zA-Z0-9]{16,}$/.test(String(value))) return 'ID格式无效'
    return null
  }
}

function validateInput(data, schema) {
  const errors = []

  for (const [field, fieldRules] of Object.entries(schema)) {
    const value = data[field]
    let isRequired = false

    for (const rule of fieldRules) {
      if (rule === RULES.required || (typeof rule === 'function' && rule.name === 'required')) {
        isRequired = true
        break
      }
    }

    for (const rule of fieldRules) {
      let error
      if (typeof rule === 'function') {
        error = rule(value)
      } else {
        error = rule(value)
      }

      if (error) {
        errors.push(`${field}: ${error}`)
        if (isRequired && (value === undefined || value === null || value === '')) break
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

const SCHEMAS = {
  scoreChange: {
    class_id: [RULES.required, RULES.objectId],
    student_id: [RULES.required],
    score_change: [RULES.required, RULES.number, RULES.inRange(-50, 50)]
  },
  redemptionSubmit: {
    item_id: [RULES.required],
    quantity: [RULES.required, RULES.positiveNumber, RULES.integer]
  },
  semesterCreate: {
    semester_name: [RULES.required, RULES.maxLength(50)],
    start_date: [RULES.required, RULES.dateStr],
    end_date: [RULES.required, RULES.dateStr],
    class_id: [RULES.required]
  },
  notification: {
    title: [RULES.required, RULES.maxLength(100)],
    content: [RULES.required, RULES.maxLength(2000)]
  }
}

module.exports = { validateInput, RULES, SCHEMAS }
