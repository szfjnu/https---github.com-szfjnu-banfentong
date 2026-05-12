/**
 * 处分管理模块共享工具函数
 * 将 WXML 中复杂的 style 计算逻辑移至 JS 层处理
 */

/**
 * 计算级别徽章的样式
 * @param {string} color - 颜色值，如 '#faad14'
 * @returns {string} CSS 样式字符串
 */
function getLevelBadgeStyle(color) {
  const c = color || '#faad14';
  return `background: ${c}20; color: ${c}`;
}

/**
 * 计算进度条宽度百分比
 * @param {number} completed - 已完成数量
 * @param {number} required - 要求数量
 * @returns {string} CSS width 样式
 */
function getProgressWidth(completed, required) {
  const width = required > 0 ? Math.min((completed || 0) / required * 100, 100) : 0;
  return `width: ${width}%`;
}

/**
 * 获取处分状态显示文本
 * @param {string} status - 状态值
 * @returns {string} 中文显示文本
 */
function getDisciplineStatusText(status) {
  const map = {
    'active': '生效中',
    'revoked': '已撤销',
    'deleted': '已删除'
  };
  return map[status] || status || '';
}

/**
 * 获取审核状态显示文本
 * @param {string} status - 审核状态值
 * @returns {string} 中文显示文本
 */
function getReviewStatusText(status) {
  const map = {
    'pending': '待审核',
    'approved': '已通过',
    'rejected': '已拒绝'
  };
  return map[status] || status || '';
}

/**
 * 获取撤销申请状态显示文本
 * @param {string} status - 撤销申请状态值
 * @returns {string} 中文显示文本
 */
function getRevokeStatusText(status) {
  const map = {
    'pending': '待审核',
    'approved': '已批准',
    'rejected': '已拒绝'
  };
  return map[status] || status || '';
}

/**
 * 为处分记录列表项添加预计算样式字段
 * @param {Object} item - 处分记录对象
 * @returns {Object} 添加了样式字段的记录
 */
function processRecordItem(item) {
  if (!item) return item;
  item._levelBadgeStyle = getLevelBadgeStyle(item.levelColor);
  item._statusText = getDisciplineStatusText(item.status);
  if (item.status === 'active') {
    item._thoughtProgressWidth = getProgressWidth(item.thought_completed, item.thought_reports_required);
    item._serviceProgressWidth = getProgressWidth(item.service_completed_hours, item.service_hours_required);
  }
  return item;
}

/**
 * 为处分详情记录添加预计算样式字段
 * @param {Object} record - 处分详情记录对象
 * @returns {Object} 添加了样式字段的记录
 */
function processRecordDetail(record) {
  if (!record) return record;
  record._levelBadgeStyle = getLevelBadgeStyle(record.levelColor);
  record._statusText = getDisciplineStatusText(record.status);
  record._thoughtProgressWidth = getProgressWidth(record.thought_completed, record.thought_reports_required);
  record._serviceProgressWidth = getProgressWidth(record.service_completed_hours, record.service_hours_required);

  // 处理撤销申请列表
  if (record.revocationApplications && record.revocationApplications.length > 0) {
    record.revocationApplications = record.revocationApplications.map(app => ({
      ...app,
      _statusText: getRevokeStatusText(app.status)
    }));
  }

  // 处理思想汇报列表
  if (record.thoughtReports && record.thoughtReports.length > 0) {
    record.thoughtReports = record.thoughtReports.map(report => ({
      ...report,
      _statusText: getReviewStatusText(report.status)
    }));
  }

  // 处理服务令列表
  if (record.serviceRecords && record.serviceRecords.length > 0) {
    record.serviceRecords = record.serviceRecords.map(service => ({
      ...service,
      _statusText: getReviewStatusText(service.status)
    }));
  }

  return record;
}

/**
 * 为级别配置列表项添加预计算样式字段
 * @param {Object} item - 级别配置项
 * @returns {Object} 添加了样式字段的配置项
 */
function processLevelItem(item) {
  if (!item) return item;
  item._badgeStyle = getLevelBadgeStyle(item.color);
  return item;
}

module.exports = {
  getLevelBadgeStyle,
  getProgressWidth,
  getDisciplineStatusText,
  getReviewStatusText,
  getRevokeStatusText,
  processRecordItem,
  processRecordDetail,
  processLevelItem
};
