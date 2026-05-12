// pages/duty/arrange/arrange.js - 值日安排（任务分派）
const app = getApp();
const util = require('../../../utils/util.js');

Page({
  data: {
    loading: true,
    classId: '',
    mode: 'arrange', // 'arrange' 或 'rotation'
    // 日期
    dutyDate: '',
    // 值日小组列表
    dutyGroups: [],
    selectedGroupId: '',
    selectedGroup: null,
    groupMembers: [],
    // 任务模板
    templates: [],
    // 任务分派表
    assignments: [], // [{ student_id, student_name, template_id, task_name }]
    // 轮转配置
    rotation: null,
    rotationGroupIds: [],
    effectiveWeekdays: ['一', '二', '三', '四', '五'],
    rotationMode: 'daily',
    // 提交中
    submitting: false
  },

  onLoad: function (options) {
    const classId = app.globalData.class_id;
    const today = new Date();
    const todayStr = this.formatDate(today);

    this.setData({
      classId,
      dutyDate: options.duty_date || todayStr,
      mode: options.mode || 'arrange'
    });

    this.loadBaseData();
  },

  formatDate: function (date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  loadBaseData: async function () {
    this.setData({ loading: true });
    try {
      await Promise.all([
        this.loadDutyGroups(),
        this.loadTemplates(),
        this.loadRotation()
      ]);

      // 如果是轮转模式，选中已配置的小组
      if (this.data.mode === 'rotation' && this.data.rotation) {
        this.initRotationUI();
      }
    } catch (err) {
      console.error('加载基础数据失败:', err);
      util.showError('加载失败');
    }
    this.setData({ loading: false });
  },

  // 加载值日小组
  loadDutyGroups: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const res = await db.collection('student_groups')
        .where({
          class_id: this.data.classId,
          group_type: '值日小组',
          is_deleted: _.neq(true)
        })
        .get();

      const groups = res.data || [];

      // 如果没有值日小组，尝试获取所有小组
      if (groups.length === 0) {
        const allRes = await db.collection('student_groups')
          .where({
            class_id: this.data.classId,
            is_deleted: _.neq(true)
          })
          .get();
        this.setData({ dutyGroups: allRes.data || [] });
      } else {
        this.setData({ dutyGroups: groups });
      }
    } catch (err) {
      console.error('加载小组失败:', err);
    }
  },

  // 加载任务模板
  loadTemplates: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getTemplates',
          data: { class_id: this.data.classId }
        }
      });

      if (res.result && res.result.success) {
        this.setData({ templates: res.result.data || [] });
      }
    } catch (err) {
      console.error('加载模板失败:', err);
    }
  },

  // 加载轮转配置
  loadRotation: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'getRotation',
          data: { class_id: this.data.classId }
        }
      });

      if (res.result && res.result.success) {
        this.setData({ rotation: res.result.data });
      }
    } catch (err) {
      console.error('加载轮转配置失败:', err);
    }
  },

  initRotationUI: function () {
    const rotation = this.data.rotation;
    if (!rotation) return;

    this.setData({
      rotationGroupIds: rotation.group_ids || [],
      rotationMode: rotation.rotation_mode || 'daily',
      effectiveWeekdays: rotation.effective_weekdays || ['一', '二', '三', '四', '五']
    });
  },

  // 日期变更
  onDateChange: function (e) {
    this.setData({ dutyDate: e.detail.value });
  },

  // 选择小组
  onGroupSelect: function (e) {
    const groupId = e.currentTarget.dataset.id;
    const group = this.data.dutyGroups.find(g => g._id === groupId);

    if (!group) return;

    // 构建成员列表
    const members = [];
    if (group.leader_id && group.leader_name) {
      members.push({ student_id: group.leader_id, student_name: group.leader_name, is_leader: true });
    }
    if (group.members && group.members.length > 0) {
      group.members.forEach(m => {
        if (m.student_id !== group.leader_id) {
          members.push({ student_id: m.student_id, student_name: m.student_name, is_leader: false });
        }
      });
    }

    // 初始化任务分派表
    const assignments = members.map(m => ({
      student_id: m.student_id,
      student_name: m.student_name,
      is_leader: m.is_leader,
      template_id: '',
      task_name: ''
    }));

    this.setData({
      selectedGroupId: groupId,
      selectedGroup: group,
      groupMembers: members,
      assignments
    });
  },

  // 为某个成员选择任务
  onTaskSelect: function (e) {
    const idx = e.currentTarget.dataset.index;
    const templateId = e.detail.value;
    const template = this.data.templates[templateId];

    if (!template) return;

    this.setData({
      [`assignments[${idx}].template_id`]: template.template_id,
      [`assignments[${idx}].task_name`]: template.name
    });
  },

  // 快速分派：给每个成员分配不同的任务（轮流）
  onAutoAssign: function () {
    const { assignments, templates } = this.data;
    if (assignments.length === 0 || templates.length === 0) {
      wx.showToast({ title: '请先选择小组和创建模板', icon: 'none' });
      return;
    }

    const newAssignments = assignments.map((a, idx) => {
      const template = templates[idx % templates.length];
      return {
        ...a,
        template_id: template.template_id,
        task_name: template.name
      };
    });

    this.setData({ assignments: newAssignments });
    wx.showToast({ title: '已自动分配', icon: 'success' });
  },

  // 全部分配同一任务
  onAssignSameTask: function (e) {
    const templateId = e.currentTarget.dataset.id;
    const template = this.data.templates.find(t => t.template_id === templateId || t._id === templateId);
    if (!template) return;

    const newAssignments = this.data.assignments.map(a => ({
      ...a,
      template_id: template.template_id,
      task_name: template.name
    }));

    this.setData({ assignments: newAssignments });
  },

  // 免值某个成员
  onExemptMember: function (e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({
      [`assignments[${idx}].template_id`]: '',
      [`assignments[${idx}].task_name`]: '免值'
    });
  },

  // 提交任务分派
  onSubmit: async function () {
    const { classId, dutyDate, selectedGroupId, assignments } = this.data;

    if (!selectedGroupId) {
      wx.showToast({ title: '请先选择值日小组', icon: 'none' });
      return;
    }

    // 过滤有效分配（有任务的）
    const validAssignments = assignments.filter(a => a.task_name && a.task_name !== '免值');

    if (validAssignments.length === 0) {
      wx.showToast({ title: '请至少分配一个任务', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'arrangeDuty',
          data: {
            class_id: classId,
            duty_date: dutyDate,
            group_id: selectedGroupId,
            assignments: validAssignments
          }
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        const count = res.result.data.task_count || 0;
        util.showSuccess(`成功安排${count}个任务`);
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        util.showError(res.result.message || '安排失败');
      }
    } catch (err) {
      wx.hideLoading();
      console.error('提交任务失败:', err);
      util.showError('提交失败');
    }

    this.setData({ submitting: false });
  },

  // 保存轮转配置
  onSaveRotation: async function () {
    const { classId, dutyGroups, rotationMode, effectiveWeekdays } = this.data;

    // 获取已选中的值日小组ID
    const groupIds = dutyGroups.map(g => ({
      group_id: g._id,
      group_name: g.group_name
    }));

    if (groupIds.length === 0) {
      wx.showToast({ title: '没有可选的小组', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: {
          action: 'saveRotation',
          data: {
            class_id: classId,
            group_ids: groupIds,
            rotation_mode: rotationMode,
            effective_weekdays: effectiveWeekdays,
            auto_advance: true
          }
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        util.showSuccess('轮转配置已保存');
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        util.showError(res.result.message || '保存失败');
      }
    } catch (err) {
      wx.hideLoading();
      console.error('保存轮转配置失败:', err);
      util.showError('保存失败');
    }
  },

  // 轮转模式切换
  onRotationModeChange: function (e) {
    this.setData({ rotationMode: e.detail.value ? 'weekly' : 'daily' });
  },

  // 星期选择
  onWeekdayToggle: function (e) {
    const day = e.currentTarget.dataset.day;
    let { effectiveWeekdays } = this.data;
    const idx = effectiveWeekdays.indexOf(day);

    if (idx >= 0) {
      effectiveWeekdays.splice(idx, 1);
    } else {
      effectiveWeekdays.push(day);
    }

    this.setData({ effectiveWeekdays });
  }
});
