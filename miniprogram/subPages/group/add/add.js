// add.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');

Page({
  data: {
    mode: 'add', // 模式：add, edit, view
    groupId: '',
    loading: false,
    submitting: false,

    // 当前环境信息
    currentClassId: '',
    currentClassName: '',
    currentSemesterId: '',
    currentSemesterName: '',

    // 表单数据
    formData: {
      group_name: '',
      group_type: '学习小组',
      group_color: '#1890ff',
      description: '',
      members: [],      // 组员列表
      leader_id: '',    // 组长ID
      leader_name: ''   // 组长姓名
    },

    // 选项数据
    groupTypes: ['学习小组', '值日小组', '宿舍小组', '兴趣小组', '项目小组', '其他'],
    typeIndex: 0,

    colorOptions: [
      { color: '#1890ff', name: '蓝色' },
      { color: '#52c41a', name: '绿色' },
      { color: '#faad14', name: '金色' },
      { color: '#ff4d4f', name: '红色' },
      { color: '#722ed1', name: '紫色' },
      { color: '#13c2c2', name: '青色' },
      { color: '#eb2f96', name: '粉色' },
      { color: '#fa8c16', name: '橙色' }
    ],
    colorIndex: 0,

    // 学生列表相关
    allStudents: [],           // 全班学生
    availableLeaderStudents: [], // 可选的组长（未在任何小组担任组长或组员）
    availableMemberStudents: [], // 可选的组员（未在任何小组担任组长或组员）
    selectedStudentIds: [],    // 已选的组员ID列表
    
    // 组长选择器索引
    leaderIndex: -1,

    // 弹窗控制
    showStudentPicker: false,
    searchKeyword: '',

    // 已占用学生ID集合
    occupiedStudentIds: new Set(),

    // 学期复用
    showSemesterCopyModal: false,
    previousSemesters: [],
    selectedSemesterId: ''
  },

  onLoad: async function (options) {
    // 1. 获取全局配置
    const classId = app.globalData.class_id;
    const className = app.globalData.currentClassName || '';

    if (!classId) {
      wx.showModal({
        title: '提示',
        content: '请先选择班级',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }

    // 2. 如果全局数据中没有学期信息，主动获取
    let semesterId = app.globalData.currentSemesterId || '';
    let semesterName = app.globalData.currentSemesterName || '';
    
    if (!semesterId) {
      console.log('【分组管理】全局数据中没有学期信息，正在获取...');
      try {
        const semester = await app.getCurrentSemester();
        if (semester) {
          semesterId = semester._id || semester.semester_id || '';
          semesterName = semester.name || '';
          console.log('【分组管理】获取学期成功:', semesterName, 'ID:', semesterId);
        } else {
          console.warn('【分组管理】未找到当前学期');
        }
      } catch (err) {
        console.error('【分组管理】获取学期失败:', err);
      }
    }

    this.setData({
      currentClassId: classId,
      currentClassName: className,
      currentSemesterId: semesterId,
      currentSemesterName: semesterName
    });

    // 3. 判断是新增还是编辑
    if (options.id) {
      this.setData({
        groupId: options.id,
        mode: options.mode || 'edit'
      });
      this.loadGroupDetail(options.id);
    } else {
      // 新增模式：检查是否需要从上学期复制
      this.checkPreviousSemesterGroups();
    }

    // 4. 加载学生列表
    this.loadStudents();

    // 5. 设置标题
    const titles = { 'add': '添加分组', 'edit': '编辑分组', 'view': '分组详情' };
    wx.setNavigationBarTitle({ title: titles[this.data.mode] || '分组管理' });
  },

  // 检查是否有上学期的分组可复制
  checkPreviousSemesterGroups: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const { currentClassId, currentSemesterId } = this.data;
      
      const query = currentClassId
        ? { class_id: _.in([currentClassId, '', null]) }
        : {};
      const semesterRes = await db.collection('semesters')
        .where(query)
        .orderBy('created_at', 'desc')
        .limit(5)
        .get();
      
      if (semesterRes.data && semesterRes.data.length > 0) {
        const currentId = this.data.currentSemesterId;
        const previousSemesters = semesterRes.data.filter(s => s._id !== currentId);
        
        if (previousSemesters.length > 0) {
          this.setData({ previousSemesters });
        }
      }
    } catch (err) {
      console.error('检查上学期分组失败:', err);
    }
  },

  // 显示学期复制弹窗
  showSemesterCopyModal: function () {
    this.setData({ showSemesterCopyModal: true });
  },

  // 关闭学期复制弹窗
  hideSemesterCopyModal: function () {
    this.setData({ showSemesterCopyModal: false, selectedSemesterId: '' });
  },

  // 选择学期
  onSemesterSelect: function (e) {
    const semesterId = e.currentTarget.dataset.id;
    this.setData({ selectedSemesterId: semesterId });
  },

  // 确认复制上学期的分组
  confirmCopyFromSemester: async function () {
    const { selectedSemesterId, currentClassId, currentSemesterId, currentSemesterName } = this.data;
    
    if (!selectedSemesterId) {
      util.showError('请选择要复制的学期');
      return;
    }

    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      
      // 获取上学期的分组
      const res = await db.collection('student_groups')
        .where({
          class_id: currentClassId,
          semester_id: selectedSemesterId,
          is_deleted: _.neq(true)
        })
        .get();

      if (!res.data || res.data.length === 0) {
        util.showError('该学期没有分组数据');
        this.setData({ loading: false });
        return;
      }

      // 复制分组到当前学期
      const serverDate = db.serverDate();
      for (const group of res.data) {
        const newGroup = {
          group_name: group.group_name,
          group_type: group.group_type,
          group_color: group.group_color || '#1890ff',
          description: group.description || '',
          leader_id: group.leader_id || '',
          leader_name: group.leader_name || '',
          members: group.members || [],
          semester_id: currentSemesterId,
          semester_name: currentSemesterName,
          class_id: currentClassId,
          creator_openid: app.globalData.openid,
          creator_name: app.globalData.userInfo?.nickName || '未知',
          is_deleted: false,
          copied_from: group._id,
          created_at: serverDate,
          updated_at: serverDate
        };
        
        await db.collection('student_groups').add({ data: newGroup });
      }

      util.showSuccess(`已复制 ${res.data.length} 个分组`);
      this.hideSemesterCopyModal();
      this.setData({ loading: false });
      
      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      console.error('复制分组失败:', err);
      this.setData({ loading: false });
      util.showError('复制失败');
    }
  },

  // 加载分组详情（编辑模式）
  loadGroupDetail: async function (groupId) {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('student_groups').doc(groupId).get();

      if (res.data) {
        const group = res.data;
        
        // 计算索引
        const typeIndex = this.data.groupTypes.indexOf(group.group_type);
        const colorIndex = this.data.colorOptions.findIndex(c => c.color === group.group_color);
        
        // 提取成员ID
        const memberIds = (group.members || []).map(m => m.student_id);

        this.setData({
          formData: {
            group_name: group.group_name,
            group_type: group.group_type,
            group_color: group.group_color || '#1890ff',
            description: group.description || '',
            members: group.members || [],
            leader_id: group.leader_id || '',
            leader_name: group.leader_name || ''
          },
          selectedStudentIds: memberIds,
          typeIndex: typeIndex >= 0 ? typeIndex : 0,
          colorIndex: colorIndex >= 0 ? colorIndex : 0,
          loading: false
        });
      }
    } catch (err) {
      console.error('加载详情失败', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 加载学生列表（优化：过滤已分组学生）
  loadStudents: async function () {
    const { currentClassId, groupId, mode } = this.data;
    try {
      const db = wx.cloud.database();
      const _ = db.command;

      // 1. 查询当前班级所有分组，找出已占用的学生
      const groupQuery = {
        class_id: currentClassId,
        is_deleted: _.neq(true)
      };
      
      // 编辑模式：排除当前正在编辑的组
      if (groupId) {
        groupQuery._id = _.neq(groupId);
      }

      const groupRes = await db.collection('student_groups')
        .where(groupQuery)
        .get();

      // 收集已占用学生ID（包括组长和组员）
      const occupiedIds = new Set();
      if (groupRes.data && groupRes.data.length > 0) {
        groupRes.data.forEach(g => {
          // 组长也是占用的
          if (g.leader_id) {
            occupiedIds.add(g.leader_id);
          }
          // 组员
          if (g.members) {
            g.members.forEach(m => occupiedIds.add(m.student_id));
          }
        });
      }

      // 2. 查询全班学生
      const studentRes = await db.collection('students')
        .where({
          class_id: currentClassId,
          status: _.neq('graduated')
        })
        .orderBy('name', 'asc')
        .get();

      const students = (studentRes.data || []).map(s => ({
        ...s,
        student_name: s.name || s.student_name || '',
        isOccupied: occupiedIds.has(s.student_id)
      }));

      // 3. 编辑模式：当前组的成员和组长也算可用
      let availableLeaderStudents = students.filter(s => !s.isOccupied);
      let availableMemberStudents = students.filter(s => !s.isOccupied);

      if (mode === 'edit' && this.data.formData.leader_id) {
        // 当前组长可选
        const currentLeader = students.find(s => s.student_id === this.data.formData.leader_id);
        if (currentLeader) {
          availableLeaderStudents.unshift({ ...currentLeader, isOccupied: false });
        }
      }

      if (mode === 'edit' && this.data.formData.members.length > 0) {
        // 当前组员可选
        this.data.formData.members.forEach(m => {
          const currentMember = students.find(s => s.student_id === m.student_id);
          if (currentMember && !availableMemberStudents.find(s => s.student_id === m.student_id)) {
            availableMemberStudents.unshift({ ...currentMember, isOccupied: false });
          }
        });
      }

      this.setData({ 
        allStudents: students,
        availableLeaderStudents,
        availableMemberStudents,
        occupiedStudentIds: occupiedIds
      });

      // 4. 如果是编辑模式，计算组长索引
      if (mode === 'edit' && this.data.formData.leader_id) {
        const index = availableLeaderStudents.findIndex(s => s.student_id === this.data.formData.leader_id);
        this.setData({ leaderIndex: index >= 0 ? index : -1 });
      }

    } catch (err) {
      console.error('加载学生失败', err);
    }
  },

  // --- 表单交互事件 ---

  onNameInput: function (e) {
    this.setData({ 'formData.group_name': e.detail.value });
  },

  onTypeChange: function (e) {
    const index = e.detail.value;
    this.setData({
      typeIndex: index,
      'formData.group_type': this.data.groupTypes[index]
    });
  },

  onColorChange: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      colorIndex: index,
      'formData.group_color': this.data.colorOptions[index].color
    });
  },

  onDescInput: function (e) {
    this.setData({ 'formData.description': e.detail.value });
  },

  // --- 组长选择逻辑 ---

  onLeaderChange: function (e) {
    const index = e.detail.value;
    const student = this.data.availableLeaderStudents[index];

    if (student) {
      this.setData({
        leaderIndex: index,
        'formData.leader_id': student.student_id,
        'formData.leader_name': student.student_name
      });
      
      // 如果组长已在组员名单里，移除
      this.removeMemberIfExist(student.student_id);
      
      // 更新可选组员列表（排除当前组长）
      this.updateAvailableMembers();
    }
  },

  // 更新可选组员列表
  updateAvailableMembers: function () {
    const { allStudents, formData, groupId } = this.data;
    const leaderId = formData.leader_id;
    
    // 基础过滤：未占用
    let availableMembers = allStudents.filter(s => !s.isOccupied);
    
    // 排除当前组长
    if (leaderId) {
      availableMembers = availableMembers.filter(s => s.student_id !== leaderId);
    }
    
    // 编辑模式：包含当前组员
    if (this.data.mode === 'edit' && formData.members.length > 0) {
      formData.members.forEach(m => {
        if (!availableMembers.find(s => s.student_id === m.student_id) && m.student_id !== leaderId) {
          const student = allStudents.find(s => s.student_id === m.student_id);
          if (student) {
            availableMembers.unshift({ ...student, isOccupied: false });
          }
        }
      });
    }
    
    this.setData({ availableMemberStudents: availableMembers });
  },

  // 辅助函数：如果组长被选中为组员，从组员名单移除
  removeMemberIfExist: function(studentId) {
    const members = this.data.formData.members;
    const newMembers = members.filter(m => m.student_id !== studentId);
    if (newMembers.length !== members.length) {
      this.setData({
        'formData.members': newMembers,
        selectedStudentIds: this.data.selectedStudentIds.filter(id => id !== studentId)
      });
    }
  },

  // --- 组员管理逻辑 ---

  showStudentPicker: function () {
    this.setData({ showStudentPicker: true, searchKeyword: '' });
  },

  hideStudentPicker: function () {
    this.setData({ showStudentPicker: false, searchKeyword: '' });
  },

  preventBubble: function () {},

  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  toggleStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const student = this.data.availableMemberStudents.find(s => s.student_id === studentId);
    if (!student) return;

    const selectedIds = [...this.data.selectedStudentIds];
    const index = selectedIds.indexOf(studentId);

    if (index > -1) {
      // 取消选择
      selectedIds.splice(index, 1);
      const members = this.data.formData.members.filter(m => m.student_id !== studentId);
      this.setData({ selectedStudentIds: selectedIds, 'formData.members': members });
    } else {
      // 添加选择
      selectedIds.push(studentId);
      const members = [...this.data.formData.members, {
        student_id: student.student_id,
        student_name: student.student_name,
        joined_at: new Date()
      }];
      this.setData({ selectedStudentIds: selectedIds, 'formData.members': members });
    }
  },

  removeMember: function (e) {
    const studentId = e.currentTarget.dataset.id;
    this.setData({
      'formData.members': this.data.formData.members.filter(m => m.student_id !== studentId),
      selectedStudentIds: this.data.selectedStudentIds.filter(id => id !== studentId)
    });
  },

  // --- 提交保存 ---

  onSubmit: async function () {
    const { formData, mode, groupId, currentClassId, currentSemesterId, currentSemesterName } = this.data;

    // 1. 基础验证
    if (!formData.group_name.trim()) {
      util.showError('请输入分组名称');
      return;
    }
    if (!formData.leader_id) {
      util.showError('请指定小组长');
      return;
    }

    this.setData({ submitting: true });

    try {
      const db = wx.cloud.database();
      const serverDate = db.serverDate();

      // 2. 确保组长也在成员列表中
      let members = [...formData.members];
      const leaderInMembers = members.find(m => m.student_id === formData.leader_id);
      if (!leaderInMembers) {
        // 组长不在成员列表中，需要添加
        members.unshift({
          student_id: formData.leader_id,
          student_name: formData.leader_name,
          joined_at: new Date(),
          is_leader: true  // 标记为组长
        });
        console.log('【分组保存】组长已添加到成员列表:', formData.leader_name);
      }

      // 3. 构建公共数据体
      const commonData = {
        group_name: formData.group_name.trim(),
        group_type: formData.group_type,
        group_color: formData.group_color,
        description: formData.description.trim(),
        leader_id: formData.leader_id,
        leader_name: formData.leader_name,
        members: members,  // 包含组长的完整成员列表
        semester_id: currentSemesterId || '',
        semester_name: currentSemesterName || '',
        class_id: currentClassId || '',
        updated_at: serverDate
      };

      if (mode === 'add') {
        await db.collection('student_groups').add({
          data: {
            ...commonData,
            creator_openid: app.globalData.openid,
            creator_name: app.globalData.userInfo?.nickName || '未知',
            is_deleted: false,
            created_at: serverDate
          }
        });
        util.showSuccess('创建成功');
      } else {
        await db.collection('student_groups').doc(groupId).update({
          data: commonData
        });
        util.showSuccess('更新成功');
      }

      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      console.error('保存失败', err);
      this.setData({ submitting: false });
      util.showError('保存失败');
    }
  },

  switchToEdit: function () {
    this.setData({ mode: 'edit' });
    wx.setNavigationBarTitle({ title: '编辑分组' });
    // 重新加载学生列表以更新可用学生
    this.loadStudents();
  },

  switchToMembers: function () {
    this.setData({ mode: 'edit' }); 
    util.showInfo('请切换到编辑模式修改成员');
  }
});
