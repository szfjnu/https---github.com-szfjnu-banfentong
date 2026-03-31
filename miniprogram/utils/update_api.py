# -*- coding: utf-8 -
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
api_file = os.path.join(script_dir, 'api.js')

with open(api_file, 'r', encoding='utf-8') as f:
    content = f.read()

# 替换 getScoreRecords 方法
old_method = '''    // 获取积分记录
    getScoreRecords: (studentId, options = {}) => {
      const { limit = 20, skip = 0 } = options;

      return db.collection('score_records')
        .where({ student_id: studentId })
        .orderBy('date', 'desc')
        .skip(skip)
        .limit(limit)
        .get();
    },'''

new_method = '''    // 获取积分记录
    getScoreRecords: (options = {}) => {
      const { limit = 20, skip = 0, student_id = '', item_id = '', source_type = '', approval_status = '' } = options;

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
    },'''

content = content.replace(old_method, new_method)

with open(api_file, 'w', encoding='utf-8') as f:
    f.write(content)

print('API更新成功')
