// 云函数:每日定时提醒(卫生值日、生日祝福、天气提醒)
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { reminder_type } = event

  try {
    if (reminder_type === 'duty') {
      return await checkDutyTasks()
    } else if (reminder_type === 'birthday') {
      return await sendBirthdayWishes()
    } else if (reminder_type === 'weather') {
      return await sendWeatherReminder()
    } else {
      return { success: false, message: '未知的提醒类型' }
    }
  } catch (err) {
    console.error('定时提醒失败:', err)
    return { success: false, message: `提醒失败: ${err.message}` }
  }
}

// 检查值日任务
async function checkDutyTasks() {
  try {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // 1. 检查今天未完成的值日任务(17:00检查)
    if (now.getHours() === 17) {
      const unfinishedTasksRes = await db.collection('duty_schedule').where({
        'tasks.task_date': _.gte(today).and(_.lt(tomorrow)),
        'tasks.status': '待完成'
      }).get()

      for (const schedule of unfinishedTasksRes.data) {
        for (const task of schedule.tasks) {
          if (task.task_date >= today && task.task_date < tomorrow && task.status === '待完成') {
            // 获取组长信息
            const groupRes = await db.collection('student_groups').doc(task.group_id).get()
            const leader_id = groupRes.data.leader_id

            // 记录提醒
            await db.collection('duty_reminders').add({
              data: {
                schedule_id: schedule._id,
                task_id: task.task_id,
                student_id: task.student_id,
                leader_id: leader_id,
                reminder_type: '未完成提醒',
                reminder_time: now,
                reminder_status: '已发送',
                consecutive_days: await getConsecutiveDays(task.student_id),
                created_at: now
              }
            })

            // 检查是否连续3天未完成
            const consecutiveDays = await getConsecutiveDays(task.student_id)
            if (consecutiveDays >= 3) {
              // 发送预警通知给班主任
              // TODO: 实现发送模板消息给班主任
              console.log(`学生${task.student_id}连续3天未完成值日任务,需要通知班主任`)
            }
          }
        }
      }
    }

    // 2. 发送明天值日提醒(每天早上7:00)
    if (now.getHours() === 7) {
      const tomorrowTasksRes = await db.collection('duty_schedule').where({
        'tasks.task_date': _.gte(tomorrow).and(_.lt(new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)))
      }).get()

      for (const schedule of tomorrowTasksRes.data) {
        for (const task of schedule.tasks) {
          if (task.task_date >= tomorrow && task.task_date < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)) {
            // 记录提醒
            await db.collection('duty_reminders').add({
              data: {
                schedule_id: schedule._id,
                task_id: task.task_id,
                student_id: task.student_id,
                leader_id: null,
                reminder_type: '任务提醒',
                reminder_time: now,
                reminder_status: '已发送',
                consecutive_days: 0,
                created_at: now
              }
            })

            // TODO: 发送模板消息给学生
            console.log(`发送值日提醒给学生${task.student_id}`)
          }
        }
      }
    }

    return { success: true, message: '值日提醒检查完成' }

  } catch (err) {
    console.error('检查值日任务失败:', err)
    return { success: false, message: `检查失败: ${err.message}` }
  }
}

// 发送生日祝福
async function sendBirthdayWishes() {
  try {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // 1. 查找今天生日的学生
    const studentsRes = await db.collection('students').where({
      date_of_birth: _.regex(new RegExp(`^${now.getMonth() + 1}-${now.getDate()}`))
    }).get()

    for (const student of studentsRes.data) {
      // 生成生日祝福内容
      const wishContent = generateBirthdayWish(student)

      // 检查是否在节假日(提前一天发送)
      const isHoliday = await checkIsHoliday(today)
      const sendDate = isHoliday ? new Date(today.getTime() - 24 * 60 * 60 * 1000) : today

      // 记录祝福
      await db.collection('birthday_wishes').add({
        data: {
          student_id: student.student_id,
          birthday: student.date_of_birth,
          wish_content: wishContent,
          sent_to_student: false,
          sent_to_parent: false,
          is_holiday: isHoliday,
          sent_date: sendDate,
          created_at: now
        }
      })

      // TODO: 发送模板消息给学生
      console.log(`发送生日祝福给学生${student.name}`)

      // TODO: 如果有家长联系方式,发送给家长
      if (student.parent_phone_number) {
        console.log(`发送生日祝福给${student.name}的家长`)
      }
    }

    // 2. 检查缺失生日信息的学生
    const studentsWithoutBirthdayRes = await db.collection('students').where({
      date_of_birth: _.exists(false)
    }).get()

    if (studentsWithoutBirthdayRes.data.length > 0) {
      // TODO: 提醒管理员补充生日信息
      console.log(`有${studentsWithoutBirthdayRes.data.length}名学生缺少生日信息`)
    }

    return { success: true, message: '生日祝福发送完成' }

  } catch (err) {
    console.error('发送生日祝福失败:', err)
    return { success: false, message: `发送失败: ${err.message}` }
  }
}

// 发送天气提醒
async function sendWeatherReminder() {
  try {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // 1. 获取天气信息(这里使用模拟数据,实际需要调用天气API)
    const weatherInfo = await getWeatherInfo()
    
    // 2. 判断是否恶劣天气
    const isSevere = ['大雨', '暴雨', '大雪', '暴雪', '大风', '台风'].includes(weatherInfo.condition)

    // 3. 生成提醒内容
    const reminderContent = generateWeatherReminder(weatherInfo, isSevere)
    const clothingSuggestion = generateClothingSuggestion(weatherInfo.temperature)
    const travelTips = generateTravelTips(weatherInfo)

    // 4. 记录提醒
    await db.collection('weather_reminders').add({
      data: {
        reminder_date: today,
        weather_condition: weatherInfo.condition,
        temperature: weatherInfo.temperature,
        is_severe: isSevere,
        reminder_content: reminderContent,
        clothing_suggestion: clothingSuggestion,
        travel_tips: travelTips,
        sent_time: now,
        sent_count: 0, // TODO: 实际发送后更新
        created_at: now
      }
    })

    // 5. 发送给所有学生和家长
    // TODO: 获取所有学生和家长,发送模板消息
    console.log(`发送天气提醒给学生和家长: ${weatherInfo.condition}`)

    return { success: true, message: '天气提醒发送完成' }

  } catch (err) {
    console.error('发送天气提醒失败:', err)
    return { success: false, message: `发送失败: ${err.message}` }
  }
}

// 获取连续未完成天数
async function getConsecutiveDays(student_id) {
  // TODO: 实现计算连续未完成天数逻辑
  return 0
}

// 检查是否节假日
async function checkIsHoliday(date) {
  // TODO: 实现节假日检查逻辑
  return false
}

// 生成生日祝福
function generateBirthdayWish(student) {
  return `亲爱的${student.name}同学:\n\n` +
         `今天是你的生日,祝你生日快乐!\n` +
         `愿你在新的一岁里,身体健康,学业进步,快乐成长!\n` +
         `希望你在新的一年里继续努力,取得更好的成绩!\n\n` +
         `班级全体师生`
}

// 获取天气信息(模拟)
async function getWeatherInfo() {
  // TODO: 实际调用天气API
  return {
    condition: '晴天',
    temperature: {
      min: 15,
      max: 25
    }
  }
}

// 生成天气提醒
function generateWeatherReminder(weatherInfo, isSevere) {
  if (isSevere) {
    return `【特别提醒】今天天气恶劣,${weatherInfo.condition},请注意出行安全!`
  } else {
    return `今天${weatherInfo.condition},气温${weatherInfo.temperature.min}-${weatherInfo.temperature.max}℃,请注意保暖。`
  }
}

// 生成穿衣建议
function generateClothingSuggestion(temperature) {
  if (temperature.max < 10) {
    return '建议穿着厚外套、毛衣等保暖衣物'
  } else if (temperature.max < 20) {
    return '建议穿着薄外套、长袖衣物'
  } else if (temperature.max < 30) {
    return '建议穿着短袖或薄长袖'
  } else {
    return '建议穿着透气短袖,注意防晒'
  }
}

// 生成出行建议
function generateTravelTips(weatherInfo) {
  if (['大雨', '暴雨'].includes(weatherInfo.condition)) {
    return '出行请携带雨具,注意路面湿滑'
  } else if (['大雪', '暴雪'].includes(weatherInfo.condition)) {
    return '道路可能结冰,注意防滑,谨慎出行'
  } else if (['大风', '台风'].includes(weatherInfo.condition)) {
    return '避免在广告牌、大树等危险区域停留'
  } else {
    return '天气良好,适宜出行'
  }
}
