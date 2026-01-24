/**
 * Jest setup for ReceiptStacker.
 *
 * Mocks native modules that are unavailable in the Jest environment.
 */

/* eslint-env jest */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// React Navigation / RNGH test setup
import 'react-native-gesture-handler/jestSetup';

// Vector icons (avoid native font loading in Jest)
jest.mock('react-native-vector-icons/Feather', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function FeatherMock(props) {
    return React.createElement(Text, props, props?.name ?? 'icon');
  };
});

// Swiper (keep it simple for unit tests)
jest.mock('react-native-swiper', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function SwiperMock(props) {
    return React.createElement(View, props, props?.children);
  };
});

// LinearGradient (avoid native module + ESM issues in Jest)
jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function LinearGradientMock(props) {
    return React.createElement(View, props, props?.children);
  };
});

// Vision Camera (native module)
jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  const Camera = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
  Camera.requestCameraPermission = jest.fn(async () => 'authorized');
  Camera.getCameraPermissionStatus = jest.fn(async () => 'authorized');

  return {
    __esModule: true,
    Camera,
    useCameraDevice: jest.fn(() => null),
  };
});

// Image Picker (native module)
jest.mock('react-native-image-picker', () => {
  return {
    __esModule: true,
    launchCamera: jest.fn(async () => ({ didCancel: true })),
    launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
  };
});

// ML Kit Text Recognition (native module)
jest.mock('@react-native-ml-kit/text-recognition', () => {
  return {
    __esModule: true,
    default: {
      recognize: jest.fn(async () => ({ text: '' })),
    },
  };
});

// Share (native module)
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {
    open: jest.fn(async () => ({})),
  },
}));

// HTML-to-PDF (native module)
jest.mock('react-native-html-to-pdf', () => ({
  __esModule: true,
  generatePDF: jest.fn(async () => ({ filePath: '' })),
}));

// BlurView (avoid native module in Jest)
jest.mock('@react-native-community/blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: function BlurViewMock(props) {
      return React.createElement(View, props, props?.children);
    },
  };
});

// react-native-modal is shipped as ESM in some versions; mock it for Jest.
jest.mock('react-native-modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function ModalMock(props) {
    if (!props?.isVisible) return null;
    return React.createElement(View, props, props?.children);
  };
});

// Image zoom viewer (native-heavy)
jest.mock('react-native-image-zoom-viewer', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function ImageZoomViewerMock(props) {
    return React.createElement(View, props, null);
  };
});

// DateTimePicker (native module; ESM in some versions)
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: function DateTimePickerMock(props) {
      return React.createElement(View, props, null);
    },
  };
});

// react-native-date-picker (native module)
jest.mock('react-native-date-picker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: function DatePickerMock(props) {
      return React.createElement(View, props, null);
    },
  };
});

// Chart kit (ESM)
jest.mock('react-native-chart-kit', () => {
  const React = require('react');
  const { View } = require('react-native');

  const make = (name) => function ChartMock(props) {
    return React.createElement(View, { ...props, accessibilityLabel: name }, null);
  };

  return {
    __esModule: true,
    LineChart: make('LineChart'),
    PieChart: make('PieChart'),
  };
});

// Calendars (ships TS/ESM)
jest.mock('react-native-calendars', () => {
  const React = require('react');
  const { View, Text } = require('react-native');

  const Calendar = function CalendarMock(props) {
    return React.createElement(View, props, React.createElement(Text, null, 'Calendar'));
  };

  return {
    __esModule: true,
    Calendar,
  };
});

// Swipe list view (native-ish list gestures)
jest.mock('react-native-swipe-list-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    SwipeListView: function SwipeListViewMock(props) {
      return React.createElement(View, props, props?.ListHeaderComponent ?? null);
    },
  };
});

// File system (native module)
jest.mock('react-native-fs', () => {
  return {
    __esModule: true,
    DocumentDirectoryPath: '/documents',
    ExternalDirectoryPath: '/external',
    writeFile: jest.fn(async () => undefined),
    exists: jest.fn(async () => true),
    stat: jest.fn(async () => ({ size: 0 })),
    unlink: jest.fn(async () => undefined),
  };
});

// Biometrics (native module)
jest.mock('react-native-biometrics', () => {
  const mockInstance = {
    isSensorAvailable: jest.fn(async () => ({ available: false, biometryType: null })),
    simplePrompt: jest.fn(async () => ({ success: false })),
  };

  const MockCtor = function ReactNativeBiometricsMock() {
    return mockInstance;
  };

  return {
    __esModule: true,
    default: MockCtor,
  };
});
