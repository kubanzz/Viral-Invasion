"""Blender 4.5 cinematic authoring for Viral Invasion's approved v3 art direction.

No game assets are modified. Run with Blender --background --python THIS -- ... .
Building a scene is the default; --still FRAME or --animation explicitly renders.
Each shot uses a local 24 fps clock; FFmpeg handles the six-shot final assembly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

FPS = 24
SHOTS = {"body": (0, 6), "lung": (6, 11), "heart": (11, 16),
         "orders": (16, 21), "transit": (21, 29), "arrival": (29, 33)}
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PLATE = ROOT / "asserts/ViralInvasion_Prologue_v3/preview/organ-overview-style-match.png"
HERO = ROOT / "asserts/ViralInvasion_Hero3D_v1/model/medic-hero-v1-animated.glb"
PALETTE = {"ivory": (0.86, 0.88, 0.79, 1), "rim": (0.96, 0.94, 0.82, 1),
           "mint": (0.57, 0.72, 0.65, 1), "coral": (0.79, 0.49, 0.43, 1),
           "rose": (0.69, 0.43, 0.49, 1), "white": (0.91, 0.98, 0.92, 1)}
USED_SOURCES = {}
MATERIALS = {}
RNG = random.Random(330024)


def args_from_cli():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--shot", choices=[*SHOTS, "widefront"], default="widefront")
    p.add_argument("--root", type=Path, default=ROOT)
    p.add_argument("--output", type=Path)
    p.add_argument("--plate", type=Path, help="Override far matte for this shot")
    p.add_argument("--body-plate", type=Path)
    p.add_argument("--lung-plate", type=Path)
    p.add_argument("--heart-plate", type=Path)
    p.add_argument("--vessel-plate", type=Path)
    p.add_argument("--resolution", default="1280x720")
    p.add_argument("--quality", choices=["draft", "final"], default="draft")
    p.add_argument("--samples", type=int)
    p.add_argument("--engine", choices=["eevee", "workbench"], default="eevee")
    p.add_argument("--still", type=int, metavar="LOCAL_FRAME")
    p.add_argument("--animation", action="store_true")
    p.add_argument("--range", dest="frame_range", help="Local inclusive frame range, e.g. 1:120")
    p.add_argument("--save-blend", type=Path)
    p.add_argument("--no-dof", action="store_true")
    p.add_argument("--no-hero", action="store_true", help="Environment-only diagnostic, never final")
    p.add_argument("--units", type=float, default=1.0, help="Density multiplier, not actor size")
    a = p.parse_args(argv)
    a.shot_alias = a.shot
    if a.shot == "widefront":
        a.shot = "lung"
    a.root = a.root.resolve()
    a.width, a.height = (int(v) for v in a.resolution.lower().split("x"))
    if min(a.width, a.height) < 64:
        p.error("Resolution must be at least 64 pixels on each side")
    a.frames = (SHOTS[a.shot][1] - SHOTS[a.shot][0]) * FPS
    if a.animation and a.still is not None:
        p.error("Choose --still or --animation")
    return a


def source(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Required original asset is missing: {path}")
    USED_SOURCES[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return path


def set_input(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def keys(obj, prop, samples, interpolation="BEZIER"):
    for frame, value in samples:
        setattr(obj, prop, value)
        obj.keyframe_insert(data_path=prop, frame=frame)
    ad = getattr(obj, "animation_data", None)
    if ad and ad.action:
        # Legacy fcurves remain available for object transforms in Blender 4.5.
        for fc in getattr(ad.action, "fcurves", []):
            if fc.data_path != prop:
                continue
            for point in fc.keyframe_points:
                point.interpolation = interpolation


def node_value_keys(socket, samples, interpolation="LINEAR"):
    for frame, value in samples:
        socket.default_value = value
        socket.keyframe_insert(data_path="default_value", frame=frame)
    tree = socket.id_data
    ad = getattr(tree, "animation_data", None)
    if ad and ad.action:
        for fc in getattr(ad.action, "fcurves", []):
            if fc.data_path != socket.path_from_id("default_value"):
                continue
            for point in fc.keyframe_points:
                point.interpolation = interpolation


def matte_material(name, color, grain=False, emission=0):
    cache = (name, grain, emission)
    if cache in MATERIALS:
        return MATERIALS[cache]
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    tree = mat.node_tree; tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    set_input(shader, "Base Color", color); set_input(shader, "Roughness", .86)
    set_input(shader, "Specular IOR Level", .2)
    set_input(shader, "Subsurface Weight", .035)
    if emission:
        set_input(shader, "Emission Color", color); set_input(shader, "Emission Strength", emission)
    if grain:
        tex = tree.nodes.new("ShaderNodeTexNoise"); tex.inputs["Scale"].default_value = 23
        tex.inputs["Detail"].default_value = 2
        bump = tree.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = .11
        bump.inputs["Distance"].default_value = .018
        tree.links.new(tex.outputs["Fac"], bump.inputs["Height"])
        tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    tree.links.new(shader.outputs[0], out.inputs[0]); MATERIALS[cache] = mat
    return mat


def image_material(name, path, alpha=False, opacity=1.0, gating=None):
    image = bpy.data.images.load(str(source(path)), check_existing=True)
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    tree = mat.node_tree; tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    tex = tree.nodes.new("ShaderNodeTexImage"); tex.image = image; tex.interpolation = "Linear"
    emit = tree.nodes.new("ShaderNodeEmission"); emit.inputs["Strength"].default_value = 1.0
    tree.links.new(tex.outputs["Color"], emit.inputs["Color"])
    if not alpha:
        tree.links.new(emit.outputs[0], out.inputs["Surface"])
        return mat, None
    transparent = tree.nodes.new("ShaderNodeBsdfTransparent")
    mix = tree.nodes.new("ShaderNodeMixShader")
    multiply = tree.nodes.new("ShaderNodeMath"); multiply.operation = "MULTIPLY"
    op = tree.nodes.new("ShaderNodeValue"); op.name = "OriginalPixelOpacity"; op.outputs[0].default_value = opacity
    tree.links.new(tex.outputs["Alpha"], multiply.inputs[0]); tree.links.new(op.outputs[0], multiply.inputs[1])
    mask = multiply.outputs[0]
    if gating is not None:
        gate = tree.nodes.new("ShaderNodeValue"); gate.name = "AuthoredFrameGate"
        node_value_keys(gate.outputs[0], gating, "CONSTANT")
        m2 = tree.nodes.new("ShaderNodeMath"); m2.operation = "MULTIPLY"
        tree.links.new(mask, m2.inputs[0]); tree.links.new(gate.outputs[0], m2.inputs[1]); mask = m2.outputs[0]
    tree.links.new(mask, mix.inputs[0]); tree.links.new(transparent.outputs[0], mix.inputs[1])
    tree.links.new(emit.outputs[0], mix.inputs[2]); tree.links.new(mix.outputs[0], out.inputs[0])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    elif hasattr(mat, "blend_method"):
        mat.blend_method = "HASHED"
    mat.use_backface_culling = False
    if hasattr(mat, "use_transparent_shadow"):
        mat.use_transparent_shadow = False
    return mat, op.outputs[0]


def mesh(name, verts, faces, mat=None, uv=None):
    data = bpy.data.meshes.new(name); data.from_pydata(verts, [], faces); data.update()
    obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj)
    if mat:
        data.materials.append(mat)
    for poly in data.polygons:
        poly.use_smooth = True
    if uv:
        layer = data.uv_layers.new(name="OriginalUV")
        for poly in data.polygons:
            for loop_index in poly.loop_indices:
                layer.data[loop_index].uv = uv[data.loops[loop_index].vertex_index]
    return obj


def empty(name, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(obj); obj.location = location
    return obj


def curve(name, points, bevel, mat, cyclic=False):
    data = bpy.data.curves.new(name, "CURVE"); data.dimensions = "3D"
    data.resolution_u = 3; data.bevel_depth = bevel; data.bevel_resolution = 2
    spline = data.splines.new("BEZIER"); spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points):
        p.co = co; p.handle_left_type = p.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(obj); obj.data.materials.append(mat)
    return obj


def camera_shot(a, start, end, look_start, look_end, lens=38, fstop=9):
    data = bpy.data.cameras.new("CinemaCamera"); cam = bpy.data.objects.new("CinemaCamera", data)
    bpy.context.collection.objects.link(cam); bpy.context.scene.camera = cam
    cam.data.lens = lens; cam.data.sensor_width = 36; cam.data.clip_end = 1500; cam.data.clip_start = .03
    target = empty("CameraFocus", look_start)
    constraint = cam.constraints.new("TRACK_TO"); constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"; constraint.up_axis = "UP_Y"
    keys(cam, "location", [(1, start), (a.frames, end)], "LINEAR")
    keys(target, "location", [(1, look_start), (a.frames, look_end)], "LINEAR")
    data.dof.use_dof = not a.no_dof; data.dof.focus_object = target; data.dof.aperture_fstop = fstop
    data.dof.aperture_blades = 6
    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    return cam, target


def plane_from_image(name, path, width, height, parent=None, foot=.5, opacity=1):
    # UVs preserve every original PNG pixel. Local +Y is the image's up axis.
    verts = [(-width / 2, -height * (1 - foot), 0), (width / 2, -height * (1 - foot), 0),
             (width / 2, height * foot, 0), (-width / 2, height * foot, 0)]
    mat, op = image_material(name, path, alpha=True, opacity=opacity)
    obj = mesh(name, verts, [(0, 1, 2, 3)], mat, [(0, 0), (1, 0), (1, 1), (0, 1)])
    obj.parent = parent
    return obj, op


def far_matte(a, cam, target, plate, distance=180):
    if not plate or not Path(plate).is_file():
        return None
    bpy.context.scene.frame_set(max(1, a.frames // 2)); bpy.context.view_layer.update()
    direction = (target.matrix_world.translation - cam.matrix_world.translation).normalized()
    center = cam.matrix_world.translation + direction * distance
    image = bpy.data.images.load(str(source(plate)), check_existing=True)
    width = 2 * distance * math.tan(cam.data.angle_x / 2) * 1.045
    height = width * image.size[1] / image.size[0]
    mat, _ = image_material("ApprovedArtDistantMatte", plate)
    obj = mesh("ApprovedArtDistantMatte", [(-width/2, -height/2, 0), (width/2, -height/2, 0),
               (width/2, height/2, 0), (-width/2, height/2, 0)], [(0, 1, 2, 3)], mat,
               [(0, 0), (1, 0), (1, 1), (0, 1)])
    obj.location = center; obj.rotation_euler = cam.matrix_world.to_euler()
    bpy.context.scene.frame_set(1)
    return obj


def painted_surface(name, path, emission=1.0, fade_horizon=False):
    """Preserve the approved hand-painted surface; geometry contributes depth."""
    mat=bpy.data.materials.new(name);mat.use_nodes=True;tree=mat.node_tree;tree.nodes.clear()
    out=tree.nodes.new("ShaderNodeOutputMaterial"); shader=tree.nodes.new("ShaderNodeEmission")
    tex=tree.nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(source(path)),check_existing=True)
    tex.extension="EXTEND"; tex.interpolation="Linear"
    tree.links.new(tex.outputs["Color"],shader.inputs["Color"]);shader.inputs["Strength"].default_value=emission
    if fade_horizon:
        uv=tree.nodes.new("ShaderNodeTexCoord");sep=tree.nodes.new("ShaderNodeSeparateXYZ")
        tree.links.new(uv.outputs["UV"],sep.inputs[0])
        ramp=tree.nodes.new("ShaderNodeMapRange");ramp.inputs["From Min"].default_value=.87;ramp.inputs["From Max"].default_value=1
        ramp.inputs["To Min"].default_value=1;ramp.inputs["To Max"].default_value=0;ramp.clamp=True
        tree.links.new(sep.outputs["Y"],ramp.inputs["Value"])
        mix=tree.nodes.new("ShaderNodeMixShader");trans=tree.nodes.new("ShaderNodeBsdfTransparent")
        tree.links.new(ramp.outputs[0],mix.inputs[0]);tree.links.new(trans.outputs[0],mix.inputs[1]);tree.links.new(shader.outputs[0],mix.inputs[2])
        tree.links.new(mix.outputs[0],out.inputs[0]);mat.surface_render_method="BLENDED"
    else:
        tree.links.new(shader.outputs[0],out.inputs[0])
    return mat


def ground(a, camera, extent=260):
    n = 55 if a.quality == "draft" else 80
    verts = []
    for j in range(n + 1):
        y = -45 + extent * j / n
        for i in range(n + 1):
            x = -extent / 2 + extent * i / n
            z = .10 * math.sin(x * .16 + y * .04) + .08 * math.cos(y * .20 - x * .02)
            verts.append((x, y, z))
    faces = [(j*(n+1)+i, j*(n+1)+i+1, (j+1)*(n+1)+i+1, (j+1)*(n+1)+i)
             for j in range(n) for i in range(n)]
    # Genuine camera projection onto a three-dimensional, undulating terrain:
    # the approved panorama retains its fine brushwork while camera translation
    # reveals parallax between land, character cards, real folds and far matte.
    scene=bpy.context.scene;original_frame=scene.frame_current
    scene.frame_set(a.frames//2);bpy.context.view_layer.update()
    uvs=[]
    for vertex in verts:
        uv=world_to_camera_view(scene,camera,Vector(vertex))
        # Match the far matte's 4.5% overscan, avoiding a different crop at the seam.
        uvs.append(((uv.x-.5)/1.045+.5,(uv.y-.5)/1.045+.5))
    scene.frame_set(original_frame)
    return mesh("ApprovedPaintProjectedOntoUndulatingLand", verts, faces,
                painted_surface("ApprovedOrganPaintOnTerrain",plate_for(a),1.0,False),uvs)


def fold(name, xy, length, width, height, yaw=0, phase=0):
    """Low rounded, open membrane arch: cream shell, coral inner wall, fine rim."""
    across, along = 18, 28
    ca, sa = math.cos(yaw), math.sin(yaw)
    def point(u, v, inset=0):
        theta = math.pi * v
        s = (u-.5) * length
        sway = math.sin(u * 4.1 + phase) * width * .17
        cross = (width-inset) * math.cos(theta) * (.90 + .10 * math.sin(u*4+phase))
        rise = (height-inset*.55) * math.sin(theta) * (.72 + .28 * math.sin(u*math.pi))
        return (xy[0] + (cross+sway)*ca - s*sa, xy[1] + (cross+sway)*sa + s*ca, .03+rise)
    for inner in [False, True]:
        inset = .17 if inner else 0
        verts = [point(j/along, i/across, inset) for j in range(along+1) for i in range(across+1)]
        faces = [(j*(across+1)+i,j*(across+1)+i+1,(j+1)*(across+1)+i+1,(j+1)*(across+1)+i)
                 for j in range(along) for i in range(across)]
        mesh(name+("CoralInner" if inner else "PearlShell"), verts, faces,
             matte_material("MutedCoralInnerMembrane" if inner else "MatteIvoryMembrane", PALETTE["coral" if inner else "ivory"], True),
             [(i/across,j/along) for j in range(along+1) for i in range(across+1)])
    for end in [0, 1]:
        curve(name+"SoftHandDrawnRim", [point(end, i/18) for i in range(19)], .035,
              matte_material("FineWarmIvoryOutline", PALETTE["rim"]))


def membrane_world(a, camera, density=1.0):
    ground(a,camera)
    # Keep the approved painted folds. The actual undulating projection mesh,
    # raised protein crossings, actors and moving camera already supply depth;
    # generic additional arches would contradict the approved silhouettes.
    layouts = []
    for i, (pos, length, width, height, yaw) in enumerate(layouts):
        fold(f"TissueFold{i:02}", pos, length, width, height, yaw, i*1.3)
    # The existing ground's painted brush texture supplies the exact material
    # family on the additional edge geometry; no character pixels are changed.
    for obj in bpy.context.scene.objects:
        if obj.type=="MESH" and obj.name.endswith("PearlShell"):
            obj.data.materials.clear();obj.data.materials.append(painted_surface(obj.name+"OriginalGroundPaint",
                a.root/"asserts/ViralInvasion_Microfront_v1/ground/healthy.png",.95))
    fiber = matte_material("FinePaleProteinFibre", (.89, .91, .81, 1))
    for i in range(round(7*density)):
        x = -40 + i * 5.9
        points = [(x-7, -20, .22), (x+math.sin(i)*5, 3, .20),
                  (x-4, 27, .21), (x+math.cos(i)*6, 55, .2), (x, 86, .2)]
        curve(f"BranchingProteinPath{i:02}", points, .015 if i % 3 else .025, fiber)
    # A distant raised fibre crossing supplies visible parallax, not a painted zoom.
    for i in range(4):
        curve(f"DistantFibreBridge{i}", [(-19, 41+i*.8, 1), (-10, 40+i*.8, 2.7), (0, 41+i*.8, 3.4),
              (12, 42+i*.8, 2.1), (24, 43+i*.8, .6)], .06, fiber)


def plate_for(a):
    if a.plate:
        return a.plate.resolve()
    specific = a.body_plate if a.shot == "body" else a.lung_plate if a.shot == "lung" else a.heart_plate if a.shot in ["heart", "orders"] else a.vessel_plate
    if specific:
        return specific.resolve()
    candidate = a.root / "asserts/ViralInvasion_Prologue_v3/plates" / ("body-overview.png" if a.shot=="body" else "bloodflow-route.png")
    if a.shot in ["body","transit","arrival"] and candidate.is_file():
        return candidate
    return a.root / DEFAULT_PLATE.relative_to(ROOT)


class ExistingSprites:
    def __init__(self, a, camera):
        self.a, self.camera = a, camera
        runtime = a.root / ".art-generated/art-runtime.json"
        self.assets = json.loads(source(runtime).read_text(encoding="utf-8"))["assets"]
        self.actors = 0

    def actor(self, name, group, position, height=.65, offset=0, attack=False):
        first = self.assets[group+".00"]
        count = first.get("animation", {}).get("frameCount", 4)
        fps = first.get("animation", {}).get("fps", 7.142857)
        rig = empty(name, position); board = empty(name+"Billboard"); board.parent = rig
        constraint = board.constraints.new("TRACK_TO"); constraint.target = self.camera
        constraint.track_axis = "TRACK_Z"; constraint.up_axis = "UP_Y"
        opacities = []
        for index in range(count):
            asset = self.assets[group+f".{index:02}"]
            src = self.a.root / "asserts" / asset["source"]
            ratio = asset.get("sourceBounds", {}).get("height", 250) / asset.get("sourceSize", {}).get("height", 512)
            full_height = height / max(.1, ratio)
            foot = asset.get("actorRegistration", {}).get("foot", {}).get("y", 435.2) / 512
            gating = []
            last = None
            for f in range(1, self.a.frames + 1):
                active = math.floor(((f-1)/FPS + offset)*fps) % count == index
                if active != last:
                    gating.append((f, 1.0 if active else 0.0)); last = active
            mat, opacity = image_material(name+f"OriginalFrame{index}", src, True, gating=gating)
            h = full_height; w = full_height
            obj = mesh(name+f"OriginalPNG{index}", [(-w/2,-h*(1-foot),0),(w/2,-h*(1-foot),0),
                       (w/2,h*foot,0),(-w/2,h*foot,0)], [(0,1,2,3)], mat, [(0,0),(1,0),(1,1),(0,1)])
            obj.parent = board
            if hasattr(obj,"visible_shadow"):obj.visible_shadow=False
            opacities.append(opacity)
        self.actors += 1
        return rig, board, opacities


def fade_actor(sockets, samples):
    for socket in sockets:
        node_value_keys(socket, samples)


def sphere(name, position, radius, mat, segments=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=6, radius=radius, location=position)
    obj = bpy.context.object; obj.name = name; obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def pulse(name, pos, begin, duration=13, radius=.55, color=None):
    mat = matte_material(name+"SoftLight", color or PALETTE["white"], emission=1.0)
    ring = curve(name, [(math.cos(i*math.tau/24)*radius, math.sin(i*math.tau/24)*radius, 0) for i in range(24)], .025, mat, True)
    ring.location = pos
    keys(ring, "scale", [(1, (.001,)*3), (begin, (.001,)*3), (begin+3, (.3,)*3),
                          (begin+duration, (1,)*3), (begin+duration+1, (.001,)*3)], "LINEAR")
    for i in range(3):
        spark = sphere(name+f"Spark{i}", pos, .045, mat, 8)
        end = (pos[0]+math.cos(i*2.1)*radius, pos[1]+math.sin(i*2.1)*radius, pos[2]+.2)
        keys(spark, "location", [(begin, pos), (begin+duration, end)], "LINEAR")
        keys(spark, "scale", [(1, (.001,)*3),(begin, (.2,)*3),(begin+3,(1,)*3),(begin+duration,(.001,)*3)], "LINEAR")


def battle(a, sprites, close=False):
    """Scattered local clashes; units enter from independent routes, never a grid."""
    count = max(6, round((22 if close else 38)*a.units))
    midpoint = 9 if close else 22
    for side, prefix, base_group in [(0,"Immune","fantasy.actor.immune.front_right."),
                                      (1,"Virus","fantasy.actor.enemy.basic.")]:
        for i in range(count):
            y = -1 + RNG.random()*23 if close else 4 + RNG.random()*47
            flank = -1 if side == 0 else 1
            x = flank*(1.5+RNG.random()*8) + math.sin(y*.2)*3
            if not close:
                x *= 1.7
            z = .22
            group = base_group + ("bite" if side == 0 and i % 4 == 0 else "windup" if side == 1 and i % 4 == 0 else "crawl" if side == 0 else "walk")
            rig, board, opacity = sprites.actor(f"{prefix}Dispersed{i:02}", group, (x,y,z),
                      height=(.78 if close else .56)*RNG.uniform(.9,1.12), offset=RNG.random()*3)
            jitter = RNG.randrange(0, 14); fight = round(a.frames*.40)+jitter
            approach = (x-flank*RNG.uniform(1.3,2.9), y+RNG.uniform(-.6,.7), z)
            strike = (approach[0]-flank*.75, approach[1]+.1, z+.04)
            retreat = (approach[0]+flank*.48, approach[1]-.25, z)
            if close and side == 0 and i % 5 == 0:
                hurt = min(a.frames-22, fight+20)
                keys(rig,"location",[(1,(x,y,z)),(fight,approach),(hurt,strike),
                      (hurt+9,(x-1.5,y-1,z)),(a.frames,(x-3.3,y-2,z))])
                keys(board,"rotation_euler",[(1,(0,0,0)),(hurt+5,(0,0,0)),(hurt+17,(0,0,-.8))])
                fade_actor(opacity, [(1,1),(hurt+9,1),(hurt+22,0),(a.frames,0)])
            elif not close and side == 1 and i % 7 == 0:
                keys(rig,"location",[(1,(x,y,z)),(fight,approach),(fight+6,strike),
                      (fight+14,(approach[0]+.7,approach[1],z)),(a.frames,(x+1,y,z))])
                fade_actor(opacity,[(1,1),(fight+8,1),(fight+23,0),(a.frames,0)])
            else:
                end = (approach[0] - (2.3 if close and side==1 else -.3)*flank,
                       approach[1]+RNG.uniform(-.8,.8),z)
                keys(rig,"location",[(1,(x,y,z)),(fight,approach),(fight+7,strike),(fight+15,retreat),
                      (min(a.frames-9,fight+32),strike),(a.frames,end)])
            if i < (8 if close else 12):
                contact = (approach[0]-flank*.4,approach[1],.38)
                pulse(f"{prefix}Impact{i}",contact,fight+6,12,.35 if close else .22,
                      PALETTE["white"] if side==0 else (.94,.73,.66,1))
    # Fine branching rose staining grows across the actual 3D ground.
    infection = matte_material("DustyRoseInfectionFront", (.72,.49,.51,1))
    for i in range(7):
        yy = 2 + RNG.random()*36
        c = curve(f"AdvancingInfectionBranch{i}",[(24+RNG.random()*4,yy,.24),(14,yy+RNG.uniform(-4,4),.24),(8,yy-RNG.uniform(1,5),.24),
                  ((-2 if close else 3),yy+RNG.uniform(-5,4),.24)], .08 if close else .055, infection)
        keys(c.data,"bevel_factor_end",[(1,.03),(a.frames,.94 if close else .56)],"LINEAR")


def import_hero(a, location, action_name="Idle_Subtle", height=1.65):
    if a.no_hero:
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source(a.root / HERO.relative_to(ROOT))))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    armatures = [obj for obj in imported if obj.type == "ARMATURE"]
    hero = empty("OriginalMedicHero_Root", location)
    for obj in imported:
        if obj.parent not in imported:
            obj.parent = hero
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for obj in imported if obj.type == "MESH" for corner in obj.bound_box]
    low = min(v.z for v in corners); high = max(v.z for v in corners)
    scale = height/max(.1,high-low); hero.scale = (scale,)*3
    hero.location.z -= low*scale
    selected = None
    for armature in armatures:
        ad = armature.animation_data_create()
        for track in list(ad.nla_tracks):
            ad.nla_tracks.remove(track)
        ad.action = None
        matches = [act for act in bpy.data.actions if action_name.lower() in act.name.lower()]
        if not matches:
            raise RuntimeError(f"Original GLB does not contain required {action_name}; imported: {[x.name for x in bpy.data.actions]}")
        selected = sorted(matches,key=lambda act:len(act.name))[0]
        track = ad.nla_tracks.new(); track.name = "OriginalAuthoredAction_Unmodified"
        strip = track.strips.new(action_name, 1, selected)
        strip.action_frame_start = selected.frame_range[0]; strip.action_frame_end = selected.frame_range[1]
        strip.repeat = a.frames / max(1, selected.frame_range[1]-selected.frame_range[0])
        strip.frame_end = a.frames+1; strip.blend_type="REPLACE"
    hero["source_file"] = str(HERO.relative_to(ROOT)); hero["original_action"] = selected.name if selected else "no-armature"
    hero.rotation_euler.z = .18
    return hero


def setup(a):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene; scene.render.engine = "BLENDER_EEVEE_NEXT" if a.engine=="eevee" else "BLENDER_WORKBENCH"
    scene.render.resolution_x=a.width; scene.render.resolution_y=a.height; scene.render.resolution_percentage=100
    scene.render.fps=FPS; scene.frame_start=1; scene.frame_end=a.frames
    scene.render.image_settings.file_format="PNG"; scene.render.image_settings.color_mode="RGB"
    scene.render.image_settings.color_depth="8"; scene.render.image_settings.compression=35
    scene.render.film_transparent=False
    if hasattr(scene,"eevee"):
        scene.eevee.taa_render_samples = a.samples or (12 if a.quality=="draft" else 32)
        if hasattr(scene.eevee,"use_raytracing"):
            scene.eevee.use_raytracing=False
    scene.view_settings.view_transform="Standard"
    try: scene.view_settings.look="Medium High Contrast" if False else "None"
    except TypeError: pass
    scene.view_settings.exposure=0; scene.view_settings.gamma=1
    scene.world = bpy.data.worlds.new("SoftIvoryAmbient"); scene.world.use_nodes=True
    bg=scene.world.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value=(.71,.77,.69,1); bg.inputs["Strength"].default_value=.75
    for name, pos, power, size, color in [("HugeSoftbox",(-18,-15,35),4200,36,(1,.95,.86)),
                  ("MintBounce",(20,12,26),2800,28,(.78,1,.91))]:
        data=bpy.data.lights.new(name,"AREA"); data.energy=power; data.shape="DISK"; data.size=size; data.color=color
        obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.location=pos
        obj.rotation_euler=(Vector((0,12,0))-obj.location).to_track_quat("-Z","Y").to_euler()
    sunlight=bpy.data.lights.new("BroadDiffuseIllustrationFill","SUN");sunlight.energy=1.2;sunlight.angle=math.radians(26)
    sun=bpy.data.objects.new("BroadDiffuseIllustrationFill",sunlight);bpy.context.collection.objects.link(sun)
    sun.rotation_euler=(math.radians(21),math.radians(-28),math.radians(-30))
    scene.render.dither_intensity=.5
    return scene


def body_scene(a):
    cam, focus = camera_shot(a,(-1,-45,18),(1,-40,17),(0,4,7),(1,5,7),lens=42,fstop=14)
    far_matte(a,cam,focus,plate_for(a),105)
    ivory=matte_material("PeripheralMembraneMatte",PALETTE["ivory"],True)
    for side in [-1,1]:
        curve("PassingPeripheralProtein",[(side*22,-18,5),(side*26,-8,11),(side*29,4,17)],.12,ivory)
    # Tiny migrating signals enter at the remote margin, never human-sized pathogens.
    rose=matte_material("TinyPeripheralInfectionSignal",(.77,.51,.56,1),emission=.25)
    for i in range(17):
        node=sphere(f"DistantInvasionTrace{i}",(10+i*.2,9,5+i*.31),.055,rose,8)
        keys(node,"location",[(1,(13+i*.2,10,9+i*.06)),(a.frames,(7+i*.14,8,2+i*.17))],"LINEAR")
    return cam,0


def front_scene(a,close):
    if close:
        cam,focus=camera_shot(a,(-12,-18,10),(-7,-12,7.5),(1,11,.7),(2,12,.7),lens=38,fstop=10)
    else:
        cam,focus=camera_shot(a,(-29,-47,39),(-19,-35,29),(1,24,.8),(3,27,.5),lens=35,fstop=15)
    far_matte(a,cam,focus,plate_for(a)); membrane_world(a,cam)
    sprites=ExistingSprites(a,cam); battle(a,sprites,close)
    return cam,sprites.actors


def orders_scene(a):
    cam,focus=camera_shot(a,(4,-11,4.2),(3,-8.8,3.5),(0,1.4,1.0),(0,1.8,1.1),lens=44,fstop=5.6)
    far_matte(a,cam,focus,plate_for(a)); membrane_world(a,cam,.5)
    hero=import_hero(a,(0,1.6,.18),"Idle_Subtle",1.75)
    sprites=ExistingSprites(a,cam)
    for i,(x,y) in enumerate([(-2.3,2.9),(1.8,3.8),(-1.5,5.3),(2.3,6.1),(-3.1,7)]):
        rig,_,_=sprites.actor(f"OriginalEscort{i}","fantasy.actor.immune.front_right.crawl",(x,y,.23),.55,i*.31)
        keys(rig,"location",[(1,(x,y+1,.23)),(a.frames*.5,(x,y,.23)),(a.frames,(x+.08,y,.23))])
    # Original construction supply artwork, rather than a replacement building design.
    bag_asset = a.root / "asserts/ViralInvasion_Expedition_v1/basePod/fixed/construction/00.png"
    if bag_asset.is_file():
        root=empty("OriginalUnbuiltOutpostSupply",(-1.1,3.3,.2)); board,_=plane_from_image("OriginalOutpostSupplyPNG",bag_asset,1.1,1.1,root,.85)
        con=board.constraints.new("TRACK_TO");con.target=cam;con.track_axis="TRACK_Z";con.up_axis="UP_Y"
    return cam,sprites.actors


def passage_scene(a,arrival=False):
    if arrival:
        cam,focus=camera_shot(a,(5,-10,5),(3,-7.5,3.3),(0,4,1),(0,5,.9),lens=39,fstop=6)
    else:
        cam,focus=camera_shot(a,(7,-12,5.9),(7,5,4.8),(0,3,1),(0,19,1),lens=35,fstop=7)
    far_matte(a,cam,focus,plate_for(a)); membrane_world(a,cam,.7)
    sprites=ExistingSprites(a,cam)
    hero=import_hero(a,(0,1,.2),"Walk" if not arrival else "Idle_Subtle",1.65)
    if hero:
        hero.rotation_euler.z=math.pi
        keys(hero,"location",[(1,(0,1,.2)),(a.frames,(0,17 if not arrival else 2.2,.2))],"LINEAR")
    for i in range(6):
        x=(-1 if i%2 else 1)*(1+i*.13);y=-.3-(i//2)*1.45
        rig,_,_=sprites.actor(f"WalkingOriginalEscort{i}","fantasy.actor.immune.front_right.crawl",(x,y,.2),.55,i*.22)
        keys(rig,"location",[(1,(x,y,.2)),(a.frames,(x,y+(16 if not arrival else 1.2),.2))],"LINEAR")
    # The approved blood-flow plate already contains the broad organic stream.
    # Only particles travel above it; extra cylinders would look like rails.
    if not arrival:
        mote=matte_material("PaleBloodstreamMote",(.90,.87,.73,1),emission=.12)
        for i in range(23):
            x=RNG.uniform(-7,7);y=RNG.uniform(-12,32);z=RNG.uniform(.3,2)
            obj=sphere(f"DriftingBloodstreamMote{i}",(x,y,z),RNG.uniform(.025,.07),mote,8)
            keys(obj,"location",[(1,(x,y,z)),(a.frames,(x+RNG.uniform(-1,1),y+18,z+.2))],"LINEAR")
    else:
        supply=a.root/"asserts/ViralInvasion_Expedition_v1/basePod/fixed/construction/00.png"
        root=empty("OriginalOutpostLandingSupply",(0,5.4,.22));board,_=plane_from_image("UnbuiltOutpostOriginalPNG",supply,1.4,1.4,root,.85)
        con=board.constraints.new("TRACK_TO");con.target=cam;con.track_axis="TRACK_Z";con.up_axis="UP_Y"
        pulse("ArrivalAnchorSoftPulse",(0,5.4,.23),12,65,1.1,PALETTE["white"])
    return cam,sprites.actors


def main():
    a=args_from_cli();scene=setup(a)
    if a.shot=="body": camera,actors=body_scene(a)
    elif a.shot in ["lung","heart"]: camera,actors=front_scene(a,a.shot=="heart")
    elif a.shot=="orders": camera,actors=orders_scene(a)
    else: camera,actors=passage_scene(a,a.shot=="arrival")
    output=a.output or a.root/"artifacts/world-prologue-v3/render"/a.shot_alias
    out_dir=output.parent if output.suffix.lower()==".png" else output
    out_dir.mkdir(parents=True,exist_ok=True)
    if a.frame_range:
        start,end=(int(v) for v in a.frame_range.split(":"));scene.frame_start=start;scene.frame_end=end
    frame=max(1,min(a.frames,a.still or 1));scene.frame_set(frame);bpy.context.view_layer.update()
    if a.save_blend:
        a.save_blend.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(a.save_blend.resolve()))
    report={"shot":a.shot,"alias":a.shot_alias,"timelineSeconds":SHOTS[a.shot],"fps":FPS,"shotFrames":a.frames,
      "resolution":[a.width,a.height],"engine":scene.render.engine,"samples":a.samples or (12 if a.quality=="draft" else 32),
      "currentFrame":frame,"originalSpriteActors":actors,"objects":len(bpy.data.objects),"originalSources":USED_SOURCES,
      "assetPolicy":"Read-only original PNG/GLB files. No material, texture, rig, model or binding changes written to game assets.",
      "approvedStyleReference":str(DEFAULT_PLATE.relative_to(ROOT)),"plate":str(plate_for(a)),
      "camera":{"lensMm":camera.data.lens,"depthOfField":camera.data.dof.use_dof},
      "heroOriginalActions":[obj.get("original_action") for obj in bpy.data.objects if obj.get("original_action")],
      "renderRequested":"still" if a.still else "animation" if a.animation else "prepare-only"}
    (out_dir/f"{a.shot_alias}-scene-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print("PROLOGUE_SCENE_READY",json.dumps({k:report[k] for k in ["shot","shotFrames","resolution","originalSpriteActors","objects","renderRequested"]}))
    if a.still is not None:
        scene.render.filepath=str(output.resolve() if output.suffix.lower()==".png" else (out_dir/f"{a.shot_alias}-{frame:04}.png").resolve())
        bpy.ops.render.render(write_still=True)
    elif a.animation:
        scene.render.filepath=str((out_dir/"frame_").resolve());bpy.ops.render.render(animation=True)


if __name__=="__main__":
    main()
