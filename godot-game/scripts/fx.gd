# Combat particles (pooled additive quads), floating damage numbers (pooled Label3D) and camera shake.
extends Node3D

const MAX_SPARKS := 160
const MAX_NUMBERS := 32

var _sparks: Array[Dictionary] = []
var _numbers: Array[Dictionary] = []
var _shake_t := 0.0
var _shake_power := 0.0


func _ready() -> void:
	var grad := Gradient.new()
	grad.set_color(0, Color(1, 1, 1, 1))
	grad.set_color(1, Color(1, 1, 1, 0))
	var tex := GradientTexture2D.new()
	tex.gradient = grad
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(1.0, 0.5)
	var quad := QuadMesh.new()
	for i in MAX_SPARKS:
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		m.albedo_texture = tex
		m.no_depth_test = false
		var mi := MeshInstance3D.new()
		mi.mesh = quad
		mi.material_override = m
		mi.visible = false
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		_sparks.append({"node": mi, "mat": m, "vel": Vector3.ZERO, "life": 0.0, "max": 1.0, "size": 1.0, "gravity": 0.0})
	for i in MAX_NUMBERS:
		var l := Label3D.new()
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.no_depth_test = true
		l.render_priority = 20
		l.font_size = 64
		l.outline_size = 12
		l.pixel_size = 0.01
		l.visible = false
		add_child(l)
		_numbers.append({"node": l, "life": 0.0})


func _emit(pos: Vector3, color: Color, count := 1, speed := 0.0, size := 0.4, life := 0.25, gravity := 0.0, spread := 1.0) -> void:
	var n := 0
	for p in _sparks:
		if n >= count:
			break
		if p["life"] > 0.0:
			continue
		p["node"].position = pos
		p["mat"].albedo_color = color
		p["vel"] = Vector3((randf() - 0.5) * spread, randf() * spread * 0.8, (randf() - 0.5) * spread) * speed
		p["life"] = life * randf_range(0.7, 1.3)
		p["max"] = p["life"]
		p["size"] = size
		p["gravity"] = gravity
		p["node"].visible = true
		n += 1


func muzzle(pos: Vector3, color: Color) -> void:
	_emit(pos, color, 1, 0.0, 0.55, 0.06)


func hit(pos: Vector3, color := Color(1.0, 0.95, 0.69)) -> void:
	_emit(pos, color, 3, 5.0, 0.25, 0.22, 12.0)


func gate_hit(pos: Vector3) -> void:
	_emit(pos, Color(0.62, 0.85, 1.0), 2, 3.0, 0.45, 0.2)


func coins(pos: Vector3, n := 10) -> void:
	_emit(pos, Color(1.0, 0.82, 0.25), n, 6.0, 0.35, 0.7, 14.0)


func burst(pos: Vector3, color: Color) -> void:
	_emit(pos, color, 14, 7.0, 0.5, 0.45, 8.0)


func orb_trail(pos: Vector3) -> void:
	_emit(pos, Color(0.75, 0.3, 1.0), 1, 0.0, 0.5, 0.15)


func damage(pos: Vector3, amount: float) -> void:
	var slot: Dictionary = _numbers[0]
	for d in _numbers:
		if d["life"] <= 0.0:
			slot = d
			break
		if d["life"] < slot["life"]:
			slot = d
	var l: Label3D = slot["node"]
	l.position = pos + Vector3(randf_range(-0.3, 0.3), 0, 0)
	l.text = str(roundi(amount))
	l.modulate = Color.WHITE
	l.visible = true
	slot["life"] = 0.6


func shake(power := 0.35, time := 0.3) -> void:
	_shake_power = maxf(_shake_power, power)
	_shake_t = maxf(_shake_t, time)


# Returns a camera offset for the current shake, decaying over time.
func shake_offset(delta: float) -> Vector3:
	if _shake_t <= 0.0:
		return Vector3.ZERO
	_shake_t -= delta
	var p := _shake_power * maxf(0.0, _shake_t) / 0.3
	if _shake_t <= 0.0:
		_shake_power = 0.0
	return Vector3(randf() - 0.5, randf() - 0.5, (randf() - 0.5) * 0.5) * p


func _process(delta: float) -> void:
	for p in _sparks:
		if p["life"] <= 0.0:
			continue
		p["life"] -= delta
		if p["life"] <= 0.0:
			p["node"].visible = false
			continue
		p["vel"].y -= p["gravity"] * delta
		p["node"].position += p["vel"] * delta
		var k: float = p["life"] / p["max"]
		p["node"].scale = Vector3.ONE * p["size"] * (0.4 + 0.6 * k)
		p["mat"].albedo_color.a = k
	for d in _numbers:
		if d["life"] <= 0.0:
			continue
		d["life"] -= delta
		var l: Label3D = d["node"]
		if d["life"] <= 0.0:
			l.visible = false
			continue
		l.position.y += delta * 2.2
		l.modulate.a = minf(1.0, d["life"] / 0.3)


func clear() -> void:
	for p in _sparks:
		p["life"] = 0.0
		p["node"].visible = false
	for d in _numbers:
		d["life"] = 0.0
		d["node"].visible = false
	_shake_t = 0.0
