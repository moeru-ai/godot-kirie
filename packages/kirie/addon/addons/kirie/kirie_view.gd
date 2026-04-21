class_name KirieView
extends Control

signal webview_ready()
signal ipc_message_received(message: Variant)
signal ipc_error(error: String)

@export var initial_url := ""
@export var auto_create := true
@export var auto_destroy := true


func _ready() -> void:
	if not auto_create:
		return

	push_warning("KirieView auto creation is not implemented yet")


func _exit_tree() -> void:
	if not auto_destroy:
		return

	push_warning("KirieView auto destroy is not implemented yet")


func load_url(_url: String) -> void:
	push_warning("KirieView.load_url() is not implemented yet")


func send_ipc_message(_message: Variant) -> void:
	push_warning("KirieView.send_ipc_message() is not implemented yet")
