# Headless smoke test. Run from the project folder:
#   godot --headless --fixed-fps 60 -s res://tests/smoke_test.gd
extends SceneTree

var main: Node
var frames := 0
var failures: Array[String] = []
var first_run_done := false
var phase2_start := -1
var gate_seen := {}
var gate_changed := false
var max_moving := 0


func _initialize() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save.cfg"))
	main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)


func _check(cond: bool, msg: String) -> void:
	if not cond:
		failures.append(msg)


## Test-only autopilot: line up with the better side of the next gate pair.
func _steer_to_best_gate() -> void:
	for pair in main.gates:
		if pair.used or pair.z > main.squad_z:
			continue
		var left: int = main.apply_op(main.squad_count, main.gate_op(pair.ops[0]))
		var right: int = main.apply_op(main.squad_count, main.gate_op(pair.ops[1]))
		main.squad_x = -2.5 if left >= right else 2.5
		return


## Test-only: steer into the next trap ahead (to verify P2).
func _steer_into_trap() -> bool:
	for t in main.traps:
		if not t.used and t.z < main.squad_z and main.squad_z - t.z < 25.0:
			main.squad_x = t.x
			return true
	return false


## Records gate labels; flags when an unused gate's value changes (P1).
func _watch_gates() -> void:
	for pair in main.gates:
		var key: float = pair.z
		var txt := "%s%d|%s%d" % [pair.ops[0]["op"], pair.ops[0]["n"], pair.ops[1]["op"], pair.ops[1]["n"]]
		if not gate_seen.has(key):
			gate_seen[key] = txt
		elif not pair.used and gate_seen[key] != txt:
			gate_changed = true


func _process(_delta: float) -> bool:
	frames += 1
	if main.state == "playing":
		_watch_gates()
		max_moving = maxi(max_moving, main.physics_fx.stats()["moving"])
		if phase2_start < 0 or not _steer_into_trap():
			_steer_to_best_gate()
	if phase2_start > 0:
		return _phase2()
	if frames == 2:
		_check(main.state == "menu", "starts in menu")
		main.start_run()
	if frames == 10 * 60:
		main.use_skill("shock")
	if frames == 12 * 60:
		main.use_skill("inferno")
	if frames == 14 * 60:
		main.use_skill("frost")
	if frames % (5 * 60) == 0:
		print(main.stats())

	if not first_run_done and main.state != "playing" and frames > 2:
		first_run_done = true
		var s: Dictionary = main.stats()
		print("run ended at frame ", frames, ": ", s)
		_check(s["kills"] > 0, "zombies were killed")
		_check(main.state == "won", "level 1 won")
		_check(gate_changed, "P1: a gate's value changed after being shot")
		_check(max_moving > 0, "physics bodies moved (corpses/debris)")
		if main.state == "won":
			_check(int(main.save["level"]) == 2, "level advanced after win")
		_check(int(main.save["coins"]) > 0, "coins earned")
		main.save["coins"] = int(main.save["coins"]) + 100  # guarantee the purchase is affordable
		var coins_before := int(main.save["coins"])
		main.show_menu()
		main.buy_upgrade("firepower")
		_check(int(main.save["firepower"]) == 1 and int(main.save["coins"]) == coins_before - 20, "upgrade purchase")
		var cfg := ConfigFile.new()
		_check(cfg.load("user://save.cfg") == OK and int(cfg.get_value("save", "firepower", 0)) == 1, "save file written")
		main.start_run()
		var s2: Dictionary = main.stats()
		_check(is_equal_approx(float(s2["boss_hp"]), round(1500.0 * pow(1.35, int(s2["level"]) - 1))), "fresh boss hp on new run")
		# Phase 2: level 5 has every enemy type; steer into a trap.
		main.save["level"] = 5
		main.save["recruits"] = 20
		main.start_run()
		var types: Array = main.stats()["enemy_types"]
		for t in ["normal", "fast", "tank", "gold", "ranged"]:
			_check(types.has(t), "P3: level 5 spawns enemy type " + t)
		phase2_start = frames
		return false

	if frames > 120 * 60:
		failures.append("run did not finish within 120 simulated seconds")
		return _finish()
	return false


func _phase2() -> bool:
	var s: Dictionary = main.stats()
	if s["traps_hit"] > 0 or main.state != "playing" or frames - phase2_start > 90 * 60:
		print("phase 2 ended at frame ", frames, ": ", s)
		_check(s["traps_hit"] > 0, "P2: a trap was hit and cost soldiers")
		return _finish()
	return false


func _finish() -> bool:
	if failures.is_empty():
		print("SMOKE TEST PASSED")
	else:
		print("SMOKE TEST FAILED: ", failures)
	quit(0 if failures.is_empty() else 1)
	return true
