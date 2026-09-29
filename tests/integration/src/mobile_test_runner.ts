export class _MobileTestRunner extends Node {
  _ready(): void {
    for (const argument of OS.get_cmdline_user_args()) {
      if (!argument.begins_with("--vidot-test=")) {
        continue;
      }

      this.get_tree().set_script(load("res://kirie_vitest_generated/runner.gd"));
      this.get_tree().call("_initialize");
      return;
    }
  }
}
