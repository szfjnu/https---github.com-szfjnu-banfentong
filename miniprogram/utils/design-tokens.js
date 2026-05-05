const colors = {
  primary: '#1890ff',
  primaryLight: '#e6f7ff',
  primaryDark: '#096dd9',
  success: '#52c41a',
  successLight: '#f6ffed',
  warning: '#faad14',
  warningLight: '#fffbe6',
  error: '#f5222d',
  errorLight: '#fff1f0',
  textPrimary: '#333333',
  textSecondary: '#666666',
  textLight: '#999999',
  textPlaceholder: '#cccccc',
  border: '#e8e8e8',
  borderLight: '#f0f0f0',
  bgPage: '#f5f5f5',
  bgCard: '#ffffff',
  bgGrey: '#fafafa',
  bgHover: '#f5f7fa',
  white: '#ffffff',
  black: '#000000'
}

const fontSizes = {
  xs: 20,
  sm: 24,
  base: 28,
  md: 30,
  lg: 32,
  xl: 36,
  xxl: 40,
  xxxl: 48
}

const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  base: 24,
  lg: 32,
  xl: 48,
  xxl: 64,
  xxxl: 96
}

const radius = {
  none: 0,
  sm: 4,
  md: 8,
  base: 12,
  lg: 16,
  xl: 24,
  round: 999
}

const shadows = {
  sm: '0 2rpx 8rpx rgba(0, 0, 0, 0.06)',
  md: '0 4rpx 16rpx rgba(0, 0, 0, 0.08)',
  lg: '0 8rpx 24rpx rgba(0, 0, 0, 0.12)'
}

module.exports = {
  colors,
  fontSizes,
  spacing,
  radius,
  shadows,
  toRpx: function (val) { return val + 'rpx' }
}
