var studentLoader = {};

studentLoader.buildStudentQuery = function (role, currentClassId, managedClasses, appGlobalData, relationRes) {
  var query = {};

  if (role === 'head_teacher') {
    if (currentClassId) {
      query.class_id = currentClassId;
    } else if (relationRes && relationRes.length > 0) {
      query.class_id = relationRes[0].class_id;
    }
  } else if (role === 'subject_teacher') {
    var targetClassIds = managedClasses;
    if (relationRes) {
      targetClassIds = relationRes.map(function (r) { return r.class_id; });
    }
    if (targetClassIds && targetClassIds.length > 0) {
      query.class_id = { $in: targetClassIds };
      query._classIds = targetClassIds;
    } else {
      return { query: null, noStudents: true };
    }
  } else if (role === 'admin') {
    // admin loads all, query stays empty
  } else if (role === 'class_cadre') {
    if (relationRes && relationRes.length > 0) {
      query.class_id = relationRes[0].class_id;
    } else if (appGlobalData.class_id) {
      query.class_id = appGlobalData.class_id;
    }
  } else {
    return { query: null, noStudents: true };
  }

  return { query: query, noStudents: false };
};

studentLoader.fetchStudents = async function (queryClassId, appGlobalClassId) {
  var res = await wx.cloud.callFunction({
    name: 'manageAuthorization',
    data: { action: 'getStudents', data: { class_id: queryClassId || appGlobalClassId } }
  });
  return (res.result && res.result.success) ? res.result.data : [];
};

studentLoader.filterByStudentStatus = async function (students, currentSemesterId, currentClassId) {
  if (!currentSemesterId || !currentClassId) {
    return students;
  }

  try {
    var db = wx.cloud.database();
    var statusRes = await db.collection('student_status')
      .where({
        class_id: currentClassId,
        status: '在读'
      })
      .get();

    var statusMap = {};
    statusRes.data.forEach(function (item) {
      statusMap[String(item.student_id)] = item.status;
    });

    return students.filter(function (student) {
      var sid = String(student.student_id);
      var status = statusMap[sid];
      return status === '在读' || !status;
    });
  } catch (err) {
    console.error('学籍过滤失败:', err);
    return students;
  }
};

studentLoader.loadStudentsByGroup = async function (groupName, currentClassId, appGlobalClassId) {
  var db = wx.cloud.database();
  var _ = db.command;
  var batchQuery = require('../../../../utils/batchQuery.js');
  var dataFormatter = require('./dataFormatter.js');

  var groupQuery = {
    group_name: groupName,
    class_id: currentClassId || appGlobalClassId || ''
  };

  var groupRes = await db.collection('student_groups')
    .where(groupQuery)
    .limit(1)
    .get();

  if (!groupRes.data || groupRes.data.length === 0) {
    return { error: '未找到该分组', students: [] };
  }

  var group = groupRes.data[0];
  var members = group.members || [];

  if (members.length === 0) {
    return { error: null, students: [], group: group };
  }

  var memberIds = members.map(function (m) { return m.student_id; });

  var studentsResData = await batchQuery.getAllRecords('students', {
    student_id: _.in(memberIds)
  });

  var students = dataFormatter.processStudentsData(studentsResData);

  if (group.leader_id) {
    students = students.map(function (s) {
      if (s.student_id === group.leader_id) {
        return Object.assign({}, s, { isLeader: true });
      }
      return s;
    });
  }

  return { error: null, students: students, group: group };
};

studentLoader.getHeadTeacherRelation = async function (openid) {
  var db = wx.cloud.database();
  var res = await db.collection('user_class_relation')
    .where({
      user_openid: openid,
      role: 'head_teacher',
      status: 'joined'
    })
    .limit(1)
    .get();
  return res.data;
};

studentLoader.getSubjectTeacherClasses = async function (openid) {
  var db = wx.cloud.database();
  var res = await db.collection('user_class_relation')
    .where({
      user_openid: openid,
      role: 'subject_teacher',
      status: 'joined'
    })
    .get();
  return res.data;
};

studentLoader.getClassCadetRelation = async function (openid) {
  var db = wx.cloud.database();
  var res = await db.collection('user_class_relation')
    .where({
      user_openid: openid,
      status: 'joined'
    })
    .limit(1)
    .get();
  return res.data;
};

studentLoader.resolveStudentQueryClassId = async function (role, currentClassId, managedClasses, openid, appGlobalClassId, filterByClassId) {
  if (role === 'head_teacher') {
    if (currentClassId) return { classId: currentClassId, isMultiple: false };
    var relationData = await studentLoader.getHeadTeacherRelation(openid);
    if (relationData.length > 0) return { classId: relationData[0].class_id, isMultiple: false };
    return { classId: null, isMultiple: false };
  }

  if (role === 'subject_teacher') {
    var targetClassIds = managedClasses;
    if (!targetClassIds || targetClassIds.length === 0) {
      var relationData = await studentLoader.getSubjectTeacherClasses(openid);
      targetClassIds = relationData.map(function (r) { return r.class_id; });
    }
    if (targetClassIds.length > 0) return { classIds: targetClassIds, isMultiple: true };
    return { noStudents: true };
  }

  if (role === 'admin') {
    if (filterByClassId) return { classId: filterByClassId, isMultiple: false };
    return { classId: appGlobalClassId, isMultiple: false };
  }

  if (role === 'class_cadre') {
    var relationData = await studentLoader.getClassCadetRelation(openid);
    if (relationData.length > 0) return { classId: relationData[0].class_id, isMultiple: false };
    if (appGlobalClassId) return { classId: appGlobalClassId, isMultiple: false };
    return { classId: null, isMultiple: false };
  }

  return { noStudents: true };
};

module.exports = studentLoader;
