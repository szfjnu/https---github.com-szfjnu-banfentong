// pages/score/rules/version/version.js
const app = getApp();
const util = require('../../../../utils/util.js');

Page({
  data: {
    loading: true,
    ruleId: '',
    ruleName: '',
    versions: [],
    selectedVersions: [],
    showCompareModal: false,
    compareData: null
  },

  onLoad: function (options) {
    if (options.rule_id) {
      this.setData({
        ruleId: options.rule_id,
        ruleName: decodeURIComponent(options.rule_name || '规则')
      });
      this.loadVersions(options.rule_id);
    } else {
      util.showError('参数错误');
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 加载版本列表
  loadVersions: async function (ruleId) {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const _ = db.command;

      // 查询该规则的所有版本
      const res = await db.collection('score_rule_versions')
        .where({
          rule_id: ruleId
        })
        .orderBy('created_at', 'desc')
        .get();

      const versions = (res.data || []).map(v => {
        // 状态标签
        let statusClass = '';
        let statusLabel = '';
        if (v.is_active) {
          statusClass = 'active';
          statusLabel = '当前版本';
        } else if (v.is_stable) {
          statusClass = 'stable';
          statusLabel = '稳定版本';
        } else {
          statusClass = 'deprecated';
          statusLabel = '已废弃';
        }

        // 格式化时间
        let created_at_str = '';
        if (v.created_at) {
          created_at_str = util.formatDateTime(new Date(v.created_at));
        }

        return {
          ...v,
          status_class: statusClass,
          status_label: statusLabel,
          created_at_str: created_at_str
        };
      });

      this.setData({
        versions,
        loading: false
      });

      console.log('加载版本列表成功，共', versions.length, '个版本');

    } catch (err) {
      console.error('加载版本失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 选择版本
  onSelectVersion: function (e) {
    const version = e.currentTarget.dataset.version;
    const selectedVersions = [...this.data.selectedVersions];

    // 检查是否已选择
    const existIndex = selectedVersions.findIndex(v => v.version_id === version.version_id);

    if (existIndex >= 0) {
      // 取消选择
      selectedVersions.splice(existIndex, 1);
    } else {
      // 添加选择（最多2个）
      if (selectedVersions.length >= 2) {
        selectedVersions.shift(); // 移除最早的
      }
      selectedVersions.push(version);
    }

    this.setData({ selectedVersions });
  },

  // 查看版本详情
  onViewVersion: function (e) {
    const version = e.currentTarget.dataset.version;

    wx.showModal({
      title: `版本 ${version.version_number}`,
      content: `积分值: ${version.score_value}\n分类: ${version.category_id}\n创建人: ${version.created_by_name}\n时间: ${version.created_at_str}\n变更说明: ${version.change_description || '无'}`,
      showCancel: false
    });
  },

  // 对比版本
  onCompareVersions: function () {
    const { selectedVersions } = this.data;

    if (selectedVersions.length !== 2) {
      util.showError('请选择2个版本进行对比');
      return;
    }

    // 按 created_at 排序，确保 oldVersion 是旧版本
    const sorted = [...selectedVersions].sort((a, b) => {
      return new Date(a.created_at) - new Date(b.created_at);
    });

    const oldVersion = sorted[0];
    const newVersion = sorted[1];

    // 计算变更字段
    const changes = [];
    const compareFields = [
      { key: 'rule_name', label: '规则名称' },
      { key: 'rule_code', label: '规则编码' },
      { key: 'score_value', label: '积分值' },
      { key: 'category_id', label: '分类' },
      { key: 'description', label: '描述' }
    ];

    compareFields.forEach(field => {
      if (oldVersion[field.key] !== newVersion[field.key]) {
        changes.push({
          field: field.key,
          label: field.label,
          old_value: oldVersion[field.key],
          new_value: newVersion[field.key]
        });
      }
    });

    this.setData({
      showCompareModal: true,
      compareData: {
        oldVersion,
        newVersion,
        changes
      }
    });
  },

  // 关闭对比弹窗
  onCloseCompareModal: function () {
    this.setData({
      showCompareModal: false,
      compareData: null
    });
  },

  // 回滚到指定版本
  onRollback: async function (e) {
    const version = e.currentTarget.dataset.version;

    wx.showModal({
      title: '确认回滚',
      content: `确定要回滚到版本 ${version.version_number} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '回滚中...', mask: true });

            const db = wx.cloud.database();
            const _ = db.command;

            // 1. 将当前活跃版本设为非活跃
            await db.collection('score_rule_versions')
              .where({
                rule_id: version.rule_id,
                is_active: true
              })
              .update({
                data: {
                  is_active: false,
                  deprecated_at: db.serverDate()
                }
              });

            // 2. 将目标版本设为活跃
            await db.collection('score_rule_versions')
              .doc(version._id)
              .update({
                data: {
                  is_active: true,
                  activated_at: db.serverDate()
                }
              });

            // 3. 更新 score_records 中的规则
            await db.collection('score_records')
              .where({
                record_id: version.rule_id
              })
              .update({
                data: {
                  rule_name: version.rule_name,
                  rule_code: version.rule_code,
                  score_value: version.score_value,
                  category_id: version.category_id,
                  description: version.description,
                  updated_at: db.serverDate()
                }
              });

            wx.hideLoading();
            util.showSuccess('回滚成功');
            this.loadVersions(version.rule_id);

          } catch (err) {
            console.error('回滚失败:', err);
            wx.hideLoading();
            util.showError('回滚失败');
          }
        }
      }
    });
  },

  preventBubble() {},
});