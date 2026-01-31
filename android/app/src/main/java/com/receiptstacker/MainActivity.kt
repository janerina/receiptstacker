package com.receiptstacker

import android.os.Bundle
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Prevent Android from restoring screen fragments.
    // react-native-screens expects to manage fragments itself.
    super.onCreate(null)
    // Enable Edge-to-Edge (draw behind system bars).
    // This allows React Native's SafeAreaView to completely manage the top status bar area,
    // ensuring perfect alignment and no double-padding or clipping "rectangles".
    WindowCompat.setDecorFitsSystemWindows(window, false)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ReceiptStacker"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
