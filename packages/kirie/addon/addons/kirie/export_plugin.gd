@tool
extends EditorExportPlugin

const PLUGIN_NAME := "Kirie"
const DEFAULT_WEB_ROOT := "res://web"
const IOS_XCFRAMEWORK_PATH := "res://addons/kirie/ios/Kirie.xcframework"
const IOS_SYSTEM_FRAMEWORKS := [
	"Foundation.framework",
	"UIKit.framework",
	"WebKit.framework",
]
const IOS_PLIST_CONTENT := """
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
"""
const IOS_PLUGIN_CPP_CODE := """
extern void init_kirie();
extern void deinit_kirie();

void kirie_generated_plugin_initialize();
void kirie_generated_plugin_deinitialize();

void godot_apple_embedded_plugins_initialize() {
	init_kirie();
	kirie_generated_plugin_initialize();
}

void godot_apple_embedded_plugins_deinitialize() {
	kirie_generated_plugin_deinitialize();
	deinit_kirie();
}

#define godot_apple_embedded_plugins_initialize kirie_generated_plugin_initialize
#define godot_apple_embedded_plugins_deinitialize kirie_generated_plugin_deinitialize

"""


func _get_name() -> String:
	return PLUGIN_NAME


func _supports_platform(platform: EditorExportPlatform) -> bool:
	return platform is EditorExportPlatformAndroid or platform is EditorExportPlatformIOS


func _export_begin(
	features: PackedStringArray,
	_is_debug: bool,
	_path: String,
	_flags: int
) -> void:
	if not features.has("ios"):
		return

	_add_ios_native_plugin()
	_add_ios_web_bundle_files(DEFAULT_WEB_ROOT)


func _get_android_dependencies(
	_platform: EditorExportPlatform,
	_debug: bool
) -> PackedStringArray:
	# This stays empty until the Android artifact coordinates are finalized.
	return PackedStringArray()


func _get_android_dependencies_maven_repos(
	_platform: EditorExportPlatform,
	_debug: bool
) -> PackedStringArray:
	return PackedStringArray()


func _get_android_libraries(
	_platform: EditorExportPlatform,
	_debug: bool
) -> PackedStringArray:
	if _debug:
		return PackedStringArray(["kirie/libraries/android/Kirie-debug.aar"])

	return PackedStringArray(["kirie/libraries/android/Kirie-release.aar"])


func _add_ios_web_bundle_files(root_path: String) -> void:
	if not DirAccess.dir_exists_absolute(root_path):
		var message := "[Kirie][export] iOS web root not found: %s" % root_path
		push_error(message)
		assert(false, message)
		return

	print("[Kirie][export] add iOS bundle web root: %s" % root_path)
	add_apple_embedded_platform_bundle_file(root_path)


func _add_ios_native_plugin() -> void:
	if not DirAccess.dir_exists_absolute(IOS_XCFRAMEWORK_PATH):
		var message := "[Kirie][export] iOS framework not found: %s" % IOS_XCFRAMEWORK_PATH
		push_error(message)
		assert(false, message)
		return

	print("[Kirie][export] add iOS framework: %s" % IOS_XCFRAMEWORK_PATH)
	add_apple_embedded_platform_framework(IOS_XCFRAMEWORK_PATH)
	for system_framework in IOS_SYSTEM_FRAMEWORKS:
		add_apple_embedded_platform_framework(system_framework)
	add_apple_embedded_platform_plist_content(IOS_PLIST_CONTENT)
	add_apple_embedded_platform_cpp_code(IOS_PLUGIN_CPP_CODE)
