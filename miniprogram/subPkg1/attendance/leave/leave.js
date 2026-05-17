// pages/attendance/leave/leave.js
const app = getApp();
const util = require('../../../utils/util.js');
const batchQuery = require('../../../utils/batchQuery.js');

Page({
  data: {
    classId: '',
    userRole: '',
    isAdmin: false,
    
    // 请假记录列表
    records: [],
    loading: false,
    hasMore: true,
    page: 0,
    pageSize: 20,
    
    // 筛选
    filterStatus: 'all', // all, approved, pending, rejected
    filterStatusText: '全部状态',
    
    // 弹窗
    showAddModal: false,
    saving: false,
    
    // 表单数据
    leaveForm: {
      student_id: '',
      student_name: '',
      leave_type: '病假',
      start_date: '',
      end_date: '',
      reason: '',
      approval_number: '',
      proof_images: []
    },
    
    // 学生列表
    students: [],
    studentSearchKeyword: '',
    filteredStudents: [],
    showStudentCandidates: false,
    
    // 请假类型
    leaveTypes: ['病假', '事假', '其他'],
    
    // 日期范围（允许编辑的日期范围，不锁死）
    minDate: '2020-01-01',
    maxDate: '2030-12-31'
  },

  onLoad: function (options) {
    const classId = options.class_id || app.globalData.class_id;
    const role = app.globalData.role;
    const isAdmin = ['admin', 'head_teacher', 'class_cadre'].includes(role);
    
    this.setData({
      classId: classId,
      userRole: role,
      isAdmin: isAdmin
    });
    
    this.loadStudents();
    this.loadRecords();
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.refreshData();
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  // 刷新数据
  refreshData: function () {
    this.setData({
      page: 0,
      hasMore: true,
      records: []
    });
    this.loadRecords();
  },

  // 加载学生列表
  loadStudents: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const students = await batchQuery.getAllRecords('students', {
        class_id: this.data.classId,
        status: _.neq('graduated')
      });
      const sorted = (students || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      this.setData({ students: sorted, filteredStudents: sorted });
    } catch (err) {
      console.error('加载学生失败:', err);
    }
  },

  // 加载请假记录
  loadRecords: async function () {
    this.setData({ loading: true });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const { classId, filterStatus } = this.data;
      
      let query = { class_id: classId };
      
      if (filterStatus !== 'all') {
        query.approval_status = filterStatus;
      }
      
      const res = await db.collection('leave_approval_records')
        .where(query)
        .orderBy('created_at', 'desc')
        .skip(this.data.page * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();
      
      const records = (res.data || []).map(record => ({
        ...record,
        duration_days: this.calculateDuration(record.start_date, record.end_date),
        date_range: `${record.start_date} 至 ${record.end_date}`,
        status_text: this.getStatusText(record.approval_status),
        status_color: this.getStatusColor(record.approval_status)
      }));
      
      this.setData({
        records: this.data.page === 0 ? records : [...this.data.records, ...records],
        hasMore: records.length === this.data.pageSize,
        loading: false
      });
      
    } catch (err) {
      console.error('加载请假记录失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 加载更多
  loadMore: function () {
    this.setData({ page: this.data.page + 1 });
    this.loadRecords();
  },

  // 计算请假天数
  calculateDuration: function (startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  },

  // 获取状态文本
  getStatusText: function (status) {
    const map = {
      'approved': '已通过',
      'rejected': '已拒绝',
      'cancelled': '已取消'
    };
    return map[status] || '未知';
  },

  // 获取状态颜色
  getStatusColor: function (status) {
    const map = {
      'approved': '#52c41a',
      'rejected': '#ff4d4f',
      'cancelled': '#999999'
    };
    return map[status] || '#999999';
  },

  // 筛选状态切换
  onFilterStatus: function (e) {
    const status = e.currentTarget.dataset.status;
    const statusTextMap = {
      'all': '全部状态',
      'approved': '已通过',
      'rejected': '已拒绝',
      'cancelled': '已取消'
    };
    
    this.setData({
      filterStatus: status,
      filterStatusText: statusTextMap[status]
    });
    this.refreshData();
  },

  // 显示添加请假记录弹窗
  onShowAddModal: function () {
    const today = this.formatDate(new Date());
    
    this.setData({
      showAddModal: true,
      leaveForm: {
        student_id: '',
        student_name: '',
        leave_type: '病假',
        start_date: today,
        end_date: today,
        reason: '',
        approval_number: '',
        proof_images: []
      }
    });
  },

  // 关闭弹窗
  onCloseModal: function () {
    this.setData({ showAddModal: false });
  },

  onStudentSearchInput: function (e) {
    const keyword = e.detail.value.trim().substring(0, 50);
    this.setData({ studentSearchKeyword: keyword, showStudentCandidates: true });
    if (!keyword) {
      this.setData({ filteredStudents: this.data.students });
      return;
    }
    const lower = keyword.toLowerCase();
    const filtered = this.data.students.filter(s =>
      (s.name && s.name.toLowerCase().includes(lower)) ||
      (s.student_id && String(s.student_id).toLowerCase().includes(lower))
    );
    this.setData({ filteredStudents: filtered });
  },

  onSelectStudentFromSearch: function (e) {
    const studentId = e.currentTarget.dataset.studentId;
    const studentName = e.currentTarget.dataset.studentName;
    this.setData({
      'leaveForm.student_id': studentId,
      'leaveForm.student_name': studentName,
      studentSearchKeyword: studentName,
      showStudentCandidates: false
    });
  },

  onClearStudentSearch: function () {
    this.setData({
      'leaveForm.student_id': '',
      'leaveForm.student_name': '',
      studentSearchKeyword: '',
      showStudentCandidates: false,
      filteredStudents: this.data.students
    });
  },

  onStudentSearchFocus: function () {
    this.setData({ showStudentCandidates: true });
    if (!this.data.studentSearchKeyword) {
      this.setData({ filteredStudents: this.data.students });
    }
  },

  // 选择请假类型
  onSelectLeaveType: function (e) {
    const index = e.detail.value;
    const type = this.data.leaveTypes[index];
    this.setData({ 'leaveForm.leave_type': type });
  },

  // 选择开始日期
  onSelectStartDate: function (e) {
    this.setData({ 'leaveForm.start_date': e.detail.value });
  },

  // 选择结束日期
  onSelectEndDate: function (e) {
    this.setData({ 'leaveForm.end_date': e.detail.value });
  },

  // 输入请假原因
  onReasonInput: function (e) {
    this.setData({ 'leaveForm.reason': e.detail.value });
  },

  // 输入审批单号
  onApprovalNumberInput: function (e) {
    this.setData({ 'leaveForm.approval_number': e.detail.value });
  },

  // 上传凭证图片
  onUploadProof: function () {
    const that = this;
    wx.chooseImage({
      count: 3 - this.data.leaveForm.proof_images.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        wx.showLoading({ title: '上传中...' });
        
        const tempFilePaths = res.tempFilePaths;
        const uploadedUrls = [];
        
        for (const filePath of tempFilePaths) {
          try {
            const cloudPath = `leave_proofs/${that.data.classId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: filePath
            });
            uploadedUrls.push(uploadRes.fileID);
          } catch (err) {
            console.error('上传失败:', err);
          }
        }
        
        wx.hideLoading();
        
        that.setData({
          'leaveForm.proof_images': [...that.data.leaveForm.proof_images, ...uploadedUrls]
        });
      }
    });
  },

  // 删除凭证图片
  onDeleteProof: function (e) {
    const index = e.currentTarget.dataset.index;
    const proofImages = this.data.leaveForm.proof_images;
    proofImages.splice(index, 1);
    this.setData({ 'leaveForm.proof_images': proofImages });
  },

  // 预览图片
  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: this.data.leaveForm.proof_images
    });
  },

  // 保存请假记录
  onSaveLeave: async function () {
    const { student_id, student_name, leave_type, start_date, end_date, reason, proof_images } = this.data.leaveForm;
    
    if (!student_id) {
      util.showError('请选择学生');
      return;
    }
    
    if (!start_date || !end_date) {
      util.showError('请选择请假日期');
      return;
    }
    
    if (new Date(start_date) > new Date(end_date)) {
      util.showError('开始日期不能大于结束日期');
      return;
    }
    
    this.setData({ saving: true });
    
    try {
      const db = wx.cloud.database();
      const approvalId = `LA${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
      const durationDays = this.calculateDuration(start_date, end_date);
      
      // 保存请假审批记录
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'addLeaveRecord',
          data: {
            approval_id: approvalId,
            student_id: student_id,
            student_name: student_name,
            class_id: this.data.classId,
            leave_type: leave_type,
            start_date: start_date,
            end_date: end_date,
            duration_days: durationDays,
            reason: reason,
            approval_status: 'approved',
            approval_number: this.data.leaveForm.approval_number,
            proof_images: proof_images,
            creator_openid: app.globalData.openid,
            creator_name: app.globalData.userInfo.nickName,
            creator_role: this.data.userRole,
            semester_id: app.globalData.currentSemesterId || ''
          }
        }
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '保存请假记录失败');
      }
      
      // 自动生成考勤记录
      await this.generateAttendanceRecords(student_id, student_name, start_date, end_date, leave_type);
      
      this.setData({
        showAddModal: false,
        saving: false
      });
      
      util.showSuccess('保存成功');
      this.refreshData();
      
    } catch (err) {
      console.error('保存失败:', err);
      this.setData({ saving: false });
      util.showError('保存失败');
    }
  },

  // 生成考勤记录
  generateAttendanceRecords: async function (studentId, studentName, startDate, endDate, leaveType) {
    try {
      const categoryId = leaveType === '病假' ? 'sick_leave' : 'personal_leave';
      const semesterId = app.globalData.currentSemesterId || '';

      const attendanceData = [];
      const currentDate = new Date(startDate);
      const end = new Date(endDate);
      while (currentDate <= end) {
        attendanceData.push({
          date: this.formatDate(currentDate),
          category_id: categoryId,
          leave_type: leaveType,
          student_name: studentName,
          recorder_openid: app.globalData.openid,
          recorder_name: app.globalData.userInfo.nickName,
          recorder_role: this.data.userRole,
          semester_id: semesterId,
          status: '请假'
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'generateLeaveAttendanceRecords',
          data: {
            student_id: studentId,
            class_id: this.data.classId,
            attendance_data: attendanceData
          }
        }
      });

      if (!res.result || !res.result.success) {
        console.error('生成考勤记录失败:', res.result?.message);
      }
    } catch (err) {
      console.error('生成考勤记录失败:', err);
    }
  },

  // 查看详情
  onViewDetail: function (e) {
    const record = e.currentTarget.dataset.record;
    wx.showModal({
      title: '请假详情',
      content: `学生：${record.student_name}\n类型：${record.leave_type}\n日期：${record.date_range}\n天数：${record.duration_days}天\n原因：${record.reason || '无'}`,
      showCancel: false
    });
  },

  // 删除请假记录
  onDeleteRecord: function (e) {
    const record = e.currentTarget.dataset.record;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${record.student_name} 的请假记录吗？`,
      success: async (res) => {
        if (res.confirm) {
          await this.doDeleteRecord(record);
        }
      }
    });
  },

  // 执行删除
  doDeleteRecord: async function (record) {
    wx.showLoading({ title: '删除中...' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: {
          action: 'deleteLeaveRecord',
          data: { recordId: record._id, class_id: this.data.classId }
        }
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '删除失败');
      }

      wx.hideLoading();
      util.showSuccess('删除成功');
      this.refreshData();
      
    } catch (err) {
      console.error('删除失败:', err);
      wx.hideLoading();
      util.showError('删除失败');
    }
  },

  // 格式化日期
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
});