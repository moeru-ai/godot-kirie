extends Node

func _ready() -> void:
	for argument in OS.get_cmdline_user_args():
		if not argument.begins_with("--vidot-test="):
			continue

		get_tree().set_script(load("res://kirie_vitest_generated/runner.gd"))
		get_tree().call("_initialize")
		return
