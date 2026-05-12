// pages/class/add/add.js
const app = getApp();
const api = require('../../../utils/api.js');
const util = require('../../../utils/util.js');
const membership = require('../../../utils/membership.js');

Page({
  data: {
    isEdit: false,
    classId: '',
    loading: false,
    submitting: false,
    showSuccessModal: false,
    createdClass: null,
    showUpgradeModal: false, // 升级提示弹窗
    membershipInfo: null, // 会员信息

    formData: {
      class_name: '',
      grade: '',
      grade_type: '',
      student_count: '',
      creator_name: '',
      creator_phone: '',
      subject: ''
    },

    // 年级选项（多列选择器）
    gradeOptions: [
      [
        { label: '职校', value: 'vocational' },
        { label: '高中', value: 'high_school' },
        { label: '初中', value: 'middle_school' },
        { label: '小学', value: 'primary_school' },
        { label: '幼儿园', value: 'kindergarten' }
      ],
      [
        { label: '一年级', value: '1' },
        { label: '二年级', value: '2' },
        { label: '三年级', value: '3' }
      ]
    ],
    gradeIndex: [0, 0],
    selectedGradeText: '',

    // 科目选项
    subjectOptions: ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '体育', '音乐', '美术', '其他'],
    subjectIndex: 12
  },

  onLoad: function (options) {
    // 检查权限
    this.checkPermission();

    // 判断是编辑还是添加
    if (options.id) {
      this.setData({
        isEdit: true,
        classId: options.id
      });
      this.loadClassData(options.id);
    } else {
      // 新建班级时检查会员权限
      this.checkCreateClassPermission();
      // 自动填充手机号
      this.autoFillPhone();
    }
  },

  // 自动填充手机号
  autoFillPhone: function () {
    const phone = app.globalData.phone || (app.globalData.userInfo && app.globalData.userInfo.phone);
    if (phone && !this.data.formData.creator_phone) {
      this.setData({ 'formData.creator_phone': phone });
    }
  },

  // 检查权限
  checkPermission: function () {
    const role = app.globalData.role;
    // 只有登录用户才能创建班级，不再限制为管理员
    if (!app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
    }
  },

  // 检查创建班级权限
  checkCreateClassPermission: async function () {
    try {
      const result = await app.checkCreateClassPermission();
      console.log('创建班级权限检查:', result);
      
      this.setData({
        membershipInfo: {
          allowed: result.allowed,
          reason: result.reason,
          remaining: result.remaining
        }
      });

      if (!result.allowed) {
        // 显示升级提示弹窗
        this.setData({ showUpgradeModal: true });
      }
    } catch (err) {
      console.error('检查权限失败:', err);
      // 权限检查失败时，允许继续操作（降级处理）
      this.setData({
        membershipInfo: {
          allowed: true,
          reason: '',
          remaining: -1
        }
      });
    }
  },

  // 关闭升级提示弹窗
  onCloseUpgradeModal: function () {
    this.setData({ showUpgradeModal: false });
  },

  // 跳转到会员页面
  goToMembership: function () {
    this.setData({ showUpgradeModal: false });
    wx.navigateTo({
      url: '/pages/membership/membership'
    });
  },

  // 加载班级数据
  loadClassData: async function (classId) {
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const res = await db.collection('classes').doc(classId).get();

      if (res.data) {
        const cls = res.data;
        this.setData({
          formData: {
            class_name: cls.class_name || '',
            grade: cls.grade || '',
            grade_type: cls.grade_type || '',
            student_count: cls.student_count || '',
            creator_name: cls.creator_name || '',
            creator_phone: cls.creator_phone || '',
            subject: cls.subject || ''
          },
          selectedGradeText: cls.grade || '',
          loading: false
        });
      }
    } catch (err) {
      console.error('加载班级数据失败:', err);
      this.setData({ loading: false });
      util.showError('加载数据失败');
    }
  },

  // 输入变化
  onInputChange: function (e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 年级选择
  onGradeChange: function (e) {
    const values = e.detail.value;
    const gradeOptions = this.data.gradeOptions;

    const gradeType = gradeOptions[0][values[0]];
    const gradeLevel = gradeOptions[1][values[1]];
    const gradeText = `${gradeType.label}${gradeLevel.label}`;

    this.setData({
      gradeIndex: values,
      selectedGradeText: gradeText,
      'formData.grade': gradeText,
      'formData.grade_type': gradeType.value
    });
  },

  // 年级列变化
  onGradeColumnChange: function (e) {
    const column = e.detail.column;
    const value = e.detail.value;
    const gradeOptions = this.data.gradeOptions;

    if (column === 0) {
      // 根据学段更新年级选项
      let newGrades = [];
      const gradeType = gradeOptions[0][value].value;

      if (gradeType === 'vocational' || gradeType === 'high_school') {
        newGrades = [
          { label: '一年级', value: '1' },
          { label: '二年级', value: '2' },
          { label: '三年级', value: '3' }
        ];
      } else if (gradeType === 'middle_school') {
        newGrades = [
          { label: '七年级', value: '7' },
          { label: '八年级', value: '8' },
          { label: '九年级', value: '9' }
        ];
      } else if (gradeType === 'primary_school') {
        newGrades = [
          { label: '一年级', value: '1' },
          { label: '二年级', value: '2' },
          { label: '三年级', value: '3' },
          { label: '四年级', value: '4' },
          { label: '五年级', value: '5' },
          { label: '六年级', value: '6' }
        ];
      } else {
        newGrades = [
          { label: '小班', value: 'small' },
          { label: '中班', value: 'middle' },
          { label: '大班', value: 'big' }
        ];
      }

      this.setData({
        'gradeOptions[1]': newGrades,
        gradeIndex: [value, 0]
      });
    }
  },

  // 科目选择
  onSubjectChange: function (e) {
    const index = e.detail.value;
    this.setData({
      subjectIndex: index,
      'formData.subject': this.data.subjectOptions[index]
    });
  },

  // 提交表单
  onSubmit: async function () {
    const { formData, isEdit, classId } = this.data;

    // 验证必填项
    if (!formData.class_name.trim()) {
      util.showError('请输入班级名称');
      return;
    }

    if (!formData.grade) {
      util.showError('请选择年级');
      return;
    }

    if (!formData.creator_name.trim()) {
      util.showError('请输入您的姓名');
      return;
    }

    if (!formData.creator_phone.trim()) {
      util.showError('请输入手机号');
      return;
    }

    if (!/^1[3-9]\d{9}$/.test(formData.creator_phone)) {
      util.showError('请输入正确的手机号');
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: isEdit ? '保存中...' : '创建中...', mask: true });

    try {
      const db = wx.cloud.database();

      const saveData = {
        class_name: formData.class_name.trim(),
        grade: formData.grade,
        grade_type: formData.grade_type,
        student_count: parseInt(formData.student_count) || null,
        creator_name: formData.creator_name.trim(),
        creator_phone: formData.creator_phone.trim(),
        subject: formData.subject,
        creator_id: app.globalData.openid,
        status: 'active',
        updated_at: db.serverDate()
      };

      if (isEdit) {
        // 更新
        const res = await wx.cloud.callFunction({
          name: 'joinClass',
          data: {
            action: 'updateClass',
            data: { _id: classId, ...saveData }
          }
        });
        if (!res.result || !res.result.success) {
          throw new Error(res.result?.message || '修改失败');
        }
        util.showSuccess('修改成功');

        wx.hideLoading();
        this.setData({ submitting: false });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        // 添加
        saveData.created_at = db.serverDate();
        saveData.class_code = this.generateClassCode();

        const res = await wx.cloud.callFunction({
          name: 'joinClass',
          data: {
            action: 'createClass',
            data: {
              class_data: saveData,
              relation_data: {
                user_openid: app.globalData.openid,
                role: 'head_teacher',
                is_owner: true,
                status: 'joined',
                apply_info: {
                  name: formData.creator_name.trim(),
                  phone: formData.creator_phone.trim(),
                  subject: formData.subject
                }
              }
            }
          }
        });

        if (!res.result || !res.result.success) {
          const errMsg = res.result?.message || res.result?.error || res.errMsg || '创建失败'
          console.error('createClass云函数返回:', JSON.stringify(res))
          throw new Error(errMsg);
        }

        const result = res.result.data || {};
        const classIdResult = result.class_id || result._id || '';

        app.globalData.class_id = classIdResult;
        wx.setStorageSync('class_id', classIdResult);

        app.globalData.role = 'head_teacher';
        wx.setStorageSync('role', 'head_teacher');

        app.globalData.currentClassName = saveData.class_name;
        wx.setStorageSync('currentClassName', saveData.class_name);

        if (!app.globalData.student_id) {
          app.loadUserAuthorizations();
        }

        wx.hideLoading();
        this.setData({ submitting: false });

        this.showCreateSuccessModal(saveData, classIdResult);
      }

    } catch (err) {
      console.error('保存失败:', err);
      wx.hideLoading();
      this.setData({ submitting: false });
      util.showError('保存失败: ' + (err.message || '未知错误'));
    }
  },

  // 删除班级
  onDelete: function () {
    const { classId, formData } = this.data;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除班级"${formData.class_name}"吗？删除后该班级的学生将失去班级关联。`,
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true });

          try {
            const cfRes = await wx.cloud.callFunction({
              name: 'joinClass',
              data: {
                action: 'deleteClass',
                data: { class_id: classId }
              }
            });

            if (!cfRes.result || !cfRes.result.success) {
              throw new Error(cfRes.result?.message || '删除失败');
            }

            wx.hideLoading();
            util.showSuccess('删除成功');

            setTimeout(() => {
              wx.navigateBack();
            }, 1500);

          } catch (err) {
            console.error('删除失败:', err);
            wx.hideLoading();
            util.showError('删除失败');
          }
        }
      }
    });
  },

  // 取消
  onCancel: function () {
    wx.navigateBack();
  },

  // 显示帮助
  onShowHelp: function () {
    wx.showModal({
      title: '帮助说明',
      content: '1. 选择学段和年级\n2. 输入班级名称\n3. 填写您的身份信息\n4. 点击创建班级\n\n创建成功后，您将成为该班级的管理员。',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  // 生成班级码（6位数字字母组合）
  generateClassCode: function () {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除容易混淆的字符
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  // 显示创建成功弹窗
  showCreateSuccessModal: function (classData, classId) {
    this.setData({
      showSuccessModal: true,
      createdClass: {
        ...classData,
        _id: classId
      }
    });
  },

  // 关闭成功弹窗
  onCloseSuccessModal: function () {
    this.setData({ showSuccessModal: false });
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  onEnterClass: function () {
    this.setData({ showSuccessModal: false });
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});
