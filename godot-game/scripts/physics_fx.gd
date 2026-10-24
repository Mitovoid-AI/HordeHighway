# Godot physics for reactions only: tumbling corpses and crate debris.
# Core movement/collisions stay deterministic in main.gd.
extends Node3D

const MAX_CORPSES := 30
const MAX_DEBRIS := 48
const CORPSE_LIFE := 2.2
const DEBRIS_LIFE := 1.6

var _corpses: Array[Dictionary] = []
var _debris: Array[Dictionary] = []
var _debris_mesh := BoxMesh.new()
var _debris_mats := {}


func _ready() -> void:
	var ground := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	shape.shape = WorldBoundaryShape3D.new()
	ground.add_child(shape)
	add_child(ground)


func _remove(list: Array[Dictionary], i: int) -> void:
	var e: Dictionary = list[i]
	if is_instance_valid(e["body"]):
		e["body"].queue_free()
	list.remove_at(i)


# Turns a dead character into a physics body flung by `impulse`.
func spawn_corpse(model: Node3D, half: Vector3, impulse: Vector3) -> void:
	if _corpses.size() >= MAX_CORPSES:
		_remove(_corpses, 0)
	var body := RigidBody3D.new()
	body.mass = 1.0
	body.angular_damp = 0.3
	var col := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = half * 2.0
	col.shape = box
	body.add_child(col)
	add_child(body)
	body.global_position = model.global_position + Vector3(0, half.y, 0)
	body.rotation.y = model.global_rotation.y
	model.reparent(body, false)
	model.position = Vector3(0, -half.y, 0)
	model.rotation = Vector3.ZERO
	body.apply_impulse(impulse, Vector3(0, half.y * 0.6, 0))
	_corpses.append({"body": body, "life": CORPSE_LIFE, "visual": model, "scale": model.scale})


# Bursts a crate/barrel into `count` physics cubes.
func spawn_debris(pos: Vector3, color: Color, count := 8, size := 0.35, power := 6.0) -> void:
	if not _debris_mats.has(color):
		var m := StandardMaterial3D.new()
		m.albedo_color = color
		_debris_mats[color] = m
	for i in count:
		if _debris.size() >= MAX_DEBRIS:
			_remove(_debris, 0)
		var s := size * randf_range(0.6, 1.2)
		var body := RigidBody3D.new()
		body.mass = 0.3
		var col := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3.ONE * s
		col.shape = box
		body.add_child(col)
		var mi := MeshInstance3D.new()
		mi.mesh = _debris_mesh
		mi.scale = Vector3.ONE * s
		mi.material_override = _debris_mats[color]
		body.add_child(mi)
		add_child(body)
		body.global_position = pos + Vector3(randf() - 0.5, 0.5 + randf() * 0.6, randf() - 0.5)
		body.linear_velocity = Vector3((randf() - 0.5) * power, 3.0 + randf() * power, (randf() - 0.5) * power - 2.0)
		body.angular_velocity = Vector3(randf(), randf(), randf()) * 10.0
		_debris.append({"body": body, "life": DEBRIS_LIFE, "visual": mi, "scale": mi.scale})


func _process(delta: float) -> void:
	for list in [_corpses, _debris]:
		for i in range(list.size() - 1, -1, -1):
			var e: Dictionary = list[i]
			e["life"] -= delta
			if e["life"] <= 0.0:
				_remove(list, i)
				continue
			if e["life"] < 0.3:
				e["visual"].scale = e["scale"] * maxf(0.01, e["life"] / 0.3)


func clear() -> void:
	for list in [_corpses, _debris]:
		while not list.is_empty():
			_remove(list, list.size() - 1)


func stats() -> Dictionary:
	var moving := 0
	for list in [_corpses, _debris]:
		for e in list:
			if is_instance_valid(e["body"]) and e["body"].linear_velocity.length() > 0.5:
				moving += 1
	return {"corpses": _corpses.size(), "debris": _debris.size(), "moving": moving}
