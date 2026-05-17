// pages/dorm/buildings/buildings.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    // 统计数据
    totalBuildings: 0,
    totalRooms: 0,
    totalBeds: 0,
    occupiedBeds: 0,

    // 搜索
    searchKeyword: '',

    // 楼栋列表
    buildings: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    pageSize: 20,
    page: 1,

    // 权限
    isAdmin: false,
    canManage: false
  },

  onLoad: function () {
    const role = app.globalData.role || ''
    const isAdmin = app.globalData.isAdmin || role === 'admin'
    const canManage = isAdmin || role === 'head_teacher'
    this.setData({
      isAdmin,
      canManage
    });
    this.loadBuildings(true);
    this.loadStats();
  },

  onShow: function () {
    this.loadBuildings(true);
    this.loadStats();
  },

  // 加载统计数据
  loadStats: async function () {
    try {
      const userClassId = app.globalData.class_id || app.globalData.classId || '';

      const buildingQuery = userClassId ? { class_id: userClassId } : {};
      const buildingRes = await db.collection('dorm_buildings').where(buildingQuery).count();
      const totalBuildings = buildingRes.total || 0;

      const roomRes = await db.collection('dorm_rooms').count();
      const totalRooms = roomRes.total || 0;

      const bedRes = await db.collection('dorm_beds').count();
      const totalBeds = bedRes.total || 0;

      const occupiedRes = await db.collection('students')
        .where({
          dorm_info: _.exists(true)
        })
        .count();
      const occupiedBeds = occupiedRes.total || 0;

      this.setData({
        totalBuildings,
        totalRooms,
        totalBeds,
        occupiedBeds
      });
    } catch (err) {
      console.error('加载统计数据失败:', err);
    }
  },

  // 加载楼栋列表
  loadBuildings: async function (refresh = false) {
    if (this.data.loading || this.data.loadingMore) return;

    try {
      if (refresh) {
        this.setData({
          loading: true,
          page: 1,
          hasMore: true
        });
      } else {
        this.setData({
          loadingMore: true
        });
      }

      const { searchKeyword, pageSize, page } = this.data;
      const userClassId = app.globalData.class_id || app.globalData.classId || '';

      // 构建查询条件
      let query = {
        class_id: _.eq(userClassId)
      };

      // 搜索
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.trim();
        query.building_name = db.RegExp({
          regexp: keyword,
          options: 'i'
        });
      }

      const res = await db.collection('dorm_buildings')
        .where(query)
        .orderBy('building_code', 'asc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      const buildings = res.data || [];

      // 获取每个楼栋的房间和楼层信息
      const buildingsWithInfo = await Promise.all(buildings.map(async (building) => {
        try {
          // 获取该楼栋的房间
          const roomsRes = await db.collection('dorm_rooms')
            .where({
              building_id: building._id
            })
            .get();

          const rooms = roomsRes.data || [];

          // 计算楼层数
          const floors = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b);

          // 获取该楼栋的床位数
          const bedsRes = await db.collection('dorm_beds')
            .where({
              building_id: building._id
            })
            .count();

          return {
            ...building,
            room_count: rooms.length,
            bed_count: bedsRes.total || 0,
            floors
          };
        } catch (err) {
          console.error('获取楼栋信息失败:', err);
          return {
            ...building,
            room_count: 0,
            bed_count: 0,
            floors: []
          };
        }
      }));

      if (refresh) {
        this.setData({
          buildings: buildingsWithInfo,
          hasMore: buildings.length >= pageSize
        });
      } else {
        this.setData({
          buildings: [...this.data.buildings, ...buildingsWithInfo],
          hasMore: buildings.length >= pageSize
        });
      }

    } catch (err) {
      console.error('加载楼栋失败:', err);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({
        loading: false,
        loadingMore: false
      });
    }
  },

  // 搜索输入
  onSearchInput: function (e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 搜索
  onSearch: function () {
    this.loadBuildings(true);
  },

  // 查看详情
  onViewDetail: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPkg2/dorm/rooms/rooms?building_id=${id}`
    });
  },

  // 编辑
  onEdit: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/subPkg2/dorm/buildings/add/add?id=${id}`
    });
  },

  // 删除
  onDelete: function (e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个楼栋吗？删除后该楼栋下的所有房间和床位也会被删除。',
      success: async (res) => {
        if (res.confirm) {
          await this.deleteBuilding(id);
        }
      }
    });
  },

  // 删除楼栋
  deleteBuilding: async function (buildingId) {
    try {
      wx.showLoading({ title: '删除中...' });

      const studentsRes = await db.collection('students')
        .where({
          dorm_info: db.RegExp({
            regexp: buildingId,
            options: 'i'
          })
        })
        .limit(1)
        .get();

      if (studentsRes.data && studentsRes.data.length > 0) {
        wx.hideLoading();
        wx.showToast({
          title: '该楼栋还有学生居住，无法删除',
          icon: 'none'
        });
        return;
      }

      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: {
          action: 'deleteBuilding',
          data: { building_id: buildingId }
        }
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.message || '删除楼栋失败');
      }

      wx.hideLoading();
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });

      this.loadBuildings(true);
      this.loadStats();

    } catch (err) {
      console.error('删除失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  // 添加
  onAdd: function () {
    wx.navigateTo({
      url: '/subPkg2/dorm/buildings/add/add'
    });
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadBuildings(true).then(() => {
      this.loadStats();
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.setData({
        page: this.data.page + 1
      });
      this.loadBuildings(false);
    }
  }
});
