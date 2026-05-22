const app = getApp();

// 👉 必须写在最外层，不能写在函数内部！
import * as echarts from '../../../ec-canvas/echarts.js';

// 👉 标准 initChart，无 require
function initChart(canvas, width, height, dpr) {
  const chart = echarts.init(canvas, null, {
    width: width,
    height: height,
    devicePixelRatio: dpr
  });
  canvas.setChart(chart);
  return chart;
}

Page({
  data: {
    buildingOptions: [],
    buildingIndex: 0,
    selectedBuildingId: '',
    roomOptions: [],
    roomIndex: 0,
    selectedRoomId: '',
    chartTypes: [
      { value: 'daily', label: '每日折线' },
      { value: 'week_compare', label: '周对比' },
      { value: 'month_compare', label: '月对比' },
      { value: 'semester_trend', label: '学期趋势' }
    ],
    chartTypeIndex: 0,
    selectedChartType: 'daily',
    ec: { onInit: initChart }, // 直接绑定
    chartLoading: false,
    noData: false,
    useFallbackList: false,
    fallbackRecords: [],
    canViewChart: false,
    classId: ''
  },

  onLoad: function () {
    const role = app.globalData.role;
    const canViewChart = role !== 'subject_teacher';
    const classId = app.globalData.class_id || app.globalData.classId || '';
    
    this.setData({
      canViewChart: canViewChart,
      classId: classId
    });

    this.loadBuildings();
  },

  loadBuildings: async function () {
    try {
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: {
          action: 'getDormCandidates',
          data: { level: 'buildings', class_id: this.data.classId }
        }
      });
      if (res.result && res.result.success) {
        this.setData({ buildingOptions: res.result.data || [] });
      }
    } catch (err) {
      console.error('加载楼栋失败:', err);
    }
  },

  onBuildingChange: function (e) {
    const idx = parseInt(e.detail.value);
    const building = this.data.buildingOptions[idx];
    if (!building) return;

    this.setData({
      buildingIndex: idx,
      selectedBuildingId: building._id,
      roomIndex: 0,
      selectedRoomId: ''
    });
    this.loadRooms(building._id);
  },

  loadRooms: async function (buildingId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'dormSyncManager',
        data: {
          action: 'getDormCandidates',
          data: { level: 'rooms', building_id: buildingId, class_id: this.data.classId }
        }
      });
      if (res.result && res.result.success) {
        const rooms = res.result.data || [];
        this.setData({ roomOptions: rooms });
        if (rooms.length > 0) {
          this.setData({ selectedRoomId: rooms[0]._id });
          this.loadChartData();
        }
      }
    } catch (err) {
      console.error('加载房间失败:', err);
    }
  },

  onRoomChange: function (e) {
    const idx = parseInt(e.detail.value);
    const room = this.data.roomOptions[idx];
    if (!room) return;
    this.setData({
      roomIndex: idx,
      selectedRoomId: room._id
    });
    this.loadChartData();
  },

  onChartTypeChange: function (e) {
    const idx = parseInt(e.detail.value);
    const ct = this.data.chartTypes[idx];
    if (!ct) return;
    this.setData({
      chartTypeIndex: idx,
      selectedChartType: ct.value
    });
    this.loadChartData();
  },

  onChartTypeTap: function (e) {
    const value = e.currentTarget.dataset.value;
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({
      chartTypeIndex: index,
      selectedChartType: value
    });
    this.loadChartData();
  },

  loadChartData: async function () {
    const { selectedRoomId } = this.data;
    if (!selectedRoomId) return;

    this.setData({ chartLoading: true, noData: false });

    try {
      const res = await wx.cloud.callFunction({
        name: 'dormScoringManager',
        data: {
          action: 'getScoreTrends',
          data: {
            room_id: selectedRoomId,
            chart_type: this.data.selectedChartType,
            class_id: this.data.classId
          }
        }
      });

      if (res.result && res.result.success) {
        const chartData = res.result.data;
        this.buildChartOption(chartData);
      } else {
        this.setData({ noData: true, chartLoading: false });
      }
    } catch (err) {
      console.error('加载趋势数据失败:', err);
      this.setData({ noData: true, chartLoading: false });
    }
  },

  buildChartOption: function (chartData) {
    const { chart_type } = chartData;

    if (this.data.useFallbackList) {
      this.setData({
        fallbackRecords: chartData.dates ? chartData.dates.map((d, i) => ({
          date: d,
          score: chartData.scores[i]
        })) : [],
        chartLoading: false,
        noData: !chartData.dates || chartData.dates.length === 0
      });
      return;
    }

    const ecComponent = this.selectComponent('#myChart');
    if (!ecComponent) {
      this.setData({ chartLoading: false, useFallbackList: true });
      return;
    }

    let option = {};

    if (chart_type === 'daily') {
      const { dates, scores } = chartData;
      if (!dates || dates.length === 0) {
        this.setData({ noData: true, chartLoading: false });
        return;
      }
      option = {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45 } },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [{
          type: 'line',
          data: scores,
          name: '每日评分',
          smooth: true,
          itemStyle: { color: '#1890ff' }
        }]
      };
    } else if (chart_type === 'week_compare') {
      const { current_labels, current_scores, previous_scores } = chartData;
      option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['本周', '上周'] },
        xAxis: { type: 'category', data: current_labels },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [
          { name: '本周', type: 'line', data: current_scores, itemStyle: { color: '#1890ff' } },
          { name: '上周', type: 'line', data: previous_scores, itemStyle: { color: '#999' }, lineStyle: { type: 'dashed' } }
        ]
      };
    } else if (chart_type === 'month_compare') {
      const { current_labels, current_scores, previous_scores } = chartData;
      option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['本月', '上月'] },
        xAxis: { type: 'category', data: current_labels, axisLabel: { rotate: 45 } },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [
          { name: '本月', type: 'line', data: current_scores, itemStyle: { color: '#1890ff' } },
          { name: '上月', type: 'line', data: previous_scores, itemStyle: { color: '#999' }, lineStyle: { type: 'dashed' } }
        ]
      };
    } else if (chart_type === 'semester_trend') {
      const { dates, scores, moving_avg } = chartData;
      option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['每日评分', '7日均线'] },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45 } },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [
          {
            name: '每日评分',
            type: 'line',
            data: scores,
            areaStyle: { color: 'rgba(24,144,255,0.15)' },
            itemStyle: { color: '#1890ff' },
            smooth: true
          },
          {
            name: '7日均线',
            type: 'line',
            data: moving_avg,
            itemStyle: { color: '#faad14' },
            lineStyle: { width: 2 },
            smooth: true
          }
        ]
      };
    }

    try {
      ecComponent.setOption(option);
    } catch (e) {
      console.error('setOption失败:', e);
      this.setData({ useFallbackList: true });
    }

    this.setData({ chartLoading: false });
  }
});