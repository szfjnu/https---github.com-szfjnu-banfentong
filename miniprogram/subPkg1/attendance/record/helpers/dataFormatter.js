const dataFormatter = {
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  getWeekStart: function (date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  },

  getMonthLastDay: function (year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;
  },

  getDefaultCategories: function () {
    return [
      { category_id: 'sick_leave', category_name: '病假', score_deduction: 0, color: '#52c41a', icon: '🏥' },
      { category_id: 'personal_leave', category_name: '事假', score_deduction: 0, color: '#1890ff', icon: '📝' },
      { category_id: 'late', category_name: '迟到', score_deduction: -1, color: '#fa8c16', icon: '⏰' },
      { category_id: 'early_leave', category_name: '早退', score_deduction: -1, color: '#faad14', icon: '🏃' },
      { category_id: 'absent', category_name: '旷课', score_deduction: -5, color: '#ff4d4f', icon: '❌' }
    ];
  },

  getCategoryColor: function (categoryId) {
    const colorMap = {
      'sick_leave': '#52c41a',
      'personal_leave': '#1890ff',
      'late': '#fa8c16',
      'early_leave': '#faad14',
      'absent': '#ff4d4f'
    };
    return colorMap[categoryId] || '#999999';
  },

  getCategoryIcon: function (categoryId) {
    const iconMap = {
      'sick_leave': '🏥',
      'personal_leave': '📝',
      'late': '⏰',
      'early_leave': '🏃',
      'absent': '❌'
    };
    return iconMap[categoryId] || '📌';
  },

  generateRecordId: function () {
    return `AR${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  },

  applyTimeFilter: function (optionValue, app) {
    const now = new Date();
    let startDate = '';
    let endDate = '';
    let label = '';

    switch (optionValue) {
      case 'today':
        startDate = this.formatDate(now);
        endDate = startDate;
        label = '今天';
        break;

      case 'week':
        const weekStart = this.getWeekStart(now);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        startDate = this.formatDate(weekStart);
        endDate = this.formatDate(weekEnd);
        label = '本周';
        break;

      case 'month':
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        endDate = this.getMonthLastDay(year, month);
        label = `${year}年${month}月`;
        break;

      case 'semester':
        const semester = app.globalData.currentSemester;
        if (semester) {
          startDate = this.formatDate(new Date(semester.start_date));
          endDate = this.formatDate(new Date(semester.end_date));
          label = semester.name || '本学期';
        } else {
          return { error: '暂无学期数据' };
        }
        break;

      default:
        label = '全部时间';
        break;
    }

    return {
      filterStartDate: startDate,
      filterEndDate: endDate,
      filterTimeLabel: label,
      selectedTimeOption: optionValue
    };
  },

  computeStatistics: function (records, categories) {
    const catMap = {};
    categories.forEach(c => {
      catMap[c.category_id] = c.category_code || '';
    });

    return {
      total: records.length,
      sickLeave: records.filter(r => catMap[r.category_id] === 'sick_leave').length,
      personalLeave: records.filter(r => catMap[r.category_id] === 'personal_leave').length,
      late: records.filter(r => catMap[r.category_id] === 'late').length,
      earlyLeave: records.filter(r => catMap[r.category_id] === 'early_leave').length,
      absent: records.filter(r => catMap[r.category_id] === 'absent').length
    };
  },

  filterStudentsByKeyword: function (students, keyword) {
    if (!keyword) return students;
    const lower = keyword.toLowerCase();
    return students.filter(s =>
      (s.name && s.name.toLowerCase().includes(lower)) ||
      (s.student_id && String(s.student_id).toLowerCase().includes(lower))
    );
  }
};

module.exports = dataFormatter;
