var dataFormatter = {};

dataFormatter.processStudentsData = function (studentsData) {
  var util = require('../../../../utils/util.js');
  return studentsData.map(function (student) {
    return {
      ...student,
      selected: false,
      scoreLevel: util.getScoreLevel(student.current_score || 100)
    };
  });
};

dataFormatter.filterStudentsByStatus = function (students, statusMap) {
  return students.filter(function (student) {
    var sid = String(student.student_id);
    var status = statusMap[sid];
    return status === '在读' || !status;
  });
};

dataFormatter.applyFilter = function (students, selectedClass, selectedGroup, searchKeyword) {
  var filtered = students;

  if (selectedClass) {
    filtered = filtered.filter(function (s) { return s.class_id === selectedClass; });
  }
  if (selectedGroup) {
    filtered = filtered.filter(function (s) { return s.group === selectedGroup; });
  }
  if (searchKeyword) {
    var kw = searchKeyword.toLowerCase();
    filtered = filtered.filter(function (s) {
      return (s.name && s.name.toLowerCase().includes(kw)) ||
        (s.student_name && s.student_name.toLowerCase().includes(kw)) ||
        (s.student_id && String(s.student_id).includes(kw));
    });
  }
  return filtered;
};

dataFormatter.buildScoreItemCascaderData = function (categoryList, allItems, isAddScore) {
  var filteredItems = allItems.filter(function (item) {
    var scoreValue = item.score_value || item.default_score || 0;
    return isAddScore ? scoreValue > 0 : scoreValue < 0;
  });

  var categoryMap = {};
  categoryList.forEach(function (cat) {
    categoryMap[cat.category_name] = [];
  });

  filteredItems.forEach(function (item) {
    var catName = (item.rule_category || item.category || '其他').trim();
    var scoreValue = item.score_value || item.default_score || 0;
    var ruleName = item.rule_name || item.name || item.item_name || '未命名项目';

    var normalizedItem = {
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

  var finalCategories = [];
  categoryList.forEach(function (c) {
    if (categoryMap[c.category_name] && categoryMap[c.category_name].length > 0) {
      finalCategories.push(c.category_name);
    }
  });

  Object.keys(categoryMap).forEach(function (name) {
    if (categoryMap[name].length > 0 && !finalCategories.includes(name)) {
      finalCategories.push(name);
    }
  });

  var firstCategory = finalCategories[0] || '其他';
  var firstItems = categoryMap[firstCategory] || [];

  var cascaderData = [
    finalCategories.map(function (name) { return { name: name }; }),
    firstItems.map(function (item) {
      return {
        name: item.rule_name,
        score: item.score_value,
        type: item.score_value > 0 ? '加分' : '扣分',
        item: item
      };
    })
  ];

  return {
    scoreItems: allItems,
    filteredScoreItems: filteredItems,
    categories: finalCategories,
    categoryMap: categoryMap,
    cascaderData: cascaderData,
    selectedCategory: firstCategory,
    firstItems: firstItems
  };
};

dataFormatter.rebuildCascaderData = function (scoreItems, isAddScore, categoryMap) {
  var filteredItems = scoreItems.filter(function (item) {
    var scoreValue = item.score_value || item.default_score || 0;
    return isAddScore ? scoreValue > 0 : scoreValue < 0;
  });

  var newCategoryMap = {};
  Object.keys(categoryMap).forEach(function (catName) {
    newCategoryMap[catName] = [];
  });

  filteredItems.forEach(function (item) {
    var catName = item.rule_category || '其他';
    if (!newCategoryMap[catName]) {
      newCategoryMap[catName] = [];
    }
    newCategoryMap[catName].push(item);
  });

  var finalCategories = [];
  Object.keys(newCategoryMap).forEach(function (name) {
    if (newCategoryMap[name].length > 0) {
      finalCategories.push(name);
    }
  });

  var firstCategory = finalCategories[0] || '其他';
  var firstItems = newCategoryMap[firstCategory] || [];

  var cascaderData = [
    finalCategories.map(function (name) { return { name: name }; }),
    firstItems.map(function (item) {
      return {
        name: item.rule_name,
        score: item.score_value,
        type: item.score_value > 0 ? '加分' : '扣分',
        item: item
      };
    })
  ];

  return {
    filteredScoreItems: filteredItems,
    categories: finalCategories,
    categoryMap: newCategoryMap,
    cascaderData: cascaderData,
    selectedCategory: firstCategory,
    firstItems: firstItems
  };
};

dataFormatter.buildCascaderSecondColumn = function (items) {
  return items.map(function (item) {
    return {
      name: item.rule_name,
      score: item.score_value,
      type: item.score_value > 0 ? '加分' : '扣分',
      item: item
    };
  });
};

module.exports = dataFormatter;
