const WEEK_DAY_NAMES = ['', '星期一', '星期二', '星期三', '星期四', '星期五']
const SECTION_NAMES = ['', '第一节课', '第二节课', '第三节课', '第四节课', '第五节课', '第六节课', '第七节课']

function validateSchedule(schedule) {
  const errors = []
  const result = {}

  if (!schedule.schedule_id || String(schedule.schedule_id).trim() === '') {
    errors.push('课表编号不能为空')
  } else {
    result.schedule_id = String(schedule.schedule_id).trim()
  }

  if (!schedule.class_name || String(schedule.class_name).trim() === '') {
    errors.push('班级名称不能为空')
  } else {
    result.class_name = String(schedule.class_name).trim()
  }

  const courseName = schedule.course_name || schedule.subject_name
  if (!courseName || String(courseName).trim() === '') {
    errors.push('课程名称不能为空')
  } else {
    result.course_name = String(courseName).trim()
    result.subject_name = String(courseName).trim()
  }

  const weekDay = parseWeekDay(schedule.week_day)
  if (weekDay === null) {
    errors.push('星期格式不正确(1-5或周一-周五)')
  } else {
    result.week_day = weekDay
    result.week_day_name = WEEK_DAY_NAMES[weekDay] || ''
  }

  const section = parseSection(schedule.section)
  if (section === null) {
    errors.push('节次格式不正确(1-7)')
  } else {
    result.section = section
    result.section_name = SECTION_NAMES[section] || ''
  }

  if (schedule.start_time) result.start_time = String(schedule.start_time).trim()
  if (schedule.end_time) result.end_time = String(schedule.end_time).trim()
  if (result.start_time && result.end_time) {
    result.time_range = result.start_time + '-' + result.end_time
  }

  if (schedule.room) result.room = String(schedule.room).trim()
  if (schedule.building) result.building = String(schedule.building).trim()
  if (schedule.campus) result.campus = String(schedule.campus).trim()
  if (schedule.teacher_name) result.teacher_name = String(schedule.teacher_name).trim()

  const typeVal = String(schedule.schedule_type || '').trim()
  result.schedule_type = typeVal || '课程'

  result.status = 'normal'
  result.is_base = true
  if (schedule.remark) result.remark = String(schedule.remark).trim()

  return {
    valid: errors.length === 0,
    errors,
    schedule: result
  }
}

function parseWeekDay(val) {
  if (val === undefined || val === null || val === '') return null
  const num = Number(val)
  if (!isNaN(num) && num >= 1 && num <= 5) return num
  const strMap = { '周一': 1, '星期一': 1, '周二': 2, '星期二': 2, '周三': 3, '星期三': 3, '周四': 4, '星期四': 4, '周五': 5, '星期五': 5, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5 }
  const mapped = strMap[String(val).trim()]
  return mapped !== undefined ? mapped : null
}

function parseSection(val) {
  if (val === undefined || val === null || val === '') return null
  const num = Number(val)
  if (!isNaN(num) && num >= 1 && num <= 7) return num
  return null
}

module.exports = { validateSchedule, parseWeekDay, parseSection }
