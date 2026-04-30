// pages/class/settings/settings.js
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    classId: '',
    classInfo: null,
    settings: {
      score_enabled: true,
      volunteer_enabled: true,
      attendance_enabled: false,
      mall_enabled: true,
      discipline_enabled: true,
      enable_dorm_management: false
    },
    loading: true
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ classId: options.id });
      this.loadData();
    }
  },

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();

      // 加载班级基本信息
      const classRes = await db.collection('classes').doc(this.data.classId).get();

      if (!classRes.data) {
        this.setData({ loading: false });
        util.showError('班级不存在');
        return;
      }

      const classInfo = classRes.data;

      // 加载班级设置（从 class_settings 集合）
      let settings = this.data.settings;
      try {
        const settingsRes = await db.collection('class_settings')
          .where({ class_id: this.data.classId })
          .get();

        if (settingsRes.data && settingsRes.data.length > 0) {
          const classSettings = settingsRes.data[0];

          // 将 class_settings 的字段映射到 settings 对象
          settings = {
            score_enabled: classSettings.score_rules !== undefined,
            volunteer_enabled: classSettings.feature_flags?.enable_volunteer !== false,
            attendance_enabled: classSettings.feature_flags?.enable_duty !== false,
            mall_enabled: true,
            discipline_enabled: true,
            enable_dorm_management: classSettings.feature_flags?.enable_dorm || false
          };
        }
      } catch (settingsErr) {
        console.error('加载班级设置失败，使用默认值:', settingsErr);
      }

      this.setData({
        classInfo: {
          ...classInfo,
          created_at: classInfo.created_at ? util.formatDate(new Date(classInfo.created_at)) : ''
        },
        settings,
        loading: false
      });
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 切换功能开关
  onToggleSetting: async function (e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;

    // 先保存原始值，以便失败时恢复
    const originalValue = this.data.settings[key];

    // 立即更新UI
    this.setData({
      [`settings.${key}`]: value
    });

    try {
      const db = wx.cloud.database();

      // 先检查是否已存在 class_settings 记录
      const existingRes = await db.collection('class_settings')
        .where({ class_id: this.data.classId })
        .get();

      // 获取当前的settings值（使用更新后的值）
      const currentSettings = { ...this.data.settings, [key]: value };
      // 优先使用数据库中原本存在的值（existingRes），如果不存在则使用当前页面的值
      const existingFeatureFlags = existingRes.data?.[0]?.feature_flags || {};

      // 构建要保存的 feature_flags 数据
      const featureFlags = {
      enable_volunteer: currentSettings.volunteer_enabled,
      // 修复点：这里直接取 value，不要用三元表达式覆盖
      enable_dorm: value, 
      enable_competition: false,
      enable_duty: currentSettings.attendance_enabled
      };

      // 构建完整的 class_settings 数据
      const classSettingsData = {
        class_id: this.data.classId,
        volunteer_score_per_hour: 2,
        score_rules: currentSettings.score_enabled ? {
          max_score_per_day: -1,
          min_score_per_action: 1,
          score_expire_days: -1
        } : undefined,
        feature_flags: featureFlags,
        notification_settings: {
          remind_before_days: 1,
          notify_on_birthday: true,
          notify_on_schedule: true
        },
        updated_at: db.serverDate()
      };

      if (existingRes.data && existingRes.data.length > 0) {
        // 更新现有记录
        await db.collection('class_settings').doc(existingRes.data[0]._id).update({
          data: classSettingsData
        });
      } else {
        // 创建新记录
        await db.collection('class_settings').add({
          data: {
            ...classSettingsData,
            created_at: db.serverDate()
          }
        });
      }

      util.showSuccess('设置已保存');
    } catch (err) {
      console.error('保存设置失败:', err);
      util.showError('保存失败');
      // 恢复原值
      this.setData({
        [`settings.${key}`]: originalValue
      });
    }
  },

  // 标记为毕业班级
  onMarkGraduated: function () {
    wx.showModal({
      title: '确认操作',
      content: '标记为毕业班级后，该班级将不再显示在活跃班级列表中。确定继续吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...', mask: true });

            const db = wx.cloud.database();
            await db.collection('classes').doc(this.data.classId).update({
              data: {
                status: 'graduated',
                graduated_at: db.serverDate(),
                updated_at: db.serverDate()
              }
            });

            wx.hideLoading();
            util.showSuccess('已标记为毕业班级');
            this.loadData();
          } catch (err) {
            console.error('操作失败:', err);
            wx.hideLoading();
            util.showError('操作失败');
          }
        }
      }
    });
  },

  // 转让班级
  onTransferClass: function () {
    wx.showModal({
      title: '转让班级',
      content: '请输入新管理员的手机号',
      editable: true,
      placeholderText: '请输入手机号',
      success: async (res) => {
        if (res.confirm && res.content) {
          const phone = res.content.trim();

          if (!/^1[3-9]\d{9}$/.test(phone)) {
            util.showError('请输入正确的手机号');
            return;
          }

          try {
            wx.showLoading({ title: '转让中...', mask: true });

            // 这里需要实现查找用户并转让的逻辑
            // 简化处理：直接更新creator_phone
            const db = wx.cloud.database();
            await db.collection('classes').doc(this.data.classId).update({
              data: {
                creator_phone: phone,
                updated_at: db.serverDate()
              }
            });

            wx.hideLoading();
            util.showSuccess('转让成功');
            this.loadData();
          } catch (err) {
            console.error('转让失败:', err);
            wx.hideLoading();
            util.showError('转让失败');
          }
        }
      }
    });
  },

  // 解散班级
  onDissolveClass: function () {
    wx.showModal({
      title: '确认解散',
      content: '解散班级将删除所有相关数据，此操作不可恢复！确定要解散吗？',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '再次确认',
            content: '您真的要解散班级吗？所有学生数据将被清除！',
            confirmColor: '#ff4d4f',
            success: async (res2) => {
              if (res2.confirm) {
                try {
                  wx.showLoading({ title: '解散中...', mask: true });

                  const db = wx.cloud.database();

                  // 删除班级下的所有学生
                  const studentsRes = await db.collection('students')
                    .where({ class_id: this.data.classId })
                    .get();

                  for (const student of studentsRes.data) {
                    await db.collection('students').doc(student._id).remove();
                  }

                  // 删除班级
                  await db.collection('classes').doc(this.data.classId).remove();

                  wx.hideLoading();
                  util.showSuccess('班级已解散');

                  setTimeout(() => {
                    wx.navigateBack({ delta: 2 });
                  }, 1500);
                } catch (err) {
                  console.error('解散失败:', err);
                  wx.hideLoading();
                  util.showError('解散失败');
                }
              }
            }
          });
        }
      }
    });
  }
});
