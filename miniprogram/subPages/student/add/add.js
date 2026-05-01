// pages/student/add/add.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');

Page({
  data: {
    isEdit: false,
    studentId: '',      // 学号
    studentDocId: '',   // 数据库 _id（用于更新）
    loading: false,
    
    // 当前班级信息
    currentClassId: '',
    currentClassName: '',
    
    // 表单数据
    formData: {
      name: '',
      student_id: '',
      gender: '男',
      class_name: '',
      class_id: '',
      date_of_birth: '',
      ethnicity: '',
      political_status: '',
      enrollment_date: '',
      phone_number: '',
      parent_phone_number: '',
      home_address: '',
      is_boarding: false,
      dorm_info: {
        building: '',
        room: '',
        bed: ''
      },
      position: '',
      initial_score: 100,
      current_score: 100
    },
    
    // 选项数据
    genderOptions: ['男', '女'],
    genderIndex: 0,
    politicalOptions: ['群众', '共青团员', '中共党员'],
    politicalIndex: 0,
    positionOptions: ['无', '班长', '班主任助理', '副班长', '学习委员', '纪律委员', '卫生委员', '组织委员', '体育委员', '文艺委员', '生活委员', '心理委员', '课代表'],
    positionIndex: 0
  },

  onLoad: function (options) {
    // 检查是否有当前班级
    const currentClassId = app.globalData.class_id;
    
    if (!currentClassId) {
      wx.showModal({
        title: '提示',
        content: '请先选择一个班级',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }
    
    // 检查权限
    this.checkPermission();
    
    // 加载当前班级信息
    this.loadCurrentClass(currentClassId);
    
    // 判断是编辑还是添加
    if (options.id) {
      this.setData({ 
        isEdit: true, 
        studentId: options.id 
      });
      this.loadStudentData(options.id);
    }
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'subject_teacher') {
      wx.showToast({
        title: '无权限操作',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
    }
  },

  // 加载当前班级信息
  loadCurrentClass: async function (classId) {
    try {
      const res = await api.classApi.getClass(classId);
      if (res.data) {
        this.setData({
          currentClassId: classId,
          currentClassName: res.data.class_name,
          'formData.class_id': classId,
          'formData.class_name': res.data.class_name
        });
      }
    } catch (err) {
      console.error('加载班级信息失败:', err);
      util.showError('加载班级信息失败');
    }
  },

  // 加载学生数据（编辑时）
  loadStudentData: async function (studentId) {
    this.setData({ loading: true });
    
    try {
      const res = await api.studentApi.getStudentByStudentId(studentId);
      if (res.data && res.data.length > 0) {
        const student = res.data[0];
        
        // 保存数据库 _id（用于更新）
        console.log('加载学生数据, _id:', student._id, 'student_id:', student.student_id);
        
        // 设置表单数据
        const formData = {
          name: student.name || '',
          student_id: student.student_id || '',
          gender: student.gender || '男',
          class_name: this.data.currentClassName || student.class_name || '',
          class_id: this.data.currentClassId || student.class_id || '',
          date_of_birth: this.formatDate(student.date_of_birth),
          ethnicity: student.ethnicity || '',
          political_status: student.political_status || '',
          enrollment_date: this.formatDate(student.enrollment_date),
          phone_number: student.phone_number || '',
          parent_phone_number: student.parent_phone_number || '',
          home_address: student.home_address || '',
          is_boarding: student.is_boarding || false,
          dorm_info: student.dorm_info || { building: '', room: '', bed: '' },
          position: student.position || '',
          initial_score: student.initial_score || 100,
          current_score: student.current_score || 100
        };
        
        // 保存 _id 用于更新
        this.setData({ 
          studentDocId: student._id,
          formData 
        });
        
        // 设置选项索引
        const genderIndex = this.data.genderOptions.indexOf(formData.gender);
        const politicalIndex = this.data.politicalOptions.indexOf(formData.political_status);
        const positionIndex = this.data.positionOptions.indexOf(formData.position);
        
        this.setData({
          formData,
          genderIndex: genderIndex >= 0 ? genderIndex : 0,
          politicalIndex: politicalIndex >= 0 ? politicalIndex : 0,
          positionIndex: positionIndex >= 0 ? positionIndex : 0,
          loading: false
        });
      }
    } catch (err) {
      console.error('加载学生数据失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 格式化日期
  formatDate: function (date) {
    if (!date) return '';
    if (typeof date === 'string') return date.split('T')[0];
    const d = new Date(date);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 输入框变化
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 性别选择
  onGenderChange: function (e) {
    const index = e.detail.value;
    this.setData({
      genderIndex: index,
      'formData.gender': this.data.genderOptions[index]
    });
  },

  // 政治面貌选择
  onPoliticalChange: function (e) {
    const index = e.detail.value;
    this.setData({
      politicalIndex: index,
      'formData.political_status': this.data.politicalOptions[index]
    });
  },

  // 职务选择
  onPositionChange: function (e) {
    const index = e.detail.value;
    this.setData({
      positionIndex: index,
      'formData.position': this.data.positionOptions[index]
    });
  },

  // 日期选择
  onDateChange: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`formData.${field}`]: e.detail.value
    });
  },

  // 住宿状态切换
  onBoardingChange: function (e) {
    this.setData({
      'formData.is_boarding': e.detail.value
    });
  },

  // 宿舍信息输入
  onDormInput: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.dorm_info.${field}`]: value
    });
  },

  // 提交表单
  onSubmit: async function (e) {
    // 验证必填字段
    const formData = this.data.formData;
    
    if (!formData.name.trim()) {
      util.showError('请输入学生姓名');
      return;
    }
    
    if (!formData.student_id.trim()) {
      util.showError('请输入学号');
      return;
    }
    
    if (!formData.class_id) {
      util.showError('请选择班级');
      return;
    }

    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const saveData = {
        ...formData,
        updated_at: db.serverDate()
      };

      if (this.data.isEdit) {
        // 更新 - 使用云函数绕过安全规则限制
        console.log('更新学生, _id:', this.data.studentDocId);
        const res = await wx.cloud.callFunction({
          name: 'manageUserCenter',
          data: { action: 'updateStudentInfo', data: { _id: this.data.studentDocId, ...saveData } }
        });
        if (res.result && res.result.success) {
          util.showSuccess('更新成功');
        } else {
          util.showError(res.result?.message || '更新失败');
          return;
        }
      } else {
        // 添加
        saveData.created_at = db.serverDate();
        
        // 检查学号是否已存在
        const checkRes = await db.collection('students')
          .where({
            student_id: formData.student_id,
            class_id: formData.class_id
          })
          .count();
        
        if (checkRes.total > 0) {
          this.setData({ loading: false });
          wx.showModal({
            title: '提示',
            content: '该学号已存在，是否继续添加？',
            success: async (res) => {
              if (res.confirm) {
                await api.studentApi.addStudent(saveData);
                util.showSuccess('添加成功');
                setTimeout(() => {
                  wx.navigateBack();
                }, 1500);
              }
            }
          });
          return;
        }
        
        await api.studentApi.addStudent(saveData);
        util.showSuccess('添加成功');
      }

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('保存失败:', err);
      this.setData({ loading: false });
      util.showError('保存失败');
    }
  },

  // 重置表单
  onReset: function () {
    this.setData({
      formData: {
        name: '',
        student_id: '',
        gender: '男',
        class_name: this.data.currentClassName,
        class_id: this.data.currentClassId,
        date_of_birth: '',
        ethnicity: '',
        political_status: '',
        enrollment_date: '',
        phone_number: '',
        parent_phone_number: '',
        home_address: '',
        is_boarding: false,
        dorm_info: {
          building: '',
          room: '',
          bed: ''
        },
        position: '',
        initial_score: 100,
        current_score: 100
      },
      genderIndex: 0,
      politicalIndex: 0,
      positionIndex: 0
    });
  }
});
