// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const { getCallerInfo, requireTeacherOrModule, AUTH_ERRORS } = require('./utils/auth');

/**
 * 积分规则引擎验证云函数
 * 用于验证规则的外键约束和数据一致性
 */
exports.main = async (event, context) => {
  const { action, data } = event;
  
  try {
    const classId = data && data.class_id
    const caller = await getCallerInfo(event, classId)
    await requireTeacherOrModule(caller, 'score')

    switch (action) {
    case 'validateRuleConstraints':
      return await validateRuleConstraints(data);
    case 'validateScoreRecord':
      return await validateScoreRecord(data);
    case 'getActiveRules':
      return await getActiveRules(data);
    case 'validateDormRule':
      return await validateDormRule(data);
    default:
      return {
        success: false,
        errMsg: '未知的操作类型'
      };
  }
  } catch (err) {
    if (err.code && Object.values(AUTH_ERRORS).includes(err.code)) {
      return { success: false, errMsg: err.message, code: err.code };
    }
    return { success: false, errMsg: err.message || '操作失败' };
  }
};

/**
 * 验证积分规则的外键约束
 * @param {Object} data - 规则数据
 * @returns {Object} 验证结果
 */
async function validateRuleConstraints(data) {
  try {
    const { class_id, semester_id, category_id, rule_id } = data;
    const errors = [];
    
    // 1. 验证班级ID是否存在
    if (class_id) {
      const classRes = await db.collection('classes')
        .where({
          _id: class_id
        })
        .limit(1)
        .get();
      
      if (classRes.data.length === 0) {
        errors.push('所选班级不存在');
      }
    }
    
    // 2. 验证学期ID是否存在（必填）
    if (!semester_id) {
      errors.push('规则必须关联学期ID');
    } else {
      const semesterRes = await db.collection('semesters')
        .where(_.or([
          { _id: semester_id },
          { semester_id: semester_id }
        ]))
        .limit(1)
        .get();
      
      if (semesterRes.data.length === 0) {
        errors.push('所选学期不存在');
      }
    }
    
    // 3. 验证积分类别ID是否存在
    if (category_id) {
      const categoryRes = await db.collection('score_categories')
        .where(_.or([
          { category_id: category_id },
          { _id: category_id }
        ]))
        .limit(1)
        .get();
      
      if (categoryRes.data.length === 0) {
        errors.push('所选积分类别不存在');
      }
    }
    
    // 4. 验证规则ID是否唯一
    if (rule_id) {
      const ruleRes = await db.collection('score_records')
        .where({
          record_id: rule_id,
          record_type: 'rule'
        })
        .limit(1)
        .get();
      
      if (ruleRes.data.length > 0) {
        // 如果是编辑操作，允许存在（已在data中排除当前规则）
        if (!data.isEdit) {
          errors.push('规则ID已存在');
        }
      }
    }
    
    return {
      success: errors.length === 0,
      errors: errors,
      errMsg: errors.length > 0 ? errors.join('; ') : '验证通过'
    };
  } catch (err) {
    console.error('验证规则约束失败:', err);
    return {
      success: false,
      errors: ['验证过程发生错误'],
      errMsg: err.message
    };
  }
}

/**
 * 验证积分记录的外键约束和数据一致性
 * @param {Object} data - 积分记录数据
 * @returns {Object} 验证结果
 */
async function validateScoreRecord(data) {
  try {
    const { student_id, rule_id, class_id, semester_id } = data;
    const errors = [];
    
    // 1. 验证学生是否存在且在当前学期有有效学籍
    if (student_id) {
      const studentRes = await db.collection('students')
        .where({
          student_id: student_id
        })
        .limit(1)
        .get();
      
      if (studentRes.data.length === 0) {
        errors.push('学生不存在');
      } else {
        // 验证学籍状态
        const statusRes = await db.collection('student_status')
          .where({
            student_id: student_id,
            status: '在读'
          })
          .limit(1)
          .get();
        
        if (statusRes.data.length === 0) {
          errors.push('学生在当前学期无有效学籍');
        }
      }
    }
    
    // 2. 验证规则ID是否存在且在有效期内
    if (rule_id) {
      const ruleRes = await db.collection('score_records')
        .where({
          record_id: rule_id,
          record_type: 'rule'
        })
        .limit(1)
        .get();
      
      if (ruleRes.data.length === 0) {
        errors.push('积分规则不存在');
      } else {
        const rule = ruleRes.data[0];
        
        // 检查规则是否启用
        if (rule.is_enabled === false) {
          errors.push('积分规则已禁用');
        }
        
        // 检查规则是否在有效期内
        const now = new Date();
        if (rule.effective_date && new Date(rule.effective_date) > now) {
          errors.push('积分规则尚未生效');
        }
        if (rule.expiry_date && new Date(rule.expiry_date) < now) {
          errors.push('积分规则已过期');
        }
      }
    }
    
    // 3. 验证班级ID是否存在
    if (class_id) {
      const classRes = await db.collection('classes')
        .where({
          _id: class_id
        })
        .limit(1)
        .get();
      
      if (classRes.data.length === 0) {
        errors.push('班级不存在');
      }
    }
    
    // 4. 验证学期ID是否存在
    if (semester_id) {
      const semesterRes = await db.collection('semesters')
        .where(_.or([
          { _id: semester_id },
          { semester_id: semester_id }
        ]))
        .limit(1)
        .get();
      
      if (semesterRes.data.length === 0) {
        errors.push('学期不存在');
      }
    }
    
    return {
      success: errors.length === 0,
      errors: errors,
      errMsg: errors.length > 0 ? errors.join('; ') : '验证通过'
    };
  } catch (err) {
    console.error('验证积分记录失败:', err);
    return {
      success: false,
      errors: ['验证过程发生错误'],
      errMsg: err.message
    };
  }
}

/**
 * 获取当前有效的积分规则
 * @param {Object} data - 查询参数
 * @returns {Object} 规则列表
 */
async function getActiveRules(data) {
  try {
    const { class_id, semester_id } = data;
    const now = new Date();
    
    let query = {
      record_type: 'rule',
      is_enabled: true
    };
    
    // 班级筛选
    if (class_id) {
      query.class_id = _.in([class_id, '', null]);
    }
    
    // 学期筛选
    if (semester_id) {
      query.semester_id = _.in([semester_id, '', null]);
    }
    
    const res = await db.collection('score_records')
      .where(query)
      .orderBy('created_at', 'desc')
      .get();
    
    // 过滤出有效期内的规则
    const activeRules = res.data.filter(rule => {
      // 检查生效日期
      if (rule.effective_date && new Date(rule.effective_date) > now) {
        return false;
      }
      
      // 检查失效日期
      if (rule.expiry_date && new Date(rule.expiry_date) < now) {
        return false;
      }
      
      return true;
    });
    
    return {
      success: true,
      data: activeRules,
      errMsg: '获取成功'
    };
  } catch (err) {
    console.error('获取活跃规则失败:', err);
    return {
      success: false,
      data: [],
      errMsg: err.message
    };
  }
}

/**
 * 验证宿舍管理规则的外键约束
 * @param {Object} data - 宿舍规则数据
 * @returns {Object} 验证结果
 */
async function validateDormRule(data) {
  try {
    const { item_id, student_id, class_id, semester_id } = data;
    const errors = [];
    
    // 1. 验证宿舍扣分项是否存在
    if (item_id) {
      const itemRes = await db.collection('dorm_deduction_items')
        .where({
          _id: item_id
        })
        .limit(1)
        .get();
      
      if (itemRes.data.length === 0) {
        errors.push('宿舍扣分项不存在');
      }
    }
    
    // 2. 验证学生是否存在且为住宿生
    if (student_id) {
      const studentRes = await db.collection('students')
        .where({
          student_id: student_id
        })
        .limit(1)
        .get();
      
      if (studentRes.data.length === 0) {
        errors.push('学生不存在');
      } else {
        const student = studentRes.data[0];
        if (!student.dorm_info || !student.dorm_info.building) {
          errors.push('该学生不是住宿生');
        }
      }
    }
    
    // 3. 验证班级ID和学期ID
    if (class_id) {
      const classRes = await db.collection('classes')
        .where({ _id: class_id })
        .limit(1)
        .get();
      
      if (classRes.data.length === 0) {
        errors.push('班级不存在');
      }
    }
    
    if (semester_id) {
      const semesterRes = await db.collection('semesters')
        .where(_.or([
          { _id: semester_id },
          { semester_id: semester_id }
        ]))
        .limit(1)
        .get();
      
      if (semesterRes.data.length === 0) {
        errors.push('学期不存在');
      }
    }
    
    return {
      success: errors.length === 0,
      errors: errors,
      errMsg: errors.length > 0 ? errors.join('; ') : '验证通过'
    };
  } catch (err) {
    console.error('验证宿舍规则失败:', err);
    return {
      success: false,
      errors: ['验证过程发生错误'],
      errMsg: err.message
    };
  }
}