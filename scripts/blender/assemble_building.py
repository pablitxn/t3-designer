"""Create an editable public-data building context in a NEW Blender scene.

Run with Blender --background --python scripts/blender/assemble_building.py,
or through the local Blender MCP. The current scenes are never removed, loaded
from disk, or reset. The saved copy retains every original scene and opens on the new building scene.
The JSON snapshot derives from building-site.ts and the web solar module.
Blender axes: X east / Y north / Z up; units are metres.
"""
from pathlib import Path
import bpy
import json
import math
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OWNER = 't3.building-context.v1'
SNAPSHOT = ROOT / 'docs/snapshots/building-site.json'
OUTPUT = ROOT / 'assets/blender/t3-building-context.blend'
PREVIEW = ROOT / 'assets/blender/t3-building-context.png'
DATA = json.loads(SNAPSHOT.read_text())
scene = None
collections = {}
materials = {}


def enum_set(obj, prop, requested):
    """Validate the active Blender version's enum values before assigning."""
    values = [i.identifier for i in obj.bl_rna.properties[prop].enum_items]
    if requested not in values:
        raise ValueError(f'{prop}: {requested} not in {values}')
    setattr(obj, prop, requested)


def material(name, color, roughness=.7, metallic=0):
    mat = bpy.data.materials.new('Demo · ' + name)
    mat['owner'] = OWNER
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    bsdf = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    # Identifiers and socket schema were verified with describe_node_type.
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    materials[name] = mat
    return mat


def mesh_object(name, vertices, faces, group, finish):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj['owner'] = OWNER
    collections[group].objects.link(obj)
    if finish:
        mesh.materials.append(materials[finish])
    return obj


def prism(name, points, base, height, group, finish):
    xy = [(x, -z) for x, z in points]
    n = len(xy)
    # Ensure CCW top face for correct shadow and surface normals.
    signed_area = sum(xy[i][0]*xy[(i+1)%n][1]-xy[(i+1)%n][0]*xy[i][1] for i in range(n))
    if signed_area < 0:
        xy.reverse()
    vertices = [(x, y, z) for z in (base, base+height) for x, y in xy]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2*n))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    return mesh_object(name, vertices, faces, group, finish)


def courtyard_prism(building, base, height, finish):
    """Keep the source courtyard hole as an editable filled 2D curve."""
    curve = bpy.data.curves.new(building['id'] + ' footprint and courtyard', 'CURVE')
    enum_set(curve, 'dimensions', '2D')
    curve.resolution_u = 1
    # 5.2 RNA reports 3D fill items even for 2D curves; actual accepted
    # 2D values were inspected live: NONE, BACK, FRONT, BOTH.
    curve.fill_mode = 'BOTH'
    for index, ring in enumerate([building['footprint']] + building.get('holes', [])):
        xy = [(x, -z) for x, z in ring]
        signed = sum(xy[i][0]*xy[(i+1)%len(xy)][1]-xy[(i+1)%len(xy)][0]*xy[i][1] for i in range(len(xy)))
        if (signed > 0) != (index == 0):
            xy.reverse()
        spline = curve.splines.new('POLY')
        spline.points.add(len(xy)-1)
        for point, (x, y) in zip(spline.points, xy):
            point.co = (x, y, 0, 1)
        spline.use_cyclic_u = True
    curve.extrude = height/2
    obj = bpy.data.objects.new(building['id'], curve)
    obj.location.z = base+height/2
    obj['owner'] = OWNER
    collections['02 · Neighbours · IGN massing'].objects.link(obj)
    curve.materials.append(materials[finish])
    return obj


def box(name, center, dims, group, finish, angle=0):
    dx, dy, dz = (d/2 for d in dims)
    vertices = []
    for x, y, z in [(-dx,-dy,-dz),(dx,-dy,-dz),(dx,dy,-dz),(-dx,dy,-dz),
                    (-dx,-dy,dz),(dx,-dy,dz),(dx,dy,dz),(-dx,dy,dz)]:
        vertices.append((center[0]+x*math.cos(angle)-y*math.sin(angle),
                         center[1]+x*math.sin(angle)+y*math.cos(angle), center[2]+z))
    return mesh_object(name, vertices, [(3,2,1,0),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)], group, finish)


def ribbon(name, points, width, height, group, finish):
    vertices, faces = [], []
    for a, b in zip(points, points[1:]):
        ax, ay = a[0], -a[1]
        bx, by = b[0], -b[1]
        length = math.hypot(bx-ax, by-ay)
        if length < .001:
            continue
        nx, ny = -(by-ay)/length*width/2, (bx-ax)/length*width/2
        offset = len(vertices)
        vertices += [(ax+nx,ay+ny,height),(ax-nx,ay-ny,height),(bx-nx,by-ny,height),(bx+nx,by+ny,height)]
        faces.append(tuple(range(offset, offset+4)))
    return mesh_object(name, vertices, faces, group, finish)


def roof(building):
    points = list(building['footprint'])
    signed = sum(points[i][0]*(-points[(i+1)%len(points)][1])-points[(i+1)%len(points)][0]*(-points[i][1]) for i in range(len(points)))
    if signed < 0:
        points.reverse()
    n = len(points)
    cx = sum(p[0] for p in points)/n
    cy = -sum(p[1] for p in points)/n
    rise = building['roofHeight']
    eaves = building['height']
    lower = [(x,-z,eaves) for x,z in points]
    upper = [(cx+(x-cx)*.76,cy+(-z-cy)*.76,eaves+rise) for x,z in points]
    faces = [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)] + [tuple(range(n,2*n))]
    obj = mesh_object('Demo · zinc roof · estimated shape', lower+upper, faces, '01 · Demo · target', 'Zinc roof')
    obj['eaves_height_m'] = eaves
    obj['maximum_height_m'] = eaves+rise
    obj['status'] = 'Estimated shape; IGN measured vertical range only'
    return obj


def target_windows(building):
    points = [(x,-z) for x,z in building['footprint']]
    signed = sum(points[i][0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*points[i][1] for i in range(len(points)))
    if signed < 0:
        points.reverse()
    for edge, (a,b) in enumerate(zip(points,points[1:]+points[:1])):
        dx,dy = b[0]-a[0],b[1]-a[1]
        length = math.hypot(dx,dy)
        if length < 28:
            continue
        ux,uy = dx/length,dy/length
        nx,ny = uy,-ux
        angle = math.atan2(dy,dx)
        bays = max(1,round(length/3.1))
        for bay in range(bays):
            d = length*(bay+.5)/bays
            for level in range(5):
                z = 1.7+level*2.85
                center = (a[0]+ux*d+nx*.06,a[1]+uy*d+ny*.06,z)
                label = f'Estimated window · facade {edge} · bay {bay+1} · level {level+1}'
                obj = box(label+' frame', center, (1.55,.12,1.58), '03 · Facades · estimated openings', 'Window frame', angle)
                obj['status'] = 'Visual rhythm only; not surveyed; no apartment mapping'
                pane = (center[0]+nx*.073,center[1]+ny*.073,center[2])
                box(label+' glass', pane, (1.35,.024,1.38), '03 · Facades · estimated openings', 'Blue glass', angle)
                mullion = (center[0]+nx*.09,center[1]+ny*.09,center[2])
                box(label+' mullion', mullion, (.045,.03,1.4), '03 · Facades · estimated openings', 'Window frame', angle)


def text_object(name, body, position, size, finish='Ink'):
    data = bpy.data.curves.new(name, 'FONT')
    data.body = body
    data.size = size
    data.extrude = .004
    obj = bpy.data.objects.new(name,data)
    obj.location = position
    obj['owner'] = OWNER
    data.materials.append(materials[finish])
    collections['05 · North and labels'].objects.link(obj)
    return obj


def setup():
    global scene
    scene = bpy.data.scenes.new('T3 Building Sun')
    scene['owner'] = OWNER
    scene['address'] = DATA['site']['officialAddress']
    scene['coordinates'] = 'Blender: X east / Y north / Z up, metres; approximate regional solar origin'
    scene['latitude'] = DATA['site']['latitude']
    scene['longitude'] = DATA['site']['longitude']
    scene['source'] = DATA['site']['attribution']
    scene['precision'] = 'Target: IGN planar 3 m / altimetric 2.5 m. Facade positions estimated.'
    scene['terrain'] = 'Flat display ground: groundOffset metadata retained, terrain not reconstructed'
    scene['solar_date'] = DATA['solar']['date']
    scene['solar_timezone'] = DATA['solar']['timeZone']
    scene['timeline'] = 'Frame 1=00:00; each frame advances 15 min; frame 61=15:00 Europe/Paris'
    if bpy.context.window:
        bpy.context.window.scene = scene
    enum_set(scene.unit_settings, 'system', 'METRIC')
    scene.unit_settings.scale_length = 1
    for name in ['01 · Demo · target','02 · Neighbours · IGN massing','03 · Facades · estimated openings','04 · Streets and cadastre','05 · North and labels','06 · Solar and cameras']:
        col = bpy.data.collections.new(name)
        col['owner'] = OWNER
        scene.collection.children.link(col)
        collections[name] = col
    material('Warm plaster',(.74,.69,.58),.83)
    material('Zinc roof',(.28,.32,.32),.68,.32)
    material('Neighbour massing',(.53,.56,.53),.85)
    material('Neighbour roofs',(.32,.37,.35),.86)
    material('Ground',(.63,.66,.58),.95)
    material('Parcel',(.71,.70,.58),.95)
    material('Asphalt',(.25,.28,.27),.93)
    material('Path',(.49,.49,.43),.94)
    material('Cadastre edge',(.67,.40,.16),.8)
    material('Window frame',(.90,.88,.79),.56)
    material('Blue glass',(.105,.19,.23),.25,.26)
    material('Ink',(.15,.23,.21),.8)


def geometry():
    ground = [[-115,-115],[115,-115],[115,115],[-115,115]]
    prism('Site ground · flat simplification',ground,-.3,.3,'04 · Streets and cadastre','Ground')
    prism('Parcel AL0538 · 1192 m2',DATA['parcel']['footprint'],.005,.012,'04 · Streets and cadastre','Parcel')
    ring = DATA['parcel']['footprint']
    ribbon('Cadastral boundary AL0538',ring+ring[:1],.16,.05,'04 · Streets and cadastre','Cadastre edge')
    for road in DATA['roads']:
        obj = ribbon(road['name']+' · '+road['id'], road['points'],road['width'],.029,'04 · Streets and cadastre','Path' if road['isPath'] else 'Asphalt')
        obj['ign_id'] = road['id']
    for building in DATA['buildings']:
        target = building['isTarget']
        group = '01 · Demo · target' if target else '02 · Neighbours · IGN massing'
        label = 'Demo · IGN footprint · 15.5 m' if target else building['id']
        finish = 'Warm plaster' if target else 'Neighbour massing'
        if building.get('holes'):
            obj = courtyard_prism(building,0,building['height'],finish)
        else:
            obj = prism(label,building['footprint'],0,building['height'],group,finish)
        for key in ['id','rnbId','height','roofHeight','groundAltitude','groundOffset','floors','planarAccuracy','verticalAccuracy','source']:
            if building.get(key) is not None:
                obj[key] = building[key]
        obj['geometry_status'] = 'IGN footprint; flat presentation ground'
        if target:
            roof(building)
            target_windows(building)
        elif not building.get('holes'):
            # A maximum may represent a small tower, not the whole roof.
            # Keep neighbours at IGN eaves height rather than extruding a
            # point maximum across the entire footprint (one range is 22.3 m).
            top = prism(building['id']+' · roof envelope',building['footprint'],building['height'],.16,group,'Neighbour roofs')
            top['status'] = 'Neutral thin roof at IGN eaves height; roof form unresolved'
            top['source_roof_vertical_range_m'] = building['roofHeight']
    # Ground-level north indicator; +Y is true north.
    ribbon('True north shaft',[[-43,43],[-43,29]],.23,.07,'05 · North and labels','Ink')
    prism('True north arrow',[[-45,31],[-43,27],[-41,31]],.05,.09,'05 · North and labels','Ink')
    text_object('North label','N',(-44.2,-25,.10),2.7)
    text_object('Site title','DEMONSTRATION MODEL',(-29,-39,.10),2.6)
    text_object('Site subtitle','IGN + CADASTRE  /  SOLAR STUDY',(-29,-43,.10),1.1)


def lighting_and_camera():
    world = bpy.data.worlds.new('Demo · daylight ambience')
    world.use_nodes = True
    bg = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (.61,.69,.76,1)
    bg.inputs['Strength'].default_value = .45
    scene.world = world
    light = bpy.data.lights.new('Demo · astronomical sun','SUN')
    light.angle = math.radians(.533)
    light.color = (1.0,.94,.83)
    sun = bpy.data.objects.new('Sun · animated 15-minute positions',light)
    sun['owner'] = OWNER
    collections['06 · Solar and cameras'].objects.link(sun)
    enum_set(sun,'rotation_mode','QUATERNION')
    previous = None
    for sample in DATA['solar']['samples']:
        x,up,south = sample['direction']
        toward = Vector((x,-south,up))
        quat = (-toward).to_track_quat('-Z','Y')
        if previous is not None and previous.dot(quat)<0:
            quat.negate()
        previous = quat.copy()
        sun.rotation_quaternion = quat
        sun.location = toward*70
        light.energy = 2.2 if sample['isDaylight'] else 0
        frame = sample['frame']
        sun.keyframe_insert(data_path='rotation_quaternion',frame=frame)
        sun.keyframe_insert(data_path='location',frame=frame)
        light.keyframe_insert(data_path='energy',frame=frame)
        if sample['minutes']%60 == 0:
            scene.timeline_markers.new(sample['localTime']+' Paris',frame=frame)
    scene.frame_start = 1
    scene.frame_end = len(DATA['solar']['samples'])
    scene.render.fps = 8
    scene.frame_set(DATA['solar']['defaultFrame'])
    current = DATA['solar']['samples'][DATA['solar']['defaultFrame']-1]
    sun['example_utc'] = current['utc']
    sun['example_altitude_deg'] = current['altitude']
    sun['example_azimuth_deg'] = current['azimuth']
    camera_data = bpy.data.cameras.new('Demo · context camera')
    camera = bpy.data.objects.new('Camera · building and neighbours',camera_data)
    collections['06 · Solar and cameras'].objects.link(camera)
    camera.location = (65,-95,100)
    camera.rotation_euler = (Vector((0,0,4))-camera.location).to_track_quat('-Z','Y').to_euler()
    enum_set(camera_data,'type','ORTHO')
    camera_data.ortho_scale = 122
    camera_data.clip_end = 600
    scene.camera = camera
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError as error:
        raise RuntimeError('EEVEE unavailable: '+str(error)) from error
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    enum_set(scene.render.image_settings,'file_format','PNG')
    scene.render.filepath = "//" + PREVIEW.name
    scene.render.use_stamp_filename = False
    scene.render.film_transparent = False
    if bpy.context.screen:
        for area in bpy.context.screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.clip_end = 1000
                enum_set(area.spaces.active.shading,'color_type','MATERIAL')
                enum_set(area.spaces.active.region_3d,'view_perspective','CAMERA')


def save():
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    readme = bpy.data.texts.new('READ ME · Demo public-data model')
    readme.write('T3 Building Sun\n\n'+scene['source']+'\n\n'+scene['coordinates']+'\n'+scene['precision']+'\n'+scene['terrain']+'\n\n'+scene['timeline']+'\nSolar date: '+scene['solar_date']+'\n\nAll 99 building footprints and 27 road pieces derive from official public IGN data.\nWindow rhythm, roof shapes, materials and flat terrain are visual estimates.\nNo apartment or individual window has been identified.\n\nSee docs/research/building-research.md and docs/model/solar-model.md.\nRegenerate with scripts/blender/assemble_building.py.\n')
    source = bpy.data.texts.new('assemble_building.py · generator source')
    source.write(Path(__file__).read_text())
    # A copy preserves the user's working-file path and every original scene.
    # Unlike a library-only .blend this also retains a usable active UI scene.
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), copy=True, compress=True)
    print(json.dumps({'scene':scene.name,'objects':len(scene.objects),'buildings':len(DATA['buildings']),'roads':len(DATA['roads']),'solar_frames':scene.frame_end,'blend':str(OUTPUT),'preview':str(PREVIEW)},indent=2))


def main():
    setup()
    geometry()
    lighting_and_camera()
    save()
    import sys
    if '--render' in sys.argv:
        scene.render.filepath = str(PREVIEW)
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
