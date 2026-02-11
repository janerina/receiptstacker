module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native'
      + '|@react-native'
      + '|@react-navigation'
      + '|@noble'
      + '|@scure'
      + '|react-native-gesture-handler'
      + '|react-native-reanimated'
      + '|reanimated-color-picker'
      + '|react-native-screens'
      + '|react-native-safe-area-context'
      + '|react-native-document-scanner-plugin'
      + '|react-native-keyboard-aware-scroll-view'
      + '|react-native-iphone-x-helper'
      + ')/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
