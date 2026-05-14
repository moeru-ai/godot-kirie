@tool
extends EditorExportPlugin

const PLUGIN_NAME := "Kirie"
const DEFAULT_WEB_ROOT := "res://web"

const OPTION_ENABLE_WEB_INSPECTOR := "kirie/debug/enable_web_inspector"
const OPTION_ALLOW_TLS_BYPASS := "kirie/debug/allow_tls_bypass"

const ANDROID_DEBUG_AAR_ARG := "--kirie-android-aar"
const ANDROID_DEBUG_AAR := "kirie/libraries/android/Kirie-debug.aar"
const ANDROID_RELEASE_AAR := "kirie/libraries/android/Kirie-release.aar"
const ANDROID_META_ENABLE_WEB_INSPECTOR := "ai.moeru.kirie.ENABLE_WEB_INSPECTOR"
const ANDROID_META_ALLOW_TLS_BYPASS := "ai.moeru.kirie.ALLOW_TLS_BYPASS"

const IOS_PLIST_ENABLE_WEB_INSPECTOR_KEY := "KirieEnableWebInspector"
const IOS_PLIST_ALLOW_TLS_BYPASS_KEY := "KirieAllowTlsBypass"
const IOS_XCFRAMEWORK_PATH := "res://addons/kirie/ios/Kirie.xcframework"
const IOS_SYSTEM_FRAMEWORKS := [
	"Foundation.framework",
	"UIKit.framework",
	"WebKit.framework",
]
const IOS_INSECURE_NETWORK_PLIST_CONTENT := """
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


func _get_export_options(_platform: EditorExportPlatform) -> Array[Dictionary]:
	return [
		{
			"option":
			{
				"name": OPTION_ENABLE_WEB_INSPECTOR,
				"type": TYPE_BOOL,
			},
			"default_value": false,
		},
		{
			"option":
			{
				"name": OPTION_ALLOW_TLS_BYPASS,
				"type": TYPE_BOOL,
			},
			"default_value": false,
		},
	]


func _export_begin(
	features: PackedStringArray, _is_debug: bool, _path: String, _flags: int
) -> void:
	if not features.has("ios"):
		return

	_add_ios_native_plugin()
	_add_ios_runtime_configuration()
	_add_ios_web_bundle_files(DEFAULT_WEB_ROOT)


func _get_android_dependencies(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
	return [
		"androidx.webkit:webkit:1.16.0",
		"com.fasterxml.jackson.dataformat:jackson-dataformat-cbor:2.21.3",
	]


func _get_android_dependencies_maven_repos(
	_platform: EditorExportPlatform, _debug: bool
) -> PackedStringArray:
	return PackedStringArray()


func _get_android_libraries(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
	match _get_android_aar_mode():
		"debug":
			return PackedStringArray([ANDROID_DEBUG_AAR])
		"release":
			return PackedStringArray([ANDROID_RELEASE_AAR])

	var message := (
		"[Kirie][export] invalid Android AAR mode. Use %s=debug or %s=release"
		% [
			ANDROID_DEBUG_AAR_ARG,
			ANDROID_DEBUG_AAR_ARG,
		]
	)
	push_error(message)
	assert(false, message)
	return PackedStringArray()


func _get_android_manifest_application_element_contents(
	_platform: EditorExportPlatform, _debug: bool
) -> String:
	return (
		"""
        <meta-data
            android:name="%s"
            android:value="%s" />
        <meta-data
            android:name="%s"
            android:value="%s" />
"""
		% [
			ANDROID_META_ENABLE_WEB_INSPECTOR,
			_xml_bool(_option_enabled(OPTION_ENABLE_WEB_INSPECTOR)),
			ANDROID_META_ALLOW_TLS_BYPASS,
			_xml_bool(_option_enabled(OPTION_ALLOW_TLS_BYPASS)),
		]
	)


func _get_android_aar_mode() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg == "%s=debug" % ANDROID_DEBUG_AAR_ARG:
			return "debug"
		if arg == "%s=release" % ANDROID_DEBUG_AAR_ARG:
			return "release"
		if arg.begins_with("%s=" % ANDROID_DEBUG_AAR_ARG):
			return "invalid"

	return "release"


func _add_ios_runtime_configuration() -> void:
	add_apple_embedded_platform_plist_content(
		(
			"""
<key>%s</key>
%s
<key>%s</key>
%s
"""
			% [
				IOS_PLIST_ENABLE_WEB_INSPECTOR_KEY,
				_plist_bool(_option_enabled(OPTION_ENABLE_WEB_INSPECTOR)),
				IOS_PLIST_ALLOW_TLS_BYPASS_KEY,
				_plist_bool(_option_enabled(OPTION_ALLOW_TLS_BYPASS)),
			]
		)
	)

	if not _option_enabled(OPTION_ALLOW_TLS_BYPASS):
		return

	add_apple_embedded_platform_plist_content(IOS_INSECURE_NETWORK_PLIST_CONTENT)


func _option_enabled(option_name: StringName) -> bool:
	return bool(get_option(option_name))


func _xml_bool(value: bool) -> String:
	if value:
		return "true"

	return "false"


func _plist_bool(value: bool) -> String:
	if value:
		return "<true/>"

	return "<false/>"


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
	add_apple_embedded_platform_cpp_code(IOS_PLUGIN_CPP_CODE)
