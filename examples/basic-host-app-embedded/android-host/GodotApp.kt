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
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.FragmentActivity
import org.godotengine.godot.Godot
import org.godotengine.godot.GodotFragment
import org.godotengine.godot.GodotHost

class GodotApp :
    FragmentActivity(),
    GodotHost {
    private var godotFragment: GodotFragment? = null
    private lateinit var godotContainer: FrameLayout
    private var headerTapCount = 0
    private var overlayTapCount = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(createContentView())
        attachGodotFragment()
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

    private fun createContentView(): FrameLayout {
        val root =
            FrameLayout(this).apply {
                clipChildren = false
                clipToPadding = false
                setBackgroundColor(Color.TRANSPARENT)
            }

        godotContainer =
            FrameLayout(this).apply {
                id = GODOT_CONTAINER_ID
            }
        root.addView(
            godotContainer,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        val badge = createBadge()
        root.addView(
            badge,
            FrameLayout
                .LayoutParams(200.dp, 36.dp, Gravity.TOP or Gravity.START)
                .apply { marginStart = 18.dp },
        )

        val nativeButton =
            styledButton("Native button", Color.rgb(20, 110, 158)).apply {
                setOnClickListener {
                    headerTapCount += 1
                    badge.text = "Android TextView • tap $headerTapCount"
                }
            }
        root.addView(
            nativeButton,
            FrameLayout
                .LayoutParams(
                    128.dp,
                    48.dp,
                    Gravity.TOP or Gravity.END,
                ).apply {
                    marginEnd = 18.dp
                },
        )

        val overlayButton =
            styledButton("Kotlin overlay • tap 0", Color.rgb(125, 72, 189)).apply {
                setOnClickListener {
                    overlayTapCount += 1
                    text = "Kotlin overlay • tap $overlayTapCount"
                }
            }
        root.addView(
            overlayButton,
            FrameLayout
                .LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    48.dp,
                    Gravity.BOTTOM or Gravity.START,
                ).apply { marginStart = 18.dp },
        )

        for (control in listOf(badge, nativeButton, overlayButton)) {
            control.elevation = 12.dp.toFloat()
            control.bringToFront()
        }

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            (badge.layoutParams as FrameLayout.LayoutParams).topMargin = systemBars.top + 18.dp
            (nativeButton.layoutParams as FrameLayout.LayoutParams).topMargin =
                systemBars.top + 12.dp
            (overlayButton.layoutParams as FrameLayout.LayoutParams).bottomMargin =
                systemBars.bottom + 18.dp
            root.requestLayout()
            insets
        }

        return root
    }

    private fun createBadge() =
        TextView(this).apply {
            gravity = Gravity.CENTER
            text = "Android TextView • tap 0"
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setTextColor(Color.rgb(148, 222, 255))
            backgroundTintList = ColorStateList.valueOf(Color.rgb(31, 46, 79))
            setBackgroundResource(android.R.drawable.dialog_holo_light_frame)
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
