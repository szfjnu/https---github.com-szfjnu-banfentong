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
  if (student.phone_number && String(student.phone_number).trim() !== '') {
    const phoneStr = String(student.phone_number).trim()
    if (!phoneRegex.test(phoneStr)) {
      errors.push('联系电话格式不正确')
    } else {
      result.phone_number = phoneStr
    }
  } else if (student.phone && String(student.phone).trim() !== '') {
    const phoneStr = String(student.phone).trim()
    if (!phoneRegex.test(phoneStr)) {
      errors.push('联系电话格式不正确')
    } else {
      result.phone_number = phoneStr
    }
  }
  if (student.parent_phone_number && String(student.parent_phone_number).trim() !== '') {
    const phoneStr = String(student.parent_phone_number).trim()
    if (!phoneRegex.test(phoneStr)) {
      errors.push('家长电话格式不正确')
    } else {
      result.parent_phone_number = phoneStr
    }
  } else if (student.parent_phone && String(student.parent_phone).trim() !== '') {
    const phoneStr = String(student.parent_phone).trim()
    if (!phoneRegex.test(phoneStr)) {
      errors.push('家长电话格式不正确')
    } else {
      result.parent_phone_number = phoneStr
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
  if (student.home_address) {
    result.home_address = String(student.home_address).trim()
  } else if (student.address) {
    result.home_address = String(student.address).trim()
  }

  if (student.initial_score !== undefined && student.initial_score !== '') {
    const score = Number(student.initial_score)
    if (!isNaN(score)) {
      result.initial_score = score
    }
  } else {
    result.initial_score = 100
  }
  result.current_score = result.initial_score
  result.dorm_score = 100

  if (student.date_of_birth) result.date_of_birth = String(student.date_of_birth).trim()
  if (student.ethnicity) result.ethnicity = String(student.ethnicity).trim()
  if (student.political_status) result.political_status = String(student.political_status).trim()
  if (student.enrollment_date) result.enrollment_date = String(student.enrollment_date).trim()

  const dormInfo = {}
  if (student.building_no || student.dorm_building) {
    dormInfo.building = String(student.building_no || student.dorm_building).trim()
  }
  if (student.room_no || student.dorm_room) {
    dormInfo.room = String(student.room_no || student.dorm_room).trim()
  }
  if (student.bed_no || student.dorm_bed) {
    dormInfo.bed = String(student.bed_no || student.dorm_bed).trim()
  }
  if (Object.keys(dormInfo).length > 0) {
    result.dorm_info = dormInfo
  }

  return {
    valid: errors.length === 0,
    errors,
    student: result
  }
}

module.exports = { validateStudent }
