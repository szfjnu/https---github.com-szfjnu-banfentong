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

function validateStudent(student) {
  const errors = []
  const cleaned = { ...student }

  if (!cleaned.student_id) {
    errors.push('学号为空')
  } else {
    cleaned.student_id = String(cleaned.student_id).trim()
  }

  if (!cleaned.name) {
    errors.push('姓名为空')
  } else {
    cleaned.name = String(cleaned.name).trim()
    if (cleaned.name.length > 20) {
      errors.push('姓名过长')
    }
  }

  if (cleaned.gender) {
    const g = String(cleaned.gender).trim().toLowerCase()
    if (g === '男' || g === 'male' || g === 'm' || g === '1') {
      cleaned.gender = '男'
    } else if (g === '女' || g === 'female' || g === 'f' || g === '2') {
      cleaned.gender = '女'
    }
  }

  if (cleaned.is_boarding !== undefined && cleaned.is_boarding !== null) {
    const v = String(cleaned.is_boarding).trim().toLowerCase()
    cleaned.is_boarding = v === '是' || v === 'true' || v === 'yes' || v === '1' || v === '住' || v === '住宿'
  }

  if (cleaned.phone_number !== undefined) {
    cleaned.phone = cleaned.phone_number
    delete cleaned.phone_number
  }
  if (cleaned.phone && !/^1[3-9]\d{9}$/.test(String(cleaned.phone).trim())) {
    errors.push('手机号格式错误')
  }

  if (cleaned.parent_phone_number !== undefined) {
    cleaned.parent_phone = cleaned.parent_phone_number
    delete cleaned.parent_phone_number
  }
  if (cleaned.parent_phone && !/^1[3-9]\d{9}$/.test(String(cleaned.parent_phone).trim())) {
    errors.push('家长电话格式错误')
  }

  if (cleaned.home_address !== undefined) {
    cleaned.address = cleaned.home_address
    delete cleaned.home_address
  }

  if (cleaned.initial_score !== undefined && cleaned.initial_score !== '') {
    const num = Number(cleaned.initial_score)
    if (isNaN(num)) {
      errors.push('初始积分无效')
    } else {
      cleaned.initial_score = num
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    student: cleaned
  }
}

module.exports = { validateInput, validateStudent, RULES, SCHEMAS }
