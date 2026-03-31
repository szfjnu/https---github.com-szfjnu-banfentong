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
      discipline_enabled: true
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
      const res = await db.collection('classes').doc(this.data.classId).get();

      if (res.data) {
        const classInfo = res.data;
        this.setData({
          classInfo: {
            ...classInfo,
            created_at: classInfo.created_at ? util.formatDate(new Date(classInfo.created_at)) : ''
          },
          settings: classInfo.settings || this.data.settings,
          loading: false
        });
      }
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

    this.setData({
      [`settings.${key}`]: value
    });

    try {
      const db = wx.cloud.database();
      await db.collection('classes').doc(this.data.classId).update({
        data: {
          [`settings.${key}`]: value,
          updated_at: db.serverDate()
        }
      });

      util.showSuccess('设置已保存');
    } catch (err) {
      console.error('保存设置失败:', err);
      util.showError('保存失败');
      // 恢复原值
      this.setData({
        [`settings.${key}`]: !value
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
