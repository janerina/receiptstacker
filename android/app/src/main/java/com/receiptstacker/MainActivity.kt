package com.receiptstacker

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  private fun disableEdgeToEdge() {
    // React Native / AndroidX can enable edge-to-edge (content draws under system bars).
    // We want classic behavior: system bars reserve their space.
    WindowCompat.setDecorFitsSystemWindows(window, true)
    window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)

    // Avoid laying out into the display cutout (notch / hole-punch).
    // This prevents any accidental overlap/clipping near the very top.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val attrs = window.attributes
      attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER
      window.attributes = attrs
    }

    // Clear legacy layout flags if they were set.
    val decor = window.decorView
    decor.systemUiVisibility = decor.systemUiVisibility and
      View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN.inv() and
      View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION.inv() and
      View.SYSTEM_UI_FLAG_LAYOUT_STABLE.inv()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Apply after ReactActivity may have configured the window.
    disableEdgeToEdge()
  }

  override fun onResume() {
    super.onResume()
    // Re-apply in case something re-enabled edge-to-edge.
    disableEdgeToEdge()
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
