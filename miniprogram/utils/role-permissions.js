/**
 * 角色权限配置
 * 定义六种角色（管理员、班主任、科任老师、班干部、学生、家长）的视图权限和操作权限
 * 
 * 使用方式：
 *   const rp = require('../../utils/role-permissions');
 *   const canView = rp.hasPermission(role, 'discipline', 'add');
 *   const menuItems = rp.getMenuItems(role, 'discipline');
 */

// 角色定义
const ROLES = {
  ADMIN: 'admin',
  HEAD_TEACHER: 'head_teacher',
  SUBJECT_TEACHER: 'subject_teacher',
  CLASS_CADRE: 'class_cadre',
  STUDENT: 'student',
  PARENT: 'parent'
};

// 角色标签
const ROLE_LABELS = {
  'admin': '管理员',
  'head_teacher': '班主任',
  'subject_teacher': '科任老师',
  'class_cadre': '班干部',
  'student': '学生',
  'parent': '家长'
};

/**
 * 权限矩阵
 * 结构: { 模块: { 操作: [允许的角色列表] } }
 * 
 * 操作类型:
 *   - view: 查看列表/详情
 *   - add: 新增
 *   - edit: 编辑/修改
 *   - delete: 删除
 *   - approve: 审批
 *   - manage: 综合管理（包含增删改查）
 *   - self: 仅查看自己的数据
 */
const PERMISSIONS = {
  // 学生管理
  student: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre'],
    add: ['admin', 'head_teacher'],
    edit: ['admin', 'head_teacher'],
    delete: ['admin', 'head_teacher'],
    import: ['admin', 'head_teacher']
  },

  // 班级管理
  class: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre'],
    add: ['admin', 'head_teacher'],
    edit: ['admin', 'head_teacher'],
    settings: ['admin', 'head_teacher']
  },

  // 分组管理
  group: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre'],
    add: ['admin', 'head_teacher'],
    edit: ['admin', 'head_teacher'],
    delete: ['admin', 'head_teacher']
  },

  // 考勤管理
  attendance: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre'],
    add: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre'],
    edit: ['admin', 'head_teacher'],
    leave: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    self: ['student', 'parent']
  },

  // 积分管理
  score: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    add: ['admin', 'head_teacher', 'class_cadre'],
    edit: ['admin', 'head_teacher'],
    delete: ['admin', 'head_teacher'],
    appeal: ['student', 'parent'],
    self: ['student', 'parent']
  },

  // 积分商城
  mall: {
    view: ['admin', 'head_teacher', 'class_cadre', 'student', 'parent'],
    redeem: ['student', 'parent'],              // 兑换
    manage: ['admin', 'head_teacher'],           // 管理商品
    ledger: ['admin', 'head_teacher']            // 台账
  },

  // 志愿服务
  volunteer: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    add: ['admin', 'head_teacher', 'class_cadre', 'student', 'parent'],
    edit: ['admin', 'head_teacher'],
    delete: ['admin', 'head_teacher'],
    verify: ['admin', 'head_teacher'],           // 验证
    self: ['student', 'parent']                  // 只看自己的
  },

  // 宿舍管理
  dorm: {
    view: ['admin', 'head_teacher', 'class_cadre'],
    add: ['admin', 'head_teacher'],
    edit: ['admin', 'head_teacher'],
    delete: ['admin', 'head_teacher'],
    score: ['admin', 'head_teacher', 'class_cadre'],
    self: ['student', 'parent']
  },

  // 值日管理
  duty: {
    view: ['admin', 'head_teacher', 'class_cadre'],
    arrange: ['admin', 'head_teacher'],          // 安排
    check: ['admin', 'head_teacher', 'class_cadre'],  // 检查
    self: ['student', 'parent']                  // 只看自己的
  },

  // 处分管理
  discipline: {
    view: ['admin', 'head_teacher'],             // 查看所有处分
    add: ['admin', 'head_teacher'],               // 添加处分
    edit: ['admin', 'head_teacher'],              // 编辑处分
    delete: ['admin', 'head_teacher'],            // 删除处分
    config: ['admin', 'head_teacher'],            // 级别配置
    revoke_apply: ['student'],                     // 申请撤销
    revoke_review: ['admin', 'head_teacher'],      // 审核撤销
    self: ['student', 'parent']                   // 只看自己的处分
  },

  // 审批管理
  approval: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre'],
    approve: ['admin', 'head_teacher'],            // 审批
    submit: ['student', 'parent', 'class_cadre']   // 提交审批
  },

  // 学期管理
  semester: {
    view: ['admin', 'head_teacher'],
    add: ['admin', 'head_teacher'],
    edit: ['admin', 'head_teacher'],
    activate: ['admin', 'head_teacher']           // 激活学期
  },

  // 技能证书与技能大赛
  skill_cert: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    add: ['admin', 'head_teacher', 'class_cadre', 'student'],
    edit: ['admin', 'head_teacher'],
    delete: ['admin', 'head_teacher'],
    approve_first: ['admin', 'head_teacher', 'class_cadre'],
    approve_final: ['admin', 'head_teacher'],
    config_score: ['admin', 'head_teacher'],
    self: ['student', 'parent']
  },

  // 通知中心
  notification: {
    view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    send: ['admin', 'head_teacher'],              // 发送通知
    self: ['subject_teacher', 'class_cadre', 'student', 'parent']  // 只看自己的
  },

  // 班级成长管理
  growth: {
    dashboard: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre'],
    trend: ['admin', 'head_teacher', 'subject_teacher'],
    warning_view: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    warning_handle: ['admin', 'head_teacher'],
    ai_advice: ['admin', 'head_teacher'],
    ai_review: ['admin', 'head_teacher'],
    review_confirm: ['admin', 'head_teacher'],
    review_edit: ['admin', 'head_teacher'],
    review_batch: ['admin', 'head_teacher'],
    personal: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    deep_analysis: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    dev_advice: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre', 'student', 'parent'],
    summary: ['admin', 'head_teacher', 'subject_teacher', 'class_cadre']
  }
};

/**
 * 判断角色是否有指定模块的指定操作权限
 * @param {string} role - 角色标识
 * @param {string} module - 模块名
 * @param {string} action - 操作名
 * @returns {boolean}
 */
function hasPermission(role, module, action) {
  if (!PERMISSIONS[module]) return false;
  if (!PERMISSIONS[module][action]) return false;
  return PERMISSIONS[module][action].includes(role);
}

/**
 * 获取角色在指定模块可执行的操作列表
 * @param {string} role - 角色标识
 * @param {string} module - 模块名
 * @returns {string[]}
 */
function getActions(role, module) {
  if (!PERMISSIONS[module]) return [];
  const actions = [];
  for (const [action, roles] of Object.entries(PERMISSIONS[module])) {
    if (roles.includes(role)) {
      actions.push(action);
    }
  }
  return actions;
}

/**
 * 判断角色是否可以管理指定模块（拥有增删改权限之一）
 * @param {string} role - 角色标识
 * @param {string} module - 模块名
 * @returns {boolean}
 */
function canManage(role, module) {
  return hasPermission(role, module, 'add') || 
         hasPermission(role, module, 'edit') || 
         hasPermission(role, module, 'delete') ||
         hasPermission(role, module, 'manage');
}

/**
 * 获取角色标签
 * @param {string} role - 角色标识
 * @returns {string}
 */
function getRoleLabel(role) {
  return ROLE_LABELS[role] || '未知角色';
}

/**
 * 判断角色是否为管理员角色
 * @param {string} role
 * @returns {boolean}
 */
function isAdminRole(role) {
  return role === 'admin' || role === 'head_teacher';
}

/**
 * 判断角色是否为教师角色
 * @param {string} role
 * @returns {boolean}
 */
function isTeacherRole(role) {
  return role === 'admin' || role === 'head_teacher' || role === 'subject_teacher';
}

/**
 * 判断角色是否为学生/家长角色
 * @param {string} role
 * @returns {boolean}
 */
function isStudentOrParent(role) {
  return role === 'student' || role === 'parent';
}

/**
 * 判断是否有模块权限配置（角色优先，模块权限兜底）
 * @param {string} role - 角色标识
 * @param {string} module - 模块名
 * @param {string} action - 操作名，默认 'write'
 * @param {Object} modulePermissions - 模块权限配置，如 { score: ['read','write'], duty: ['read','write'] }
 * @returns {boolean}
 */
function hasModulePermission(role, module, action = 'write', modulePermissions) {
  if (['admin', 'head_teacher', 'subject_teacher'].includes(role)) return true;
  // 家长/班干部之外的普通学生才可使用模块授权，家长绝对禁止
  if (!['student', 'class_cadre'].includes(role)) return false;
  if (!modulePermissions) return false;
  const perms = modulePermissions[module] || [];
  return perms.includes(action);
}

/**
 * 综合判断是否可管理模块（角色canManage + 模块权限兜底）
 * @param {string} role - 角色标识
 * @param {string} module - 模块名
 * @param {Object} authorizations - 模块权限配置
 * @returns {boolean}
 */
function canManageWithModule(role, module, authorizations) {
  if (canManage(role, module)) return true;
  // 家长绝对禁止通过模块授权获得管理权限
  if (role === 'parent') return false;
  return hasModulePermission(role, module, 'write', authorizations);
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  hasPermission,
  getActions,
  canManage,
  getRoleLabel,
  isAdminRole,
  isTeacherRole,
  isStudentOrParent,
  hasModulePermission,
  canManageWithModule
};
