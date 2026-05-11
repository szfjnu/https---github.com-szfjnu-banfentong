// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { getCallerInfo, requireAdmin, AUTH_ERRORS } = require('../utils/auth')

exports.main = async (event, context) => {
  const db = cloud.database()
  const _ = db.command

  try {
    const caller = await getCallerInfo(event)
    requireAdmin(caller)

    const existCount = await db.collection('score_categories').count()
    
    if (existCount.total > 0) {
      return {
        success: false,
        message: '积分类别已初始化,无需重复执行',
        count: existCount.total
      }
    }

    // 定义基础积分类别
    const baseCategories = [
      {
        category_id: 'classroom_performance',
        category_name: '课堂表现',
        category_code: 'CLASSROOM',
        icon: '📚',
        color: '#1890ff',
        description: '课堂学习表现、回答问题、课堂纪律等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 1,
        is_system: true,
        is_active: true,
        class_id: '', // 全局模板
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'homework',
        category_name: '作业完成',
        category_code: 'HOMEWORK',
        icon: '📝',
        color: '#52c41a',
        description: '作业完成情况、作业质量、按时提交等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 2,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'volunteer',
        category_name: '志愿服务',
        category_code: 'VOLUNTEER',
        icon: '🤝',
        color: '#722ed1',
        description: '志愿服务活动、社区服务、公益活动等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 3,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'group_collaboration',
        category_name: '小组协作',
        category_code: 'GROUP',
        icon: '👥',
        color: '#fa8c16',
        description: '小组合作学习、团队协作、小组贡献等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 4,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'etiquette',
        category_name: '文明礼仪',
        category_code: 'ETIQUETTE',
        icon: '🙏',
        color: '#13c2c2',
        description: '文明礼貌、行为规范、尊师重道等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 5,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'discipline',
        category_name: '行为纪律',
        category_code: 'DISCIPLINE',
        icon: '⚠️',
        color: '#f5222d',
        description: '纪律遵守、违纪处理、处分记录等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 6,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'morality',
        category_name: '品德表现',
        category_code: 'MORALITY',
        icon: '⭐',
        color: '#eb2f96',
        description: '品德表现、好人好事、道德品质等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 7,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'hygiene',
        category_name: '劳动卫生',
        category_code: 'HYGIENE',
        icon: '🧹',
        color: '#a0d911',
        description: '卫生值日、劳动表现、环境维护等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 8,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'sports_arts',
        category_name: '文体活动',
        category_code: 'SPORTS_ARTS',
        icon: '🏆',
        color: '#2f54eb',
        description: '体育活动、文艺表演、竞赛获奖等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 9,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'class_contribution',
        category_name: '班级贡献',
        category_code: 'CONTRIBUTION',
        icon: '🎯',
        color: '#faad14',
        description: '班级服务、班级管理、特殊贡献等',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 10,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        created_at: new Date(),
        updated_at: new Date()
      },
      // 宿舍管理相关类别
      {
        category_id: 'dorm_hygiene',
        category_name: '宿舍卫生',
        category_code: 'DORM_HYGIENE',
        icon: '🏠',
        color: '#1890ff',
        description: '宿舍卫生检查、内务整理、宿舍环境等(仅住宿生)',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 11,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        is_dorm_related: true, // 宿舍相关标识
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        category_id: 'dorm_discipline',
        category_name: '宿舍纪律',
        category_code: 'DORM_DISCIPLINE',
        icon: '🛏️',
        color: '#f5222d',
        description: '宿舍纪律、作息规律、安全违规等(仅住宿生)',
        applicable_roles: ['student'],
        applicable_grades: [],
        sort_order: 12,
        is_system: true,
        is_active: true,
        class_id: '',
        semester_id: '',
        is_dorm_related: true, // 宿舍相关标识
        created_at: new Date(),
        updated_at: new Date()
      }
    ]

    // 批量插入数据
    const promises = baseCategories.map(category => 
      db.collection('score_categories').add({ data: category })
    )

    const results = await Promise.all(promises)

    return {
      success: true,
      message: '积分类别初始化成功',
      count: results.length,
      categories: baseCategories.map(c => ({
        id: c.category_id,
        name: c.category_name,
        icon: c.icon
      }))
    }

  } catch (err) {
    console.error('初始化积分类别失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return {
      success: false,
      message: '初始化失败: ' + err.message,
      error: err
    }
  }
}