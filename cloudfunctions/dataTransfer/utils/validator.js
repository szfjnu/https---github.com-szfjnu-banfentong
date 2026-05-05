function validateStudent(student) {
  const errors = []
  const result = {}

  if (!student.student_id || String(student.student_id).trim() === '') {
    errors.push('学号不能为空')
  } else if (String(student.student_id).length > 30) {
    errors.push('学号长度不能超过30')
  } else {
    result.student_id = String(student.student_id).trim()
  }

  if (!student.name || String(student.name).trim() === '') {
    errors.push('姓名不能为空')
  } else if (String(student.name).length > 20) {
    errors.push('姓名长度不能超过20')
  } else {
    result.name = String(student.name).trim()
  }

  const phoneRegex = /^1[3-9]\d{9}$/
  if (student.phone && String(student.phone).trim() !== '') {
    const phoneStr = String(student.phone).trim()
    if (!phoneRegex.test(phoneStr)) {
      errors.push('联系电话格式不正确')
    } else {
      result.phone = phoneStr
    }
  }
  if (student.parent_phone && String(student.parent_phone).trim() !== '') {
    const phoneStr = String(student.parent_phone).trim()
    if (!phoneRegex.test(phoneStr)) {
      errors.push('家长电话格式不正确')
    } else {
      result.parent_phone = phoneStr
    }
  }

  const genderVal = String(student.gender || '').trim().toLowerCase()
  if (['男', 'male', 'm', '1'].includes(genderVal)) {
    result.gender = '男'
  } else if (['女', 'female', 'f', '2'].includes(genderVal)) {
    result.gender = '女'
  } else if (student.gender) {
    result.gender = String(student.gender).trim()
  }

  const boardingVal = String(student.is_boarding || '').trim().toLowerCase()
  if (['是', 'true', 'yes', '1', '住', '住宿'].includes(boardingVal)) {
    result.is_boarding = true
  } else {
    result.is_boarding = false
  }

  if (student.position) result.position = String(student.position).trim()
  if (student.parent_name) result.parent_name = String(student.parent_name).trim()
  if (student.address) result.address = String(student.address).trim()
  if (student.initial_score !== undefined && student.initial_score !== '') {
    const score = Number(student.initial_score)
    if (!isNaN(score)) {
      result.initial_score = score
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    student: result
  }
}

module.exports = { validateStudent }
