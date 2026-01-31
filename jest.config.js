module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native'
      + '|@react-native'
      + '|@react-navigation'
      + '|react-native-gesture-handler'
      + '|react-native-reanimated'
      + '|reanimated-color-picker'
      + '|react-native-screens'
      + '|react-native-safe-area-context'
      + ')/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
