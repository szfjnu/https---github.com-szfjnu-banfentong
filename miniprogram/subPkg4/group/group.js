const app = getApp();
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

Page({
  data: {
    loading: true,
    groups: [],
    currentClassId: '',
    currentClassName: '',
    userRole: '',
    showActions: false,
    selectedGroup: null,
    groupTypes: ['学习小组', '值日小组', '宿舍小组', '兴趣小组', '项目小组', '其他'],
    filterType: 'all',
    // 学期相关
    currentSemesterId: '',
    currentSemesterName: ''
  },

  onLoad: function () {
    this.initPage();
  },

  onShow: function () {
    if (this.data.currentClassId) {
      this.loadGroups();
    }
  },

  // 初始化页面
  initPage: function () {
    const classId = app.globalData.class_id;
    const className = app.globalData.currentClassName || '';
    const role = app.globalData.role || '';
    const semesterId = app.globalData.currentSemesterId || '';
    const semesterName = app.globalData.currentSemesterName || '';

    if (!classId) {
      wx.showModal({
        title: '提示',
        content: '请先选择班级',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }

    this.setData({
      currentClassId: classId,
      currentClassName: className,
      userRole: role,
      currentSemesterId: semesterId,
      currentSemesterName: semesterName
    });

    this.loadGroups();
  },

  // 加载分组列表
  loadGroups: async function () {
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      const query = {
        class_id: this.data.currentClassId,
        is_deleted: _.neq(true)
      };
      
      // 如果有学期ID，按学期筛选
      if (this.data.currentSemesterId) {
        query.semester_id = this.data.currentSemesterId;
      }
      
      const res = await db.collection('student_groups')
        .where(query)
        .orderBy('created_at', 'desc')
        .get();

      // 统计每个分组的人数（包含组长）
      const groups = res.data || [];
      
      for (let group of groups) {
        // 组员数量
        const memberCount = (group.members || []).length;
        // 是否有组长
        const hasLeader = group.leader_id ? 1 : 0;
        // 总人数 = 组员 + 组长
        group.total_count = memberCount + hasLeader;
        group.member_count = memberCount;
      }

      this.setData({
        groups: groups,
        loading: false
      });

    } catch (err) {
      console.error('加载分组列表失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 筛选分组类型
  onFilterChange: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterType: type });
  },

  // 获取筛选后的分组
  getFilteredGroups: function () {
    const { groups, filterType } = this.data;
    if (filterType === 'all') {
      return groups;
    }
    return groups.filter(g => g.group_type === filterType);
  },

  // 跳转到添加分组页面
  goToAddGroup: function () {
    wx.navigateTo({
      url: '/subPkg4/group/add/add'
    });
  },

  // 显示分组操作菜单
  showGroupActions: function (e) {
    const group = e.currentTarget.dataset.group;
    this.setData({
      showActions: true,
      selectedGroup: group
    });
  },

  // 关闭操作菜单
  hideActions: function () {
    this.setData({
      showActions: false,
      selectedGroup: null
    });
  },

  // 阻止冒泡
  preventBubble: function () {},

  // 查看分组详情
  viewGroupDetail: function () {
    const group = this.data.selectedGroup;
    this.hideActions();
    
    wx.navigateTo({
      url: `/subPkg4/group/add/add?id=${group._id}&mode=view`
    });
  },

  // 编辑分组
  editGroup: function () {
    const group = this.data.selectedGroup;
    this.hideActions();
    
    wx.navigateTo({
      url: `/subPkg4/group/add/add?id=${group._id}&mode=edit`
    });
  },

  // 删除分组
  deleteGroup: async function () {
    const group = this.data.selectedGroup;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除分组「${group.group_name}」吗？`,
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...', mask: true });
            
            const res = await wx.cloud.callFunction({
              name: 'scoreManager',
              data: {
                action: 'deleteStudentGroup',
                data: { group_id: group._id }
              }
            });

            if (!res.result || !res.result.success) {
              throw new Error(res.result?.message || '删除失败');
            }

            wx.hideLoading();
            util.showSuccess('删除成功');
            this.hideActions();
            this.loadGroups();

          } catch (err) {
            console.error('删除分组失败:', err);
            wx.hideLoading();
            util.showError('删除失败');
          }
        }
      }
    });
    
    this.hideActions();
  },

  // 查看分组学生
  viewGroupStudents: function () {
    const group = this.data.selectedGroup;
    this.hideActions();
    
    wx.navigateTo({
      url: `/subPkg4/group/add/add?id=${group._id}&mode=members`
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadGroups().then(() => {
      wx.stopPullDownRefresh();
    });
  }
});
