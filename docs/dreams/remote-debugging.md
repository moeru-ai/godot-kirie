# Kirie Remote Debugging Dream

Status: exploratory. This is not scheduled implementation work.

Kirie automation currently depends on project-owned observability:

- explicit probe logs
- success or failure markers
- targeted scene-tree dumps when investigating lifecycle issues

This keeps IPC bring-up dependent on interfaces that Kirie owns directly,
instead of coupling early validation to editor-facing debugger behavior.

## Long-Term Direction

A longer-term direction is to evaluate whether Godot's remote debugging
transport exposed through `--remote-debug` can support richer external
inspection for Kirie runs.

If practical, this could provide:

- external inspection beyond plain log scraping
- possible access to scene-tree or debugger state during automated runs
- a better foundation for future AI-assisted debugging and diagnosis

Until then, logs and project-owned debug hooks remain the primary supported
automation interfaces.

## References

- [Command line tutorial](../references.md#godot)
- [Overview of debugging tools](../references.md#godot)
- [Debugger panel](../references.md#godot)
- [EditorSettings](../references.md#godot)
