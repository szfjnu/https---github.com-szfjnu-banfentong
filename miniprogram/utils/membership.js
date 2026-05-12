/**
 * 会员权限管理工具
 * 用于检查用户的会员状态和功能权限
 */

// 延迟初始化数据库（避免在云开发初始化前调用）
let _db = null;
let _ = null;

function getDb() {
  if (!_db) {
    _db = wx.cloud.database();
    _ = _db.command;
  }
  return _db;
}

function getCmd() {
  if (!_) {
    getDb();
  }
  return _;
}

/**
 * 会员等级常量
 */
const MEMBERSHIP_LEVELS = {
  FREE: 'free',           // 免费用户
  BASIC: 'basic',         // 基础版
  PRO: 'pro',             // 专业版
  ENTERPRISE: 'enterprise' // 企业版
};

/**
 * 会员状态常量
 */
const MEMBERSHIP_STATUS = {
  ACTIVE: 'active',       // 有效
  EXPIRED: 'expired',     // 已过期
  CANCELLED: 'cancelled', // 已取消
  PENDING: 'pending'      // 待支付
};

/**
 * 默认会员权限配置
 */
const DEFAULT_PERMISSIONS = {
  [MEMBERSHIP_LEVELS.FREE]: {
    can_create_class: true,
    max_classes: 1,
    max_students_per_class: 50,
    can_authorize_admin: false,
    can_export_data: false,
    can_use_advanced_analytics: false,
    can_use_ai_features: false,
    storage_quota_mb: 100,
    history_retention_days: 30
  },
  [MEMBERSHIP_LEVELS.BASIC]: {
    can_create_class: true,
    max_classes: 1,
    max_students_per_class: 50,
    can_authorize_admin: true,
    can_export_data: false,
    can_use_advanced_analytics: false,
    can_use_ai_features: false,
    storage_quota_mb: 500,
    history_retention_days: 180
  },
  [MEMBERSHIP_LEVELS.PRO]: {
    can_create_class: true,
    max_classes: 5,
    max_students_per_class: 200,
    can_authorize_admin: true,
    can_export_data: true,
    can_use_advanced_analytics: true,
    can_use_ai_features: false,
    can_import_schedule_excel: true,
    can_import_grade_excel: true,
    storage_quota_mb: 2048,
    history_retention_days: 365
  },
  [MEMBERSHIP_LEVELS.ENTERPRISE]: {
    can_create_class: true,
    max_classes: -1,
    max_students_per_class: -1,
    can_authorize_admin: true,
    can_export_data: true,
    can_use_advanced_analytics: true,
    can_use_ai_features: true,
    can_import_schedule_excel: true,
    can_import_grade_excel: true,
    storage_quota_mb: 10240,
    history_retention_days: -1
  }
};

/**
 * 获取用户会员信息
 * @param {string} openid 用户openid
 * @returns {Promise<Object>} 会员信息
 */
async function getUserMembership(openid) {
  try {
    const db = getDb();
    const res = await db.collection('users').where({
      _openid: openid
    }).field({
      membership: true,
      membership_permissions: true,
      membership_usage: true,
      role: true
    }).get();

    if (res.data.length === 0) {
      return null;
    }

    const user = res.data[0];
    const membership = user.membership || {
      level: MEMBERSHIP_LEVELS.FREE,
      status: MEMBERSHIP_STATUS.ACTIVE
    };

    // 检查会员是否过期
    if (membership.expire_date && new Date(membership.expire_date) < new Date()) {
      membership.status = MEMBERSHIP_STATUS.EXPIRED;
      membership.level = MEMBERSHIP_LEVELS.FREE;
    }

    // 获取权限（用户自定义权限或默认权限）
    const permissions = user.membership_permissions || 
      DEFAULT_PERMISSIONS[membership.level] || 
      DEFAULT_PERMISSIONS[MEMBERSHIP_LEVELS.FREE];

    return {
      ...membership,
      permissions,
      usage: user.membership_usage || {
        classes_created: 0,
        storage_used_mb: 0
      },
      role: user.role
    };
  } catch (err) {
    console.error('获取会员信息失败:', err);
    return null;
  }
}

/**
 * 检查用户是否有某个功能权限
 * @param {string} openid 用户openid
 * @param {string} featureCode 功能代码
 * @returns {Promise<Object>} { allowed: boolean, reason: string }
 */
async function checkFeatureAccess(openid, featureCode) {
  try {
    let membership = await getUserMembership(openid);
    
    if (!membership) {
      if (featureCode === 'create_class') {
        return { allowed: true, reason: '' };
      }
      return { allowed: false, reason: '用户不存在' };
    }

    // 管理员拥有所有权限
    if (membership.role === 'admin') {
      return { allowed: true, reason: '' };
    }

    // 检查会员状态
    if (membership.status === MEMBERSHIP_STATUS.EXPIRED) {
      return { allowed: false, reason: '会员已过期，请续费后继续使用' };
    }

    if (membership.status !== MEMBERSHIP_STATUS.ACTIVE) {
      return { allowed: false, reason: '会员状态异常' };
    }

    // 根据功能代码检查权限
    const permissions = membership.permissions;
    let allowed = false;
    let reason = '';

    switch (featureCode) {
      case 'create_class':
        allowed = permissions.can_create_class;
        reason = allowed ? '' : '免费用户无法创建班级，请升级会员';
        // 检查配额
        if (allowed && permissions.max_classes > 0) {
          const usage = membership.usage;
          if (usage.classes_created >= permissions.max_classes) {
            allowed = false;
            reason = `已达到创建班级上限（${permissions.max_classes}个），请升级会员`;
          }
        }
        break;

      case 'authorize_admin':
        allowed = permissions.can_authorize_admin;
        reason = allowed ? '' : '当前会员等级不支持授权管理功能';
        break;

      case 'export_data':
        allowed = permissions.can_export_data;
        reason = allowed ? '' : '数据导出功能仅限专业版及以上会员使用';
        break;

      case 'advanced_analytics':
        allowed = permissions.can_use_advanced_analytics;
        reason = allowed ? '' : '高级分析功能仅限专业版及以上会员使用';
        break;

      case 'ai_features':
        allowed = permissions.can_use_ai_features;
        reason = allowed ? '' : 'AI功能仅限企业版会员使用';
        break;

      case 'import_schedule_excel':
        allowed = permissions.can_import_schedule_excel || false;
        reason = allowed ? '' : '课表Excel导入功能仅限专业版及以上会员使用';
        break;

      case 'import_grade_excel':
        allowed = permissions.can_import_grade_excel || false;
        reason = allowed ? '' : '成绩Excel导入功能仅限专业版及以上会员使用，请升级会员';
        break;

      default:
        allowed = false;
        reason = '未知功能';
    }

    // 记录访问日志
    await logFeatureAccess(openid, featureCode, allowed, reason);

    return { allowed, reason };
  } catch (err) {
    console.error('检查权限失败:', err);
    return { allowed: false, reason: '权限检查失败，请重试' };
  }
}

/**
 * 检查创建班级权限
 * @param {string} openid 用户openid
 * @returns {Promise<Object>} { allowed: boolean, reason: string, remaining: number }
 */
async function checkCreateClassPermission(openid) {
  try {
    let membership = await getUserMembership(openid);
    
    if (!membership) {
      await initUserMembership(openid);
      membership = await getUserMembership(openid);
      if (!membership) {
        return { allowed: true, reason: '', remaining: 1 };
      }
    }

    // 管理员拥有所有权限
    if (membership.role === 'admin') {
      return { allowed: true, reason: '', remaining: -1 };
    }

    // 检查会员状态
    if (membership.status === MEMBERSHIP_STATUS.EXPIRED) {
      return { 
        allowed: false, 
        reason: '会员已过期，请续费后继续使用', 
        remaining: 0 
      };
    }

    const permissions = membership.permissions;
    
    if (!permissions.can_create_class) {
      return { 
        allowed: true, 
        reason: '', 
        remaining: 1
      };
    }

    const usage = membership.usage;
    const maxClasses = permissions.max_classes;
    const remaining = maxClasses === -1 ? -1 : Math.max(0, maxClasses - usage.classes_created);

    if (maxClasses > 0 && usage.classes_created >= maxClasses) {
      return { 
        allowed: false, 
        reason: `已达到创建班级上限（${maxClasses}个），请升级会员`, 
        remaining: 0 
      };
    }

    return { allowed: true, reason: '', remaining };
  } catch (err) {
    console.error('检查创建班级权限失败:', err);
    return { allowed: false, reason: '权限检查失败', remaining: 0 };
  }
}

/**
 * 更新用户使用量
 * @param {string} openid 用户openid
 * @param {string} type 更新类型
 * @param {number} delta 变化量
 */
async function updateUsage(openid, type, delta) {
  try {
    await wx.cloud.callFunction({
      name: 'manageUserCenter',
      data: {
        action: 'updateUsage',
        data: { openid, type, delta }
      }
    });
  } catch (err) {
    console.error('更新使用量失败:', err);
  }
}

/**
 * 记录功能访问日志
 * @param {string} openid 用户openid
 * @param {string} featureCode 功能代码
 * @param {boolean} allowed 是否允许
 * @param {string} reason 原因
 */
async function logFeatureAccess(openid, featureCode, allowed, reason) {
  try {
    const featureNames = {
      'create_class': '创建班级',
      'authorize_admin': '授权管理',
      'export_data': '数据导出',
      'advanced_analytics': '高级分析',
      'ai_features': 'AI功能',
      'import_schedule_excel': '课表Excel导入',
      'import_grade_excel': '成绩Excel导入'
    };

    await wx.cloud.callFunction({
      name: 'manageUserCenter',
      data: {
        action: 'logFeatureAccess',
        data: {
          openid,
          feature_code: featureCode,
          feature_name: featureNames[featureCode] || featureCode,
          allowed,
          reason
        }
      }
    });
  } catch (err) {
    console.error('记录访问日志失败:', err);
  }
}

/**
 * 初始化用户会员信息
 * @param {string} openid 用户openid
 */
async function initUserMembership(openid) {
  try {
    const db = getDb();
    const res = await db.collection('users').where({
      _openid: openid
    }).field({
      membership: true
    }).get();

    if (res.data.length > 0 && res.data[0].membership) {
      return;
    }

    await wx.cloud.callFunction({
      name: 'manageUserCenter',
      data: {
        action: 'initUserMembership',
        data: {
          openid,
          membership: {
            level: MEMBERSHIP_LEVELS.FREE,
            status: MEMBERSHIP_STATUS.ACTIVE,
            auto_renew: false,
            days_remaining: -1
          },
          permissions: DEFAULT_PERMISSIONS[MEMBERSHIP_LEVELS.FREE],
          usage: {
            classes_created: 0,
            storage_used_mb: 0
          },
          invite_code: generateInviteCode()
        }
      }
    });
  } catch (err) {
    console.error('初始化会员信息失败:', err);
  }
}

/**
 * 生成邀请码
 * @returns {string} 邀请码
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 获取会员等级显示名称
 * @param {string} level 会员等级
 * @returns {string} 显示名称
 */
function getMembershipLevelName(level) {
  const names = {
    [MEMBERSHIP_LEVELS.FREE]: '免费用户',
    [MEMBERSHIP_LEVELS.BASIC]: '基础版',
    [MEMBERSHIP_LEVELS.PRO]: '专业版',
    [MEMBERSHIP_LEVELS.ENTERPRISE]: '企业版'
  };
  return names[level] || '未知';
}

/**
 * 获取会员状态显示名称
 * @param {string} status 会员状态
 * @returns {string} 显示名称
 */
function getMembershipStatusName(status) {
  const names = {
    [MEMBERSHIP_STATUS.ACTIVE]: '有效',
    [MEMBERSHIP_STATUS.EXPIRED]: '已过期',
    [MEMBERSHIP_STATUS.CANCELLED]: '已取消',
    [MEMBERSHIP_STATUS.PENDING]: '待支付'
  };
  return names[status] || '未知';
}

module.exports = {
  MEMBERSHIP_LEVELS,
  MEMBERSHIP_STATUS,
  DEFAULT_PERMISSIONS,
  getUserMembership,
  checkFeatureAccess,
  checkCreateClassPermission,
  updateUsage,
  initUserMembership,
  getMembershipLevelName,
  getMembershipStatusName,
  generateInviteCode
};
