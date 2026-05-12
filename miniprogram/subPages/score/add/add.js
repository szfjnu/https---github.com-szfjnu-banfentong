// pages/score/add/add.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');
const batchQuery = require('../../../utils/batchQuery.js');

Page({
  data: {
    loading: true,
    submitting: false,
    // 学生相关
    students: [],
    filteredStudents: [],
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
    let semesterId = app.globalData.currentSemesterId || '';
    
    console.log('初始化用户上下文 - role:', role, 'classId:', classId, 'semesterId:', semesterId);
    
    // 如果全局数据中没有学期信息，主动获取
    if (!semesterId) {
      console.log('【积分登记】全局数据中没有学期信息，正在获取...');
      try {
        const semester = await app.getCurrentSemester();
        if (semester) {
          semesterId = semester._id || semester.semester_id || '';
          console.log('【积分登记】获取学期成功:', semester.name, 'ID:', semesterId);
        } else {
          console.warn('【积分登记】未找到当前学期');
        }
      } catch (err) {
        console.error('【积分登记】获取学期失败:', err);
      }
    }
    
    this.setData({
      currentClassId: classId,
      currentSemesterId: semesterId
    });
    
    // 如果是班主任,只加载自己管理的班级
    if (role === 'head_teacher' && classId) {
      // 获取班级名称用于构建选项
      const className = await this.getClassNameById(classId);
      this.setData({
        selectedClass: classId,
        selectedClassIndex: classId ? 1 : 0,
        managedClasses: [classId],
        classOptions: [
          { value: '', label: '全部班级' },
          { value: classId, label: className || '我的班级' }
        ]
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
    
    if (role !== 'admin' && role !== 'head_teacher' && role !== 'teacher' && role !== 'class_cadre') {
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

  // 根据班级ID获取班级名称
  getClassNameById: async function (classId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('classes')
        .doc(classId)
        .field({ class_name: true })
        .get();
      return res.data?.class_name || '';
    } catch (err) {
      console.error('获取班级名称失败:', err);
      return '';
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
  loadStudents: async function (filterByClassId = null) {
    try {
      const role = app.globalData.role;
      const { currentClassId, managedClasses, currentSemesterId } = this.data;
      
      console.log('【加载学生开始】role:', role, 'currentClassId:', currentClassId, 'managedClasses:', managedClasses, 'filterByClassId:', filterByClassId);
      
      const db = wx.cloud.database();
      const _ = db.command;
      let query = {};
      
      // 数据隔离:根据角色过滤学生
      if (role === 'head_teacher') {
        // 班主任：使用 currentClassId 直接按 class_id 查询
        if (currentClassId) {
          query.class_id = currentClassId;
          console.log('【班主任】按class_id筛选:', currentClassId);
        } else {
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
            const classId = relationRes.data[0].class_id;
            query.class_id = classId;
            console.log('【班主任】从关系表获取class_id:', classId);
          } else {
            console.warn('班主任未找到关联班级，将尝试加载所有学生');
          }
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
          console.log('【科任老师】按class_id筛选:', targetClassIds);
        } else {
          console.warn('科任老师未找到关联班级');
          this.setData({ students: [] });
          return;
        }
      } else if (role === 'admin') {
        // 管理员可以查看所有学生
        if (filterByClassId) {
          query.class_id = filterByClassId;
        }
      } else if (role === 'class_cadre') {
        // 班干部：获取所在班级的学生列表
        const relationRes = await db.collection('user_class_relation')
          .where({
            user_openid: app.globalData.openid,
            status: 'joined'
          })
          .limit(1)
          .get();
        if (relationRes.data.length > 0) {
          const classId = relationRes.data[0].class_id;
          query.class_id = classId;
          console.log('【班干部】按class_id筛选:', classId);
        } else if (app.globalData.class_id) {
          query.class_id = app.globalData.class_id;
          console.log('【班干部】从全局数据获取class_id:', app.globalData.class_id);
        }
      } else {
        // 其他角色不允许加载学生
        this.setData({ students: [] });
        console.log('无权限加载学生, role:', role);
        return;
      }

      // 执行查询
      console.log('【loadStudents】执行学生查询, query:', query);
      const res = await wx.cloud.callFunction({
        name: 'manageAuthorization',
        data: { action: 'getStudents', data: { class_id: query.class_id || app.globalData.class_id } }
      });
      const studentsData = (res.result && res.result.success) ? res.result.data : [];
      console.log('【loadStudents】查询到学生数量:', studentsData.length, '数据:', studentsData);

      // 处理学生数据
      let students = studentsData.map(student => ({
        ...student, 
        selected: false, 
        scoreLevel: util.getScoreLevel(student.current_score || 100)
      }));
      
      // 学籍校验（仅对有班级的情况且启用了学期校验）
      if (currentSemesterId && currentClassId) {
        const targetClassId = currentClassId;
        
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
      this.applyStudentFilter();
      console.log('【学生加载完成】共', students.length, '人');

    } catch (err) {
      console.error('【加载学生失败】:', err);
      this.setData({ students: [] });
    }
  },

  // 加载班级列表
  loadClasses: async function () {
    // 如果是班主任，班级选项已在 initUserContext 中设置，不再重新加载
    if (app.globalData.role === 'head_teacher') {
      console.log('【加载班级】班主任已设置班级选项，跳过加载');
      return;
    }
    
    try {
      const res = await api.classApi.getClasses();
      const classOptions = [
        { value: '', label: '全部班级' },
        ...res.data.map(item => ({
          value: item._id,
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
      const { isAddScore } = this.data;

      // 1. 使用云函数获取类别和规则，突破小程序端20条限制
      const classId = this.data.currentClassId || app.globalData.class_id || '';

      const [catCfRes, itemCfRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'scoreManager',
          data: { action: 'getScoreCategories', data: { classId } }
        }),
        wx.cloud.callFunction({
          name: 'scoreManager',
          data: { action: 'getScoreItems', data: { classId, semesterId: app.globalData.currentSemesterId || '' } }
        })
      ]);

      const categoryList = (catCfRes.result && catCfRes.result.data) || [];
      const allItems = (itemCfRes.result && itemCfRes.result.data) || [];
      
      // 3. 过滤出符合当前操作类型的项目
      const filteredItems = allItems.filter(item => {
        const scoreValue = item.score_value || item.default_score || 0;
        // 加分操作：只显示分值>0的项目；扣分操作：只显示分值<0的项目
        return isAddScore ? scoreValue > 0 : scoreValue < 0;
      });
      
      // 4. 按类别分组
      const categoryMap = {};
      // 初始化映射表
      categoryList.forEach(cat => {
        categoryMap[cat.category_name] = [];
      });
      
      // 将规则归类到对应的分类中
      filteredItems.forEach(item => {
        const catName = (item.rule_category || item.category || '其他').trim();
        const scoreValue = item.score_value || item.default_score || 0;
        const ruleName = item.rule_name || item.name || item.item_name || '未命名项目';

        const normalizedItem = {
          ...item,
          rule_category: catName,
          score_value: scoreValue,
          rule_name: ruleName
        };

        if (!categoryMap[catName]) {
          categoryMap[catName] = [];
        }
        categoryMap[catName].push(normalizedItem);
      });
      
      // 5. 提取有效的分类名称列表（只包含有项目的分类）
      const validCategories = [];
      const finalCategories = [];
      
      categoryList.forEach(c => {
        if (categoryMap[c.category_name] && categoryMap[c.category_name].length > 0) {
          finalCategories.push(c.category_name);
        }
      });
      
      // 补充未在分类表中但有项目的分类
      Object.keys(categoryMap).forEach(name => {
        if (categoryMap[name].length > 0 && !finalCategories.includes(name)) {
          finalCategories.push(name);
        }
      });
      
      // 6. 构建级联选择器数据
      const firstCategory = finalCategories[0] || '其他';
      const firstItems = categoryMap[firstCategory] || [];
      
      const cascaderData = [
        finalCategories.map(name => ({ name })),
        firstItems.map(item => ({
          name: item.rule_name,
          score: item.score_value,
          type: item.score_value > 0 ? '加分' : '扣分',
          item: item
        }))
      ];  

      this.setData({
        scoreItems: allItems,           // 保存所有项目用于切换
        filteredScoreItems: filteredItems, // 保存过滤后的项目
        categories: finalCategories,
        categoryMap: categoryMap,
        cascaderData: cascaderData,
        selectedCategory: firstCategory,
        cascaderValue: [0, 0]
      });

      // 7. 默认选择第一个项目
      if (firstItems.length > 0) {
        this.updateSelectedItem(firstItems[0]);
      }
      
      console.log('加载积分规则成功, 共', allItems.length, '条, 当前显示', filteredItems.length, '条');

    } catch (err) {
      console.error('加载积分项目失败:', err);
      util.showError('积分配置加载失败');
    }
  },
  
  // 重新构建级联选择器数据（用于切换加分/扣分时）
  rebuildCascaderData: function() {
    const { scoreItems, isAddScore, categoryMap } = this.data;
    
    // 重新过滤项目
    const filteredItems = scoreItems.filter(item => {
      const scoreValue = item.score_value || item.default_score || 0;
      return isAddScore ? scoreValue > 0 : scoreValue < 0;
    });
    
    // 重新构建categoryMap
    const newCategoryMap = {};
    Object.keys(categoryMap).forEach(catName => {
      newCategoryMap[catName] = [];
    });
    
    filteredItems.forEach(item => {
      const catName = item.rule_category || '其他';
      if (!newCategoryMap[catName]) {
        newCategoryMap[catName] = [];
      }
      newCategoryMap[catName].push(item);
    });
    
    // 提取有效分类
    const finalCategories = [];
    Object.keys(newCategoryMap).forEach(name => {
      if (newCategoryMap[name].length > 0) {
        finalCategories.push(name);
      }
    });
    
    // 构建级联选择器数据
    const firstCategory = finalCategories[0] || '其他';
    const firstItems = newCategoryMap[firstCategory] || [];
    
    const cascaderData = [
      finalCategories.map(name => ({ name })),
      firstItems.map(item => ({
        name: item.rule_name,
        score: item.score_value,
        type: item.score_value > 0 ? '加分' : '扣分',
        item: item
      }))
    ];
    
    this.setData({
      filteredScoreItems: filteredItems,
      categories: finalCategories,
      categoryMap: newCategoryMap,
      cascaderData: cascaderData,
      selectedCategory: firstCategory,
      cascaderValue: [0, 0]
    });
    
    // 选择第一个项目
    if (firstItems.length > 0) {
      this.updateSelectedItem(firstItems[0]);
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
    this.applyStudentFilter();
  },

  applyStudentFilter: function () {
    const { students, selectedClass, selectedGroup, searchKeyword } = this.data;
    let filtered = students;

    if (selectedClass) {
      filtered = filtered.filter(s => s.class_id === selectedClass);
    }
    if (selectedGroup) {
      filtered = filtered.filter(s => s.group === selectedGroup);
    }
    if (searchKeyword) {
      const kw = searchKeyword.toLowerCase();
      filtered = filtered.filter(s =>
        (s.name && s.name.toLowerCase().includes(kw)) ||
        (s.student_name && s.student_name.toLowerCase().includes(kw)) ||
        (s.student_id && String(s.student_id).includes(kw))
      );
    }
    this.setData({ filteredStudents: filtered });
  },

  // 班级筛选
  onClassChange: async function (e) {
    const index = e.detail.value;
    const selectedOption = this.data.classOptions[index];
    const classIdOrEmpty = selectedOption.value;
    
    console.log('班级选择变化:', classIdOrEmpty, 'label:', selectedOption.label);
    
    this.setData({
      selectedClass: classIdOrEmpty,
      selectedClassIndex: index
    });
    
    if (app.globalData.role === 'admin' && classIdOrEmpty) {
      await this.loadStudents(classIdOrEmpty);
    } else if (!classIdOrEmpty) {
      await this.loadStudents();
    }
  },

  // 分组筛选
  onGroupChange: async function (e) {
    const index = e.detail.value;
    const selectedOption = this.data.groupOptions[index];
    const selectedGroup = selectedOption.value;
    
    this.setData({
      selectedGroup: selectedGroup,
      selectedGroupIndex: index
    });

    // 如果选择了特定分组，根据分组成员筛选学生
    if (selectedGroup) {
      await this.loadStudentsByGroup(selectedGroup);
    } else {
      // 选择"全部分组"，重新加载所有学生
      await this.loadStudents();
    }
  },

  // 根据分组加载学生
  loadStudentsByGroup: async function (groupName) {
    try {
      const { currentClassId } = this.data;
      const db = wx.cloud.database();
      const _ = db.command;

      console.log('【按分组加载学生】分组名:', groupName, '班级ID:', currentClassId);

      // 1. 查询分组信息
      const groupQuery = {
        group_name: groupName,
        class_id: currentClassId || app.globalData.class_id || ''
      };

      console.log('【分组查询条件】:', groupQuery);

      const groupRes = await db.collection('student_groups')
        .where(groupQuery)
        .limit(1)
        .get();

      console.log('【分组查询结果】:', groupRes.data);

      if (!groupRes.data || groupRes.data.length === 0) {
        console.warn('未找到分组:', groupName);
        wx.showToast({
          title: '未找到该分组',
          icon: 'none'
        });
        this.setData({ students: [] });
        return;
      }

      const group = groupRes.data[0];
      const members = group.members || [];
      
      console.log('【分组信息】名称:', group.group_name, '成员数:', members.length, '成员列表:', members);

      if (members.length === 0) {
        this.setData({ students: [] });
        return;
      }

      // 2. 提取成员学生ID列表
      const memberIds = members.map(m => m.student_id);
      console.log('【成员ID列表】:', memberIds);
      
      // 3. 反查学生表获取详细信息
      const studentsResData = await batchQuery.getAllRecords('students', {
        student_id: _.in(memberIds)
      });

      console.log('【学生查询结果】数量:', studentsResData.length, '数据:', studentsResData);

      // 4. 处理学生数据
      let students = studentsResData.map(student => ({
        ...student,
        selected: false,
        scoreLevel: util.getScoreLevel(student.current_score || 100)
      }));

      // 5. 如果组长也在成员列表中，标记组长
      if (group.leader_id) {
        students = students.map(s => {
          if (s.student_id === group.leader_id) {
            return { ...s, isLeader: true };
          }
          return s;
        });
      }

      this.setData({ students });
      this.applyStudentFilter();
      console.log('【分组学生加载完成】共', students.length, '人, 学生数据:', students);

    } catch (err) {
      console.error('【按分组加载学生失败】:', err);
      this.setData({ students: [] });
      wx.showToast({
        title: '加载分组学生失败',
        icon: 'none'
      });
    }
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

      // 处理空分类情况
      if (items.length === 0) {
        this.setData({
          'cascaderData[1]': [{ name: '该分类暂无项目', score: 0, type: '加分', item: null }],
          cascaderValue: [value, 0]
        });
        return;
      }

      // 构造新的第二列数据
      const newItemsColumn = items.map(item => ({
        name: item.rule_name,
        score: item.score_value,
        type: item.score_value > 0 ? '加分' : '扣分',
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
    const newIsAddScore = !this.data.isAddScore;
    this.setData({
      isAddScore: newIsAddScore
    });
    
    // 重新构建级联选择器数据
    this.rebuildCascaderData();
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
    const maxScore = app.globalData.scoreMax || 100;
    if (newValue > maxScore) newValue = maxScore;
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
    this.applyStudentFilter();
  },

  // 全选当前筛选的学生
  onSelectAll: function () {
    const { students, selectedClass, selectedGroup, searchKeyword } = this.data;
    let filteredStudents = students;

    if (selectedClass) {
      filteredStudents = filteredStudents.filter(s => s.class_id === selectedClass);
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
    if (this.data.submitting) return;
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

          // 添加积分变更记录到 score_records 集合（通过云函数）
          try {
            const addRecordRes = await wx.cloud.callFunction({
              name: 'scoreManager',
              data: { action: 'addScoreRecord', data: recordData }
            });
            if (!addRecordRes.result || !addRecordRes.result.success) {
              console.error('积分记录添加失败:', addRecordRes.result);
            }
          } catch (err) {
            console.error('积分记录添加云函数调用失败:', err);
          }
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
