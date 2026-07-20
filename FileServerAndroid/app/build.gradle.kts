plugins {
    id("com.android.application")
}

android {
    namespace = "com.syj5385.fileexplore"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.syj5385.fileexplore"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles("proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
