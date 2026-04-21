class_name Kirie
extends Object

signal webview_ready()
signal ipc_message_received(message: Variant)
signal ipc_error(error: String)


func create_webview(_options: Dictionary = {}) -> void:
	push_warning("Kirie.create_webview() is not implemented yet")


func destroy_webview() -> void:
	push_warning("Kirie.destroy_webview() is not implemented yet")


func load_url(_url: String) -> void:
	push_warning("Kirie.load_url() is not implemented yet")


func send_ipc_message(_message: Variant) -> void:
	push_warning("Kirie.send_ipc_message() is not implemented yet")
