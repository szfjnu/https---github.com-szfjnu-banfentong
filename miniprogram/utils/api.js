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
  // 获取学生详情
  getStudent: (studentId) => {
    return db.collection('students').doc(studentId).get();
  },

  // 根据学号获取学生详情
  getStudentByStudentId: (studentId) => {
    return db.collection('students')
      .where({ student_id: studentId })
      .limit(1)
      .get();
  },

  // 添加学生
  addStudent: (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    return db.collection('students').add({ data });
  },

  // 更新学生
  updateStudent: (studentId, data) => {
    data.updated_at = db.serverDate();
    return db.collection('students').doc(studentId).update({ data });
  },

  // 删除学生
  deleteStudent: (studentId) => {
    return db.collection('students').doc(studentId).remove();
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

  // 添加积分记录
  addScoreRecord: (data) => {
    data.created_at = db.serverDate();
    return db.collection('score_records').add({ data });
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

  // 添加积分规则
  addScoreItem: (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    return db.collection('score_items').add({ data });
  },

  // 更新积分规则
  updateScoreItem: (itemId, data) => {
    data.updated_at = db.serverDate();
    return db.collection('score_items').doc(itemId).update({ data });
  },

  // 删除积分规则
  deleteScoreItem: (itemId) => {
    return db.collection('score_items').doc(itemId).remove();
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
      const res = await db.collection('volunteer_records').where(query).get();
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

  // 添加志愿服务记录
  addVolunteerRecord: (data) => {
    data.created_at = db.serverDate();
    return db.collection('volunteer_records').add({ data });
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
    return db.collection('discipline_record')
      .where({ student_id: studentId })
      .orderBy('date', 'desc')
      .get();
  },

  // 添加处分记录
  addDisciplineRecord: (data) => {
    data.createdAt = db.serverDate();
    data.updatedAt = db.serverDate();
    return db.collection('discipline_record').add({ data });
  }
};

/**
 * 学期相关API
 */
const semesterApi = {
  // 获取当前学期
  getCurrentSemester: () => {
    return db.collection('semesters')
      .where({ status: 'active' })
      .limit(1)
      .get();
  },

  // 获取所有学期
  getSemesters: () => {
    return db.collection('semesters')
      .orderBy('start_date', 'desc')
      .get();
  },

  // 获取所有学期(旧方法,保留兼容)
  getAllSemesters: () => {
    return db.collection('semesters')
      .orderBy('start_date', 'desc')
      .get();
  },

  // 添加学期
  addSemester: (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    return db.collection('semesters').add({ data });
  },

  // 更新学期
  updateSemester: (semesterId, data) => {
    data.updated_at = db.serverDate();
    return db.collection('semesters').doc(semesterId).update({ data });
  },

  // 删除学期
  deleteSemester: (semesterId) => {
    return db.collection('semesters').doc(semesterId).remove();
  },

  // 获取学期详情
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

  // 添加班级
  addClass: (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    return db.collection('classes').add({ data });
  },

  // 更新班级
  updateClass: (classId, data) => {
    data.updated_at = db.serverDate();
    return db.collection('classes').doc(classId).update({ data });
  },

  // 根据班级代码查找班级
  getClassByCode: (classCode) => {
    return db.collection('classes')
      .where({
        class_code: classCode,
        status: 'active'
      })
      .limit(1)
      .get();
  },

  // 根据创建者手机号查找班级
  getClassesByCreatorPhone: (phone) => {
    return db.collection('classes')
      .where({
        creator_phone: phone,
        status: 'active'
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

  // 更新用户信息
  updateUser: (userId, data) => {
    data.updated_at = db.serverDate();
    return db.collection('users').doc(userId).update({ data });
  },

  // 添加用户
  addUser: (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    return db.collection('users').add({ data });
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
  // 获取可兑换物品
  getRedemptionItems: () => {
    return db.collection('redemption_items')
      .where({ status: '可兑换' })
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取所有兑换物品
  getAllItems: () => {
    return db.collection('redemption_items')
      .orderBy('created_at', 'desc')
      .get();
  },

  // 添加兑换物品
  addItem: (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    return db.collection('redemption_items').add({ data });
  },

  // 更新兑换物品
  updateItem: (itemId, data) => {
    data.updated_at = db.serverDate();
    return db.collection('redemption_items').doc(itemId).update({ data });
  },

  // 提交兑换申请
  submitRedemption: (data) => {
    data.created_at = db.serverDate();
    return db.collection('redemption_requests').add({ data });
  },

  // 获取兑换记录
  getRedemptionRecords: (studentId) => {
    return db.collection('redemption_requests')
      .where({ student_id: studentId })
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取所有兑换请求
  getAllRequests: () => {
    return db.collection('redemption_requests')
      .orderBy('created_at', 'desc')
      .get();
  },

  // 获取指定物品的兑换请求
  getRequestsByItem: (itemId) => {
    return db.collection('redemption_requests')
      .where({ item_id: itemId })
      .orderBy('created_at', 'desc')
      .get();
  },

  // 更新兑换请求
  updateRequest: (requestId, data) => {
    return db.collection('redemption_requests').doc(requestId).update({ data });
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

  // 添加宿舍积分记录
  addDormScoreRecord: (data) => {
    data.created_at = db.serverDate();
    return db.collection('dorm_score_records').add({ data });
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

  // 添加成绩记录
  addGradeRecord: (data) => {
    data.created_at = db.serverDate();
    return db.collection('grade_records').add({ data });
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

  // 更新值日任务状态
  updateDutyTask: (scheduleId, taskId, data) => {
    return db.collection('duty_schedule').doc(scheduleId).update({
      data: {
        tasks: _.map(data.tasks, task => {
          if (task.task_id === taskId) {
            return { ...task, ...data };
          }
          return task;
        })
      }
    });
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

  // 添加分组
  addGroup: (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    return db.collection('student_groups').add({ data });
  },

  // 更新分组
  updateGroup: (groupId, data) => {
    data.updated_at = db.serverDate();
    return db.collection('student_groups').doc(groupId).update({ data });
  },

  // 删除分组
  deleteGroup: (groupId) => {
    return db.collection('student_groups').doc(groupId).remove();
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

  // 添加用户班级关系
  addRelation: (data) => {
    data.created_at = db.serverDate();
    data.updated_at = db.serverDate();
    return db.collection('user_class_relation').add({ data });
  },

  // 更新用户班级关系
  updateRelation: (relationId, data) => {
    data.updated_at = db.serverDate();
    return db.collection('user_class_relation').doc(relationId).update({ data });
  },

  // 删除用户班级关系（退出班级）
  deleteRelation: (relationId) => {
    return db.collection('user_class_relation').doc(relationId).remove();
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
