// pages/score/add/add.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');

Page({
  data: {
    loading: true,
    submitting: false,
    // 学生相关
    students: [],
    selectedStudents: [],
    searchKeyword: '',
    classOptions: [{ value: '', label: '全部班级' }],
    selectedClass: '',
    selectedClassIndex: 0,
    // 分组筛选
    groupOptions: [{ value: '', label: '全部分组' }],
    selectedGroup: '',
    selectedGroupIndex: 0,
    // 级联选择器数据
    categories: [],
    scoreItems: [],
    cascaderData: [], // [[类别列表], [项目列表]]
    cascaderValue: [0, 0],
    selectedCategory: '',
    selectedItem: null,
    // 来源类型
    sourceTypes: [
      { value: '日常积分', label: '日常积分' },
      { value: '志愿服务', label: '志愿服务' },
      { value: '竞赛获奖', label: '竞赛获奖' },
      { value: '证书获得', label: '证书获得' },
      { value: '处分扣分', label: '处分扣分' },
      { value: '宿舍折算', label: '宿舍折算' },
      { value: '其他', label: '其他' }
    ],
    selectedSourceTypeIndex: 0,
    sourceType: '日常积分',
    // 积分值和类型
    scoreValue: 0,
    isAddScore: true, // true为加分，false为扣分
    reason: '',
    remark: '',
    // 当前学期
    currentSemester: null,
    // 当前用户角色
    userRole: '',
    // 数据隔离相关
    currentClassId: '',
    currentSemesterId: '',
    managedClasses: [] // 教师管理的班级列表
  },

  onLoad: async function () {
    this.checkPermission();
    await this.initUserContext();
    this.loadData();
  },

  // 初始化用户上下文信息
  initUserContext: async function () {
    const role = app.globalData.role;
    const classId = app.globalData.class_id || '';
    const semesterId = app.globalData.currentSemesterId || '';
    
    console.log('初始化用户上下文 - role:', role, 'classId:', classId, 'semesterId:', semesterId);
    
    this.setData({
      currentClassId: classId,
      currentSemesterId: semesterId
    });
    
    // 如果是班主任,只加载自己管理的班级
    if (role === 'head_teacher' && classId) {
      this.setData({
        selectedClass: classId,
        managedClasses: [classId]
      });
    } else if (role === 'admin' || role === 'subject_teacher') {
      // 管理员或科任老师可以查看所有班级
      await this.loadManagedClasses();
    }
  },

  // 加载教师管理的班级列表
  loadManagedClasses: async function () {
    try {
      const role = app.globalData.role;
      const openid = app.globalData.openid;
      
      if (role === 'admin') {
        // 管理员可以查看所有班级
        const res = await api.classApi.getClasses();
        const classes = res.data || [];
        this.setData({
          managedClasses: classes.map(c => c.class_id || c._id)
        });
      } else if (role === 'subject_teacher') {
        // 科任老师查询 user_class_relation 表获取管理的班级
        const db = wx.cloud.database();
        const res = await db.collection('user_class_relation')
          .where({
            user_openid: openid,
            role: 'subject_teacher',
            status: 'joined'
          })
          .get();
        
        const classIds = res.data.map(r => r.class_id);
        this.setData({ managedClasses: classIds });
      }
    } catch (err) {
      console.error('加载管理的班级失败:', err);
    }
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    this.setData({ userRole: role });
    
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'teacher') {
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

  // 加载数据
  loadData: async function () {
    this.setData({ loading: true });

    try {
      await Promise.all([
        this.loadStudents(),
        this.loadClasses(),
        this.loadGroups(),
        this.loadScoreItems(),
        this.loadCurrentSemester()
      ]);

      this.setData({ loading: false });
    } catch (err) {
      console.error('加载数据失败:', err);
      this.setData({ loading: false });
      util.showError('加载失败');
    }
  },

  // 加载学生列表
  loadStudents: async function (filterByClassName = null) {
    try {
      const role = app.globalData.role;
      const { currentClassId, managedClasses, currentSemesterId } = this.data;
      
      console.log('【加载学生开始】role:', role, 'currentClassId:', currentClassId, 'managedClasses:', managedClasses, 'filterByClassName:', filterByClassName);
      
      const db = wx.cloud.database();
      const _ = db.command;
      let query = {};
      
      // 数据隔离:根据角色过滤学生
      if (role === 'head_teacher') {
        // 班主任：优先使用 currentClassId，如果没有则通过 user_class_relation 获取
        let targetClassId = currentClassId;
        if (!targetClassId) {
          // 尝试从关系表获取
          const relationRes = await db.collection('user_class_relation')
            .where({
              user_openid: app.globalData.openid,
              role: 'head_teacher',
              status: 'joined'
            })
            .limit(1)
            .get();
          if (relationRes.data.length > 0) {
            targetClassId = relationRes.data[0].class_id;
            console.log('从关系表获取到班级ID:', targetClassId);
          }
        }
        
        if (targetClassId) {
          query.class_id = targetClassId;
        } else {
          console.warn('班主任未找到关联班级，将尝试加载所有学生');
        }
      } else if (role === 'subject_teacher') {
        // 科任老师：获取所教班级的学生
        let targetClassIds = managedClasses;
        if (!targetClassIds || targetClassIds.length === 0) {
          // 尝试从关系表获取
          const relationRes = await db.collection('user_class_relation')
            .where({
              user_openid: app.globalData.openid,
              role: 'subject_teacher',
              status: 'joined'
            })
            .get();
          targetClassIds = relationRes.data.map(r => r.class_id);
          console.log('从关系表获取科任老师管理的班级:', targetClassIds);
        }
        
        if (targetClassIds.length > 0) {
          query.class_id = _.in(targetClassIds);
        } else {
          console.warn('科任老师未找到关联班级');
          this.setData({ students: [] });
          return;
        }
      } else if (role === 'admin') {
        // 管理员可以查看所有学生
        // 如果传入了 filterByClassName，则按班级名称筛选
        if (filterByClassName) {
          query.class_name = filterByClassName;
        }
      } else {
        // 其他角色不允许加载学生
        this.setData({ students: [] });
        console.log('无权限加载学生, role:', role);
        return;
      }

      // 执行查询
      console.log('执行学生查询, query:', query);
      const res = await db.collection('students')
        .where(query)
        .limit(1000)
        .orderBy('created_at', 'desc')
        .get();
      console.log('查询到学生数量:', res.data.length);

      // 处理学生数据
      let students = res.data.map(student => ({
        ...student, 
        selected: false, 
        scoreLevel: util.getScoreLevel(student.current_score || 100)
      }));
      
      // 学籍校验（仅对有班级的情况且启用了学期校验）
      if (currentSemesterId && (currentClassId || query.class_id)) {
        const targetClassId = currentClassId || (query.class_id && typeof query.class_id === 'string' ? query.class_id : null);
        
        if (targetClassId) {
          const statusRes = await db.collection('student_status')
            .where({ 
              class_id: targetClassId,
              status: '在读'
            })
            .get();

          const statusMap = {};
          statusRes.data.forEach(item => {
            statusMap[String(item.student_id)] = item.status;
          });
          
          students = students.filter(student => {
            const sid = String(student.student_id);
            const status = statusMap[sid];
            return status === '在读' || !status;
          });
          
          console.log(`【学籍过滤】通过校验:${students.length}人`);
        }
      }
      
      this.setData({ students });
      console.log('【学生加载完成】共', students.length, '人');

    } catch (err) {
      console.error('【加载学生失败】:', err);
      this.setData({ students: [] });
    }
  },

  // 加载班级列表
  loadClasses: async function () {
    try {
      const res = await api.classApi.getClasses();
      const classOptions = [
        { value: '', label: '全部班级' },
        ...res.data.map(item => ({
          value: item.class_name,
          label: item.class_name
        }))
      ];
      this.setData({ classOptions });
    } catch (err) {
      console.error('加载班级列表失败:', err);
    }
  },

  // 加载分组列表
  loadGroups: async function () {
    try {
      const res = await api.groupApi.getGroups();
      const groupOptions = [
        { value: '', label: '全部分组' },
        ...res.data.map(item => ({
          value: item.group_name || item.name,
          label: item.group_name || item.name
        }))
      ];
      this.setData({ groupOptions });
    } catch (err) {
      console.error('加载分组列表失败:', err);
      // 集合不存在时使用默认选项
      if (err.errCode === -502005) {
        this.setData({
          groupOptions: [{ value: '', label: '全部分组' }]
        });
      }
    }
  },

  // 加载积分项目
  loadScoreItems: async function () {
    try {
      const db = wx.cloud.database();
      const _ = db.command;

      // 1. 先从 score_categories 集合拉取真正的分类定义
      const categoriesRes  = await db.collection('score_categories')
        .where({
          is_active: true 
        })
        .orderBy('sort_order', 'asc')
        .get();

      // 2.从 score_items 集合查询积分规则数据
      const itemsRes = await db.collection('score_items')
        .where({
          record_type: 'rule',
          is_enabled: _.neq(false) // 只查询启用的规则
        })
        .orderBy('created_at', 'desc')
        .get();

      const categoryList = categoriesRes.data || [];
      const allItems = itemsRes.data || [];
      
      // 3.按类别分组
      const categoryMap = {};
      // 初始化映射表，确保分类表里的每个分类在 map 里都有个位置（即便暂时没规则）
      categoryList.forEach(cat => {

        categoryMap[cat.category_name] = [];

      });
      // 将规则归类到对应的分类中
      allItems.forEach(item => {
        const catName = (item.rule_category || '其他').trim();
        if (!categoryMap[catName]) {
          categoryMap[catName] = [];
        }
        categoryMap[catName].push(item);
      });
      // 4. 提取最终的分类名称列表（优先使用分类表里的名称）
      const finalCategories = categoryList.map(c => c.category_name);
      // 如果有些规则的分类不在分类表里，也补进去
      Object.keys(categoryMap).forEach(name => {
        if (!finalCategories.includes(name)) {
          finalCategories.push(name);
        }
       });  
      //const categories = Object.keys(categoryMap);
      
      // 5. 构建级联选择器数据 [第一列, 第二列]

      const firstCategory = finalCategories[0] || '其他';
      const firstItems = categoryMap[firstCategory] || [];
      
      const cascaderData = [
        finalCategories.map(name => ({ name })),
        firstItems.map(item => ({
          name: item.rule_name || item.name || item.item_name || '未命名项目',
          score: item.score_value || 0,
          type: (item.score_value || 0) > 0 ? '加分' : '扣分',
          item: item
        }))
      ];  


      this.setData({
        scoreItems: allItems,
        categories: finalCategories,
        categoryMap: categoryMap,
        cascaderData: cascaderData,
        selectedCategory: firstCategory,
        cascaderValue: [0, 0] // 强制重置索引
      });

      //  6. 默认选择第一个项目
      if (firstItems.length > 0) {
        this.updateSelectedItem(firstItems[0]);
      }
      
      console.log('加载积分规则成功, 共', allItems.length, '条');

    } catch (err) {
      console.error('加载积分项目失败:', err);
      util.showError('积分配置加载失败');
    }
  },
  // 提取一个通用的更新方法，避免直接 setData(undefined)
  updateSelectedItem: function(item) {
    if (!item) return;
    this.setData({
      selectedItem: item,
      scoreValue: Math.abs(item.score_value || 0),
      isAddScore: (item.score_value || 0) > 0,
      reason: item.rule_name || item.name || item.item_name || ''
    });
  },


  loadCurrentSemester: async function () {
    try {
      const res = await api.semesterApi.getCurrentSemester();
      if (res.data && res.data.length > 0) {
        const semester = res.data[0];
        this.setData({ 
          currentSemester: semester,
          currentSemesterId: semester._id  // 假设数据库中的主键是 _id 或 semester_id
        
        });
        console.log('页面主动加载学期成功:', semester.name || semester.semester_name);
      } else {
        console.warn('数据库中未发现激活的学期记录');
      }
    } catch (err) {
      console.error('加载当前学期失败:', err);
    }
  },

  // 搜索学生
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  // 班级筛选
  onClassChange: async function (e) {
    const index = e.detail.value;
    const selectedOption = this.data.classOptions[index];
    const className = selectedOption.value; // class_name 或空字符串
    
    console.log('班级选择变化:', className, 'label:', selectedOption.label);
    
    this.setData({
      selectedClass: className,
      selectedClassIndex: index
    });
    
    // 如果是管理员且选择了特定班级，重新加载该班级的学生
    if (app.globalData.role === 'admin' && className) {
      await this.loadStudents(className);
    } else if (!className) {
      // 选择"全部班级"，重新加载所有学生
      await this.loadStudents();
    }
  },

  // 分组筛选
  onGroupChange: function (e) {
    const index = e.detail.value;
    const selectedOption = this.data.groupOptions[index];
    this.setData({
      selectedGroup: selectedOption.value,
      selectedGroupIndex: index
    });
  },

  // 级联选择器变化
  onCascaderChange: function (e) {
    const value = e.detail.value;
    const catIndex = value[0] || 0;
    const itemIndex = value[1] || 0;
    const { categories, categoryMap } = this.data;
    
    const selectedCategory = categories[catIndex];
    const items = categoryMap[selectedCategory] || [];
    const selectedItem = items[itemIndex];
    if (!selectedItem) {
      console.error('选中的项目不存在:', selectedCategory, itemIndex);
      return; // 关键：如果取不到项目，直接返回，不执行 setData
    }
    this.setData({
      cascaderValue: value,
      selectedCategory: selectedCategory
    });
    this.updateSelectedItem(selectedItem);
  },

  // 级联选择器列变化（滚动时）
  onCascaderColumnChange: function (e) {
    const { column, value } = e.detail;
    const { categories, categoryMap, cascaderData } = this.data;

    if (column === 0) {
      // 第一列变化，更新第二列
      const selectedCategory = categories[value];
      const items = categoryMap[selectedCategory] || [];
      
      // 构造新的第二列数据
      const newItemsColumn = items.map(item => ({
        name: item.item_name || item.rule_name || item.name || '未命名项目',
        score: item.score_value || item.default_score || 0,
        type: item.type || (item.score_value > 0 ? '加分' : '扣分'),
        item: item
      }));

      this.setData({
        'cascaderData[1]': newItemsColumn,
        // 关键：切换分类时，把第二列的索引强行指回 0
        cascaderValue: [value, 0] 
      });
    }
  },

  // 切换加分/扣分
  onToggleScoreType: function () {
    this.setData({
      isAddScore: !this.data.isAddScore
    });
  },

  // 来源类型选择
  onSourceTypeChange: function (e) {
    const index = e.detail.value;
    this.setData({
      selectedSourceTypeIndex: index,
      sourceType: this.data.sourceTypes[index].value
    });
  },

  // 手动输入积分值
  onScoreValueInput: function (e) {
    const value = parseInt(e.detail.value) || 0;
    this.setData({ scoreValue: Math.abs(value) });
  },

  // 积分值加减
  onScoreValueChange: function (e) {
    const delta = e.currentTarget.dataset.delta;
    let newValue = this.data.scoreValue + delta;
    if (newValue < 0) newValue = 0;
    if (newValue > 100) newValue = 100;
    this.setData({ scoreValue: newValue });
  },

  // 输入原因
  onReasonInput: function (e) {
    this.setData({ reason: e.detail.value });
  },

  // 输入备注
  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },

  // 选择/取消选择学生
  onToggleStudent: function (e) {
    const studentId = e.currentTarget.dataset.id;
    const students = this.data.students.map(s => {
      if (s.student_id === studentId) {
        return { ...s, selected: !s.selected };
      }
      return s;
    });

    const selectedStudents = students.filter(s => s.selected);
    this.setData({ students, selectedStudents });
  },

  // 全选当前筛选的学生
  onSelectAll: function () {
    const { students, selectedClass, selectedGroup, searchKeyword } = this.data;
    let filteredStudents = students;

    if (selectedClass) {
      filteredStudents = filteredStudents.filter(s => s.class_name === selectedClass);
    }

    if (selectedGroup) {
      filteredStudents = filteredStudents.filter(s => s.group === selectedGroup);
    }

    if (searchKeyword) {
      filteredStudents = filteredStudents.filter(s => 
        s.name.includes(searchKeyword) || 
        s.student_id.includes(searchKeyword)
      );
    }

    const allSelected = filteredStudents.every(s => s.selected);
    const newStudents = students.map(s => {
      const inFilter = filteredStudents.some(fs => fs.student_id === s.student_id);
      if (inFilter) {
        return { ...s, selected: !allSelected };
      }
      return s;
    });

    const selectedStudents = newStudents.filter(s => s.selected);
    this.setData({ students: newStudents, selectedStudents });
  },

  // 提交积分
  onSubmit: async function () {
    const { selectedStudents, scoreValue, isAddScore, reason, remark, sourceType, selectedItem, currentClassId, currentSemesterId } = this.data;

    // 验证
    if (selectedStudents.length === 0) {
      util.showError('请选择至少一个学生');
      return;
    }

    if (scoreValue <= 0) {
      util.showError('请输入有效的积分值');
      return;
    }

    if (!reason.trim()) {
      util.showError('请输入原因说明');
      return;
    }

    // 强制绑定班级ID和学期ID
    if (!currentClassId) {
      util.showError('班级信息缺失,无法提交');
      return;
    }

    if (!currentSemesterId) {
      util.showError('学期信息缺失,无法提交');
      return;
    }

    // 校验规则ID绑定
    if (!selectedItem || !selectedItem.record_id) {
      util.showError('请选择有效的积分规则');
      return;
    }

    // 后端权限校验:验证教师对该班级的管理权限
    try {
      const hasPermission = await this.verifyTeacherPermission();
      if (!hasPermission) {
        util.showError('您没有权限对该班级进行操作');
        return;
      }
    } catch (err) {
      console.error('权限校验失败:', err);
      util.showError('权限校验失败');
      return;
    }

    const actualScoreChange = isAddScore ? scoreValue : -scoreValue;
    const scoreText = isAddScore ? `+${scoreValue}` : `-${scoreValue}`;
    
    const content = `确定要为 ${selectedStudents.length} 名学生${isAddScore ? '添加' : '扣减'} ${scoreValue} 积分吗？\n原因：${reason}`;

    wx.showModal({
      title: '确认提交',
      content: content,
      success: async (res) => {
        if (res.confirm) {
          await this.submitScoreRecords(actualScoreChange, isAddScore);
        }
      }
    });
  },

  // 验证教师权限
  verifyTeacherPermission: async function () {
    const role = app.globalData.role;
    const openid = app.globalData.openid;
    const { currentClassId } = this.data;

    // 管理员拥有所有权限
    if (role === 'admin') {
      return true;
    }

    // 班主任检查是否为自己的班级
    if (role === 'head_teacher') {
      const teacherClassId = app.globalData.class_id;
      return teacherClassId === currentClassId;
    }

    // 科任老师检查 user_class_relation 表
    if (role === 'subject_teacher') {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('user_class_relation')
          .where({
            user_openid: openid,
            class_id: currentClassId,
            role: 'subject_teacher',
            status: 'joined'
          })
          .count();

        return res.total > 0;
      } catch (err) {
        console.error('查询教师权限失败:', err);
        return false;
      }
    }

    return false;
  },

  // 提交积分记录
  submitScoreRecords: async function (actualScoreChange, isAdd) {
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      const { selectedStudents, selectedItem, reason, remark, sourceType, currentSemester } = this.data;
      const operatorName = app.globalData.userInfo?.name || app.globalData.name || '管理员';

      let successCount = 0;
      let failCount = 0;
      const failedStudents = [];

      for (const student of selectedStudents) {
        try {
          // 计算积分变化前后的值
          const scoreBefore = student.current_score || 100;
          const scoreAfter = Math.max(0, scoreBefore + actualScoreChange);

          console.log(`处理学生 ${student.name}: 积分从 ${scoreBefore} 变为 ${scoreAfter}`);

          // 创建积分变更记录（存入 score_records 集合）
          const recordData = {
            // 记录类型标识（区分规则配置和变更记录）
            record_type: 'record',
            record_id: `REC-${Date.now()}`,
            
            // 学生关联信息
            student_id: student.student_id,
            student_id_number: student.student_id,
            student_name: student.name,
            class_name: student.class_name,
            class_id: this.data.currentClassId, // 强制使用当前班级ID
            
            // 积分变化信息
            score_before: scoreBefore,
            score_after: scoreAfter,
            score_value: actualScoreChange,
            score_change: actualScoreChange,
            score_type: isAdd ? '加分' : '扣分',
            
            // 规则引用（使用积分规则信息）
            rule_id: this.data.selectedItem?.record_id || '',
            rule_name: selectedItem?.rule_name || selectedItem?.name || reason,
            rule_category: selectedItem?.rule_category || this.data.selectedCategory || '',
            rule_code: selectedItem?.rule_code || '',
            rule_version: this.data.selectedItem?.version_number || '1.0.0',
            
            // 操作信息
            reason: reason,
            remark: remark || '',
            record_date: new Date().toISOString(),
            date: new Date(),
            operator_name: operatorName,
            operator_type: app.globalData.role === 'admin' ? '管理员' : (app.globalData.role === 'head_teacher' ? '班主任' : '教师'),
            operator_id: app.globalData.openid,
            
            // 状态信息
            status: '已确认',
            approval_status: '已通过',
            source_type: sourceType,
            
            // 学期信息（强制绑定学期ID）
            semester_id: this.data.currentSemesterId,
            semester_name: currentSemester?.semester_name || currentSemester?.name || '',
            
            // 时间戳
            created_at: new Date(),
            updated_at: new Date()
          };

          // 添加积分变更记录到 score_records 集合
          await wx.cloud.database().collection('score_records').add({ data: recordData });
          console.log(`积分记录添加成功: ${student.name}`);

          // 使用云函数更新学生积分（绕过数据库权限限制）
          try {
            const updateResult = await wx.cloud.callFunction({
              name: 'updateStudentScore',
              data: {
                studentId: student._id,
                studentIdNumber: student.student_id,
                scoreAfter: scoreAfter,
                operatorId: app.globalData.openid,
                operatorName: operatorName
              }
            });
            
            console.log(`云函数返回结果:`, updateResult);
            
            if (updateResult.result && updateResult.result.success) {
              console.log(`✅ 学生积分更新成功: ${student.name}, 新积分: ${scoreAfter}, 方法: ${updateResult.result.method}`);
              successCount++;
            } else {
              console.error(`❌ 学生积分更新失败: ${student.name}`, updateResult.result);
              failCount++;
              failedStudents.push(student.name + '(积分更新失败)');
            }
          } catch (cloudErr) {
            console.error(`❌ 云函数调用失败:`, cloudErr);
            failCount++;
            failedStudents.push(student.name + '(云函数调用失败)');
          }
        } catch (err) {
          console.error(`为 ${student.name} 添加积分失败:`, err);
          failCount++;
          failedStudents.push(student.name);
        }
      }

      wx.hideLoading();
      this.setData({ submitting: false });

      if (failCount === 0) {
        util.showSuccess(`成功为 ${successCount} 名学生${isAdd ? '添加' : '扣减'}积分`);
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showModal({
          title: '部分成功',
          content: `成功：${successCount}人\n失败：${failCount}人\n失败学生：${failedStudents.join('、')}`,
          showCancel: false
        });
      }

    } catch (err) {
      console.error('提交积分记录失败:', err);
      wx.hideLoading();
      this.setData({ submitting: false });
      util.showError('提交失败: ' + (err.message || err.errMsg || '未知错误'));
    }
  }
});
