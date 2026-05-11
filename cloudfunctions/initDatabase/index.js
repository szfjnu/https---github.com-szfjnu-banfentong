// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const { getCallerInfo, requireAdmin, AUTH_ERRORS } = require('../utils/auth')

exports.main = async (event, context) => {
  try {
    const caller = await getCallerInfo(event)
    requireAdmin(caller)

    const openid = caller.openid
    // 1. 检查并创建管理员账号
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    let userRole = 'student'
    
    if (userRes.data.length === 0) {
      // 创建第一个用户为管理员
      await db.collection('users').add({
        data: {
          _openid: openid,
          role: 'admin',
          nickname: '系统管理员',
          avatarUrl: '',
          permissions: [
            { module: 'student', actions: ['read', 'write', 'delete'] },
            { module: 'score', actions: ['read', 'write', 'delete'] },
            { module: 'attendance', actions: ['read', 'write', 'delete'] },
            { module: 'dorm', actions: ['read', 'write', 'delete'] },
            { module: 'semester', actions: ['read', 'write', 'delete'] },
            { module: 'grade', actions: ['read', 'write', 'delete'] },
            { module: 'competition', actions: ['read', 'write', 'delete'] },
            { module: 'volunteer', actions: ['read', 'write', 'delete'] },
            { module: 'discipline', actions: ['read', 'write', 'delete'] }
          ],
          is_active: true,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      })
      userRole = 'admin'
    } else {
      userRole = userRes.data[0].role
    }

    // 2. 检查并创建活跃学期
    const semesterRes = await db.collection('semesters').where({
      status: 'active'
    }).get()

    let semesterCreated = false
    if (semesterRes.data.length === 0) {
      // 创建默认学期
      const now = new Date()
      const year = now.getFullYear()
      
      await db.collection('semesters').add({
        data: {
          name: `${year}-${year + 1}第一学期`,
          semester_name: `${year}-${year + 1}第一学期`,
          start_date: new Date(year, 8, 1), // 9月1日
          end_date: new Date(year + 1, 1, 15), // 次年2月15日
          status: 'active',
          is_current: true,
          description: '系统自动创建的学期',
          initial_score: 100,
          dorm_initial_score: 100,
          dorm_conversion_ratio: 0.3,
          dorm_warning_threshold: 60,
          dorm_critical_threshold: 40,
          is_initialized: false,
          class_id: '',
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      })
      semesterCreated = true
    }

    // 3. 创建默认积分项目
    const scoreItemsRes = await db.collection('score_items').get()
    let itemsCreated = false
    
    if (scoreItemsRes.data.length === 0) {
      const defaultItems = [
        { item_id: 'ITEM001', name: '课堂表现优秀', category: '学习表现', default_score: 2, type: '加分', is_active: true },
        { item_id: 'ITEM002', name: '作业完成优秀', category: '学习表现', default_score: 1, type: '加分', is_active: true },
        { item_id: 'ITEM003', name: '帮助同学', category: '品德表现', default_score: 1, type: '加分', is_active: true },
        { item_id: 'ITEM004', name: '迟到', category: '考勤', default_score: -1, type: '扣分', is_active: true },
        { item_id: 'ITEM005', name: '旷课', category: '考勤', default_score: -2, type: '扣分', is_active: true },
        { item_id: 'ITEM006', name: '宿舍卫生优秀', category: '住宿管理', default_score: 2, type: '加分', is_active: true },
        { item_id: 'ITEM007', name: '宿舍卫生差', category: '住宿管理', default_score: -2, type: '扣分', is_active: true },
        { item_id: 'ITEM008', name: '志愿服务', category: '志愿服务', default_score: 2, type: '加分', is_active: true },
        { item_id: 'ITEM009', name: '竞赛获奖', category: '竞赛获奖', default_score: 5, type: '加分', is_active: true },
        { item_id: 'ITEM010', name: '违纪行为', category: '处分扣分', default_score: -5, type: '扣分', is_active: true }
      ]
      
      for (const item of defaultItems) {
        await db.collection('score_items').add({
          data: {
            ...item,
            description: '',
            requires_approval: false,
            max_times_per_semester: -1,
            max_score_per_semester: -1,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
          }
        })
      }
      itemsCreated = true
    }

    return {
      success: true,
      message: '数据库初始化完成',
      data: {
        openid: openid,
        userRole: userRole,
        isNewUser: userRes.data.length === 0,
        semesterCreated: semesterCreated,
        scoreItemsCreated: itemsCreated
      }
    }
  } catch (err) {
    console.error('初始化数据库失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return {
      success: false,
      error: err.message || '初始化失败'
    }
  }
}
