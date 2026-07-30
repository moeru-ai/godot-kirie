// NOTICE: This Kotlin host is application source maintained by the embedded-view example.
// The build copies it into Godot's generated Android Gradle project; it is not part of
// the reusable Kirie addon.
// References:
// - https://docs.godotengine.org/en/stable/tutorials/platform/android/android_library.html
// - https://github.com/godotengine/godot/blob/master/platform/android/java/lib/src/main/java/org/godotengine/godot/GodotFragment.java

package com.godot.game

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import org.godotengine.godot.Godot
import org.godotengine.godot.GodotFragment
import org.godotengine.godot.GodotHost

class GodotApp :
    FragmentActivity(),
    GodotHost {
    private var godotFragment: GodotFragment? = null
    private lateinit var godotContainer: FrameLayout
    private lateinit var layerButton: Button
    private lateinit var nativeOverlayButton: Button
    private var nativeOverlayOnTop = true
    private var headerTapCount = 0
    private var overlayTapCount = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(createContentView())
        attachGodotFragment()
        applyLayerOrder()
    }

    override fun onResume() {
        super.onResume()
        updateWindowAppearance()
    }

    override fun onGodotMainLoopStarted() {
        runOnUiThread(::updateWindowAppearance)
    }

    override fun getActivity(): Activity = this

    override fun getGodot(): Godot? = godotFragment?.godot

    private fun updateWindowAppearance() {
        val godot = godot ?: return
        godot.enableImmersiveMode(godot.isInImmersiveMode(), true)
        godot.enableEdgeToEdge(godot.isInEdgeToEdgeMode(), true)
        godot.setSystemBarsAppearance()
    }

    private fun createContentView(): LinearLayout {
        val root =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.rgb(0, 0, 0))
            }
        root.addView(createHeader())

        val surface =
            FrameLayout(this).apply {
                setBackgroundColor(Color.rgb(3, 8, 20))
            }
        root.addView(
            surface,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f,
            ),
        )

        godotContainer =
            FrameLayout(this).apply {
                id = GODOT_CONTAINER_ID
            }
        surface.addView(
            godotContainer,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        nativeOverlayButton =
            styledButton("Kotlin overlay • tap 0", Color.rgb(125, 72, 189)).apply {
                setOnClickListener {
                    overlayTapCount += 1
                    text = "Kotlin overlay • tap $overlayTapCount"
                }
            }
        surface.addView(
            nativeOverlayButton,
            FrameLayout
                .LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    48.dp,
                    Gravity.BOTTOM or Gravity.START,
                ).apply {
                    marginStart = 24.dp
                    bottomMargin = 24.dp
                },
        )
        return root
    }

    private fun createHeader(): LinearLayout {
        val header =
            LinearLayout(this).apply {
                gravity = Gravity.CENTER_VERTICAL
                orientation = LinearLayout.HORIZONTAL
                setPadding(18.dp, 8.dp, 18.dp, 8.dp)
                setBackgroundColor(Color.rgb(9, 14, 28))
            }

        val labels = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        labels.addView(
            TextView(this).apply {
                text = "Kotlin host"
                textSize = 18f
                setTextColor(Color.WHITE)
                setTypeface(typeface, Typeface.BOLD)
            },
        )
        val badge =
            TextView(this).apply {
                gravity = Gravity.CENTER
                text = "Android TextView • tap 0"
                textSize = 12f
                typeface = Typeface.MONOSPACE
                setPadding(0, 0, 0, 0)
                setTextColor(Color.rgb(148, 222, 255))
                backgroundTintList = ColorStateList.valueOf(Color.rgb(31, 46, 79))
                setBackgroundResource(android.R.drawable.dialog_holo_light_frame)
            }
        labels.addView(
            badge,
            LinearLayout.LayoutParams(200.dp, 30.dp).apply { topMargin = 6.dp },
        )
        header.addView(labels, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

        val actions = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        actions.addView(
            styledButton("Native button", Color.rgb(20, 110, 158)).apply {
                setOnClickListener {
                    headerTapCount += 1
                    badge.text = "Android TextView • tap $headerTapCount"
                }
            },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 38.dp),
        )
        layerButton =
            Button(this).apply {
                isAllCaps = false
                minHeight = 0
                minimumHeight = 0
                textSize = 12f
                typeface = Typeface.MONOSPACE
                setTextColor(Color.rgb(148, 222, 255))
                backgroundTintList = ColorStateList.valueOf(Color.TRANSPARENT)
                setOnClickListener {
                    nativeOverlayOnTop = !nativeOverlayOnTop
                    applyLayerOrder()
                }
            }
        actions.addView(layerButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 28.dp))
        header.addView(
            actions,
            LinearLayout.LayoutParams(128.dp, ViewGroup.LayoutParams.WRAP_CONTENT),
        )
        return header
    }

    private fun styledButton(
        label: String,
        color: Int,
    ) = Button(this).apply {
        text = label
        isAllCaps = false
        maxLines = 1
        minHeight = 0
        minimumHeight = 0
        textSize = 12f
        setTextColor(Color.WHITE)
        backgroundTintList = ColorStateList.valueOf(color)
    }

    private fun attachGodotFragment() {
        val restored = supportFragmentManager.findFragmentByTag(GODOT_FRAGMENT_TAG)
        godotFragment =
            if (restored is GodotFragment) {
                restored
            } else {
                GodotFragment().also { fragment ->
                    godotFragment = fragment
                    supportFragmentManager
                        .beginTransaction()
                        .replace(GODOT_CONTAINER_ID, fragment, GODOT_FRAGMENT_TAG)
                        .commitNowAllowingStateLoss()
                }
            }
    }

    private fun applyLayerOrder() {
        if (nativeOverlayOnTop) {
            godotContainer.elevation = 0f
            nativeOverlayButton.elevation = 12.dp.toFloat()
            nativeOverlayButton.bringToFront()
            layerButton.text = "Web layer ↑"
        } else {
            nativeOverlayButton.elevation = 0f
            godotContainer.elevation = 12.dp.toFloat()
            godotContainer.bringToFront()
            layerButton.text = "Native layer ↑"
        }
    }

    private val Int.dp: Int
        get() = (this * resources.displayMetrics.density).toInt()

    private companion object {
        const val GODOT_CONTAINER_ID = 0x4B1E0001
        const val GODOT_FRAGMENT_TAG = "view-embedded-godot"

        init {
            if (BuildConfig.FLAVOR == "mono") {
                try {
                    System.loadLibrary("System.Security.Cryptography.Native.Android")
                } catch (error: UnsatisfiedLinkError) {
                    Log.e("GODOT", "Unable to load System.Security.Cryptography.Native.Android", error)
                }
            }
        }
    }
}
