// pages/student/import/import.js
const app = getApp();
const util = require('../../../utils/util.js');
const excelTransfer = require('../../utils/excelTransfer.js');

Page({
  data: {
    classId: '',
    className: '',
    
    // 导入相关
    importMethod: 'manual', // manual, paste, file, excel
    pasteContent: '',
    excelFileID: '',
    excelFileName: '',
    excelUploading: false,
    
    // 预览数据
    previewData: [],
    validCount: 0,
    invalidCount: 0,
    
    // 字段说明
    fieldDesc: [
      { name: 'student_id', label: '学号', required: true, example: '2024001' },
      { name: 'name', label: '姓名', required: true, example: '张三' },
      { name: 'gender', label: '性别', required: false, example: '男/女' },
      { name: 'is_boarding', label: '住宿', required: false, example: '是/否' },
      { name: 'position', label: '班干部', required: false, example: '班长/学习委员' },
      { name: 'phone', label: '联系电话', required: false, example: '13800138000' },
      { name: 'parent_name', label: '家长姓名', required: false, example: '张父' },
      { name: 'parent_phone', label: '家长电话', required: false, example: '13900139000' },
      { name: 'address', label: '家庭住址', required: false, example: 'XX市XX区XX街道' },
      { name: 'initial_score', label: '初始积分', required: false, example: '100' },
      { name: 'date_of_birth', label: '出生日期', required: false, example: '2008-01-15' },
      { name: 'ethnicity', label: '民族', required: false, example: '汉族' },
      { name: 'political_status', label: '政治面貌', required: false, example: '共青团员' },
      { name: 'enrollment_date', label: '入学日期', required: false, example: '2024-09-01' }
    ],
    
    // 示例模板
    templateExample: '学号,姓名,性别,住宿,班干部,联系电话,家长姓名,家长电话,家庭住址,初始积分,出生日期,民族,政治面貌,入学日期\n2024001,张三,男,是,班长,13800138000,张父,13900139000,XX市XX区,100,2008-01-15,汉族,共青团员,2024-09-01\n2024002,李四,女,否,学习委员,13800138001,李母,13900139001,XX市XX区,100,2008-03-20,汉族,群众,2024-09-01',
    
    // 导入状态
    importing: false,
    importProgress: 0,
    importResult: null,
    duplicateCount: 0,
    overwriteConfirmed: false
  },

  onLoad: function (options) {
    const classId = app.globalData.class_id;
    const className = app.globalData.className || options.class_name || '';
    
    if (!classId) {
      wx.showModal({
        title: '提示',
        content: '请先选择班级',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }
    
    this.setData({ classId, className });
  },

  // 切换导入方式
  onMethodChange: function (e) {
    const method = e.currentTarget.dataset.method;
    this.setData({ 
      importMethod: method,
      previewData: [],
      validCount: 0,
      invalidCount: 0,
      importResult: null
    });
  },

  // 粘贴内容变化
  onPasteChange: function (e) {
    this.setData({ pasteContent: e.detail.value });
  },

  // 解析粘贴的数据
  onParsePaste: function () {
    const content = this.data.pasteContent.trim();
    
    if (!content) {
      util.showError('请粘贴数据');
      return;
    }
    
    this.parseData(content);
  },

  // 使用示例模板
  onUseTemplate: function () {
    this.setData({ 
      pasteContent: this.data.templateExample,
      importMethod: 'paste'
    });
    util.showSuccess('已填充示例模板');
  },

  // 选择文件导入（使用文本文件）
  onChooseFile: function () {
    const that = this;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt', 'csv'],
      success: (res) => {
        const file = res.tempFiles[0];
        that.readFileContent(file.path);
      },
      fail: (err) => {
        console.error('选择文件失败:', err);
        // 如果选择文件失败，提示使用粘贴方式
        wx.showModal({
          title: '提示',
          content: '文件选择暂不可用，请使用"粘贴数据"方式导入',
          showCancel: false
        });
      }
    });
  },

  // 读取文件内容
  readFileContent: function (filePath) {
    const that = this;
    const fs = wx.getFileSystemManager();
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      that.parseData(content);
    } catch (err) {
      console.error('读取文件失败:', err);
      util.showError('读取文件失败');
    }
  },

  // 解析数据
  parseData: function (content) {
    wx.showLoading({ title: '解析中...', mask: true });
    
    try {
      // 按行分割
      const lines = content.split(/\n|\r\n/).filter(line => line.trim());
      
      if (lines.length < 2) {
        wx.hideLoading();
        util.showError('数据格式错误，至少需要标题行和一行数据');
        return;
      }
      
      // 解析标题行
      const headers = this.parseCSVLine(lines[0]);
      
      // 找到各字段的列索引
      const fieldIndex = {
        student_id: this.findFieldIndex(headers, ['学号', 'student_id', '编号']),
        name: this.findFieldIndex(headers, ['姓名', 'name', '名字']),
        gender: this.findFieldIndex(headers, ['性别', 'gender']),
        is_boarding: this.findFieldIndex(headers, ['住宿', 'is_boarding', '住校']),
        position: this.findFieldIndex(headers, ['班干部', 'position', '职务', '职位']),
        phone: this.findFieldIndex(headers, ['联系电话', 'phone', '电话', '手机']),
        parent_name: this.findFieldIndex(headers, ['家长姓名', 'parent_name', '家长']),
        parent_phone: this.findFieldIndex(headers, ['家长电话', 'parent_phone']),
        address: this.findFieldIndex(headers, ['家庭住址', 'address', '住址', '地址']),
        initial_score: this.findFieldIndex(headers, ['初始积分', 'initial_score', '积分']),
        date_of_birth: this.findFieldIndex(headers, ['出生日期', 'date_of_birth', '生日', 'birth_date', 'birthday']),
        ethnicity: this.findFieldIndex(headers, ['民族', 'ethnicity', 'nation']),
        political_status: this.findFieldIndex(headers, ['政治面貌', 'political_status', 'political']),
        enrollment_date: this.findFieldIndex(headers, ['入学日期', 'enrollment_date'])
      };
      
      // 检查必填字段
      if (fieldIndex.student_id === -1 || fieldIndex.name === -1) {
        wx.hideLoading();
        util.showError('缺少必填字段：学号和姓名');
        return;
      }
      
      // 解析数据行
      const previewData = [];
      let validCount = 0;
      let invalidCount = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        
        if (values.length < 2) continue;
        
        const student = {
          rowIndex: i,
          student_id: fieldIndex.student_id >= 0 ? values[fieldIndex.student_id]?.trim() : '',
          name: fieldIndex.name >= 0 ? values[fieldIndex.name]?.trim() : '',
          gender: fieldIndex.gender >= 0 ? this.parseGender(values[fieldIndex.gender]) : '',
          is_boarding: fieldIndex.is_boarding >= 0 ? this.parseBoolean(values[fieldIndex.is_boarding]) : false,
          position: fieldIndex.position >= 0 ? values[fieldIndex.position]?.trim() : '',
          phone: fieldIndex.phone >= 0 ? values[fieldIndex.phone]?.trim() : '',
          parent_name: fieldIndex.parent_name >= 0 ? values[fieldIndex.parent_name]?.trim() : '',
          parent_phone: fieldIndex.parent_phone >= 0 ? values[fieldIndex.parent_phone]?.trim() : '',
          address: fieldIndex.address >= 0 ? values[fieldIndex.address]?.trim() : '',
          initial_score: fieldIndex.initial_score >= 0 ? parseInt(values[fieldIndex.initial_score]) || 100 : 100,
          date_of_birth: fieldIndex.date_of_birth >= 0 ? values[fieldIndex.date_of_birth]?.trim() : '',
          ethnicity: fieldIndex.ethnicity >= 0 ? values[fieldIndex.ethnicity]?.trim() : '',
          political_status: fieldIndex.political_status >= 0 ? values[fieldIndex.political_status]?.trim() : '',
          enrollment_date: fieldIndex.enrollment_date >= 0 ? values[fieldIndex.enrollment_date]?.trim() : ''
        };
        
        // 验证数据
        const validation = this.validateStudent(student);
        student.valid = validation.valid;
        student.errors = validation.errors;
        
        if (student.valid) {
          validCount++;
        } else {
          invalidCount++;
        }
        
        previewData.push(student);
      }
      
      this.setData({
        previewData,
        validCount,
        invalidCount
      });
      
      wx.hideLoading();
      
      if (previewData.length === 0) {
        util.showError('未解析到有效数据');
      } else {
        util.showSuccess(`解析完成：${validCount}条有效，${invalidCount}条无效`);
      }
      
    } catch (err) {
      console.error('解析数据失败:', err);
      wx.hideLoading();
      util.showError('解析数据失败');
    }
  },

  // 解析CSV行（支持引号包围的字段）
  parseCSVLine: function (line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === '\t') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  },

  // 查找字段索引
  findFieldIndex: function (headers, possibleNames) {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase().trim();
      if (possibleNames.some(name => header === name.toLowerCase())) {
        return i;
      }
    }
    return -1;
  },

  // 解析性别
  parseGender: function (value) {
    if (!value) return '';
    const v = value.trim().toLowerCase();
    if (v === '男' || v === 'male' || v === 'm' || v === '1') return '男';
    if (v === '女' || v === 'female' || v === 'f' || v === '2') return '女';
    return value.trim();
  },

  // 解析布尔值
  parseBoolean: function (value) {
    if (!value) return false;
    const v = value.trim().toLowerCase();
    return v === '是' || v === 'true' || v === 'yes' || v === '1' || v === '住' || v === '住宿';
  },

  // 验证学生数据
  validateStudent: function (student) {
    const errors = [];
    
    if (!student.student_id) {
      errors.push('学号为空');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(student.student_id)) {
      errors.push('学号格式错误');
    }
    
    if (!student.name) {
      errors.push('姓名为空');
    } else if (student.name.length > 20) {
      errors.push('姓名过长');
    }
    
    if (student.phone && !/^1[3-9]\d{9}$/.test(student.phone)) {
      errors.push('手机号格式错误');
    }
    
    if (student.parent_phone && !/^1[3-9]\d{9}$/.test(student.parent_phone)) {
      errors.push('家长电话格式错误');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  },

  // 删除预览行
  onRemoveRow: function (e) {
    const index = e.currentTarget.dataset.index;
    const previewData = this.data.previewData;
    const removed = previewData.splice(index, 1)[0];
    
    this.setData({
      previewData,
      validCount: this.data.validCount - (removed.valid ? 1 : 0),
      invalidCount: this.data.invalidCount - (removed.valid ? 0 : 1)
    });
  },

  onChooseExcel: async function () {
    try {
      const file = await excelTransfer.chooseExcelFile()
      this.setData({ excelUploading: true, excelFileName: file.name })
      const uploadRes = await excelTransfer.uploadToCloud(file.path)
      this.setData({ excelUploading: false, excelFileID: uploadRes.fileID })
      wx.showLoading({ title: '解析中...', mask: true })
      const res = await excelTransfer.callDataTransfer('importStudent', {
        fileID: uploadRes.fileID,
        classId: this.data.classId,
        className: this.data.className,
        confirm: false
      })
      wx.hideLoading()
      if (res.data && res.data.rows) {
        const rows = res.data.rows
        const validCount = res.data.validCount || 0
        const invalidCount = res.data.invalidCount || 0
        const duplicateCount = res.data.duplicateCount || 0
        this.setData({ previewData: rows, validCount, invalidCount, duplicateCount })
        let msg = `解析完成：${validCount}条有效，${invalidCount}条无效`
        if (duplicateCount > 0) {
          msg += `，${duplicateCount}条重复学号`
        }
        util.showSuccess(msg)
      }
    } catch (err) {
      wx.hideLoading()
      this.setData({ excelUploading: false })
      util.showError(err.message || 'Excel导入失败')
    }
  },

  onConfirmImport: async function () {
    const { previewData, classId, validCount, importMethod, duplicateCount, overwriteConfirmed } = this.data;
    
    if (validCount === 0) {
      util.showError('没有有效数据可导入');
      return;
    }
    
    if (duplicateCount > 0 && !overwriteConfirmed) {
      wx.showModal({
        title: '发现重复数据',
        content: `发现${duplicateCount}条重复学号数据，确认导入将跳过已有记录。如需覆盖已有信息，请勾选"覆盖已存在的学生数据"后重试。`,
        confirmText: '继续导入',
        success: async (res) => {
          if (res.confirm) {
            if (importMethod === 'excel') {
              await this.doExcelImport();
            } else {
              await this.doImport();
            }
          }
        }
      });
      return;
    }
    
    wx.showModal({
      title: '确认导入',
      content: `即将导入 ${validCount} 条学生数据${overwriteConfirmed ? '（覆盖已有记录）' : ''}，是否继续？`,
      success: async (res) => {
        if (res.confirm) {
          if (importMethod === 'excel') {
            await this.doExcelImport();
          } else {
            await this.doImport();
          }
        }
      }
    });
  },

  onOverwriteChange: function (e) {
    this.setData({ overwriteConfirmed: e.detail.value });
  },

  doExcelImport: async function () {
    const { previewData, classId, className, excelFileID, overwriteConfirmed } = this.data
    this.setData({ importing: true, importProgress: 0 })
    wx.showLoading({ title: '导入中...', mask: true })
    try {
      const res = await excelTransfer.callDataTransfer('importStudent', {
        fileID: excelFileID,
        classId,
        className,
        confirm: true,
        previewData,
        overwrite: overwriteConfirmed
      })
      wx.hideLoading()
      const result = res.data || {}
      this.setData({
        importing: false,
        importProgress: 100,
        importResult: {
          successCount: result.successCount || 0,
          failCount: result.failCount || 0,
          skipCount: result.skipCount || 0,
          overwriteCount: result.overwriteCount || 0,
          errors: result.errors || []
        }
      })
      if (result.successCount > 0) {
        util.showSuccess(`成功导入 ${result.successCount} 名学生`)
      }
    } catch (err) {
      wx.hideLoading()
      this.setData({ importing: false })
      util.showError(err.message || '导入失败')
    }
  },

  // 执行导入
  doImport: async function () {
    const { previewData, classId } = this.data;
    
    this.setData({ importing: true, importProgress: 0 });
    wx.showLoading({ title: '导入中...', mask: true });
    
    try {
      const validData = previewData.filter(s => s.valid).map(s => ({
        student_id: s.student_id,
        name: s.name,
        gender: s.gender || '男',
        is_boarding: s.is_boarding || false,
        position: s.position || '',
        phone_number: s.phone || '',
        parent_name: s.parent_name || '',
        parent_phone_number: s.parent_phone || '',
        home_address: s.address || '',
        initial_score: s.initial_score || 100,
        current_score: s.initial_score || 100,
        date_of_birth: s.date_of_birth || '',
        ethnicity: s.ethnicity || '',
        political_status: s.political_status || '',
        enrollment_date: s.enrollment_date || ''
      }));

      const res = await wx.cloud.callFunction({
        name: 'dataTransfer',
        data: {
          action: 'importStudents',
          data: {
            students: validData,
            class_id: classId
          }
        }
      });

      wx.hideLoading();

      const result = (res.result && res.result.success) ? res.result.data : {};
      const importResult = {
        successCount: result.successCount || 0,
        failCount: result.failCount || 0,
        skipCount: result.skipCount || 0,
        overwriteCount: result.overwriteCount || 0,
        errors: (result.errors || []).slice(0, 10)
      };
      
      this.setData({ 
        importing: false, 
        importProgress: 100,
        importResult 
      });
      
      if (importResult.successCount > 0) {
        util.showSuccess(`成功导入 ${importResult.successCount} 名学生`);
      }
    } catch (err) {
      console.error('导入失败:', err);
      wx.hideLoading();
      this.setData({ importing: false });
      util.showError('导入失败');
    }
  },

  // 完成/返回
  onFinish: function () {
    wx.navigateBack();
  },

  // 重新导入
  onReset: function () {
    this.setData({
      pasteContent: '',
      previewData: [],
      validCount: 0,
      invalidCount: 0,
      importResult: null,
      importMethod: 'paste',
      duplicateCount: 0,
      overwriteConfirmed: false
    });
  }
});