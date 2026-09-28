import bpy, sys
argv = sys.argv[sys.argv.index("--")+1:]
src, out, target, texmax = argv[0], argv[1], int(argv[2]), int(argv[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
for o in meshes:
    if o.data.users > 1: o.data = o.data.copy()
total = sum(tris(o) for o in meshes)
for attempt in range(4):
    cur = sum(tris(o) for o in meshes)
    if cur <= target * 1.05: break
    r = target / cur
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        m = o.modifiers.new("dec", 'DECIMATE'); m.ratio = r; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier="dec")
after = sum(tris(o) for o in meshes)
for img in list(bpy.data.images):
    if img.is_float or img.depth > 32:
        w, h = img.size
        n = bpy.data.images.new(img.name + "_8", w, h, alpha=True)
        n.pixels.foreach_set(img.pixels[:]) if False else None
        px = [0.0] * (w * h * 4); img.pixels.foreach_get(px); n.pixels.foreach_set(px)
        n.colorspace_settings.name = img.colorspace_settings.name
        img.user_remap(n)
for img in bpy.data.images:
    if img.users and img.size[0] > texmax: img.scale(texmax, max(1, int(img.size[1] * texmax / img.size[0])))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format=(argv[4] if len(argv)>4 else 'WEBP'), export_image_quality=80, export_animations=False)
print("DONE", src.split('/')[-1], total, "->", after)
