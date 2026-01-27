What you can run anytime

Rebuild the self-contained APK: cd C:\Projects\ReceiptStacker\android; .\\gradlew assembleRelease
Install to emulator: adb install -r C:\Projects\ReceiptStacker\android\\app\\build\\outputs\\apk\\release\\app-release.apk
Launch on emulator: C:\Projects\ReceiptStacker\android\adb shell monkey -p com.receiptstacker -c android.intent.category.LAUNCHER 1