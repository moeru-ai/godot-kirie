class_name KirieView
extends Control

signal webview_ready
signal text_received(message: String)
signal binary_received(bytes: PackedByteArray)
signal data_received(value: Variant)
signal ipc_error(error: String)

@export var initial_url := ""
@export var auto_create := true
@export var auto_destroy := true

var _kirie := GdKirie.new()


func _ready() -> void:
	_kirie.webview_ready.connect(_on_kirie_webview_ready)
	_kirie.text_received.connect(_on_kirie_text_received)
	_kirie.binary_received.connect(_on_kirie_binary_received)
	_kirie.data_received.connect(_on_kirie_data_received)
	_kirie.ipc_error.connect(_on_kirie_ipc_error)

	if not auto_create:
		return

	(
		_kirie
		. create_webview(
			{
				"initial_url": initial_url,
			}
		)
	)


func _exit_tree() -> void:
	if not auto_destroy:
		return

	_kirie.destroy_webview()


func load_url(url: String) -> void:
	_kirie.load_url(url)


func send_text(message: String) -> void:
	_kirie.send_text(message)


func send_binary(bytes: PackedByteArray) -> void:
	_kirie.send_binary(bytes)


func send_data(value: Variant) -> void:
	_kirie.send_data(value)


func _on_kirie_webview_ready() -> void:
	webview_ready.emit()


func _on_kirie_text_received(message: String) -> void:
	text_received.emit(message)


func _on_kirie_binary_received(bytes: PackedByteArray) -> void:
	binary_received.emit(bytes)


func _on_kirie_data_received(value: Variant) -> void:
	data_received.emit(value)


func _on_kirie_ipc_error(error: String) -> void:
	ipc_error.emit(error)
