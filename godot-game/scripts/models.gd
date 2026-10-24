# Loads the CC0 Kenney models (see ../CREDITS.md) and plays their animations.
class_name Models
extends RefCounted

const PATHS := {
	"soldierA": "mini/character-male-a", "soldierB": "mini/character-male-b", "soldierC": "mini/character-male-c",
	"soldierD": "mini/character-female-a", "soldierE": "mini/character-female-b",
	"zombie": "graveyard/character-zombie", "skeleton": "graveyard/character-skeleton",
	"vampire": "graveyard/character-vampire", "ghost": "graveyard/character-ghost", "keeper": "graveyard/character-keeper",
	"gunPistol": "blaster/blaster-a", "gunSmg": "blaster/blaster-d", "gunRifle": "blaster/blaster-g", "gunGatling": "blaster/blaster-p",
	"crate": "blaster/crate-medium", "barrel": "survival/barrel",
	"road": "roads/road-straight", "lamp": "roads/light-square", "barrier": "roads/construction-barrier", "cone": "roads/construction-cone",
	"pine": "graveyard/pine", "pineCrooked": "graveyard/pine-crooked", "rocks": "graveyard/rocks", "rocksTall": "graveyard/rocks-tall",
	"grave": "graveyard/gravestone-round", "graveCross": "graveyard/gravestone-cross",
	"lightpost": "graveyard/lightpost-single", "pumpkin": "graveyard/pumpkin", "hay": "graveyard/hay-bale",
	"tree": "survival/tree", "treeTall": "survival/tree-tall", "rock": "survival/rock-a",
}

# Animations that loop; everything else plays once.
const LOOPING := ["idle", "walk", "sprint", "holding-right-shoot", "attack-melee-right"]

static var _scenes := {}


static func instance(key: String, scale := 1.0) -> Node3D:
	if not _scenes.has(key):
		_scenes[key] = load("res://assets/models/%s.glb" % PATHS[key])
	var n: Node3D = _scenes[key].instantiate()
	n.scale = Vector3.ONE * scale
	var ap := anim_player(n)
	if ap:
		for anim_name in LOOPING:
			if ap.has_animation(anim_name):
				ap.get_animation(anim_name).loop_mode = Animation.LOOP_LINEAR
	return n


static func anim_player(n: Node) -> AnimationPlayer:
	var found := n.find_children("*", "AnimationPlayer", true, false)
	return found[0] if found.size() > 0 else null


static func play(n: Node, anim_name: String, speed := 1.0, blend := 0.15) -> void:
	var ap := anim_player(n)
	if ap == null or not ap.has_animation(anim_name):
		return
	if ap.current_animation == anim_name and ap.is_playing():
		return
	ap.play(anim_name, blend, speed)


# Copies every surface material and tints it (gold enemy, boss).
static func tint(n: Node, color: Color) -> void:
	for mi in n.find_children("*", "MeshInstance3D", true, false):
		var m: MeshInstance3D = mi
		for s in m.mesh.get_surface_count():
			var src := m.get_active_material(s)
			if src is BaseMaterial3D:
				var dup: BaseMaterial3D = src.duplicate()
				dup.albedo_color = color
				m.set_surface_override_material(s, dup)


static func set_overlay(n: Node, material: Material) -> void:
	for mi in n.find_children("*", "MeshInstance3D", true, false):
		(mi as MeshInstance3D).material_overlay = material


# Attaches `item` to the right arm: a node on rigid models, a bone on skinned ones.
static func attach_right_hand(character: Node3D, item: Node3D) -> Node3D:
	var arm := character.find_child("arm-right", true, false)
	if arm:
		arm.add_child(item)
		return arm
	var skels := character.find_children("*", "Skeleton3D", true, false)
	if skels.is_empty():
		character.add_child(item)
		return character
	var skel: Skeleton3D = skels[0]
	var att := skel.get_node_or_null("RightHand") as BoneAttachment3D
	if att == null:
		att = BoneAttachment3D.new()
		att.name = "RightHand"
		att.bone_name = "arm-right"
		skel.add_child(att)
	att.add_child(item)
	return att
