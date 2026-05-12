// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command
const { getCallerInfo, requireAdmin } = require('./utils/auth')

exports.main = async (event, context) => {
  console.log('开始修复班级设置数据...')

  try {
    const caller = await getCallerInfo(event)
    requireAdmin(caller)
    // 1. 删除 class_id 为空的无效数据
    const deleteRes = await db.collection('class_settings')
      .where({
        class_id: _.in(['', null, undefined])
      })
      .remove()

    console.log('删除无效数据:', deleteRes.stats.removed)

    // 2. 查询所有班级
    const classesRes = await db.collection('classes')
      .where({
        status: _.neq('graduated')
      })
      .field({
        _id: true,
        class_name: true
      })
      .get()

    const classes = classesRes.data
    console.log('找到活跃班级数量:', classes.length)

    let updatedCount = 0
    let createdCount = 0

    // 3. 为每个班级检查并创建/更新 class_settings
    for (const classInfo of classes) {
      const classId = classInfo._id

      // 检查是否已存在该班级的设置
      const existingRes = await db.collection('class_settings')
        .where({ class_id: classId })
        .get()

      if (existingRes.data && existingRes.data.length > 0) {
        // 更新现有记录，确保有完整的 feature_flags
        const existingSettings = existingRes.data[0]
        const needUpdate = !existingSettings.feature_flags ||
                          existingSettings.feature_flags.enable_dorm === undefined

        if (needUpdate) {
          await db.collection('class_settings')
            .doc(existingSettings._id)
            .update({
              data: {
                feature_flags: existingSettings.feature_flags || {
                  enable_volunteer: true,
                  enable_dorm: false,
                  enable_competition: false,
                  enable_duty: true
                },
                notification_settings: existingSettings.notification_settings || {
                  remind_before_days: 1,
                  notify_on_birthday: true,
                  notify_on_schedule: true
                },
                score_rules: existingSettings.score_rules || {
                  max_score_per_day: -1,
                  min_score_per_action: 1,
                  score_expire_days: -1
                },
                volunteer_score_per_hour: existingSettings.volunteer_score_per_hour || 2,
                updated_at: db.serverDate()
              }
            })
          updatedCount++
          console.log('更新班级设置:', classId, classInfo.class_name)
        }
      } else {
        // 创建新的班级设置记录
        await db.collection('class_settings').add({
          data: {
            class_id: classId,
            volunteer_score_per_hour: 2,
            score_rules: {
              max_score_per_day: -1,
              min_score_per_action: 1,
              score_expire_days: -1
            },
            feature_flags: {
              enable_volunteer: true,
              enable_dorm: false,
              enable_competition: false,
              enable_duty: true
            },
            notification_settings: {
              remind_before_days: 1,
              notify_on_birthday: true,
              notify_on_schedule: true
            },
            created_at: db.serverDate(),
            updated_at: db.serverDate()
          }
        })
        createdCount++
        console.log('创建班级设置:', classId, classInfo.class_name)
      }
    }

    // 4. 查询修复后的数据
    const finalRes = await db.collection('class_settings').get()

    return {
      success: true,
      message: '班级设置修复完成',
      stats: {
        deletedInvalid: deleteRes.stats.removed,
        updated: updatedCount,
        created: createdCount,
        totalRecords: finalRes.data.length
      },
      data: finalRes.data
    }

  } catch (err) {
    console.error('修复班级设置失败:', err)
    return {
      success: false,
      message: '修复失败: ' + err.message,
      error: err
    }
  }
}
