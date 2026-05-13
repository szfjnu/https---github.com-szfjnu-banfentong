const batchQuery = require('../../../../utils/batchQuery.js');

const studentLoader = {
  loadEditStudents: async function (classId, selectedDate) {
    const db = wx.cloud.database();
    const _ = db.command;
    const allStudents = await batchQuery.getAllRecords('students', {
      class_id: classId,
      status: _.neq('graduated')
    }, 'student_id', 'asc');

    const attendanceRes = await db.collection('attendance_records')
      .where({ class_id: classId, date: selectedDate })
      .get();

    const attendanceMap = {};
    (attendanceRes.data || []).forEach(record => {
      attendanceMap[record.student_id] = record;
    });

    return allStudents.map(student => ({
      ...student,
      attendance: attendanceMap[student.student_id] || null,
      selected: false
    }));
  },

  loadEditStudentsByGroup: async function (classId, selectedDate, groupName) {
    const db = wx.cloud.database();
    const _ = db.command;
    const groupRes = await db.collection('student_groups')
      .where({ group_name: groupName, class_id: classId })
      .limit(1)
      .get();
    if (!groupRes.data || groupRes.data.length === 0) {
      return { error: '未找到该分组', students: [] };
    }
    const members = groupRes.data[0].members || [];
    if (members.length === 0) {
      return { students: [] };
    }
    const memberIds = members.map(m => m.student_id);
    const studentsData = await batchQuery.getAllRecords('students', {
      student_id: _.in(memberIds),
      status: _.neq('graduated')
    });
    const attendanceRes = await db.collection('attendance_records')
      .where({ class_id: classId, date: selectedDate })
      .get();
    const attendanceMap = {};
    (attendanceRes.data || []).forEach(record => {
      attendanceMap[record.student_id] = record;
    });
    const editStudents = studentsData.map(student => ({
      ...student,
      attendance: attendanceMap[student.student_id] || null,
      selected: false
    }));
    return { students: editStudents };
  },

  loadEditGroupOptions: async function (classId) {
    const db = wx.cloud.database();
    const res = await db.collection('student_groups')
      .where({ class_id: classId, is_deleted: false })
      .orderBy('created_at', 'desc')
      .get();
    return [{ value: '', label: '全部分组' }, ...(res.data || []).map(g => ({ value: g.group_name, label: g.group_name }))];
  }
};

module.exports = studentLoader;
