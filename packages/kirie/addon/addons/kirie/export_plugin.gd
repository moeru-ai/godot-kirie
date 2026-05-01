@tool
extends EditorExportPlugin

const PLUGIN_NAME := "Kirie"
const DEFAULT_WEB_ROOT := "res://web"


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
	# if _debug:
	# 	return PackedStringArray(["kirie/libraries/android/Kirie-debug.aar"])

	# Now we don't have transitive dependencies, let's publish to maven later
	return PackedStringArray(["kirie/libraries/android/Kirie-debug.aar"])


func _add_ios_web_bundle_files(root_path: String) -> void:
	if not DirAccess.dir_exists_absolute(root_path):
		var message := "[Kirie][export] iOS web root not found: %s" % root_path
		push_error(message)
		assert(false, message)
		return

	print("[Kirie][export] add iOS bundle web root: %s" % root_path)
	add_apple_embedded_platform_bundle_file(root_path)
