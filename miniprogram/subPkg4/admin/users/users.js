const app = getApp();

const ROLE_MAP = {
  admin: '管理员',
  head_teacher: '班主任',
  subject_teacher: '科任老师',
  class_cadre: '班干部',
  student: '学生',
  parent: '家长'
};

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'head_teacher', label: '班主任' },
  { value: 'subject_teacher', label: '科任老师' },
  { value: 'class_cadre', label: '班干部' },
  { value: 'student', label: '学生' },
  { value: 'parent', label: '家长' }
];

Page({
  data: {
    loading: true,
    users: [],
    searchKeyword: '',
    activeTab: 'all',
    roleTabs: [
      { key: 'all', label: '全部' },
      { key: 'admin', label: '管理员' },
      { key: 'head_teacher', label: '班主任' },
      { key: 'subject_teacher', label: '科任老师' },
      { key: 'class_cadre', label: '班干部' },
      { key: 'student', label: '学生' }
    ],
    page: 1,
    pageSize: 20,
    hasMore: true,
    total: 0,
    currentUser: null,
    showRoleDialog: false,
    showMemberDialog: false,
    showAuditPanel: false,
    roleOptions: ROLE_OPTIONS,
    editMembership: { isAdvanced: false, level: 1 },
    auditLogs: []
  },

  onLoad: function () {
    const role = app.globalData.role;
    if (role !== 'admin') {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.loadUsers();
  },

  onPullDownRefresh: function () {
    this.setData({ page: 1, hasMore: true, users: [] });
    this.loadUsers();
  },

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearchConfirm: function () {
    this.setData({ page: 1, hasMore: true, users: [] });
    this.loadUsers();
  },

  onTabChange: function (e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeTab: key, page: 1, hasMore: true, users: [] });
    this.loadUsers();
  },

  onLoadMore: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadUsers();
    }
  },

  loadUsers: async function () {
    this.setData({ loading: true });
    try {
      const { page, pageSize, activeTab, searchKeyword } = this.data;
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'listUsers',
          data: { page, pageSize, role: activeTab === 'all' ? '' : activeTab, search: searchKeyword }
        }
      });

      if (res.result && res.result.success) {
        const newUsers = (res.result.data.users || []).map(u => this.formatUser(u));
        const users = page === 1 ? newUsers : this.data.users.concat(newUsers);
        const total = res.result.data.total || 0;
        this.setData({
          users,
          total,
          hasMore: users.length < total,
          page: page + 1
        });
      }
    } catch (err) {
      console.error('加载用户列表失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
    this.setData({ loading: false });
    wx.stopPullDownRefresh();
  },

  formatUser: function (u) {
    const primaryRole = u.primaryRole || u.role || 'student';
    const membership = u.membership || {};
    const isAdvanced = membership.is_advanced || false;
    const level = membership.level || 1;
    return {
      ...u,
      primaryRole,
      primaryRoleLabel: ROLE_MAP[primaryRole] || primaryRole,
      openidTruncated: u.openid ? (u.openid.substring(0, 8) + '...') : '',
      membershipLevel: isAdvanced ? 'advanced' : 'free',
      membershipLevelNum: level,
      classes: (u.classes || []).map(c => ({
        ...c,
        roleLabel: ROLE_MAP[c.role] || c.role,
        roleIndex: ROLE_OPTIONS.findIndex(r => r.value === c.role)
      }))
    };
  },

  onEditRole: function (e) {
    const index = e.currentTarget.dataset.index;
    const user = this.data.users[index];
    this.setData({ currentUser: user, showRoleDialog: true });
  },

  onCloseRoleDialog: function () {
    this.setData({ showRoleDialog: false });
  },

  onRolePickerChange: function (e) {
    const classIndex = e.currentTarget.dataset.classIndex;
    const roleIndex = Number(e.detail.value);
    const currentUser = this.data.currentUser;
    const classes = currentUser.classes.map((c, i) => {
      if (i === classIndex) {
        return { ...c, role: ROLE_OPTIONS[roleIndex].value, roleLabel: ROLE_OPTIONS[roleIndex].label, roleIndex };
      }
      return c;
    });
    this.setData({ currentUser: { ...currentUser, classes } });
  },

  onSaveRole: async function () {
    const { currentUser } = this.data;
    if (!currentUser) return;

    wx.showLoading({ title: '保存中...' });
    try {
      for (const cls of currentUser.classes) {
        await wx.cloud.callFunction({
          name: 'manageUserCenter',
          data: {
            action: 'updateUserRole',
            data: { targetOpenid: currentUser.openid, classId: cls.classId, newRole: cls.role }
          }
        });
      }
      wx.hideLoading();
      wx.showToast({ title: '角色已更新', icon: 'success' });
      this.setData({ showRoleDialog: false });
      this.onPullDownRefresh();
    } catch (err) {
      wx.hideLoading();
      console.error('更新角色失败:', err);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  onEditMembership: function (e) {
    const index = e.currentTarget.dataset.index;
    const user = this.data.users[index];
    const membership = user.membership || {};
    this.setData({
      currentUser: user,
      editMembership: {
        isAdvanced: membership.is_advanced || false,
        level: membership.level || 1
      },
      showMemberDialog: true
    });
  },

  onCloseMemberDialog: function () {
    this.setData({ showMemberDialog: false });
  },

  onToggleAdvanced: function (e) {
    this.setData({ 'editMembership.isAdvanced': e.detail.value });
  },

  onSelectLevel: function (e) {
    this.setData({ 'editMembership.level': e.currentTarget.dataset.level });
  },

  onSaveMembership: async function () {
    const { currentUser, editMembership } = this.data;
    if (!currentUser) return;

    wx.showLoading({ title: '保存中...' });
    try {
      await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'updateUserMembership',
          data: {
            targetOpenid: currentUser.openid,
            isAdvanced: editMembership.isAdvanced,
            level: editMembership.level
          }
        }
      });
      wx.hideLoading();
      wx.showToast({ title: '会员已更新', icon: 'success' });
      this.setData({ showMemberDialog: false });
      this.onPullDownRefresh();
    } catch (err) {
      wx.hideLoading();
      console.error('更新会员失败:', err);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  onViewAuditLog: function (e) {
    const index = e.currentTarget.dataset.index;
    const user = this.data.users[index];
    this.setData({ currentUser: user, showAuditPanel: true, auditLogs: [] });
    this.loadAuditLog(user.openid);
  },

  onCloseAuditPanel: function () {
    this.setData({ showAuditPanel: false });
  },

  loadAuditLog: async function (targetOpenid) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: {
          action: 'getPermissionAuditLog',
          data: { targetOpenid, page: 1, pageSize: 50 }
        }
      });

      if (res.result && res.result.success) {
        const auditLogs = (res.result.data || []).map(log => {
          const d = log.created_at ? new Date(log.created_at) : null;
          return {
            ...log,
            actionLabel: log.action === 'updateRole' ? '角色变更' : '会员变更',
            oldValueText: JSON.stringify(log.old_value || {}),
            newValueText: JSON.stringify(log.new_value || {}),
            operatorName: log.operator_name || '系统',
            timeText: d ? `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` : ''
          };
        });
        this.setData({ auditLogs });
      }
    } catch (err) {
      console.error('加载审计日志失败:', err);
    }
  },

  preventBubble: function () {}
});
