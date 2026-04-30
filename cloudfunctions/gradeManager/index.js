// 云函数：成绩管理中心
// 功能：批量录入、成绩查询（角色隔离）、统计聚合、排名计算
// 集合：grades

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event, context) => {
  const { action, data } = event;
  const { OPENID } = cloud.getWXContext();

  try {
    switch (action) {
      case 'batchInput':
        return await batchInput(data, OPENID);
      case 'getList':
        return await getList(data, OPENID);
      case 'getStats':
        return await getStats(data, OPENID);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('gradeManager 错误:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};

/**
 * 批量录入成绩
 * 1. 遍历 grades 数组逐条写入 grades 集合
 * 2. 若 student_id 不在 students 表中，记录错误但继续处理
 * 3. 录入完成后，按总分降序计算 rank_class 并批量回写
 * 4. score < 60 自动设置 is_pass: false
 */
async function batchInput(data, openId) {
  const { grades, class_id, term, exam_type } = data;

  if (!grades || !Array.isArray(grades) || grades.length === 0) {
    return { success: false, message: '成绩数据不能为空' };
  }
  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }
  if (!term || !exam_type) {
    return { success: false, message: '缺少学期或考试类型' };
  }

  const validExamTypes = ['monthly', 'midterm', 'final'];
  if (!validExamTypes.includes(exam_type)) {
    return { success: false, message: '考试类型无效，仅支持 monthly/midterm/final' };
  }

  const successList = [];
  const failList = [];
  const now = db.serverDate();

  // 遍历录入每条成绩
  for (let i = 0; i < grades.length; i++) {
    const item = grades[i];
    const studentId = item.student_id;
    const subject = item.subject;
    const score = Number(item.score);

    // 基础校验
    if (!studentId || !subject || isNaN(score)) {
      failList.push({ index: i, student_id: studentId, reason: '字段不完整或分数无效' });
      continue;
    }

    if (score < 0 || score > 150) {
      failList.push({ index: i, student_id: studentId, reason: '分数超出范围(0-150)' });
      continue;
    }

    // 验证学生是否存在于本班
    try {
      const studentRes = await db.collection('students')
        .where({ student_id: studentId, class_id: class_id })
        .limit(1)
        .get();

      if (!studentRes.data || studentRes.data.length === 0) {
        failList.push({ index: i, student_id: studentId, reason: '学生不存在于本班' });
        continue;
      }

      const studentName = studentRes.data[0].name || studentRes.data[0].student_name || '';

      // 写入 grades 集合
      await db.collection('grades').add({
        data: {
          class_id: class_id,
          student_id: studentId,
          student_name: studentName,
          subject: subject,
          score: score,
          exam_type: exam_type,
          term: term,
          total_score: 0,
          rank_class: 0,
          rank_grade: null,
          is_pass: score >= 60,
          created_by: openId,
          created_at: now,
          updated_at: now
        }
      });

      successList.push({ index: i, student_id: studentId, subject: subject, score: score });
    } catch (err) {
      console.error(`录入第${i}条失败:`, err);
      failList.push({ index: i, student_id: studentId, reason: '写入数据库失败: ' + err.message });
    }
  }

  // 录入完成后，计算本次考试每位学生的总分和班级排名
  try {
    await calculateClassRank(class_id, term, exam_type);
  } catch (err) {
    console.error('排名计算失败:', err);
    // 排名计算失败不影响录入结果返回
  }

  return {
    success: true,
    message: `录入完成：成功${successList.length}条，失败${failList.length}条`,
    data: {
      successCount: successList.length,
      failCount: failList.length,
      successList: successList,
      failList: failList
    }
  };
}

/**
 * 计算班级排名
 * 使用聚合管道按学生分组求总分，再按总分降序排列计算排名，最后回写 grades 表
 */
async function calculateClassRank(classId, term, examType) {
  // 聚合查询：按 student_id 分组，求总分
  const aggregateRes = await db.collection('grades')
    .where({
      class_id: classId,
      term: term,
      exam_type: examType
    })
    .aggregate()
    .group({
      _id: '$student_id',
      total_score: $.sum('$score'),
      student_name: $.first('$student_name')
    })
    .sort({ total_score: -1 })
    .end();

  if (!aggregateRes.list || aggregateRes.list.length === 0) {
    return;
  }

  // 计算排名并批量更新
  const rankList = aggregateRes.list;
  for (let rank = 0; rank < rankList.length; rank++) {
    const studentId = rankList[rank]._id;
    const totalScore = rankList[rank].total_score;
    const classRank = rank + 1;

    // 更新该学生本次考试的所有科目记录的 total_score 和 rank_class
    await db.collection('grades')
      .where({
        class_id: classId,
        student_id: studentId,
        term: term,
        exam_type: examType
      })
      .update({
        data: {
          total_score: totalScore,
          rank_class: classRank,
          updated_at: db.serverDate()
        }
      });
  }
}

/**
 * 获取成绩列表
 * - 班主任：返回本班该次考试所有成绩
 * - 科任老师：强制过滤只返回自己教授的科目
 * - 学生/家长：只返回自己的成绩
 */
async function getList(data, openId) {
  const { class_id, term, exam_type, subject, role, student_id } = data;

  if (!class_id) {
    return { success: false, message: '缺少班级ID' };
  }
  if (!term || !exam_type) {
    return { success: false, message: '缺少学期或考试类型' };
  }
  if (!role) {
    return { success: false, message: '缺少用户角色' };
  }

  // 构建基础查询条件
  let query = {
    class_id: class_id,
    term: term,
    exam_type: exam_type
  };

  // 角色权限过滤
  if (role === 'student' || role === 'parent') {
    // 学生/家长：只能查看自己的成绩
    if (!student_id) {
      return { success: false, message: '缺少学生ID' };
    }
    query.student_id = student_id;
  } else if (role === 'subject_teacher') {
    // 科任老师：只能查看自己教授的科目
    const userRes = await db.collection('users')
      .where({ _openid: openId })
      .limit(1)
      .get();

    if (!userRes.data || userRes.data.length === 0) {
      return { success: false, message: '用户信息不存在', code: 403 };
    }

    const teacherSubjects = userRes.data[0].subjects || [];
    const teacherClasses = userRes.data[0].assigned_classes || [];

    // 验证该老师是否教授该班级
    if (teacherClasses.length > 0 && !teacherClasses.includes(class_id)) {
      return { success: false, message: '您无权查看该班级成绩', code: 403 };
    }

    // 科目过滤：优先使用前端传入的 subject，但必须属于该老师的科目
    if (subject) {
      if (!teacherSubjects.includes(subject)) {
        return { success: false, message: `您只能查看自己教授的科目: ${teacherSubjects.join('、')}`, code: 403 };
      }
      query.subject = subject;
    } else {
      // 未指定科目则返回该老师所有教授科目
      if (teacherSubjects.length > 0) {
        query.subject = _.in(teacherSubjects);
      }
    }
  }
  // head_teacher / admin：可查看本班全部，不做额外过滤

  // 可选科目过滤（班主任/管理员主动筛选）
  if ((role === 'head_teacher' || role === 'admin') && subject) {
    query.subject = subject;
  }

  // 查询成绩数据
  const res = await db.collection('grades')
    .where(query)
    .orderBy('rank_class', 'asc')
    .orderBy('score', 'desc')
    .limit(200)
    .get();

  const grades = res.data || [];

  // 按学生分组返回，便于前端展示
  const studentMap = {};
  for (const g of grades) {
    if (!studentMap[g.student_id]) {
      studentMap[g.student_id] = {
        student_id: g.student_id,
        student_name: g.student_name || '',
        total_score: g.total_score || 0,
        rank_class: g.rank_class || 0,
        subjects: []
      };
    }
    studentMap[g.student_id].subjects.push({
      subject: g.subject,
      score: g.score,
      is_pass: g.is_pass,
      _id: g._id
    });
  }

  const studentList = Object.values(studentMap).sort((a, b) => (a.rank_class || 999) - (b.rank_class || 999));

  return {
    success: true,
    data: {
      grades: grades,
      studentList: studentList
    }
  };
}

/**
 * 获取统计信息（仅班主任/管理员可调用）
 * 聚合计算指定考试的平均分、最高分、及格率
 */
async function getStats(data, openId) {
  const { class_id, term, exam_type, subject } = data;

  if (!class_id || !term || !exam_type) {
    return { success: false, message: '缺少班级ID、学期或考试类型' };
  }

  // 验证调用者身份
  const userRes = await db.collection('users')
    .where({ _openid: openId })
    .limit(1)
    .get();

  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, message: '用户信息不存在' };
  }

  const userRole = userRes.data[0].role;
  if (userRole !== 'head_teacher' && userRole !== 'admin') {
    return { success: false, message: '仅班主任和管理员可查看统计', code: 403 };
  }

  // 构建查询条件
  let matchCondition = {
    class_id: class_id,
    term: term,
    exam_type: exam_type
  };

  // 可选：按科目统计
  if (subject) {
    matchCondition.subject = subject;
  }

  // 聚合计算统计数据
  const statsRes = await db.collection('grades')
    .aggregate()
    .match(matchCondition)
    .group({
      _id: subject ? '$subject' : null,
      avg_score: $.avg('$score'),
      max_score: $.max('$score'),
      min_score: $.min('$score'),
      total_count: $.sum(1),
      pass_count: $.sum($.cond({
        if: $.gte(['$score', 60]),
        then: 1,
        else: 0
      }))
    })
    .end();

  if (!statsRes.list || statsRes.list.length === 0) {
    return {
      success: true,
      data: {
        subjects: [],
        overall: { avg_score: 0, max_score: 0, min_score: 0, total_count: 0, pass_count: 0, pass_rate: 0 }
      }
    };
  }

  // 处理统计结果
  const subjects = [];
  let totalAvg = 0, totalMax = 0, totalMin = Infinity, totalCount = 0, totalPass = 0;

  for (const stat of statsRes.list) {
    const passRate = stat.total_count > 0 ? Math.round((stat.pass_count / stat.total_count) * 10000) / 100 : 0;
    const subjectStat = {
      subject: stat._id || '全部',
      avg_score: Math.round(stat.avg_score * 100) / 100,
      max_score: stat.max_score,
      min_score: stat.min_score,
      total_count: stat.total_count,
      pass_count: stat.pass_count,
      pass_rate: passRate
    };
    subjects.push(subjectStat);

    totalCount += stat.total_count;
    totalPass += stat.pass_count;
    totalAvg += stat.avg_score * stat.total_count;
    if (stat.max_score > totalMax) totalMax = stat.max_score;
    if (stat.min_score < totalMin) totalMin = stat.min_score;
  }

  const overall = {
    avg_score: totalCount > 0 ? Math.round((totalAvg / totalCount) * 100) / 100 : 0,
    max_score: totalMax,
    min_score: totalMin === Infinity ? 0 : totalMin,
    total_count: totalCount,
    pass_count: totalPass,
    pass_rate: totalCount > 0 ? Math.round((totalPass / totalCount) * 10000) / 100 : 0
  };

  return {
    success: true,
    data: {
      subjects: subjects,
      overall: overall
    }
  };
}
