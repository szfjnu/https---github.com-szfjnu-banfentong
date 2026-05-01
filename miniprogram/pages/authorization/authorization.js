// pages/authorization/authorization.js
// 系统授权管理页面 - 复选框交互 + 级联逻辑 + 事件冒泡修复
const app = getApp();

// 权限模块定义（approve 审批权限）
const PERMISSION_MODULES = [
  { key: 'score', label: '积分管理', actions: ['read', 'write', 'approve'] },
  { key: 'attendance', label: '考勤管理', actions: ['read', 'write', 'approve'] },
  { key: 'duty', label: '值日管理', actions: ['read', 'write', 'approve'] },
  { key: 'dorm', label: '宿舍管理', actions: ['read', 'write', 'approve'] },
  { key: 'volunteer', label: '志愿服务', actions: ['read', 'write', 'approve'] },
  { key: 'discipline', label: '处分管理', actions: ['read', 'approve'] },
  { key: 'notification', label: '通知管理', actions: ['read', 'write'] }
];

const ACTION_LABELS = { read: '查看', write: '编辑', approve: '审批' };

// 级联规则：选中高级自动勾选低级，取消低级自动取消高级
const CASCADE_ON_CHECK = {
  approve: ['write', 'read'],
  write: ['read']
};
const CASCADE_ON_UNCHECK = {
  read: ['write', 'approve'],
  write: ['approve']
};

Page({
  data: {
    loading: true,
    classId: '',
    students: [],
    filteredStudents: [],
    searchKeyword: '',
    selectedPosition: '',
    positionOptions: [
      { value: '', label: '全部' },
      { value: '班长', label: '班长' },
      { value: '班主任助理', label: '班主任助理' },
      { value: '学习委员', label: '学习委员' },
      { value: '团支部书记', label: '团支书' },
      { value: '卫生委员', label: '卫生委员' },
      { value: '体育委员', label: '体育委员' },
      { value: '生活委员', label: '生活委员' },
      { value: '课代表', label: '课代表' }
    ],
    permissionModules: PERMISSION_MODULES,
    actionLabels: ACTION_LABELS,
    // 单个学生权限弹窗
    showSingleModal: false,
    currentStudent: null,
    currentModuleList: [],
    currentPermMap: {},
    // 批量授权弹窗
    showBatchModal: false,
    batchPermissions: {},
    batchPermMap: {},
    submitting: false,
    // 选中状态
    selectedStudentIds: [],
    selectAll: false
  },

  onLoad: function () {
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher') {
      wx.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ classId: app.globalData.class_id });
    this.loadData();
  },

  onPullDownRefresh: function () {
    this.loadData();
  },

  loadData: async function () {
    this.setData({ loading: true });
    try {
      await Promise.all([this.loadStudents(), this.loadAuthorizations()]);
    } catch (err) {
      console.error('加载数据失败:', err);
    }
    this.setData({ loading: false });
    wx.stopPullDownRefresh();
  },

  loadStudents: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const res = await db.collection('students')
        .where({ class_id: this.data.classId, status: _.neq('graduated') })
        .orderBy('name', 'asc')
        .limit(200)
        .get();

      const students = (res.data || []).map(s => ({
        ...s,
        name: s.name || s.student_name || '',
        isSelected: false,
        permissions: {}
      }));
      this.setData({ students, filteredStudents: students });
    } catch (err) {
      console.error('加载学生列表失败:', err);
    }
  },

  loadAuthorizations: async function () {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('student_authorizations')
        .where({ class_id: this.data.classId })
        .limit(200)
        .get();

      const authMap = {};
      (res.data || []).forEach(auth => {
        authMap[auth.student_id] = auth.permissions || {};
      });

      const students = this.data.students.map(s => ({
        ...s,
        permissions: authMap[s.student_id] || {}
      }));
      this.setData({ students });
      this.filterStudents();
    } catch (err) {
      console.error('加载授权数据失败:', err);
      if (err.errCode === -502005) {
        this.filterStudents();
      }
    }
  },

  filterStudents: function () {
    const { students, selectedPosition, searchKeyword } = this.data;
    let filtered = [...students];
    if (selectedPosition) {
      filtered = filtered.filter(s => s.position === selectedPosition);
    }
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      filtered = filtered.filter(s =>
        (s.name && s.name.toLowerCase().includes(kw)) ||
        (s.student_id && s.student_id.toLowerCase().includes(kw))
      );
    }
    this.setData({ filteredStudents: filtered });
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
    this.filterStudents();
  },

  onPositionFilter: function (e) {
    const idx = Number(e.detail.value);
    const position = this.data.positionOptions[idx];
    if (!position) return;
    this.setData({ selectedPosition: position.value });
    this.filterStudents();
  },

  // 选中/取消选中学生
  onToggleSelect: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const students = this.data.students.map(s => ({
      ...s,
      isSelected: s.student_id === studentId ? !s.isSelected : s.isSelected
    }));
    const selectedStudentIds = students.filter(s => s.isSelected).map(s => s.student_id);
    this.setData({ students, selectedStudentIds, selectAll: false });
    this.filterStudents();
  },

  onToggleSelectAll: function () {
    const selectAll = !this.data.selectAll;
    const filteredIds = this.data.filteredStudents.map(s => s.student_id);
    const students = this.data.students.map(s => ({
      ...s,
      isSelected: selectAll && filteredIds.includes(s.student_id)
    }));
    const selectedStudentIds = selectAll ? filteredIds : [];
    this.setData({ students, selectedStudentIds, selectAll });
    this.filterStudents();
  },

  // ========== 单个学生权限弹窗 ==========

  onViewStudentAuth: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const student = this.data.students.find(s => s.student_id === studentId);
    if (!student) return;

    const permissions = student.permissions || {};
    const moduleList = PERMISSION_MODULES.map(m => ({
      key: m.key,
      label: m.label,
      actions: m.actions,
      currentActions: [...(permissions[m.key] || [])]
    }));

    // 扁平化权限映射：{ "score_read": true, "score_write": false, ... }
    const permMap = {};
    PERMISSION_MODULES.forEach(m => {
      const modPerms = permissions[m.key] || [];
      m.actions.forEach(a => {
        permMap[`${m.key}_${a}`] = modPerms.includes(a);
      });
    });

    this.setData({
      showSingleModal: true,
      currentStudent: { ...student },
      currentModuleList: moduleList,
      currentPermMap: permMap
    });
  },

  // 复选框切换 - 带级联逻辑（扁平化权限映射驱动视图）
  onCheckPermission: function (e) {
    const { module: moduleKey, action } = e.currentTarget.dataset;
    console.log('[权限调试] onCheckPermission触发, module:', moduleKey, 'action:', action);

    const permMap = { ...this.data.currentPermMap };
    const permKey = `${moduleKey}_${action}`;
    const isChecked = !!permMap[permKey];

    const updateData = {};

    if (isChecked) {
      // 取消勾选 → 级联取消高级权限
      const cascadeRemove = CASCADE_ON_UNCHECK[action] || [];
      const toRemove = [action, ...cascadeRemove];
      toRemove.forEach(a => {
        const key = `${moduleKey}_${a}`;
        permMap[key] = false;
        updateData[`currentPermMap.${key}`] = false;
      });
    } else {
      // 勾选 → 级联勾选低级权限
      const cascadeAdd = CASCADE_ON_CHECK[action] || [];
      const toAdd = [action, ...cascadeAdd];
      toAdd.forEach(a => {
        const key = `${moduleKey}_${a}`;
        permMap[key] = true;
        updateData[`currentPermMap.${key}`] = true;
      });
    }

    // 同步更新 currentModuleList（供保存时读取）
    const moduleIndex = this.data.currentModuleList.findIndex(m => m.key === moduleKey);
    if (moduleIndex !== -1) {
      const module = this.data.currentModuleList[moduleIndex];
      const newActions = module.actions.filter(a => !!permMap[`${moduleKey}_${a}`]);
      updateData[`currentModuleList[${moduleIndex}].currentActions`] = newActions;
    }

    console.log('[权限调试] 更新permMap:', JSON.stringify(permMap));
    this.setData(updateData);
  },

  // 保存单个学生权限（前端直写数据库）
  onSaveSingleAuth: async function () {
    const student = this.data.currentStudent;
    const moduleList = this.data.currentModuleList;
    const permissions = {};
    moduleList.forEach(m => {
      if (m.currentActions && m.currentActions.length > 0) {
        permissions[m.key] = [...m.currentActions];
      }
    });
    console.log('[权限调试] 保存权限, student:', student?.student_id, 'permissions:', JSON.stringify(permissions));

    wx.showLoading({ title: '保存中...' });
    try {
      const db = wx.cloud.database();
      const classId = this.data.classId;
      const studentId = student.student_id;

      const existing = await db.collection('student_authorizations')
        .where({ class_id: classId, student_id: studentId })
        .limit(1)
        .get();

      if (existing.data && existing.data.length > 0) {
        await db.collection('student_authorizations')
          .doc(existing.data[0]._id)
          .update({ data: { permissions, updated_at: db.serverDate() } });
      } else {
        await db.collection('student_authorizations').add({
          data: {
            auth_id: `auth_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
            class_id: classId,
            student_id: studentId,
            student_name: student.name || '',
            permissions,
            created_at: db.serverDate(),
            updated_at: db.serverDate()
          }
        });
      }
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showSingleModal: false });
      this.loadData();
    } catch (err) {
      wx.hideLoading();
      console.error('保存权限失败:', err);
      wx.showToast({ title: '保存失败: ' + (err.message || ''), icon: 'none' });
    }
  },

  // ========== 批量授权弹窗 ==========

  onShowBatchModal: function () {
    if (this.data.selectedStudentIds.length === 0) {
      wx.showToast({ title: '请先选择学生', icon: 'none' });
      return;
    }
    this.setData({ showBatchModal: true, batchPermissions: {}, batchPermMap: {} });
  },

  onHideBatchModal: function () {
    this.setData({ showBatchModal: false });
  },

  // 批量授权 - 复选框切换（带级联，扁平化驱动视图）
  onBatchCheckPermission: function (e) {
    const { module: moduleKey, action } = e.currentTarget.dataset;
    console.log('[权限调试] onBatchCheckPermission触发, module:', moduleKey, 'action:', action);

    const permMap = { ...this.data.batchPermMap };
    const permKey = `${moduleKey}_${action}`;
    const isChecked = !!permMap[permKey];

    const updateData = {};

    if (isChecked) {
      const cascadeRemove = CASCADE_ON_UNCHECK[action] || [];
      const toRemove = [action, ...cascadeRemove];
      toRemove.forEach(a => {
        const key = `${moduleKey}_${a}`;
        permMap[key] = false;
        updateData[`batchPermMap.${key}`] = false;
      });
    } else {
      const cascadeAdd = CASCADE_ON_CHECK[action] || [];
      const toAdd = [action, ...cascadeAdd];
      toAdd.forEach(a => {
        const key = `${moduleKey}_${a}`;
        permMap[key] = true;
        updateData[`batchPermMap.${key}`] = true;
      });
    }

    // 同步 batchPermissions（供保存时读取）
    const permissions = { ...this.data.batchPermissions };
    PERMISSION_MODULES.forEach(m => {
      const modPerms = m.actions.filter(a => !!permMap[`${m.key}_${a}`]);
      if (modPerms.length > 0) {
        permissions[m.key] = modPerms;
      } else {
        delete permissions[m.key];
      }
    });
    updateData.batchPermissions = permissions;

    this.setData(updateData);
  },

  // 执行批量授权（前端直写数据库）
  onBatchAuthorize: async function () {
    const { selectedStudentIds, batchPermissions, students } = this.data;

    if (Object.keys(batchPermissions).length === 0) {
      wx.showToast({ title: '请选择要授权的权限', icon: 'none' });
      return;
    }

    // 深拷贝权限
    const permsCopy = {};
    for (const [k, v] of Object.entries(batchPermissions)) {
      permsCopy[k] = [...v];
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '批量授权中...' });

    try {
      const db = wx.cloud.database();
      const classId = this.data.classId;
      const studentList = students
        .filter(s => selectedStudentIds.includes(s.student_id))
        .map(s => ({ student_id: s.student_id, name: s.name || '' }));

      for (let i = 0; i < studentList.length; i += 3) {
        const batch = studentList.slice(i, i + 3);
        await Promise.all(batch.map(async (stu) => {
          const existing = await db.collection('student_authorizations')
            .where({ class_id: classId, student_id: stu.student_id })
            .limit(1)
            .get();

          if (existing.data && existing.data.length > 0) {
            const existingPerms = existing.data[0].permissions || {};
            const mergedPerms = { ...existingPerms, ...permsCopy };
            await db.collection('student_authorizations')
              .doc(existing.data[0]._id)
              .update({ data: { permissions: mergedPerms, updated_at: db.serverDate() } });
          } else {
            await db.collection('student_authorizations').add({
              data: {
                auth_id: `auth_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
                class_id: classId,
                student_id: stu.student_id,
                student_name: stu.name,
                permissions: permsCopy,
                created_at: db.serverDate(),
                updated_at: db.serverDate()
              }
            });
          }
        }));
      }

      wx.hideLoading();
      this.setData({ submitting: false, showBatchModal: false, selectedStudentIds: [], selectAll: false });
      wx.showToast({ title: '批量授权成功', icon: 'success' });
      this.loadData();
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      console.error('批量授权失败:', err);
      wx.showToast({ title: '授权失败: ' + (err.message || ''), icon: 'none' });
    }
  },

  // ========== 弹窗控制 ==========

  closeModal: function () {
    this.setData({ showSingleModal: false });
  },

  // 阻止事件冒泡（关键：防止弹窗内点击冒泡到遮罩层关闭弹窗）
  preventBubble: function () {
    // 空函数，仅用于 catchtap 阻止冒泡
  }
});
