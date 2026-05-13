// utils/api.js
// API封装 - 云数据库操作封装

const db = wx.cloud.database();
const _ = db.command;

/**
 * 学生相关API
 */
const studentApi = {
  // 获取学生列表
  //getStudents: (options = {}) => {
  //  const { limit = 20, skip = 0, search = '', class_name = '' } = options;

  //  let query = {};
  //  if (search) {
  //    query = _.or([
  //      { name: db.RegExp({ regexp: search, options: 'i' }) },
  //      { student_id: db.RegExp({ regexp: search, options: 'i' }) }
  //    ]);
  //  }
  //  if (class_name) {
  //    query.class_name = class_name;
  //  }

  //  return db.collection('students')
  //    .where(query)
  //    .orderBy('created_at', 'desc')
  //    .skip(skip)
  //    .limit(limit)
  //    .get();
  //},
  // 获取学生列表修改后的代码
  getStudents: function (options = {}) {
    const { limit = 20, skip = 0, search = '', class_id } = options; // 1. 接收 class_id

    let query = db.collection('students');

    // 2. 如果有 class_id，就加 where 条件
    if (class_id) {
      query = query.where({
        class_id: class_id
      });
    }

    // 3. 搜索逻辑
    if (search) {
      // 这里假设你有一个 search_name 字段或者用正则
      // 注意：云开发正则查询比较消耗性能，建议简单搜索
      query = query.where({
        name: db.RegExp({
          regexp: search,
          options: 'i'
        })
      });
    }

    return query
      .orderBy('created_at', 'desc')
      .skip(skip)
      .limit(limit)
      .get()
      .then(res => {
        return res;
      });
  },
  // 按文档_id获取学生详情（BUG3修复：明确按主键查询）
  getStudentById: (docId) => {
    return db.collection('students').doc(docId).get();
  },

  // 按学号获取学生详情（BUG3修复：原getStudent误用doc()将学号当_id查询）
  getStudent: (studentId) => {
    return db.collection('students')
      .where({ student_id: studentId })
      .limit(1)
      .get();
  },

  // 根据学号获取学生详情（显式命名，语义更清晰）
  getStudentByStudentId: (studentId) => {
    return db.collection('students')
      .where({ student_id: studentId })
      .limit(1)
      .get();
  },

  addStudent: async (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'addStudent', data }
      });
      return res.result;
    } catch (err) {
      console.error('addStudent云函数调用失败:', err);
      throw err;
    }
  },

  updateStudent: async (studentId, data) => {
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'updateStudent', data: { studentId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateStudent云函数调用失败:', err);
      throw err;
    }
  },

  deleteStudent: async (studentId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'deleteStudent', data: { studentId } }
      });
      return res.result;
    } catch (err) {
      console.error('deleteStudent云函数调用失败:', err);
      throw err;
    }
  }
};

/**
 * 积分相关API
 */
const scoreApi = {
  // 获取积分排行榜
  getScoreRanking: (options = {}) => {
    const { limit = 50, class_id = '', class_name = '' } = options;

    let query = {};
    // 2. 优先使用 class_id 进行筛选（修正逻辑）
    if (class_id) {
      query.class_id = class_id;
    } else if (class_name) {
      query.class_name = class_name;
    }

    return db.collection('students')
      .where(query)
      .orderBy('current_score', 'desc')
      .limit(limit)
      .get();
  },

  // 获取积分记录
  getScoreRecords: (options = {}) => {
    const { limit = 20, skip = 0, student_id = '', item_id = '', source_type = '', approval_status = '', class_id = '' } = options;

    let query = {};

    if (student_id) {
      query.student_id = student_id;
    }

    if (item_id) {
      query.item_id = item_id;
    }

    if (source_type) {
      query.source_type = source_type;
    }

    if (approval_status) {
      query.approval_status = approval_status;
    }

    if (class_id) {
      query.class_id = class_id;
    }

    return db.collection('score_records')
      .where(query)
      .orderBy('date', 'desc')
      .skip(skip)
      .limit(limit)
      .get();
  },

  // 获取积分记录详情
  getScoreRecordDetail: (recordId) => {
    return db.collection('score_records').doc(recordId).get();
  },

  addScoreRecord: async (data) => {
    data.created_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'addScoreRecord', data }
      });
      return res.result;
    } catch (err) {
      console.error('addScoreRecord云函数调用失败:', err);
      throw err;
    }
  },

  // 获取积分项目
  getScoreItems: (category = '') => {
    let query = { is_active: true };
    if (category) {
      query.category = category;
    }

    return db.collection('score_items')
      .where(query)
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取所有积分规则
  getAllScoreItems: () => {
    return db.collection('score_items')
      .orderBy('created_at', 'desc')
      .get();
  },

  addScoreItem: async (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'addScoreItem', data }
      });
      return res.result;
    } catch (err) {
      console.error('addScoreItem云函数调用失败:', err);
      throw err;
    }
  },

  updateScoreItem: async (itemId, data) => {
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'updateScoreItem', data: { itemId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateScoreItem云函数调用失败:', err);
      throw err;
    }
  },

  deleteScoreItem: async (itemId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'deleteScoreItem', data: { itemId } }
      });
      return res.result;
    } catch (err) {
      console.error('deleteScoreItem云函数调用失败:', err);
      throw err;
    }
  }
};

/**
 * 志愿服务相关API
 */
const volunteerApi = {
  // 获取志愿服务统计
  getStatistics: async (studentId) => {
    const db = wx.cloud.database();

    let query = {};
    if (studentId) {
      query.student_id = studentId;
    }

    try {
      const res = await db.collection('volunteer_records').where(query).orderBy('created_at', 'desc').limit(100).get();
      const records = res.data;

      const totalHours = records.reduce((sum, r) => sum + (r.duration || 0), 0);
      const totalScore = records.reduce((sum, r) => sum + (r.earned_score || 0), 0);
      const recordCount = records.length;

      return {
        data: {
          totalHours,
          totalScore,
          recordCount
        }
      };
    } catch (err) {
      console.error('获取志愿服务统计失败:', err);
      return {
        data: {
          totalHours: 0,
          totalScore: 0,
          recordCount: 0
        }
      };
    }
  },

  // 获取志愿服务记录列表
  getRecords: (options = {}) => {
    const { limit = 20, skip = 0, search = '', service_type = '', student_id = '' } = options;

    let query = {};

    if (student_id) {
      query.student_id = student_id;
    }

    if (service_type) {
      query.service_type = service_type;
    }

    if (search) {
      query.activity_name = db.RegExp({ regexp: search, options: 'i' });
    }

    return db.collection('volunteer_records')
      .where(query)
      .orderBy('date', 'desc')
      .skip(skip)
      .limit(limit)
      .get();
  },

  addVolunteerRecord: async (data) => {
    data.created_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'addVolunteerRecord', data }
      });
      return res.result;
    } catch (err) {
      console.error('addVolunteerRecord云函数调用失败:', err);
      throw err;
    }
  },

  // 获取志愿服务详情
  getVolunteerDetail: (recordId) => {
    return db.collection('volunteer_records').doc(recordId).get();
  }
};

/**
 * 处分相关API
 */
const disciplineApi = {
  // 获取处分记录
  getDisciplineRecords: (studentId) => {
    return db.collection('discipline_records')
      .where({ student_id: studentId, is_deleted: db.command.neq(true) })
      .orderBy('issue_date', 'desc')
      .get();
  },

  addDisciplineRecord: async (data) => {
    data.createdAt = db.serverDate();
    data.updatedAt = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDiscipline',
        data: { action: 'addDisciplineRecord', data }
      });
      return res.result;
    } catch (err) {
      console.error('addDisciplineRecord云函数调用失败:', err);
      throw err;
    }
  }
};

/**
 * 学期相关API
 */
const semesterApi = {
  getCurrentSemester: async (classId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'getSemesterConfig', data: { class_id: classId || '' } }
      });
      if (res.result && res.result.success) {
        return { data: [res.result.data] };
      }
      return { data: [] };
    } catch (err) {
      console.error('getCurrentSemester云函数调用失败:', err);
      return { data: [] };
    }
  },

  getSemesters: (classId) => {
    const query = {};
    if (classId) {
      const _ = wx.cloud.database().command;
      query.class_id = _.in([classId, '', null, undefined]);
    }
    return db.collection('semesters')
      .where(query)
      .orderBy('start_date', 'desc')
      .get();
  },

  getAllSemesters: () => {
    return db.collection('semesters')
      .orderBy('start_date', 'desc')
      .get();
  },

  addSemester: async (data) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'addSemester', data: data }
      });
      return res.result;
    } catch (err) {
      console.error('addSemester云函数调用失败:', err);
      throw err;
    }
  },

  updateSemester: async (semesterId, data) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'updateSemester', data: { _id: semesterId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateSemester云函数调用失败:', err);
      throw err;
    }
  },

  setCurrentSemester: async (semesterId, classId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'setCurrentSemester', data: { semester_id: semesterId, class_id: classId || '' } }
      });
      return res.result;
    } catch (err) {
      console.error('setCurrentSemester云函数调用失败:', err);
      throw err;
    }
  },

  initClassSemester: async (classId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'initClassSemester', data: { class_id: classId } }
      });
      return res.result;
    } catch (err) {
      console.error('initClassSemester云函数调用失败:', err);
      throw err;
    }
  },

  getSemesterConfig: async (classId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'getSemesterConfig', data: { class_id: classId || '' } }
      });
      return res.result;
    } catch (err) {
      console.error('getSemesterConfig云函数调用失败:', err);
      return { success: false, message: err.message };
    }
  },

  deleteSemester: async (semesterId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageSemester',
        data: { action: 'deleteSemester', data: { semester_id: semesterId } }
      });
      return res.result;
    } catch (err) {
      console.error('deleteSemester云函数调用失败:', err);
      return { success: false, message: err.message || '删除失败' };
    }
  },

  getSemesterDetail: (semesterId) => {
    return db.collection('semesters').doc(semesterId).get();
  }
};

/**
 * 班级相关API
 */
const classApi = {
  // 获取班级列表（所有班级，仅管理员使用）
  getClasses: () => {
    return db.collection('classes')
      .where({ status: 'active' })
      .orderBy('class_name', 'asc')
      .get();
  },

  // 获取用户所属的班级列表（根据user_class_relation）
  getUserClasses: async (userOpenid) => {
    try {
      // 1. 查询用户与班级的关系
      const relationsRes = await db.collection('user_class_relation')
        .where({
          user_openid: userOpenid,
          status: 'joined'
        })
        .get();

      if (!relationsRes.data || relationsRes.data.length === 0) {
        return { data: [] };
      }

      // 2. 获取每个班级的详情
      const classes = [];
      for (const relation of relationsRes.data) {
        try {
          const classRes = await db.collection('classes').doc(relation.class_id).get();
          if (classRes.data) {
            classes.push({
              ...classRes.data,
              role: relation.role,
              is_owner: relation.is_owner || false,
              student_id: relation.student_id || null,
              relation_id: relation._id
            });
          }
        } catch (err) {
          console.error('获取班级详情失败:', relation.class_id, err);
        }
      }

      return { data: classes };
    } catch (err) {
      console.error('获取用户班级列表失败:', err);
      return { data: [] };
    }
  },

  // 获取班级详情
  getClass: (classId) => {
    return db.collection('classes').doc(classId).get();
  },

  addClass: async (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'createClass', data }
      });
      return res.result;
    } catch (err) {
      console.error('addClass云函数调用失败:', err);
      throw err;
    }
  },

  updateClass: async (classId, data) => {
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'updateClass', data: { classId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateClass云函数调用失败:', err);
      throw err;
    }
  },

  // 根据班级代码查找班级（兼容无status字段的旧数据）
  getClassByCode: (classCode) => {
    return db.collection('classes')
      .where({
        class_code: classCode,
        status: _.in(['active', undefined, null, ''])
      })
      .limit(1)
      .get();
  },

  // 根据创建者手机号查找班级（兼容无status字段的旧数据）
  getClassesByCreatorPhone: (phone) => {
    return db.collection('classes')
      .where({
        creator_phone: phone,
        status: _.in(['active', undefined, null, ''])
      })
      .get();
  }
};

/**
 * 用户相关API
 */
const userApi = {
  // 获取用户信息
  getUser: (openid) => {
    return db.collection('users')
      .where({ _openid: openid })
      .limit(1)
      .get();
  },

  updateUser: async (userId, data) => {
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageUserCenter',
        data: { action: 'updateUser', data: { userId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateUser云函数调用失败:', err);
      throw err;
    }
  },

  addUser: async (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: { action: 'ensureUser', data }
      });
      return res.result;
    } catch (err) {
      console.error('addUser云函数调用失败:', err);
      throw err;
    }
  },

  // 根据用户ID获取用户详情
  getUserById: (userId) => {
    return db.collection('users').doc(userId).get();
  }
};

/**
 * 积分兑换相关API
 */
const redemptionApi = {
  // 获取可兑换物品（按班级过滤）
  getRedemptionItems: (classId) => {
    const query = { status: '可兑换' };
    if (classId) query.class_id = classId;
    return db.collection('redemption_items')
      .where(query)
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取所有兑换物品（按班级过滤）
  getAllItems: (classId) => {
    const query = {};
    if (classId) query.class_id = classId;
    return db.collection('redemption_items')
      .where(query)
      .orderBy('created_at', 'desc')
      .get();
  },

  addItem: async (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'processRedemption',
        data: { action: 'addItem', data }
      });
      return res.result;
    } catch (err) {
      console.error('addItem云函数调用失败:', err);
      throw err;
    }
  },

  updateItem: async (itemId, data) => {
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'processRedemption',
        data: { action: 'updateItem', data: { itemId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateItem云函数调用失败:', err);
      throw err;
    }
  },

  submitRedemption: async (data) => {
    data.created_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'processRedemption',
        data: { action: 'submitRedemption', data }
      });
      return res.result;
    } catch (err) {
      console.error('submitRedemption云函数调用失败:', err);
      throw err;
    }
  },

  // 获取兑换记录（按班级过滤）
  getRedemptionRecords: (studentId, classId) => {
    const query = { student_id: studentId };
    if (classId) query.class_id = classId;
    return db.collection('redemption_requests')
      .where(query)
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取所有兑换请求（按班级过滤）
  getAllRequests: (classId) => {
    const query = {};
    if (classId) query.class_id = classId;
    return db.collection('redemption_requests')
      .where(query)
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取指定物品的兑换请求（按班级过滤）
  getRequestsByItem: (itemId, classId) => {
    const query = { item_id: itemId };
    if (classId) query.class_id = classId;
    return db.collection('redemption_requests')
      .where(query)
      .orderBy('created_at', 'desc')
      .get();
  },

  updateRequest: async (requestId, data) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'processRedemption',
        data: { action: 'updateRequest', data: { requestId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateRequest云函数调用失败:', err);
      throw err;
    }
  }
};

/**
 * 宿舍积分相关API
 */
const dormScoreApi = {
  // 获取宿舍积分记录
  getDormScoreRecords: (studentId) => {
    return db.collection('dorm_score_records')
      .where({ student_id: studentId })
      .orderBy('date', 'desc')
      .get();
  },

  addDormScoreRecord: async (data) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'convertDormScore',
        data: {
          action: data.action || 'addDormScoreRecord',
          data
        }
      });
      return res.result;
    } catch (err) {
      console.error('addDormScoreRecord云函数调用失败:', err);
      throw err;
    }
  }
};

/**
 * 成绩相关API
 */
const gradeApi = {
  // 获取成绩记录
  getGradeRecords: (studentId) => {
    return db.collection('grade_records')
      .where({ student_id: studentId })
      .orderBy('exam_date', 'desc')
      .get();
  },

  addGradeRecord: async (data) => {
    data.created_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'gradeManager',
        data: { action: 'addGradeRecord', data }
      });
      return res.result;
    } catch (err) {
      console.error('addGradeRecord云函数调用失败:', err);
      throw err;
    }
  }
};

/**
 * 值日相关API
 */
const dutyApi = {
  // 获取值日表
  getDutySchedule: (semesterId, weekNumber) => {
    return db.collection('duty_schedule')
      .where({
        semester_id: semesterId,
        week_number: weekNumber
      })
      .get();
  },

  updateDutyTask: async (scheduleId, taskId, data) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageDuty',
        data: { action: 'updateDutyTask', data: { scheduleId, taskId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateDutyTask云函数调用失败:', err);
      throw err;
    }
  }
};

/**
 * 分组相关API
 */
const groupApi = {
  // 获取所有分组
  getGroups: () => {
    return db.collection('student_groups')
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取分组详情
  getGroup: (groupId) => {
    return db.collection('student_groups').doc(groupId).get();
  },

  addGroup: async (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'addGroup', data }
      });
      return res.result;
    } catch (err) {
      console.error('addGroup云函数调用失败:', err);
      throw err;
    }
  },

  updateGroup: async (groupId, data) => {
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'updateGroup', data: { groupId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateGroup云函数调用失败:', err);
      throw err;
    }
  },

  deleteGroup: async (groupId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'scoreManager',
        data: { action: 'deleteGroup', data: { groupId } }
      });
      return res.result;
    } catch (err) {
      console.error('deleteGroup云函数调用失败:', err);
      throw err;
    }
  }
};

/**
 * 文件相关API
 */
const fileApi = {
  // 上传文件
  uploadFile: (cloudPath, filePath) => {
    return wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath
    });
  },

  // 下载文件
  downloadFile: (fileID) => {
    return wx.cloud.downloadFile({
      fileID: fileID
    });
  },

  // 删除文件
  deleteFile: (fileList) => {
    return wx.cloud.deleteFile({
      fileList: fileList
    });
  }
};

/**
 * 用户班级关系相关API
 */
const relationApi = {
  // 获取用户的所有班级关系
  getUserRelations: (userOpenid, status = '') => {
    let query = { user_openid: userOpenid };
    if (status) {
      query.status = status;
    }
    return db.collection('user_class_relation')
      .where(query)
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取班级的所有成员关系
  getClassRelations: (classId, status = 'joined') => {
    let query = { class_id: classId };
    if (status) {
      query.status = status;
    }
    return db.collection('user_class_relation')
      .where(query)
      .orderBy('join_time', 'desc')
      .get();
  },

  addRelation: async (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'addRelation', data }
      });
      return res.result;
    } catch (err) {
      console.error('addRelation云函数调用失败:', err);
      throw err;
    }
  },

  updateRelation: async (relationId, data) => {
    data.updated_at = db.serverDate();
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'updateRelation', data: { relationId, ...data } }
      });
      return res.result;
    } catch (err) {
      console.error('updateRelation云函数调用失败:', err);
      throw err;
    }
  },

  deleteRelation: async (relationId) => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinClass',
        data: { action: 'deleteRelation', data: { relationId } }
      });
      return res.result;
    } catch (err) {
      console.error('deleteRelation云函数调用失败:', err);
      throw err;
    }
  },

  // 检查用户是否已加入班级
  checkUserInClass: (userOpenid, classId) => {
    return db.collection('user_class_relation')
      .where({
        user_openid: userOpenid,
        class_id: classId,
        status: _.in(['joined', 'pending'])
      })
      .limit(1)
      .get();
  },

  // 根据关系ID获取关系详情
  getRelation: (relationId) => {
    return db.collection('user_class_relation').doc(relationId).get();
  }
};

module.exports = {
  studentApi,
  scoreApi,
  volunteerApi,
  disciplineApi,
  semesterApi,
  classApi,
  userApi,
  redemptionApi,
  dormScoreApi,
  gradeApi,
  dutyApi,
  fileApi,
  groupApi,
  relationApi,
  db,
  _
};
