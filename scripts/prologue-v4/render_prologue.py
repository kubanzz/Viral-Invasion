"""Blender 4.5 cinematic authoring for Viral Invasion's approved v4 cinematic revision.

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
SHOTS = {"body": (0, 5), "lung": (5, 10), "heart": (10, 18),
         "orders": (18, 23), "transit": (23, 28), "arrival": (28, 33)}
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


def main():
    a=args_from_cli();scene=setup(a)
    if a.shot=="body": camera,actors=body_scene(a)
    elif a.shot in ["lung","heart"]: camera,actors=front_scene(a,a.shot=="heart")
    elif a.shot=="orders": camera,actors=orders_scene(a)
    else: camera,actors=passage_scene(a,a.shot=="arrival")
    output=a.output or a.root/"artifacts/world-prologue-v4/render"/a.shot_alias
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
