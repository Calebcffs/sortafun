import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index("--")+1:]
src, out, png, levels = argv[0], argv[1], argv[2], int(argv[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"): bpy.data.objects.remove(o, do_unlink=True)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
# merge the separate flat-shaded faces so subdivision rounds them instead of splitting
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
if levels > 0:
    sub = mesh.modifiers.new("sub", 'SUBSURF'); sub.levels = levels; sub.render_levels = levels
    while mesh.modifiers[0].name != "sub": bpy.ops.object.modifier_move_up(modifier="sub")
    bpy.ops.object.modifier_apply(modifier="sub")
for p in mesh.data.polygons: p.use_smooth = True
print("VERTS", len(mesh.data.vertices), "TRIS", sum(len(p.vertices)-2 for p in mesh.data.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_skins=True, export_apply=False, export_yup=True)
# preview render (workbench), side + 3/4
scn = bpy.context.scene
scn.render.engine = 'BLENDER_WORKBENCH'; scn.render.resolution_x = 900; scn.render.resolution_y = 500
scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'MATERIAL'
bb = [mesh.matrix_world @ mathutils.Vector(c) for c in mesh.bound_box]
ctr = sum(bb, mathutils.Vector()) / 8; size = max((max(v[i] for v in bb) - min(v[i] for v in bb)) for i in range(3))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam); scn.camera = cam
cam.location = ctr + mathutils.Vector((size*1.1, -size*1.1, size*0.35))
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
scn.render.filepath = png
bpy.ops.render.render(write_still=True)
