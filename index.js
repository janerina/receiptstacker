/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

import BackgroundFetch from 'react-native-background-fetch';
import { backupFetchHeadlessTask } from './src/services/backupRestore/scheduler';

AppRegistry.registerComponent(appName, () => App);

// Prompt 47: allow scheduled backups to run in the background.
BackgroundFetch.registerHeadlessTask(backupFetchHeadlessTask);
