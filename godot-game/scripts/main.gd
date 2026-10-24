# Horde Highway — Godot 4 build. Models: CC0 Kenney packs (see ../CREDITS.md).
# Rules mirror ../zombie-survival-design.md and the HTML5 build.
extends Node3D

const PhysicsFx := preload("res://scripts/physics_fx.gd")
const Fx := preload("res://scripts/fx.gd")

# ---------- Tunables ----------
const ROAD_HALF := 5.0
const RUN_SPEED := 9.0
const STEER_SPEED := 9.0
const BULLET_SPEED := 42.0
const BULLET_LIFE := 1.15
const MAX_BULLETS := 320
const MAX_DRAWN_SOLDIERS := 30 # drawn cap for phone GPUs; squad_count is unaffected
const MAX_SQUAD := 999
const ZOMBIE_SPEED := 2.6
const ZOMBIE_WAKE_DIST := 70.0
const BOSS_SPEED := 1.3
const BOSS_RADIUS := 2.6
const BOSS_STOP_DIST := 16.0
const BARREL_RADIUS := 0.8
const BARREL_HIT_COST := 5
const GOLDEN_ANGLE := 2.39996
const CHAR_SCALE := 1.7
const GATE_HITS_ADD := 3 # P1: hits per +1 / -1 step on + and - gates
const GATE_HITS_MUL := 15 # P1: hits per step on × and ÷ gates
const GATE_MUL_MAX := 5
const TRAP_HALF_WIDTH := 1.5 # P2
const ORB_SPEED := 14.0 # P3 ranged enemy projectile

const WEAPONS := [
	{"name": "Pistol", "dmg": 10.0, "interval": 0.30, "color": Color(1.0, 0.95, 0.48), "model": "gunPistol"},
	{"name": "SMG", "dmg": 9.0, "interval": 0.16, "color": Color(0.62, 0.97, 1.0), "model": "gunSmg"},
	{"name": "Rifle", "dmg": 20.0, "interval": 0.20, "color": Color(1.0, 0.7, 0.42), "model": "gunRifle"},
	{"name": "Gatling", "dmg": 34.0, "interval": 0.18, "color": Color(0.83, 0.55, 1.0), "model": "gunGatling"},
]

# P3 enemy types: hp/speed are multipliers of the level's base zombie.
const ENEMIES := {
	"normal": {"model": "zombie", "scale": 1.8, "hp": 1.0, "speed": 1.0, "bite": 1, "coins": 1, "anim": "walk", "radius": 0.45},
	"fast": {"model": "skeleton", "scale": 1.7, "hp": 0.6, "speed": 2.0, "bite": 1, "coins": 1, "anim": "sprint", "radius": 0.45},
	"tank": {"model": "keeper", "scale": 2.8, "hp": 5.0, "speed": 0.6, "bite": 3, "coins": 3, "anim": "walk", "radius": 0.8},
	"gold": {"model": "ghost", "scale": 1.9, "hp": 3.0, "speed": -0.6, "bite": 1, "coins": 15, "anim": "idle", "radius": 0.45},
	"ranged": {"model": "vampire", "scale": 1.8, "hp": 1.5, "speed": 1.0, "bite": 1, "coins": 2, "anim": "walk", "radius": 0.45, "range": 20.0, "fire_every": 2.5},
}
const SOLDIER_MODELS := ["soldierA", "soldierB", "soldierC", "soldierD", "soldierE"]
const SCENERY := [
	["pine", 3.2], ["pineCrooked", 3.2], ["treeTall", 3.4], ["tree", 3.4], ["rocks", 2.2], ["rocksTall", 2.2],
	["grave", 2.4], ["graveCross", 2.4], ["lightpost", 2.6], ["pumpkin", 2.2], ["hay", 2.2], ["rock", 3.0],
]

const SKILL_COOLDOWN := {"frost": 15.0, "shock": 12.0, "inferno": 20.0}

const UPGRADES := [
	{"id": "firepower", "label": "Firepower", "desc": "+15% bullet damage", "base": 20.0, "growth": 1.5},
	{"id": "rate", "label": "Fire rate", "desc": "Shoot 6% faster", "base": 20.0, "growth": 1.5},
	{"id": "recruits", "label": "Recruits", "desc": "+1 starting soldier", "base": 30.0, "growth": 1.6},
]

const SAVE_PATH := "user://save.cfg"
const ZOMBIE_COLOR := Color(0.44, 0.75, 0.29)
const FROZEN_COLOR := Color(0.6, 0.85, 1.0)

# ---------- Entity records ----------
class Zombie:
	var type: String
	var def: Dictionary
	var x: float
	var z: float
	var hp: float
	var node: Node3D
	var alive := true
	var phase: float
	var radius := 0.45
	var fire_t := 0.0

class Trap:
	var x: float
	var z: float
	var cost: int
	var used := false

class Orb:
	var node: MeshInstance3D
	var active := false
	var life := 0.0
	var vel := Vector3.ZERO

class Barrel:
	var x: float
	var z: float
	var hp: float
	var reward_type: String
	var reward_n: int
	var node: Node3D
	var label: Label3D
	var alive := true

class GatePair:
	var z: float
	var used := false
	var ops: Array = []
	var node: Node3D

class Boss:
	var z: float
	var hp: float
	var max_hp: float
	var node: Node3D
	var alive := true
	var active := false

class Bullet:
	var node: MeshInstance3D
	var active := false
	var life := 0.0

# ---------- State ----------
var save := {"level": 1, "coins": 0, "firepower": 0, "rate": 0, "recruits": 0}
var state := "menu"
var level_num := 1
var level_length := 0.0
var boss_z := 0.0
var squad_x := 0.0
var squad_z := 0.0
var squad_count := 0
var squad_radius := 1.0
var weapon_tier := 0
var fire_timer := 0.0
var run_coins := 0
var kills := 0
var elapsed := 0.0
var freeze_t := 0.0
var inferno_t := 0.0
var shock_t := 0.0
var boss_bite_t := 0.0
var cooldowns := {"frost": 0.0, "shock": 0.0, "inferno": 0.0}

var gates: Array[GatePair] = []
var barrels: Array[Barrel] = []
var zombies: Array[Zombie] = []
var traps: Array[Trap] = []
var boss: Boss = null
var bullets: Array[Bullet] = []
var orbs: Array[Orb] = []
var physics_fx: Node3D
var fx: Node3D
var frost_overlay: StandardMaterial3D

# ---------- Scene objects ----------
var level_root: Node3D
var squad_root: Node3D
var soldier_nodes: Array[Node3D] = []
var squad_label: Label3D
var camera: Camera3D
var shock_ring: MeshInstance3D
var inferno_zone: MeshInstance3D

# ---------- Shared resources ----------
var mesh := {}
var mat := {}

# ---------- UI ----------
var ui := {}


func _ready() -> void:
	_load_save()
	_build_resources()
	_build_world()
	_build_ui()
	build_level(int(save["level"]))
	show_menu()


# ---------- Save ----------
func _load_save() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	for key in save.keys():
		save[key] = int(cfg.get_value("save", key, save[key]))


func _write_save() -> void:
	var cfg := ConfigFile.new()
	for key in save.keys():
		cfg.set_value("save", key, save[key])
	cfg.save(SAVE_PATH)


func upgrade_cost(u: Dictionary) -> int:
	return int(round(float(u["base"]) * pow(float(u["growth"]), int(save[u["id"]]))))


# ---------- Resources ----------
func _lambert(color: Color, alpha := 1.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(color, alpha)
	m.roughness = 1.0
	if alpha < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	return m


func _unshaded(color: Color, alpha := 1.0) -> StandardMaterial3D:
	var m := _lambert(color, alpha)
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m


func _build_resources() -> void:
	var body := CapsuleMesh.new()
	body.radius = 0.26
	body.height = 1.02
	mesh["body"] = body
	var head := SphereMesh.new()
	head.radius = 0.24
	head.height = 0.48
	mesh["head"] = head
	var arm := BoxMesh.new()
	arm.size = Vector3(0.14, 0.14, 0.55)
	mesh["arm"] = arm
	var bullet := SphereMesh.new()
	bullet.radius = 0.12
	bullet.height = 0.24
	bullet.radial_segments = 6
	bullet.rings = 4
	mesh["bullet"] = bullet
	var barrel := CylinderMesh.new()
	barrel.top_radius = 0.75
	barrel.bottom_radius = 0.75
	barrel.height = 1.4
	mesh["barrel"] = barrel
	var gate := BoxMesh.new()
	gate.size = Vector3(4.8, 2.6, 0.2)
	mesh["gate"] = gate
	var post := BoxMesh.new()
	post.size = Vector3(0.25, 3.0, 0.25)
	mesh["post"] = post
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.2
	trunk.bottom_radius = 0.25
	trunk.height = 1.2
	trunk.radial_segments = 6
	mesh["trunk"] = trunk
	var crown := CylinderMesh.new()
	crown.top_radius = 0.0
	crown.bottom_radius = 1.3
	crown.height = 2.6
	crown.radial_segments = 7
	mesh["crown"] = crown
	var stripe := BoxMesh.new()
	stripe.size = Vector3(0.25, 0.02, 2.5)
	mesh["stripe"] = stripe
	var eye := SphereMesh.new()
	eye.radius = 0.22
	eye.height = 0.44
	mesh["eye"] = eye

	mat["soldier"] = _lambert(Color(0.85, 0.64, 0.25))
	mat["helmet"] = _lambert(Color(0.33, 0.44, 0.23))
	mat["zombie"] = _lambert(ZOMBIE_COLOR)
	mat["zombie_shirt"] = _lambert(Color(0.48, 0.32, 0.19))
	mat["bullet"] = _unshaded(WEAPONS[0]["color"])
	mat["barrel"] = _lambert(Color(0.88, 0.47, 0.18))
	mat["gate_good"] = _lambert(Color(0.23, 0.63, 1.0), 0.55)
	mat["gate_bad"] = _lambert(Color(1.0, 0.3, 0.3), 0.55)
	mat["post"] = _lambert(Color(0.93, 0.93, 0.93))
	mat["road"] = _lambert(Color(0.54, 0.56, 0.6))
	mat["grass"] = _lambert(Color(0.42, 0.76, 0.29))
	mat["curb"] = _lambert(Color(0.85, 0.85, 0.85))
	mat["stripe"] = _unshaded(Color.WHITE)
	mat["trunk"] = _lambert(Color(0.48, 0.32, 0.19))
	mat["crown"] = _lambert(Color(0.25, 0.6, 0.23))
	mat["boss"] = _lambert(Color(0.36, 0.42, 0.29))
	mat["boss_eye"] = _unshaded(Color(1.0, 0.16, 0.16))
	mat["shock"] = _unshaded(Color(0.77, 0.55, 1.0), 0.6)
	mat["inferno"] = _unshaded(Color(1.0, 0.48, 0.1), 0.45)


func _mesh(m: Mesh, material: Material, pos := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = material
	mi.position = pos
	return mi


func _label3d(text: String, size: int, color := Color.WHITE) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font_size = size
	l.outline_size = size / 6
	l.modulate = color
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	l.render_priority = 10
	l.pixel_size = 0.01
	return l


# ---------- World (persistent) ----------
func _build_world() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.56, 0.83, 1.0)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.8, 0.85, 0.8)
	e.ambient_light_energy = 0.7
	e.fog_enabled = true
	e.fog_light_color = Color(0.56, 0.83, 1.0)
	e.fog_density = 0.008
	env.environment = e
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-60, 30, 0)
	sun.light_energy = 1.1
	add_child(sun)

	camera = Camera3D.new()
	camera.fov = 62.0
	camera.far = 150.0 # fog hides everything beyond
	add_child(camera)

	physics_fx = PhysicsFx.new()
	add_child(physics_fx)
	fx = Fx.new()
	add_child(fx)
	frost_overlay = _unshaded(FROZEN_COLOR, 0.55)

	squad_root = Node3D.new()
	add_child(squad_root)
	for i in MAX_DRAWN_SOLDIERS:
		var s := Models.instance(SOLDIER_MODELS[i % SOLDIER_MODELS.size()], CHAR_SCALE)
		s.rotation.y = PI # models face +Z; the squad runs toward -Z
		s.visible = false
		squad_root.add_child(s)
		soldier_nodes.append(s)
		_attach_gun(s, 0)
	squad_label = _label3d("0", 96)
	add_child(squad_label)

	for i in MAX_BULLETS:
		var b := Bullet.new()
		b.node = _mesh(mesh["bullet"], mat["bullet"])
		b.node.visible = false
		add_child(b.node)
		bullets.append(b)

	var orb_mesh := SphereMesh.new()
	orb_mesh.radius = 0.3
	orb_mesh.height = 0.6
	var orb_mat := _unshaded(Color(0.82, 0.44, 1.0))
	for i in 24:
		var o := Orb.new()
		o.node = _mesh(orb_mesh, orb_mat)
		o.node.visible = false
		add_child(o.node)
		orbs.append(o)

	var ring := CylinderMesh.new()
	ring.top_radius = 1.0
	ring.bottom_radius = 1.0
	ring.height = 0.02
	shock_ring = _mesh(ring, mat["shock"])
	shock_ring.visible = false
	add_child(shock_ring)

	var zone := PlaneMesh.new()
	zone.size = Vector2(ROAD_HALF * 2, 16)
	inferno_zone = _mesh(zone, mat["inferno"])
	inferno_zone.visible = false
	add_child(inferno_zone)


func _build_environment(length: float) -> void:
	var mid_z := -length / 2.0 + 30.0
	var grass := PlaneMesh.new()
	grass.size = Vector2(120, length)
	level_root.add_child(_mesh(grass, mat["grass"], Vector3(0, -0.02, mid_z)))

	# Road: Kenney 1×1 road tiles scaled to the road width.
	var tile := ROAD_HALF * 2.0
	var z := 30.0
	while z > 30.0 - length:
		var t := Models.instance("road", tile)
		t.rotation.y = PI / 2.0 # tile's lanes run along X; turn them along the road
		t.position = Vector3(0, 0, z - tile / 2.0)
		level_root.add_child(t)
		z -= tile

	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	z = 30.0
	while z > 30.0 - length:
		for side in [-1.0, 1.0]:
			var pick: Array = SCENERY[rng.randi() % SCENERY.size()]
			var s := Models.instance(pick[0], pick[1] * rng.randf_range(0.85, 1.15))
			s.position = Vector3(side * (ROAD_HALF + 1.5 + rng.randf() * 6.0), 0, z - rng.randf() * 6.0)
			s.rotation.y = rng.randf() * TAU
			level_root.add_child(s)
		z -= 12.0
	z = 20.0
	while z > 30.0 - length:
		for side in [-1.0, 1.0]:
			var lamp := Models.instance("lamp", 6.0)
			lamp.position = Vector3(side * (ROAD_HALF + 0.4), 0, z)
			lamp.rotation.y = PI if side > 0 else 0.0
			level_root.add_child(lamp)
		z -= 30.0


func _multimesh(m: Mesh, material: Material, count: int, place: Callable) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = m
	mm.instance_count = count
	for i in count:
		mm.set_instance_transform(i, Transform3D(Basis(), place.call(i)))
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = material
	return mmi


# ---------- Level ----------
func _clear_level() -> void:
	if level_root:
		level_root.queue_free()
	level_root = null
	gates.clear()
	barrels.clear()
	zombies.clear()
	traps.clear()
	boss = null
	for b in bullets:
		b.active = false
		b.node.visible = false
	for o in orbs:
		o.active = false
		o.node.visible = false
	if physics_fx:
		physics_fx.clear()
		fx.clear()


func _good_op(rng: RandomNumberGenerator, lvl: int) -> Array:
	if rng.randf() < 0.25:
		return ["×", 2 if rng.randf() < 0.8 else 3]
	return ["+", 3 + int(rng.randf() * (6 + lvl * 2))]


func _bad_op(rng: RandomNumberGenerator, lvl: int) -> Array:
	if rng.randf() < 0.3:
		return ["÷", 2 + int(rng.randf() * 2)]
	return ["-", 2 + int(rng.randf() * (4 + lvl * 2))]


static func apply_op(count: int, op: Array) -> int:
	var n: int = op[1]
	match op[0]:
		"+":
			return count + n
		"-":
			return count - n
		"×":
			return count * n
		"÷":
			return int(floor(count / float(n)))
	return count


func _spawn_gate_pair(z: float, rng: RandomNumberGenerator, lvl: int) -> void:
	var a := _good_op(rng, lvl)
	var b := _good_op(rng, lvl) if rng.randf() < 0.3 else _bad_op(rng, lvl)
	var pair := GatePair.new()
	pair.z = z
	var sides: Array = [a, b] if rng.randf() < 0.5 else [b, a]
	pair.node = Node3D.new()
	for i in 2:
		var op: Array = sides[i]
		var x := -2.5 if i == 0 else 2.5
		var good: bool = op[0] == "+" or op[0] == "×"
		var panel_mat: StandardMaterial3D = (mat["gate_good"] if good else mat["gate_bad"]).duplicate()
		var panel := _mesh(mesh["gate"], panel_mat, Vector3(x, 1.4, z))
		pair.node.add_child(panel)
		pair.node.add_child(_mesh(mesh["post"], mat["post"], Vector3(x + (-2.4 if i == 0 else 2.4), 1.5, z)))
		var label := _label3d("%s%d" % [op[0], op[1]], 160)
		label.position = Vector3(x, 1.6, z + 0.2)
		pair.node.add_child(label)
		pair.ops.append({"op": op[0], "n": op[1], "hits": 0, "mat": panel_mat, "label": label})
	level_root.add_child(pair.node)
	gates.append(pair)


static func gate_op(g: Dictionary) -> Array:
	return [g["op"], g["n"]]


# P1: shooting a gate improves it. + and × grow; − and ÷ shrink and flip to +1.
func _hit_gate(g: Dictionary) -> void:
	g["hits"] += 1
	var mul: bool = g["op"] == "×" or g["op"] == "÷"
	if g["hits"] < (GATE_HITS_MUL if mul else GATE_HITS_ADD):
		return
	g["hits"] = 0
	match g["op"]:
		"+":
			g["n"] += 1
		"×":
			g["n"] = mini(GATE_MUL_MAX, g["n"] + 1)
		_:
			g["n"] -= 1
			if g["n"] <= (1 if g["op"] == "÷" else 0):
				g["op"] = "+"
				g["n"] = 1
				g["mat"].albedo_color = mat["gate_good"].albedo_color
	g["label"].text = "%s%d" % [g["op"], g["n"]]


func _spawn_trap(z: float, rng: RandomNumberGenerator, lvl: int) -> void:
	var t := Trap.new()
	t.x = -ROAD_HALF + TRAP_HALF_WIDTH + rng.randf() * (ROAD_HALF * 2.0 - TRAP_HALF_WIDTH * 2.0)
	t.z = z
	t.cost = 3 + lvl
	var g := Node3D.new()
	for dx in [-1.0, 0.0, 1.0]:
		var bar := Models.instance("barrier", 7.0)
		bar.position = Vector3(dx * 0.95, 0, 0)
		bar.rotation.y = PI / 2.0
		g.add_child(bar)
	for dx in [-1.6, 1.6]:
		var c := Models.instance("cone", 8.0)
		c.position = Vector3(dx, 0, 0.6)
		g.add_child(c)
	g.position = Vector3(t.x, 0, z)
	var label := _label3d("TRAP", 90, Color(1.0, 0.42, 0.37))
	label.position = Vector3(0, 2.2, 0)
	g.add_child(label)
	level_root.add_child(g)
	traps.append(t)


func _spawn_barrel(z: float, rng: RandomNumberGenerator, lvl: int) -> void:
	var b := Barrel.new()
	b.x = -3.5 + rng.randf() * 7.0
	b.z = z
	b.hp = 60.0 + 25.0 * lvl
	if rng.randf() < 0.55:
		b.reward_type = "weapon"
	else:
		b.reward_type = "squad"
		b.reward_n = 4 + int(rng.randf() * (4 + lvl))
	b.node = Models.instance("crate", 1.6) if b.reward_type == "weapon" else Models.instance("barrel", 5.5)
	if b.reward_type == "weapon":
		b.node.rotation.y = PI / 2.0
	b.node.position = Vector3(b.x, 0, z)
	b.label = _label3d("", 80, Color(1.0, 0.91, 0.66))
	b.label.position = Vector3(b.x, 2.3, z)
	level_root.add_child(b.node)
	level_root.add_child(b.label)
	_update_barrel_label(b)
	barrels.append(b)


func _update_barrel_label(b: Barrel) -> void:
	var top := "GUN UP" if b.reward_type == "weapon" else "+%d" % b.reward_n
	b.label.text = "%s\n%d" % [top, maxi(0, ceili(b.hp))]


# P3: group composition unlocks by level (fast L2+, ranged L3+, tank L4+).
func _pick_enemy_type(rng: RandomNumberGenerator, lvl: int, i: int) -> String:
	if lvl >= 4 and i == 0:
		return "tank"
	if lvl >= 3 and i == 1:
		return "ranged"
	if lvl >= 2 and rng.randf() < 0.25:
		return "fast"
	return "normal"


func _spawn_enemy(type: String, x: float, z: float, lvl: int, rng: RandomNumberGenerator) -> void:
	var def: Dictionary = ENEMIES[type]
	var zb := Zombie.new()
	zb.type = type
	zb.def = def
	zb.x = x
	zb.z = z
	zb.hp = (20.0 + 6.0 * lvl) * float(def["hp"])
	zb.phase = rng.randf() * 6.0
	zb.radius = def["radius"]
	zb.fire_t = def.get("fire_every", 0.0)
	zb.node = Models.instance(def["model"], def["scale"])
	if type == "gold":
		Models.tint(zb.node, Color(1.0, 0.82, 0.25))
	zb.node.position = Vector3(x, 0, z)
	level_root.add_child(zb.node)
	Models.play(zb.node, def["anim"], 1.4 if type == "fast" else 1.0)
	var ap := Models.anim_player(zb.node)
	if ap:
		ap.seek(zb.phase * 0.3, true)
	zombies.append(zb)


func _spawn_zombie_group(z: float, rng: RandomNumberGenerator, lvl: int, with_gold: bool) -> void:
	var n := 6 + 2 * lvl
	for i in n:
		_spawn_enemy(_pick_enemy_type(rng, lvl, i), -4.0 + rng.randf() * 8.0, z - rng.randf() * 8.0, lvl, rng)
	if with_gold:
		_spawn_enemy("gold", -3.0 + rng.randf() * 6.0, z - 10.0, lvl, rng)


func _spawn_boss(z: float, lvl: int) -> void:
	var g := Models.instance("zombie", 6.5)
	Models.tint(g, Color(0.6, 0.5, 0.56))
	g.position = Vector3(0, 0, z)
	level_root.add_child(g)
	Models.play(g, "walk", 0.6)
	boss = Boss.new()
	boss.z = z
	boss.max_hp = round(1500.0 * pow(1.35, lvl - 1))
	boss.hp = boss.max_hp
	boss.node = g


func build_level(lvl: int) -> void:
	_clear_level()
	level_root = Node3D.new()
	add_child(level_root)
	var rng := RandomNumberGenerator.new()
	rng.seed = lvl * 7919 + 13
	level_num = lvl
	level_length = 260.0 + 20.0 * lvl
	boss_z = -level_length
	_build_environment(level_length + 120.0)

	var z := -40.0
	var i := 0
	var gold_group := 1 + rng.randi() % 2 # one gold ghost per level
	var groups := 0
	while z > -level_length + 40.0:
		var kind := "gate"
		if i % 3 == 1:
			kind = "zombies"
		elif i % 3 == 2:
			kind = "barrel" if rng.randf() < 0.6 else "zombies"
		match kind:
			"gate":
				_spawn_gate_pair(z, rng, lvl)
			"barrel":
				_spawn_barrel(z, rng, lvl)
			_:
				groups += 1
				_spawn_zombie_group(z, rng, lvl, groups == gold_group)
				if rng.randf() < 0.35:
					_spawn_trap(z + 15.0, rng, lvl) # P2: trap in front of some groups
		z -= 30.0 + rng.randf() * 10.0
		i += 1
	_spawn_boss(boss_z, lvl)


# ---------- Run lifecycle ----------
func start_run() -> void:
	build_level(int(save["level"]))
	squad_x = 0.0
	squad_z = 0.0
	squad_count = 5 + int(save["recruits"])
	weapon_tier = 0
	mat["bullet"].albedo_color = WEAPONS[0]["color"]
	fire_timer = 0.0
	run_coins = 0
	kills = 0
	elapsed = 0.0
	freeze_t = 0.0
	inferno_t = 0.0
	shock_t = 0.0
	boss_bite_t = 0.0
	for k in cooldowns.keys():
		cooldowns[k] = 0.0
	for s in soldier_nodes:
		_attach_gun(s, 0)
		Models.play(s, "sprint")
	state = "playing"
	ui["menu"].visible = false
	ui["result"].visible = false
	ui["hud"].visible = true
	ui["skills"].visible = true
	ui["boss_box"].visible = false


func _end_run(won: bool) -> void:
	state = "won" if won else "lost"
	if won:
		run_coins += 50 * level_num
	save["coins"] = int(save["coins"]) + run_coins
	if won:
		save["level"] = int(save["level"]) + 1
	_write_save()
	ui["skills"].visible = false
	ui["result_title"].text = "VICTORY" if won else "DEFEATED"
	ui["result_text"].text = "Zombies down: %d · Coins earned: %d" % [kills, run_coins]
	ui["result_btn"].text = "NEXT" if won else "RETRY"
	ui["result"].visible = true


# ---------- Combat ----------
func _weapon_damage() -> float:
	return float(WEAPONS[weapon_tier]["dmg"]) * (1.0 + 0.15 * int(save["firepower"]))


func _fire_interval() -> float:
	return float(WEAPONS[weapon_tier]["interval"]) * maxf(0.4, 1.0 - 0.06 * int(save["rate"]))


func _fire_volley() -> void:
	var shots := mini(squad_count, 10)
	var fired := 0
	var drawn := mini(squad_count, MAX_DRAWN_SOLDIERS)
	for b in bullets:
		if fired >= shots:
			break
		if b.active:
			continue
		var i := randi() % drawn
		var r := 0.42 * sqrt(float(i))
		var a := i * GOLDEN_ANGLE
		b.active = true
		b.life = BULLET_LIFE
		b.node.visible = true
		b.node.position = Vector3(squad_x + cos(a) * r, 0.8, squad_z + sin(a) * r - 0.4)
		if fired < 3:
			fx.muzzle(b.node.position + Vector3(0, 0.1, -0.3), WEAPONS[weapon_tier]["color"])
		fired += 1


func _attach_gun(s: Node3D, tier: int) -> void:
	var old: Node = s.get_meta("gun") if s.has_meta("gun") else null
	if old and is_instance_valid(old):
		old.queue_free()
	var gun := Models.instance(WEAPONS[tier]["model"], 0.55)
	gun.position = Vector3(0, -0.12, 0.18)
	gun.rotation.y = PI
	Models.attach_right_hand(s, gun)
	s.set_meta("gun", gun)


func _kill_zombie(zb: Zombie, by_player: bool) -> void:
	zb.alive = false
	if not by_player:
		fx.burst(Vector3(zb.x, 1, zb.z), Color(0.56, 0.82, 0.31))
		zb.node.queue_free()
		return
	kills += 1
	run_coins += int(zb.def["coins"])
	if zb.type == "gold":
		fx.coins(Vector3(zb.x, 1.5, zb.z), 24)
	Models.set_overlay(zb.node, null)
	Models.play(zb.node, "die", 1.0, 0.05)
	# Ragdoll-lite: the body is flung away from the squad and tumbles under physics.
	var s: float = zb.def["scale"]
	var heavy := 0.5 if zb.type == "tank" else 1.0
	physics_fx.spawn_corpse(zb.node, Vector3(0.3, 0.4, 0.18) * s,
		Vector3(randf_range(-1.5, 1.5), randf_range(3.0, 6.0), -randf_range(4.0, 8.0)) * heavy)


func _damage_zombie(zb: Zombie, dmg: float, show_fx := true) -> void:
	zb.hp -= dmg
	if show_fx:
		fx.hit(Vector3(zb.x, 1.2, zb.z + 0.3))
		fx.damage(Vector3(zb.x, 2.2, zb.z), dmg)
	if zb.type != "tank":
		zb.z -= 0.12 # knockback
	if zb.hp <= 0.0:
		_kill_zombie(zb, true)


func _damage_boss(dmg: float, show_fx := true) -> void:
	if boss == null or not boss.alive:
		return
	boss.hp -= dmg
	if show_fx:
		fx.damage(Vector3(randf_range(-1.0, 1.0), 6.0, boss.z), dmg)
	if boss.hp <= 0.0:
		boss.alive = false
		Models.play(boss.node, "die", 1.0, 0.05)
		physics_fx.spawn_corpse(boss.node, Vector3(1.8, 2.6, 1.1), Vector3(0, 6, -10))
		fx.coins(Vector3(0, 3, boss.z), 40)
		_end_run(true)


func _hit_barrel(b: Barrel, dmg: float) -> void:
	b.hp -= dmg
	fx.hit(Vector3(b.x, 1, b.z + 0.6), Color(1.0, 0.76, 0.48))
	if b.hp <= 0.0:
		_destroy_barrel(b)
		physics_fx.spawn_debris(Vector3(b.x, 0.5, b.z), Color(0.54, 0.35, 0.24) if b.reward_type == "weapon" else Color(0.75, 0.4, 0.16), 10, 0.4, 7.0)
		fx.burst(Vector3(b.x, 1, b.z), Color(1.0, 0.7, 0.28))
		fx.coins(Vector3(b.x, 1.2, b.z), 8)
		fx.shake(0.4, 0.3)
		run_coins += 5
		if b.reward_type == "weapon":
			weapon_tier = mini(WEAPONS.size() - 1, weapon_tier + 1)
			mat["bullet"].albedo_color = WEAPONS[weapon_tier]["color"]
			for s in soldier_nodes:
				_attach_gun(s, weapon_tier)
		else:
			squad_count = mini(MAX_SQUAD, squad_count + b.reward_n)
	else:
		_update_barrel_label(b)


func _destroy_barrel(b: Barrel) -> void:
	b.alive = false
	b.node.queue_free()
	b.label.queue_free()


func use_skill(id: String) -> void:
	if state != "playing" or cooldowns[id] > 0.0:
		return
	cooldowns[id] = SKILL_COOLDOWN[id]
	match id:
		"frost":
			freeze_t = 3.0
			_set_frozen_look(true)
		"shock":
			shock_t = 0.5
			var dmg := 60.0 * level_num
			for zb in zombies:
				if zb.alive and Vector2(zb.x - squad_x, zb.z - squad_z).length() < 30.0:
					_damage_zombie(zb, dmg)
			if boss and boss.alive and absf(boss.z - squad_z) < 30.0:
				_damage_boss(dmg)
		"inferno":
			inferno_t = 4.0


# ---------- Main update ----------
func _process(delta: float) -> void:
	var dt := minf(delta, 0.05)
	_update_game(dt)
	_layout_squad()
	_update_camera(dt)
	_update_hud()


func _update_game(dt: float) -> void:
	if state != "playing":
		return
	elapsed += dt

	for k in cooldowns.keys():
		cooldowns[k] = maxf(0.0, cooldowns[k] - dt)
	if freeze_t > 0.0:
		freeze_t -= dt
		if freeze_t <= 0.0:
			_set_frozen_look(false)
	var frozen := freeze_t > 0.0

	# Movement
	var boss_phase := squad_z <= boss_z + BOSS_STOP_DIST
	if not boss_phase:
		squad_z -= RUN_SPEED * dt
	if boss and boss.alive and boss_phase and not boss.active:
		boss.active = true
		ui["boss_box"].visible = true
		for s in soldier_nodes:
			Models.play(s, "holding-right-shoot")
	var steer := 0.0
	if Input.is_physical_key_pressed(KEY_LEFT) or Input.is_physical_key_pressed(KEY_A):
		steer -= 1.0
	if Input.is_physical_key_pressed(KEY_RIGHT) or Input.is_physical_key_pressed(KEY_D):
		steer += 1.0
	squad_x += steer * STEER_SPEED * dt
	var drawn := mini(squad_count, MAX_DRAWN_SOLDIERS)
	squad_radius = 0.42 * sqrt(float(maxi(drawn, 1))) + 0.3
	squad_x = clampf(squad_x, -ROAD_HALF + squad_radius, ROAD_HALF - squad_radius)

	# Gates
	for pair in gates:
		if pair.used or squad_z > pair.z:
			continue
		pair.used = true
		var op := gate_op(pair.ops[0 if squad_x < 0.0 else 1])
		squad_count = clampi(apply_op(squad_count, op), 0, MAX_SQUAD)
		pair.node.queue_free()

	# Shooting
	fire_timer -= dt
	if fire_timer <= 0.0 and squad_count > 0:
		_fire_volley()
		fire_timer = _fire_interval()

	# Bullets
	var dmg := _weapon_damage()
	for b in bullets:
		if not b.active:
			continue
		b.life -= dt
		var p := b.node.position
		p.z -= BULLET_SPEED * dt
		b.node.position = p
		var hit := b.life <= 0.0
		if not hit:
			for pair in gates:
				if not pair.used and absf(pair.z - p.z) < 0.5 and absf(p.x) < ROAD_HALF:
					_hit_gate(pair.ops[0 if p.x < 0.0 else 1])
					fx.gate_hit(Vector3(p.x, p.y, pair.z + 0.2))
					hit = true
					break
		if not hit:
			for zb in zombies:
				if zb.alive and absf(zb.z - p.z) < 0.6 and absf(zb.x - p.x) < zb.radius + 0.05:
					_damage_zombie(zb, dmg)
					hit = true
					break
		if not hit:
			for br in barrels:
				if br.alive and absf(br.z - p.z) < BARREL_RADIUS and absf(br.x - p.x) < BARREL_RADIUS:
					_hit_barrel(br, dmg)
					hit = true
					break
		if not hit and boss and boss.alive and absf(boss.z - p.z) < 1.5 and absf(p.x) < BOSS_RADIUS:
			_damage_boss(dmg)
			hit = true
		if hit:
			b.active = false
			b.node.visible = false
		if state != "playing":
			return

	# Barrels touching the squad
	for br in barrels:
		if not br.alive:
			continue
		if absf(br.z - squad_z) < squad_radius + BARREL_RADIUS and absf(br.x - squad_x) < squad_radius + BARREL_RADIUS:
			_destroy_barrel(br)
			physics_fx.spawn_debris(Vector3(br.x, 0.5, br.z), Color(0.54, 0.35, 0.24), 8, 0.4, 6.0)
			fx.shake(0.35, 0.25)
			squad_count = maxi(0, squad_count - BARREL_HIT_COST)

	# P2: traps cost soldiers once when the squad runs into them.
	for t in traps:
		if t.used:
			continue
		if absf(t.z - squad_z) < squad_radius + 0.4 and absf(t.x - squad_x) < squad_radius + TRAP_HALF_WIDTH:
			t.used = true
			squad_count = maxi(0, squad_count - t.cost)
			fx.burst(Vector3(squad_x, 1, squad_z), Color(1.0, 0.3, 0.3))

	# Zombies (P3 behaviours per type)
	var burn := 40.0 * (1.0 + 0.15 * (level_num - 1)) * dt
	for zb in zombies:
		if not zb.alive:
			continue
		var dx := squad_x - zb.x
		var dz := squad_z - zb.z
		var dist := sqrt(dx * dx + dz * dz)
		if dist > ZOMBIE_WAKE_DIST:
			continue
		var def := zb.def
		if not frozen and dist > 0.001:
			var speed := ZOMBIE_SPEED * float(def["speed"])
			var hold: float = def.get("range", 0.0)
			if hold > 0.0 and dz > 0.0 and dz <= hold + 0.5:
				# Ranged: once in range, hold that distance ahead of the squad and slide toward its lane.
				zb.z += (squad_z - hold - zb.z) * minf(1.0, dt * 3.0)
				zb.x += signf(dx) * minf(absf(dx), 2.0 * dt)
				zb.fire_t -= dt
				if zb.fire_t <= 0.0:
					_fire_orb(zb)
					zb.fire_t = def["fire_every"]
			else:
				zb.x += dx / dist * speed * dt
				zb.z += dz / dist * speed * dt
			zb.x = clampf(zb.x, -ROAD_HALF - 2.0, ROAD_HALF + 2.0)
		zb.node.position = Vector3(zb.x, 0, zb.z)
		zb.node.rotation.y = atan2(dx, dz) + (PI if float(def["speed"]) < 0.0 else 0.0)
		if dist < squad_radius + zb.radius:
			_kill_zombie(zb, false)
			squad_count = maxi(0, squad_count - int(def["bite"]))
			continue
		if inferno_t > 0.0 and zb.z < squad_z - 4.0 and zb.z > squad_z - 20.0:
			_damage_zombie(zb, burn, false)

	# P3: ranged-enemy orbs fly toward where the squad was; dodge by steering.
	for o in orbs:
		if not o.active:
			continue
		if not frozen:
			o.node.position += o.vel * dt
		o.life -= dt
		if randf() < 0.5:
			fx.orb_trail(o.node.position)
		var op := o.node.position
		if absf(op.x - squad_x) < squad_radius and absf(op.z - squad_z) < squad_radius:
			squad_count = maxi(0, squad_count - 1)
			fx.burst(op, Color(0.75, 0.3, 1.0))
			o.active = false
		if o.life <= 0.0:
			o.active = false
		o.node.visible = o.active

	# Boss
	if boss and boss.alive and boss.active:
		var gap := (squad_z - boss.z) - (BOSS_RADIUS + squad_radius)
		if not frozen and gap > 0.0:
			boss.z += BOSS_SPEED * dt
		boss.node.position.z = boss.z
		if gap <= 0.0:
			Models.play(boss.node, "attack-melee-right", 0.8)
			boss_bite_t -= dt
			if boss_bite_t <= 0.0:
				squad_count = maxi(0, squad_count - 1)
				boss_bite_t = 0.25
		if inferno_t > 0.0 and boss.z < squad_z - 4.0 and boss.z > squad_z - 20.0 - BOSS_RADIUS:
			_damage_boss(burn, false)
			if state != "playing":
				return

	# Effects
	if inferno_t > 0.0:
		inferno_t -= dt
	inferno_zone.visible = inferno_t > 0.0
	inferno_zone.position = Vector3(0, 0.05, squad_z - 12.0)
	if shock_t > 0.0:
		shock_t -= dt
		var s := 1.0 + (0.5 - shock_t) * 60.0
		shock_ring.scale = Vector3(s, 1, s)
		shock_ring.position = Vector3(squad_x, 0.1, squad_z)
	shock_ring.visible = shock_t > 0.0

	if squad_count <= 0:
		_end_run(false)


# ---------- Rendering helpers ----------
func _layout_squad() -> void:
	var drawn := mini(squad_count, MAX_DRAWN_SOLDIERS)
	for i in MAX_DRAWN_SOLDIERS:
		var s := soldier_nodes[i]
		s.visible = i < drawn and state != "menu"
		if not s.visible:
			continue
		var r := 0.42 * sqrt(float(i))
		var a := i * GOLDEN_ANGLE
		s.position = Vector3(squad_x + cos(a) * r, 0.0, squad_z + sin(a) * r)
	squad_label.visible = state != "menu"
	squad_label.position = Vector3(squad_x, 2.4 + squad_radius * 0.5, squad_z)
	squad_label.text = str(squad_count)


func _update_camera(dt: float) -> void:
	var shake: Vector3 = fx.shake_offset(dt)
	camera.position = Vector3(squad_x * 0.4, 13.0, squad_z + 15.0) + shake
	camera.look_at(Vector3(squad_x * 0.3 + shake.x, 0.0, squad_z - 14.0))


func _fire_orb(zb: Zombie) -> void:
	for o in orbs:
		if o.active:
			continue
		o.active = true
		o.life = 3.0
		o.node.position = Vector3(zb.x, 1.3, zb.z)
		o.vel = Vector3(squad_x - zb.x, 0, squad_z - zb.z).normalized() * ORB_SPEED
		o.node.visible = true
		Models.play(zb.node, "attack-melee-right", 1.0, 0.05)
		get_tree().create_timer(0.45).timeout.connect(func() -> void:
			if zb.alive:
				Models.play(zb.node, "walk"))
		return


# Frost: translucent overlay + paused animations on every living enemy.
func _set_frozen_look(on: bool) -> void:
	var nodes: Array[Node3D] = []
	for zb in zombies:
		if zb.alive:
			nodes.append(zb.node)
	if boss and boss.alive:
		nodes.append(boss.node)
	for n in nodes:
		Models.set_overlay(n, frost_overlay if on else null)
		var ap := Models.anim_player(n)
		if ap:
			ap.speed_scale = 0.0 if on else 1.0


# ---------- Input ----------
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and state == "playing" and (event.button_mask & MOUSE_BUTTON_MASK_LEFT):
		squad_x += event.relative.x / get_viewport().get_visible_rect().size.x * 14.0
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_1:
				use_skill("frost")
			KEY_2:
				use_skill("shock")
			KEY_3:
				use_skill("inferno")


# ---------- UI ----------
func _style(color: Color, radius: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	sb.content_margin_top = 12
	sb.content_margin_bottom = 12
	return sb


func _text(text: String, size: int, color := Color.WHITE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_constant_override("outline_size", 6)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.45))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _button(text: String, bg: Color, fg: Color, size: int) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_color_override("font_color", fg)
	b.add_theme_color_override("font_hover_color", fg)
	b.add_theme_color_override("font_pressed_color", fg)
	b.add_theme_stylebox_override("normal", _style(bg, 18))
	b.add_theme_stylebox_override("hover", _style(bg.lightened(0.1), 18))
	b.add_theme_stylebox_override("pressed", _style(bg.darkened(0.15), 18))
	b.add_theme_stylebox_override("disabled", _style(Color(0.42, 0.45, 0.5), 18))
	b.add_theme_color_override("font_disabled_color", Color(0.85, 0.85, 0.85))
	b.focus_mode = Control.FOCUS_NONE
	return b


func _bar(fill: Color, height: int) -> ProgressBar:
	var p := ProgressBar.new()
	p.show_percentage = false
	p.custom_minimum_size = Vector2(0, height)
	p.max_value = 1.0
	p.add_theme_stylebox_override("background", _style(Color(0, 0, 0, 0.3), height / 2))
	var f := _style(fill, height / 2)
	f.content_margin_top = 0
	f.content_margin_bottom = 0
	p.add_theme_stylebox_override("fill", f)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


func _overlay() -> Control:
	var root := ColorRect.new()
	root.color = Color(0.04, 0.08, 0.16, 0.55)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(center)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(620, 0)
	var ps := _style(Color(0.12, 0.16, 0.27), 28)
	ps.content_margin_left = 32
	ps.content_margin_right = 32
	ps.content_margin_top = 32
	ps.content_margin_bottom = 32
	panel.add_theme_stylebox_override("panel", ps)
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	panel.add_child(box)
	root.set_meta("box", box)
	return root


func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	# HUD
	var hud := VBoxContainer.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	hud.offset_left = 24
	hud.offset_right = -24
	hud.offset_top = 20
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(hud)
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(row)
	ui["hud_level"] = _text("Level 1", 32)
	ui["hud_weapon"] = _text("Pistol", 32)
	ui["hud_coins"] = _text("0", 32, Color(1.0, 0.82, 0.25))
	for l in [ui["hud_level"], ui["hud_weapon"], ui["hud_coins"]]:
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(l)
	ui["hud_level"].horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	ui["hud_coins"].horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	ui["progress"] = _bar(Color(0.3, 0.85, 0.39), 16)
	hud.add_child(ui["progress"])
	var boss_box := VBoxContainer.new()
	boss_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	boss_box.add_child(_text("BRUTE", 30))
	ui["boss_bar"] = _bar(Color(1.0, 0.23, 0.19), 22)
	boss_box.add_child(ui["boss_bar"])
	hud.add_child(boss_box)
	ui["boss_box"] = boss_box
	ui["hud"] = hud

	# Skills
	var skills := HBoxContainer.new()
	skills.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	skills.offset_top = -190
	skills.offset_bottom = -30
	skills.alignment = BoxContainer.ALIGNMENT_CENTER
	skills.add_theme_constant_override("separation", 24)
	skills.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(skills)
	ui["skill_buttons"] = {}
	var colors := {"frost": Color(0.23, 0.63, 1.0), "shock": Color(0.65, 0.3, 1.0), "inferno": Color(1.0, 0.48, 0.1)}
	for id in ["frost", "shock", "inferno"]:
		var b := _button(id.capitalize(), colors[id], Color.WHITE, 28)
		for st in ["normal", "hover", "pressed", "disabled"]:
			var sb: StyleBoxFlat = b.get_theme_stylebox(st)
			sb.set_corner_radius_all(80)
			sb.border_color = Color(1, 1, 1, 0.85)
			sb.set_border_width_all(6)
		b.custom_minimum_size = Vector2(150, 150)
		b.pressed.connect(use_skill.bind(id))
		skills.add_child(b)
		ui["skill_buttons"][id] = b
	ui["skills"] = skills

	# Menu
	var menu := _overlay()
	layer.add_child(menu)
	var mbox: VBoxContainer = menu.get_meta("box")
	mbox.add_child(_text("HORDE HIGHWAY", 60, Color(1.0, 0.82, 0.25)))
	var sub := _text("Grow your squad. Pick the right gate. Survive the horde.", 26)
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mbox.add_child(sub)
	var stats := HBoxContainer.new()
	ui["menu_level"] = _text("Level 1", 32)
	ui["menu_coins"] = _text("Coins 0", 32)
	for l in [ui["menu_level"], ui["menu_coins"]]:
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stats.add_child(l)
	mbox.add_child(stats)
	ui["upgrade_rows"] = []
	for u in UPGRADES:
		var r := HBoxContainer.new()
		var info := VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var title := _text(u["label"], 28)
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		var desc := _text(u["desc"], 22, Color(1, 1, 1, 0.75))
		desc.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		info.add_child(title)
		info.add_child(desc)
		r.add_child(info)
		var buy := _button("", Color(1.0, 0.82, 0.25), Color(0.23, 0.16, 0.0), 26)
		buy.custom_minimum_size = Vector2(170, 0)
		buy.pressed.connect(buy_upgrade.bind(u["id"]))
		r.add_child(buy)
		mbox.add_child(r)
		ui["upgrade_rows"].append({"u": u, "title": title, "buy": buy})
	var play := _button("PLAY", Color(0.3, 0.85, 0.39), Color(0.03, 0.22, 0.06), 44)
	play.pressed.connect(start_run)
	mbox.add_child(play)
	mbox.add_child(_text("Drag or A/D · Arrow keys to steer · 1 2 3 for skills", 22, Color(1, 1, 1, 0.7)))
	ui["menu"] = menu

	# Result
	var result := _overlay()
	layer.add_child(result)
	var rbox: VBoxContainer = result.get_meta("box")
	ui["result_title"] = _text("VICTORY", 60, Color(1.0, 0.82, 0.25))
	ui["result_text"] = _text("", 30)
	ui["result_text"].autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ui["result_btn"] = _button("CONTINUE", Color(0.3, 0.85, 0.39), Color(0.03, 0.22, 0.06), 44)
	ui["result_btn"].pressed.connect(show_menu)
	rbox.add_child(ui["result_title"])
	rbox.add_child(ui["result_text"])
	rbox.add_child(ui["result_btn"])
	ui["result"] = result


func buy_upgrade(id: String) -> void:
	for u in UPGRADES:
		if u["id"] != id:
			continue
		var cost := upgrade_cost(u)
		if int(save["coins"]) < cost:
			return
		save["coins"] = int(save["coins"]) - cost
		save[id] = int(save[id]) + 1
		_write_save()
		_render_menu()


func _render_menu() -> void:
	ui["menu_level"].text = "Level %d" % int(save["level"])
	ui["menu_coins"].text = "Coins %d" % int(save["coins"])
	for row in ui["upgrade_rows"]:
		var u: Dictionary = row["u"]
		var cost := upgrade_cost(u)
		row["title"].text = "%s · Lv %d" % [u["label"], int(save[u["id"]])]
		row["buy"].text = "● %d" % cost
		row["buy"].disabled = int(save["coins"]) < cost


func show_menu() -> void:
	state = "menu"
	ui["result"].visible = false
	ui["hud"].visible = false
	ui["skills"].visible = false
	ui["menu"].visible = true
	_render_menu()


func _update_hud() -> void:
	if state == "menu":
		return
	ui["hud_level"].text = "Level %d" % level_num
	ui["hud_weapon"].text = WEAPONS[weapon_tier]["name"]
	ui["hud_coins"].text = "● %d" % (int(save["coins"]) + run_coins)
	ui["progress"].value = clampf(-squad_z / (level_length - BOSS_STOP_DIST), 0.0, 1.0)
	if boss:
		ui["boss_bar"].value = clampf(boss.hp / boss.max_hp, 0.0, 1.0)
	for id in ui["skill_buttons"].keys():
		var b: Button = ui["skill_buttons"][id]
		var cd: float = cooldowns[id]
		b.text = str(ceili(cd)) if cd > 0.0 else id.capitalize()
		b.disabled = cd > 0.0


# Read-only stats for automated smoke tests.
func stats() -> Dictionary:
	var alive := 0
	for zb in zombies:
		if zb.alive:
			alive += 1
	var types := {}
	for zb in zombies:
		types[zb.type] = true
	var traps_hit := 0
	for t in traps:
		if t.used:
			traps_hit += 1
	return {
		"state": state, "level": level_num, "count": squad_count, "x": squad_x, "z": snappedf(squad_z, 0.1),
		"kills": kills, "run_coins": run_coins, "weapon": WEAPONS[weapon_tier]["name"],
		"boss_hp": boss.hp if boss else -1.0, "zombies_alive": alive,
		"enemy_types": types.keys(), "traps_hit": traps_hit, "physics": physics_fx.stats(),
	}
