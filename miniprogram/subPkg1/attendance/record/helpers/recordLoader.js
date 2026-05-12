const batchQuery = require('../../../utils/batchQuery.js');
const dataFormatter = require('./dataFormatter.js');
const util = require('../../../utils/util.js');

const recordLoader = {
  buildFilterQuery: function (classId, filterGroupId, filterStudentId, filterCategoryId, filterStartDate, filterEndDate, students) {
    const db = wx.cloud.database();
    const _ = db.command;
    let query = { class_id: classId };

    if (filterStudentId) {
      query.student_id = filterStudentId;
    } else if (filterGroupId) {
      const groupStudents = students.filter(s => s.group_id === filterGroupId);
      const studentIds = groupStudents.map(s => s.student_id);
      if (studentIds.length > 0) {
        query.student_id = _.in(studentIds);
      }
    }
    if (filterCategoryId) {
      query.category_id = filterCategoryId;
    }
    if (filterStartDate && filterEndDate) {
      query.date = _.gte(filterStartDate).and(_.lte(filterEndDate));
    }

    return query;
  },

  loadRecords: async function (classId, filterGroupId, filterStudentId, filterCategoryId, filterStartDate, filterEndDate, students, page, pageSize) {
    const db = wx.cloud.database();
    const query = this.buildFilterQuery(classId, filterGroupId, filterStudentId, filterCategoryId, filterStartDate, filterEndDate, students);

    const res = await db.collection('attendance_records')
      .where(query)
      .orderBy('date', 'desc')
      .orderBy('created_at', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get();

    return (res.data || []).map(record => ({
      ...record,
      dateStr: util.formatDate(new Date(record.date)),
      categoryColor: dataFormatter.getCategoryColor(record.category_id),
      categoryIcon: dataFormatter.getCategoryIcon(record.category_id)
    }));
  },

  loadStatistics: async function (classId, filterGroupId, filterStudentId, filterStartDate, filterEndDate, students, categories) {
    const db = wx.cloud.database();
    const query = this.buildFilterQuery(classId, filterGroupId, filterStudentId, '', filterStartDate, filterEndDate, students);

    const res = await db.collection('attendance_records').where(query).get();
    return dataFormatter.computeStatistics(res.data || [], categories);
  },

  loadGroups: async function (classId) {
    const db = wx.cloud.database();
    const res = await db.collection('student_groups')
      .where({ class_id: classId, is_deleted: false })
      .orderBy('created_at', 'desc')
      .get();
    return [{ group_id: '', group_name: '全部小组' }, ...(res.data || [])];
  },

  loadStudents: async function (classId) {
    const db = wx.cloud.database();
    const _ = db.command;
    const allStudents = await batchQuery.getAllRecords('students', {
      class_id: classId,
      status: _.neq('graduated')
    }, 'student_id', 'asc');
    return [{ student_id: '', name: '全部学生' }, ...allStudents];
  },

  loadCategories: async function (classId) {
    const db = wx.cloud.database();
    const res = await db.collection('attendance_categories')
      .where({ class_id: classId, is_active: true })
      .orderBy('sort_order', 'asc')
      .get();
    let categories = res.data || [];
    if (categories.length === 0) {
      categories = dataFormatter.getDefaultCategories();
    }
    return [{ category_id: '', category_name: '全部类别' }, ...categories];
  }
};

module.exports = recordLoader;
