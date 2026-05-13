const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const { getCallerInfo, requireAdmin, AUTH_ERRORS } = require('./utils/auth')

const INDEX_DEFINITIONS = [
  {
    collection: 'users',
    indexes: [
      { keys: { _openid: 1 }, options: { unique: true }, name: 'users_openid_unique' },
      { keys: { role: 1 }, name: 'users_role' },
      { keys: { student_id: 1 }, name: 'users_student_id' }
    ]
  },
  {
    collection: 'user_class_relation',
    indexes: [
      { keys: { user_openid: 1, class_id: 1 }, options: { unique: true }, name: 'ucr_openid_classid_unique' },
      { keys: { user_openid: 1 }, name: 'ucr_openid' },
      { keys: { class_id: 1 }, name: 'ucr_classid' },
      { keys: { class_id: 1, role: 1 }, name: 'ucr_classid_role' },
      { keys: { status: 1 }, name: 'ucr_status' }
    ]
  },
  {
    collection: 'classes',
    indexes: [
      { keys: { class_id: 1 }, options: { unique: true }, name: 'classes_classid_unique' },
      { keys: { class_code: 1 }, options: { unique: true }, name: 'classes_classcode_unique' },
      { keys: { creator_id: 1 }, name: 'classes_creatorid' },
      { keys: { status: 1 }, name: 'classes_status' }
    ]
  },
  {
    collection: 'students',
    indexes: [
      { keys: { student_id: 1 }, options: { unique: true }, name: 'students_studentid_unique' },
      { keys: { class_id: 1 }, name: 'students_classid' },
      { keys: { class_id: 1, status: 1 }, name: 'students_classid_status' },
      { keys: { _openid: 1 }, name: 'students_openid' },
      { keys: { 'dorm_info.building': 1, 'dorm_info.room': 1 }, name: 'students_dorm_building_room' }
    ]
  },
  {
    collection: 'semesters',
    indexes: [
      { keys: { class_id: 1, status: 1 }, name: 'semesters_classid_status' },
      { keys: { is_current: 1 }, name: 'semesters_iscurrent' }
    ]
  },
  {
    collection: 'class_settings',
    indexes: [
      { keys: { class_id: 1 }, options: { unique: true }, name: 'classsettings_classid_unique' }
    ]
  },
  {
    collection: 'score_items',
    indexes: [
      { keys: { item_id: 1 }, name: 'scoreitems_itemid' },
      { keys: { class_id: 1, is_active: 1 }, name: 'scoreitems_classid_active' },
      { keys: { category: 1 }, name: 'scoreitems_category' }
    ]
  },
  {
    collection: 'score_categories',
    indexes: [
      { keys: { category_id: 1 }, name: 'scorecats_catid' },
      { keys: { class_id: 1, is_active: 1 }, name: 'scorecats_classid_active' }
    ]
  },
  {
    collection: 'score_records',
    indexes: [
      { keys: { student_id: 1, semester_id: 1 }, name: 'screrec_stuid_semid' },
      { keys: { class_id: 1, created_at: -1 }, name: 'screrec_classid_createdat' },
      { keys: { item_id: 1 }, name: 'screrec_itemid' },
      { keys: { source_type: 1, source_record_id: 1 }, name: 'screrec_source' },
      { keys: { is_enabled: 1 }, name: 'screrec_enabled' }
    ]
  },
  {
    collection: 'scores',
    indexes: [
      { keys: { student_id: 1, class_id: 1 }, options: { unique: true }, name: 'scores_stuid_classid_unique' }
    ]
  },
  {
    collection: 'attendance_records',
    indexes: [
      { keys: { student_id: 1, date: -1 }, name: 'attrec_stuid_date' },
      { keys: { class_id: 1, date: -1 }, name: 'attrec_classid_date' },
      { keys: { category_id: 1 }, name: 'attrec_catid' }
    ]
  },
  {
    collection: 'attendance_categories',
    indexes: [
      { keys: { class_id: 1, is_active: 1 }, name: 'attcats_classid_active' }
    ]
  },
  {
    collection: 'attendance_warnings',
    indexes: [
      { keys: { class_id: 1, status: 1 }, name: 'attwarn_classid_status' },
      { keys: { student_id: 1 }, name: 'attwarn_stuid' }
    ]
  },
  {
    collection: 'volunteer_records',
    indexes: [
      { keys: { student_id: 1, class_id: 1 }, name: 'volrec_stuid_classid' },
      { keys: { class_id: 1, date: -1 }, name: 'volrec_classid_date' }
    ]
  },
  {
    collection: 'discipline_records',
    indexes: [
      { keys: { student_id: 1, class_id: 1 }, name: 'disrec_stuid_classid' },
      { keys: { class_id: 1, issue_date: -1 }, name: 'disrec_classid_date' },
      { keys: { is_revoked: 1 }, name: 'disrec_revoked' }
    ]
  },
  {
    collection: 'student_authorizations',
    indexes: [
      { keys: { student_id: 1, class_id: 1 }, name: 'stauth_stuid_classid' },
      { keys: { openid: 1, class_id: 1 }, name: 'stauth_openid_classid' },
      { keys: { status: 1 }, name: 'stauth_status' }
    ]
  },
  {
    collection: 'student_leader_permission',
    indexes: [
      { keys: { student_id: 1, class_id: 1 }, name: 'slp_stuid_classid' },
      { keys: { openid: 1, class_id: 1 }, name: 'slp_openid_classid' }
    ]
  },
  {
    collection: 'student_groups',
    indexes: [
      { keys: { class_id: 1, semester_id: 1 }, name: 'stgroups_classid_semid' }
    ]
  },
  {
    collection: 'dorm_buildings',
    indexes: [
      { keys: { building_id: 1 }, name: 'dormbld_bldid' },
      { keys: { class_id: 1 }, name: 'dormbld_classid' }
    ]
  },
  {
    collection: 'dorm_rooms',
    indexes: [
      { keys: { building_id: 1, room_number: 1 }, name: 'dormrm_bldid_rmnum' },
      { keys: { class_id: 1 }, name: 'dormrm_classid' }
    ]
  },
  {
    collection: 'dorm_beds',
    indexes: [
      { keys: { room_id: 1, bed_number: 1 }, name: 'dormbed_rmid_bednum' },
      { keys: { student_id: 1 }, name: 'dormbed_stuid' },
      { keys: { class_id: 1 }, name: 'dormbed_classid' }
    ]
  },
  {
    collection: 'dorm_rules',
    indexes: [
      { keys: { class_id: 1, category: 1 }, name: 'dormrules_classid_cat' },
      { keys: { is_active: 1 }, name: 'dormrules_active' }
    ]
  },
  {
    collection: 'dorm_score_records',
    indexes: [
      { keys: { class_id: 1, semester_id: 1 }, name: 'dsr_classid_semid' },
      { keys: { student_id: 1 }, name: 'dsr_stuid' },
      { keys: { building: 1, room: 1, date: -1 }, name: 'dsr_bld_rm_date' }
    ]
  },
  {
    collection: 'dorm_score_accounts',
    indexes: [
      { keys: { student_id: 1, class_id: 1, semester_id: 1 }, options: { unique: true }, name: 'dsa_stuid_classid_semid_unique' }
    ]
  },
  {
    collection: 'dorm_warnings',
    indexes: [
      { keys: { student_id: 1, status: 1 }, name: 'dwarn_stuid_status' },
      { keys: { class_id: 1, warning_type: 1 }, name: 'dwarn_classid_type' }
    ]
  },
  {
    collection: 'redemption_items',
    indexes: [
      { keys: { class_id: 1, status: 1 }, name: 'reditems_classid_status' }
    ]
  },
  {
    collection: 'redemption_requests',
    indexes: [
      { keys: { student_id: 1, status: 1 }, name: 'redreq_stuid_status' },
      { keys: { class_id: 1 }, name: 'redreq_classid' }
    ]
  },
  {
    collection: 'product_wishes',
    indexes: [
      { keys: { class_id: 1, status: 1 }, name: 'pw_classid_status' },
      { keys: { product_id: 1, user_id: 1 }, name: 'pw_prodid_userid' }
    ]
  },
  {
    collection: 'auction_items',
    indexes: [
      { keys: { class_id: 1, status: 1 }, name: 'aucitems_classid_status' }
    ]
  },
  {
    collection: 'auction_bids',
    indexes: [
      { keys: { item_id: 1 }, name: 'aucbids_itemid' },
      { keys: { bidder_id: 1 }, name: 'aucbids_bidderid' }
    ]
  },
  {
    collection: 'flea_items',
    indexes: [
      { keys: { seller_id: 1, status: 1 }, name: 'flea_sellerid_status' },
      { keys: { class_id: 1, status: 1 }, name: 'flea_classid_status' },
      { keys: { category: 1 }, name: 'flea_category' }
    ]
  },
  {
    collection: 'campus_activities',
    indexes: [
      { keys: { class_id: 1, status: 1 }, name: 'ca_classid_status' },
      { keys: { organizer_id: 1 }, name: 'ca_orgid' }
    ]
  },
  {
    collection: 'treehole_posts',
    indexes: [
      { keys: { class_id: 1, status: 1 }, name: 'thposts_classid_status' },
      { keys: { author_id: 1, created_at: -1 }, name: 'thposts_authorid_createdat' }
    ]
  },
  {
    collection: 'treehole_replies',
    indexes: [
      { keys: { post_id: 1, created_at: 1 }, name: 'threplies_postid_createdat' }
    ]
  },
  {
    collection: 'treehole_hearts',
    indexes: [
      { keys: { post_id: 1, user_id: 1 }, options: { unique: true }, name: 'thhearts_postid_userid_unique' }
    ]
  },
  {
    collection: 'hero_honors',
    indexes: [
      { keys: { class_id: 1, created_at: -1 }, name: 'heroh_classid_createdat' },
      { keys: { student_id: 1 }, name: 'heroh_stuid' }
    ]
  },
  {
    collection: 'hero_cheers',
    indexes: [
      { keys: { honor_id: 1, user_id: 1 }, options: { unique: true }, name: 'heroc_honorid_userid_unique' }
    ]
  },
  {
    collection: 'approvals',
    indexes: [
      { keys: { class_id: 1, status: 1 }, name: 'approvals_classid_status' },
      { keys: { applicant_id: 1 }, name: 'approvals_applicantid' },
      { keys: { business_type: 1, business_id: 1 }, name: 'approvals_biz' }
    ]
  },
  {
    collection: 'grades',
    indexes: [
      { keys: { class_id: 1, subject: 1 }, name: 'grades_classid_subject' },
      { keys: { student_id: 1 }, name: 'grades_stuid' }
    ]
  },
  {
    collection: 'notifications',
    indexes: [
      { keys: { class_id: 1, created_at: -1 }, name: 'notifs_classid_createdat' }
    ]
  },
  {
    collection: 'user_notifications',
    indexes: [
      { keys: { user_id: 1, is_read: 1 }, name: 'unotifs_userid_read' }
    ]
  },
  {
    collection: 'growth_profiles',
    indexes: [
      { keys: { student_id: 1, class_id: 1, semester_id: 1 }, name: 'gp_stuid_classid_semid' }
    ]
  },
  {
    collection: 'growth_warnings',
    indexes: [
      { keys: { student_id: 1, status: 1 }, name: 'gw_stuid_status' },
      { keys: { class_id: 1, warning_type: 1 }, name: 'gw_classid_type' }
    ]
  },
  {
    collection: 'schedules',
    indexes: [
      { keys: { class_id: 1, week_day: 1, section: 1 }, name: 'sched_classid_wd_sec' },
      { keys: { teacher_openid: 1, week_day: 1 }, name: 'sched_teacher_wd' }
    ]
  },
  {
    collection: 'seats',
    indexes: [
      { keys: { class_id: 1 }, options: { unique: true }, name: 'seats_classid_unique' }
    ]
  },
  {
    collection: 'chat_logs',
    indexes: [
      { keys: { user_id: 1, session_id: 1 }, name: 'chatlogs_userid_sessid' }
    ]
  },
  {
    collection: 'permission_audit_logs',
    indexes: [
      { keys: { class_id: 1, created_at: -1 }, name: 'pal_classid_createdat' },
      { keys: { operator_id: 1 }, name: 'pal_opid' }
    ]
  },
  {
    collection: 'duty_schedule',
    indexes: [
      { keys: { class_id: 1, date: -1 }, name: 'dutysched_classid_date' },
      { keys: { group_id: 1 }, name: 'dutysched_groupid' }
    ]
  },
  {
    collection: 'duty_tasks',
    indexes: [
      { keys: { student_id: 1, class_id: 1 }, name: 'dutytasks_stuid_classid' }
    ]
  }
]

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
    return true
  } catch (err) {
    if (err.message && (err.message.includes('no such collection') || err.message.includes('not exist'))) {
      await db.createCollection(name)
      console.log(`集合 ${name} 已创建`)
      return true
    }
    throw err
  }
}

async function createIndexWithRetry(collection, indexDef) {
  const { keys, options = {}, name } = indexDef
  try {
    await db.collection(collection).createIndex({ keys, options })
    return { name, status: 'created', unique: !!options.unique }
  } catch (err) {
    if (err.message && (err.message.includes('already exists') || err.message.includes('duplicate'))) {
      return { name, status: 'already_exists', unique: !!options.unique }
    }
    console.error(`索引 ${name} 创建失败:`, err.message)
    return { name, status: 'failed', error: err.message, unique: !!options.unique }
  }
}

async function setupAllIndexes() {
  const results = []
  
  for (const def of INDEX_DEFINITIONS) {
    const { collection, indexes } = def
    const collectionResult = { collection, indexes: [] }
    
    try {
      await ensureCollection(collection)
    } catch (err) {
      collectionResult.error = `集合创建失败: ${err.message}`
      results.push(collectionResult)
      continue
    }
    
    for (const indexDef of indexes) {
      const result = await createIndexWithRetry(collection, indexDef)
      collectionResult.indexes.push(result)
    }
    
    results.push(collectionResult)
  }
  
  return results
}

async function setupCollectionIndexes(collectionName) {
  const def = INDEX_DEFINITIONS.find(d => d.collection === collectionName)
  if (!def) {
    return { error: `未找到集合 ${collectionName} 的索引定义` }
  }
  
  await ensureCollection(collectionName)
  const indexes = []
  for (const indexDef of def.indexes) {
    const result = await createIndexWithRetry(collectionName, indexDef)
    indexes.push(result)
  }
  return { collection: collectionName, indexes }
}

async function listIndexDefinitions() {
  return INDEX_DEFINITIONS.map(d => ({
    collection: d.collection,
    indexes: d.indexes.map(i => ({
      name: i.name,
      keys: i.keys,
      unique: !!(i.options && i.options.unique)
    }))
  }))
}

exports.main = async (event, context) => {
  try {
    const caller = await getCallerInfo(event, event.classId || event.class_id, { allowNoClass: true })
    requireAdmin(caller)
    
    const action = event.action || 'setupAll'
    
    switch (action) {
      case 'setupAll': {
        const results = await setupAllIndexes()
        const summary = {
          total: results.length,
          withErrors: results.filter(r => r.error).length,
          totalIndexes: results.reduce((sum, r) => sum + r.indexes.length, 0),
          created: results.reduce((sum, r) => sum + r.indexes.filter(i => i.status === 'created').length, 0),
          alreadyExists: results.reduce((sum, r) => sum + r.indexes.filter(i => i.status === 'already_exists').length, 0),
          failed: results.reduce((sum, r) => sum + r.indexes.filter(i => i.status === 'failed').length, 0)
        }
        return { success: true, summary, details: results }
      }
      case 'setupCollection': {
        if (!event.collection) {
          return { success: false, message: '请提供 collection 参数' }
        }
        const result = await setupCollectionIndexes(event.collection)
        return { success: true, result }
      }
      case 'list': {
        const definitions = await listIndexDefinitions()
        return { success: true, totalCollections: definitions.length, definitions }
      }
      default:
        return { success: false, message: `未知action: ${action}` }
    }
  } catch (err) {
    console.error('setupIndexes失败:', err)
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, message: err.message, code: err.code }
    }
    return { success: false, error: err.message || '索引创建失败' }
  }
}
