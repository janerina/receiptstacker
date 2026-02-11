What you can run anytime

//Rebuild the self-contained APK: 
cd C:\Projects\ReceiptStacker\android; .\\gradlew assembleRelease

-----------------------------------------------
//Physical Device
cd C:\Projects\ReceiptStacker; & "C:\Users\janer\AppData\Local\Android\Sdk\platform-tools\adb.exe" -s R9ZX90HXSVA install -r C:\Projects\ReceiptStacker\android\\app\\build\\outputs\\apk\\release\\app-release.apk

//emulator - 5554
cd C:\Projects\ReceiptStacker; & "C:\Users\janer\AppData\Local\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 install -r android\app\build\outputs\apk\release\app-release.apk

//Small emulator - 5556
cd C:\Projects\ReceiptStacker; & "C:\Users\janer\AppData\Local\Android\Sdk\platform-tools\adb.exe" -s emulator-5556 install -r android\app\build\outputs\apk\release\app-release.apk
----------------------------------------------


//Launch on emulator: 
cd C:\Projects\ReceiptStacker; & "C:\Users\janer\AppData\Local\Android\Sdk\platform-tools\adb.exe" -s emulator-5554 shell monkey -p com.receiptstacker -c android.intent.category.LAUNCHER 1






