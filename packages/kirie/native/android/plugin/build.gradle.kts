import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

val pluginName = "Kirie"
val pluginPackageName = "ai.moeru.kirie.android"

android {
    namespace = pluginPackageName
    compileSdk = 36

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        minSdk = 24

        manifestPlaceholders["godotPluginName"] = pluginName
        manifestPlaceholders["godotPluginPackageName"] = pluginPackageName
        manifestPlaceholders["kirieUsesCleartextTraffic"] = "false"
        buildConfigField("String", "GODOT_PLUGIN_NAME", "\"$pluginName\"")
        setProperty("archivesBaseName", pluginName)
        consumerProguardFiles("consumer-rules.pro")
    }

    buildTypes {
        debug {
            manifestPlaceholders["kirieUsesCleartextTraffic"] = "true"
        }

        release {
            manifestPlaceholders["kirieUsesCleartextTraffic"] = "false"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.16.0")
    implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-cbor:2.21.3")
    implementation("org.godotengine:godot:4.6.2.stable")
}
