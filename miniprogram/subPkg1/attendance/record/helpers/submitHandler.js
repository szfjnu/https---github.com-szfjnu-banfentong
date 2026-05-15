const app = getApp();
const dataFormatter = require('./dataFormatter.js');

const submitHandler = {
  saveAttendance: async function (context) {
    const { selectedCategoryId, selectedCategoryCode, selectedDate, selectedEditStudents,
            is_absent_category, period_sections, selected_period_sections,
            categories, classId, userRole } = context.data;

    const db = wx.cloud.database();
    const category = categories.find(c => c.category_id === selectedCategoryId);
    const categoryCode = selectedCategoryCode || category?.category_code || selectedCategoryId;

    for (const student of selectedEditStudents) {
      const existRes = await db.collection('attendance_records')
        .where({
          student_id: student.student_id,
          class_id: classId,
          date: selectedDate
        })
        .get();

      if (existRes.data && existRes.data.length > 0) {
        const existingRecord = existRes.data[0];
        const oldScoreChange = existingRecord.score_change || 0;
        const newScoreChange = category.score_deduction || 0;
        const scoreDiff = newScoreChange - oldScoreChange;

        const updateFields = {
          category_id: selectedCategoryId,
          category_code: categoryCode,
          category_name: category.category_name,
          score_change: newScoreChange,
          semester_id: app.globalData.currentSemesterId || '',
          updated_at: new Date().toISOString()
        };
        const updateRes = await wx.cloud.callFunction({
          name: 'scoreManager',
          data: {
            action: 'updateAttendanceRecord',
            data: {
              recordId: existingRecord._id,
              ...updateFields,
              classId: classId
            }
          }
        });
        if (!updateRes.result || !updateRes.result.success) {
          console.error('更新考勤记录失败:', updateRes.result?.message || '未知错误');
        }

        if (scoreDiff !== 0) {
          await context.updateStudentScore(student.student_id, scoreDiff, {
            category_code: categoryCode,
            category_name: category.category_name,
            reason_detail: `${selectedDate} ${category.category_name}(调整，原${oldScoreChange}→新${newScoreChange})`
          });
        }
      } else {
        if (is_absent_category && selected_period_sections.length > 0) {
          const selectedSections = period_sections.filter(s =>
            selected_period_sections.includes(s.section_id)
          );
          for (const section of selectedSections) {
            const existSectionRes = await db.collection('attendance_records')
              .where({
                student_id: student.student_id,
                class_id: classId,
                date: selectedDate,
                period_section: section.section_id
              })
              .limit(1).get();
            if (existSectionRes.data && existSectionRes.data.length > 0) continue;

            const recordId = dataFormatter.generateRecordId();
            const recordData = {
              record_id: recordId,
              student_id: student.student_id,
              student_name: student.name,
              class_id: classId,
              date: selectedDate,
              category_id: selectedCategoryId,
              category_code: categoryCode,
              category_name: category.category_name,
              score_change: category.score_deduction || 0,
              reason: '',
              period_section: section.section_id,
              period_section_name: section.section_name,
              period_start_time: section.start_time,
              period_end_time: section.end_time,
              recorder_openid: app.globalData.openid,
              recorder_name: app.globalData.userInfo.nickName,
              recorder_role: userRole,
              semester_id: app.globalData.currentSemesterId || '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            const addRes = await wx.cloud.callFunction({
              name: 'scoreManager',
              data: {
                action: 'addAttendanceRecord',
                data: {
                  ...recordData,
                  classId: classId
                }
              }
            });
            if (!addRes.result || !addRes.result.success) {
              console.error('添加考勤记录(分节)失败:', addRes.result?.message || '未知错误');
            }
          }
          if (category.score_deduction && category.score_deduction !== 0) {
            const totalDeduction = (category.score_deduction || 0) * selectedSections.length;
            await context.updateStudentScore(student.student_id, totalDeduction, {
              category_code: categoryCode,
              category_name: category.category_name,
              reason_detail: `${selectedDate} ${category.category_name}(${selectedSections.length}节)`
            });
          }
        } else {
          const recordId = dataFormatter.generateRecordId();
          const recordData = {
            record_id: recordId,
            student_id: student.student_id,
            student_name: student.name,
            class_id: classId,
            date: selectedDate,
            category_id: selectedCategoryId,
            category_code: categoryCode,
            category_name: category.category_name,
            score_change: category.score_deduction || 0,
            reason: '',
            recorder_openid: app.globalData.openid,
            recorder_name: app.globalData.userInfo.nickName,
            recorder_role: userRole,
            semester_id: app.globalData.currentSemesterId || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          const addRes = await wx.cloud.callFunction({
            name: 'scoreManager',
            data: {
              action: 'addAttendanceRecord',
              data: {
                ...recordData,
                classId: classId
              }
            }
          });
          if (!addRes.result || !addRes.result.success) {
            console.error('添加考勤记录(无节次)失败:', addRes.result?.message || '未知错误');
          }

          if (category.score_deduction && category.score_deduction !== 0) {
            await context.updateStudentScore(student.student_id, category.score_deduction, {
              category_code: categoryCode,
              category_name: category.category_name,
              reason_detail: `${selectedDate} ${category.category_name}`
            });
          }
        }
      }
    }
  }
};

module.exports = submitHandler;
