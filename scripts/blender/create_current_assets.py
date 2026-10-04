"""Original photo-informed T3 assets, in metres, authored in a scoped Blender scene.

MCP: exec(compile(open(path).read(), path, 'exec'), {'__file__': path,
    '__name__': 't3_assets'}); then setup(); build_batch(...); finish().
CLI: Blender --background --python scripts/blender/create_current_assets.py
All dimensions are estimated. Source photography is evidence, not an image texture.
The user's other scenes are preserved. Only our owner-tagged scene is regenerated.
"""
from pathlib import Path
import bpy
import json
import math
import random
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/web/public/models/current'
SOURCE = ROOT / 'assets/blender/asset-library.blend'
PREVIEW = ROOT / 'assets/blender/current-assets.png'
OWNER = 't3.current-assets.v1'
SCENE_NAME = 'T3 · Current-state asset library'
SPECS = [
 ('fridge-freezer', 'Réfrigérateur congélateur inox', (.60,1.85,.64), ['photo-06','photo-11']),
 ('washing-machine', 'Lave-linge frontal', (.60,.85,.60), ['photo-02']),
 ('oven-cooktop', 'Four encastré et plaque vitrocéramique', (.60,.88,.60), ['photo-08','photo-11']),
 ('microwave', 'Micro-ondes noir', (.48,.29,.38), ['photo-08','photo-11']),
 ('extractor-hood', 'Hotte cheminée inox', (.60,.65,.48), ['photo-08','photo-11']),
 ('boiler', 'Chaudière murale blanche', (.40,.75,.30), ['photo-08','photo-11']),
 ('base-cabinet', 'Meuble bas chêne et plan noir', (.60,.90,.60), ['photo-08','photo-11']),
 ('sink-cabinet', 'Meuble évier inox et égouttoir', (.90,1.05,.60), ['photo-06','photo-11']),
 ('wall-cabinet', 'Meuble haut chêne à deux portes', (.80,.70,.32), ['photo-06','photo-11']),
 ('bathroom-vanity', 'Vasque inox sur plan bois', (.60,.88,.50), ['photo-02']),
 ('toilet', 'WC au sol avec réservoir', (.38,.78,.65), ['photo-03']),
 ('radiator', 'Radiateur blanc à éléments verticaux', (.90,.60,.10), ['photo-10','photo-07']),
 ('towel-rail', 'Sèche-serviettes blanc', (.45,.70,.10), ['photo-02']),
 ('glass-block-screen', 'Paroi en pavés de verre', (.80,2.10,.08), ['photo-02']),
 ('shower-tray', 'Receveur de douche carré', (.80,.12,.80), ['photo-02']),
 ('electrical-panel', 'Tableau électrique à deux rangées', (.38,.52,.09), ['photo-04']),
]
scene = None
materials = {}
current_root = None
built = {}


def enum_set(obj, key, value):
    choices = [i.identifier for i in obj.bl_rna.properties[key].enum_items]
    if value not in choices:
        raise ValueError(f'{key}: {value} unavailable; {choices}')
    setattr(obj, key, value)


def material(name, color, metallic=0, roughness=.5):
    mat = bpy.data.materials.new('T3 current · ' + name)
    mat['owner'] = OWNER
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    materials[name] = mat
    return mat


def raster_texture(name, oak=True):
    """Original deterministic 256px PBR base color; embedded in every dependent GLB."""
    size = 256
    img = bpy.data.images.new('T3 current · ' + name, width=size, height=size)
    img['owner'] = OWNER
    pixels = []
    for y in range(size):
        for x in range(size):
            u, v = x/size, y/size
            noise = math.sin(x*127.1+y*311.7)*43758.5453 % 1
            if oak:
                wobble = .09*math.sin(v*12)+.045*math.sin(v*31)
                grain = math.sin((u+wobble)*math.tau*32)
                fine = math.sin((u+.012*math.sin(v*19))*math.tau*103)
                knot = math.sin(math.sqrt(((u-.35)*5)**2+((v-.42)*1.8)**2)*61)
                f = .93 + .045*grain + .026*fine + .025*knot + .018*(noise-.5)
                rgb = (.56*f,.405*f,.23*f)
            else:
                f = .053 + .01*math.sin(u*21+math.sin(v*18))+.008*math.sin(v*41+u*13)+.008*noise
                rgb = (f*.86,f*.93,f)
            pixels.extend((*rgb,1))
    img.pixels.foreach_set(pixels)
    img.pack()
    mat = materials[name]
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])


def link_part(obj, name, mat):
    obj.name = f'{current_root.name} · {name}' if current_root else name
    obj['owner'] = OWNER
    if current_root:
        obj.parent = current_root
    if mat:
        obj.data.materials.append(materials[mat])
    return obj


def app_loc(v):
    return (v[0], -v[2], v[1])


def bevel(obj, width=.004, segments=3):
    if width <= 0:
        return obj
    mod = obj.modifiers.new('Rounded manufactured edges', 'BEVEL')
    mod.width = width
    mod.segments = segments
    return obj


def box(name, dims, loc, mat='white', edge=.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=app_loc(loc))
    o = bpy.context.object
    o.dimensions = (dims[0],dims[2],dims[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_part(o,name,mat)
    bevel(o,edge)
    # UVs expressed in metres, wood grain runs vertically on the front faces.
    if o.data.uv_layers.active:
        for p in o.data.polygons:
            major = max(range(3), key=lambda i: abs(p.normal[i]))
            for li in p.loop_indices:
                c = o.data.vertices[o.data.loops[li].vertex_index].co
                if major == 1: uv = (c.x*1.6+.5,c.z*1.6+.5)
                elif major == 0: uv = (c.y*1.6+.5,c.z*1.6+.5)
                else: uv = (c.x*1.6+.5,c.y*1.6+.5)
                o.data.uv_layers.active.data[li].uv = uv
    return o


def sphere(name, dims, loc, mat='white'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=.5, location=app_loc(loc))
    o=bpy.context.object
    o.dimensions=(dims[0],dims[2],dims[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_part(o,name,mat)
    for p in o.data.polygons:p.use_smooth=True
    return o


def cylinder(name, radius, depth, loc, mat='metal', axis='y', vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=app_loc(loc))
    o=bpy.context.object
    if axis=='z':o.rotation_euler[0]=math.pi/2
    if axis=='x':o.rotation_euler[1]=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    link_part(o,name,mat)
    bevel(o,.0015,2)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o


def torus(name, radius, tube, loc, mat='metal', axis='y', scale=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius,minor_radius=tube,
        major_segments=48,minor_segments=8,location=app_loc(loc))
    o=bpy.context.object
    if axis=='z':o.rotation_euler[0]=math.pi/2
    if axis=='x':o.rotation_euler[1]=math.pi/2
    if scale:o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    link_part(o,name,mat)
    for p in o.data.polygons:p.use_smooth=True
    return o


def tube(name, pts, radius, mat='metal'):
    curve=bpy.data.curves.new(name,'CURVE')
    enum_set(curve,'dimensions','3D')
    curve.resolution_u=12
    curve.bevel_depth=radius
    curve.bevel_resolution=3
    spline=curve.splines.new('POLY')
    spline.points.add(len(pts)-1)
    for p,v in zip(spline.points,pts):p.co=(*app_loc(v),1)
    o=bpy.data.objects.new(name,curve)
    scene.collection.objects.link(o)
    link_part(o,name,mat)
    # Export all authored parts as meshes; no runtime curve extension needed.
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def bowl(name, radius, depth, loc, mat='metal', ellipse=1, square=False):
    # Double-sided vessel with a real open cavity, not a solid sphere.
    profile=[(0,-depth),(.20,-depth*.98),(.48,-depth*.85),(.72,-depth*.62),
             (.88,-depth*.33),(.98,-.012),(1,0),(.98,.006),(.95,0),(.85,-depth*.29),
             (.69,-depth*.56),(.44,-depth*.78),(.20,-depth*.9),(0,-depth*.91)]
    n=48; verts=[]; faces=[]
    for r,h in profile:
        for j in range(n):
            a=math.tau*j/n
            ca,sa=math.cos(a),math.sin(a)
            if square:ca,sa=math.copysign(abs(ca)**.35,ca),math.copysign(abs(sa)**.35,sa)
            verts.append(app_loc((loc[0]+radius*r*ca,loc[1]+h,loc[2]+radius*r*sa*ellipse)))
    for i in range(len(profile)-1):
        for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);link_part(o,name,mat)
    for p in mesh.polygons:p.use_smooth=True
    return o


def handle(name,x,y,z,width=.22,vertical=False,mat='metal'):
    pts=[(-width/2,0,0),(-width/2,0,.026),(width/2,0,.026),(width/2,0,0)]
    if vertical:pts=[(0,p[0],p[2]) for p in pts]
    return tube(name,[(x+a,y+b,z+c) for a,b,c in pts],.006,mat)


def shaker(name,x,y,z,w,h):
    box(name+' inset',(w-.044,h-.044,.014),(x,y,z-.012),'oak',.001)
    for xx in [-1,1]:box(name+' stile',(.042,h,.024),(x+xx*(w-.042)/2,y,z),'oak',.0015)
    for yy in [-1,1]:box(name+' rail',(w-.084,.042,.024),(x,y+yy*(h-.042)/2,z),'oak',.0015)


def feet(w,d):
    for x in [-w/2+.06,w/2-.06]:
        for z in [-d/2+.06,d/2-.06]:cylinder('Adjustable foot',.022,.035,(x,.0175,z),'rubber')


def fridge_freezer():
    box('Insulated body',(.59,1.805,.572),(0,.9275,-.034),'silver',.014)
    box('Door gasket',(.575,1.76,.015),(0,.9375,.259),'rubber',.006)
    box('Lower freezer door',(.594,.51,.036),(0,.295,.280),'metal',.012)
    box('Upper refrigerator door',(.594,1.24,.036),(0,1.19,.280),'metal',.012)
    # Rounded vertical bar handles match the long handles in the photos.
    handle('Freezer pull',-.245,.30,.289,.30,True)
    handle('Fridge pull',-.245,.90,.289,.44,True)
    box('Brand plaque',(.055,.02,.001),(0,1.59,.300),'silver',.001)
    box('Brand mark',(.019,.024,.002),(0,1.62,.300),'white',.001)
    box('Toe ventilation',(.50,.034,.013),(0,.043,.27),'charcoal')
    for i in range(15):box('Toe slot',(.013,.019,.005),(-.224+i*.032,.043,.279),'rubber',0)
    feet(.60,.60)


def washing_machine():
    box('Enamel cabinet',(.594,.81,.538),(0,.43,-.031),'white',.012)
    box('Top cap',(.60,.026,.57),(0,.837,-.015),'white',.007)
    box('Front enamel panel',(.588,.69,.024),(0,.375,.248),'white',.008)
    box('Control fascia',(.588,.12,.029),(0,.757,.252),'white',.004)
    box('Detergent drawer',(.19,.075,.006),(-.17,.764,.270),'cream',.003)
    box('Drawer grip',(.10,.007,.007),(-.17,.741,.276),'silver',.002)
    cylinder('Program selector',.030,.021,(.005,.768,.277),'silver','z')
    cylinder('Selector face',.024,.005,(.005,.768,.290),'white','z')
    box('Program display',(.16,.056,.008),(.178,.767,.272),'charcoal',.003)
    for i in range(3):box('Display indicator',(.019,.005,.003),(.14+i*.026,.77,.277),'blue',.001)
    for i in range(4):cylinder('Control button',.006,.004,(.12+i*.029,.720,.272),'silver','z',16)
    cylinder('Recessed seal',.204,.018,(0,.404,.264),'rubber','z')
    torus('Door surround',.183,.021,(0,.404,.274),'silver','z')
    torus('Inner gasket',.154,.013,(0,.404,.289),'rubber','z')
    cylinder('Dark glass porthole',.15,.014,(0,.404,.283),'dark-glass','z',48)
    torus('Drum edge',.127,.003,(0,.404,.292),'metal','z')
    for i in range(3):
        a=i*math.tau/3
        box('Drum paddle',(.013,.053,.006),(.09*math.cos(a),.404+.09*math.sin(a),.293),'silver')
    handle('Door latch',.185,.404,.270,.095,True,'white')
    box('Bottom service panel',(.15,.075,.006),(.186,.087,.264),'cream',.003)
    feet(.60,.58)


def oven_cooktop():
    box('Oven case',(.59,.78,.54),(0,.43,-.025),'charcoal',.009)
    box('Stainless fascia',(.594,.095,.024),(0,.774,.262),'metal',.004)
    box('Status screen',(.115,.036,.006),(0,.777,.278),'dark-glass',.002)
    for x in [-.212,.212]:cylinder('Oven rotary dial',.023,.022,(x,.776,.284),'silver','z')
    box('Door steel surround',(.586,.557,.024),(0,.441,.269),'metal',.008)
    box('Door black enamel',(.55,.514,.01),(0,.431,.285),'rubber',.007)
    box('Oven smoked glass',(.448,.32,.007),(0,.413,.293),'dark-glass',.009)
    for y in [.32,.37,.42,.47,.52]:box('Rack visible through glass',(.36,.003,.003),(0,y,.298),'charcoal',.001)
    handle('Oven door handle',0,.636,.270,.47,False,'silver')
    box('Lower vent',(.54,.027,.012),(0,.112,.270),'rubber',.002)
    for i in range(14):box('Oven vent',(.024,.004,.003),(-.24+i*.037,.112,.278),'silver',0)
    box('Ceramic hob',(.60,.018,.59),(0,.871,0),'hob',.009)
    for x,z,r in [(-.15,-.15,.083),(.15,-.14,.092),(-.15,.13,.090),(.16,.14,.066)]:
        torus('Burner outer etched ring',r,.0018,(x,.881,z),'burner')
        torus('Burner inner etched ring',r-.012,.001,(x,.881,z),'burner')
    for i in range(4):box('Hob touch mark',(.010,.001,.004),(-.06+i*.04,.881,.25),'silver',0)
    feet(.60,.56)


def microwave():
    box('Black metal enclosure',(.48,.275,.351),(0,.15,-.0145),'charcoal',.011)
    box('Front surround',(.473,.265,.025),(0,.15,.166),'rubber',.006)
    box('Door glazing',(.325,.225,.008),(-.065,.15,.183),'dark-glass',.006)
    box('Door window inner border',(.272,.165,.004),(-.081,.15,.189),'charcoal',.004)
    box('Dark window',(.257,.15,.002),(-.081,.15,.192),'dark-glass',.004)
    handle('Door handle',.101,.15,.16,.17,True,'charcoal')
    box('Digital display',(.089,.04,.005),(.185,.238,.183),'dark-glass',.002)
    for i in range(4):box('Blue display segment',(.008,.002,.002),(.158+i*.017,.241,.187),'blue',0)
    for row in range(4):
        for col in range(2):box('Membrane control',(.029,.009,.002),(.166+col*.037,.197-row*.027,.185),'silver',.001)
    cylinder('Timer dial',.019,.008,(.184,.067,.187),'metal','z')
    for i in range(5):box('Side vent slot',(.002,.004,.12),(.240,.08+i*.017,-.043),'rubber',.001)
    feet(.44,.32)


def extractor_hood():
    box('Canopy lower grille',(.574,.042,.439),(0,.029,.006),'charcoal',.003)
    box('Brushed stainless canopy',(.60,.05,.48),(0,.065,0),'metal',.003)
    box('Chimney lower',(.255,.38,.20),(0,.278,-.10),'metal',.004)
    box('Chimney upper',(.25,.32,.195),(0,.49,-.10),'silver',.003)
    for i in range(3):box('Hood button',(.013,.008,.002),(-.024+i*.025,.065,.241),'rubber',.001)
    for i in range(12):box('Grease filter slat',(.42,.003,.012),(0,.006,-.18+i*.031),'silver',.001)
    for x in [-.21,.21]:cylinder('Task lamp',.025,.007,(x,.008,.165),'cream','y')


def boiler():
    box('Enamel heat-exchanger case',(.392,.66,.274),(0,.412,-.01),'white',.014)
    box('Lower control cover',(.20,.11,.009),(0,.165,.134),'cream',.020)
    cylinder('Pilot indicator',.005,.003,(0,.26,.135),'red','z',16)
    for x in [-.12,-.06,.03,.10]:
        cylinder('Copper pipe',.007,.073,(x,.038,-.008),'copper')
        cylinder('Pipe collar',.012,.018,(x,.035,-.008),'metal')
    tube('Service cable',[(-.15,.10,.05),(-.15,.02,.08),(.12,.02,.08),(.12,.10,.05)],.004,'white')
    box('Service badge',(.018,.026,.002),(-.16,.16,.130),'blue',0)


def cabinet_body(w=.60,h=.90,d=.60,counter=True):
    box('Oak cabinet carcase',(w-.016,h-.135,d-.045),(0,(h-.135)/2+.10,-.015),'oak',.003)
    box('Recessed plinth',(w-.02,.10,d-.11),(0,.05,-.045),'oak',.002)
    if counter:box('Charcoal stone worktop',(w,.036,d),(0,h-.018,0),'stone',.003)


def base_cabinet():
    cabinet_body()
    for y,h in [(.759,.17),(.51,.31),(.21,.27)]:
        shaker('Drawer',0,y,.28,.578,h)
        handle('Drawer pull',0,y+.018,.283,.29)


def sink_cabinet():
    cabinet_body(.9,.90,.60)
    for o in list(current_root.children):
        if 'carcase' in o.name:bpy.data.objects.remove(o,do_unlink=True)
    for x in [-.434,.434]:box('Sink carcase side',(.02,.765,.54),(x,.4825,-.015),'oak')
    box('Sink carcase back',(.86,.765,.018),(0,.4825,-.278),'oak')
    box('Sink carcase bottom',(.86,.02,.54),(0,.11,-.015),'oak')
    for x in [-.22,.22]:
        shaker('Sink door',x,.468,.28,.427,.727)
        handle('Door pull',x+(.15 if x<0 else -.15),.66,.283,.19,True)
    # The sink counter is constructed around a rectangular opening.
    for o in list(current_root.children):
        if 'stone worktop' in o.name:bpy.data.objects.remove(o,do_unlink=True)
    box('Counter rear rail',(.90,.036,.092),(0,.882,-.254),'stone')
    box('Counter front rail',(.90,.036,.105),(0,.882,.2475),'stone')
    box('Counter left edge',(.055,.036,.403),(-.4225,.882,-.006),'stone')
    box('Counter right edge',(.055,.036,.403),(.4225,.882,-.006),'stone')
    box('Drainer plate',(.43,.010,.41),(-.19,.892,-.008),'silver',.012)
    box('Sink right flange',(.042,.01,.41),(.386,.892,-.008),'silver',.01)
    for z in [-.20,.184]:box('Sink rim flange',(.37,.01,.026),(.20,.892,z),'silver',.01)
    # A shallow basin interior sits within a dark recess; front rim remains metal.
    box('Sink cavity',(.31,.005,.28),(.205,.790,-.008),'charcoal',.03)
    bowl('Pressed stainless sink',.165,.105,(.202,.904,-.008),'metal',ellipse=.90,square=True)
    # Hollow vessel projects below the worktop; there is only one sink.
    cylinder('Sink drain',.023,.003,(.202,.801,-.008),'silver')
    for i in range(7):box('Drainer raised flute',(.025,.005,.313),(-.34+i*.047,.900,-.008),'metal',.008)
    tube('Swan-neck tap',[(.15,.899,-.19),(.15,1.005,-.19),(.15,1.036,-.16),(.15,1.037,-.115),(.15,1.015,-.093)],.009)
    cylinder('Tap base',.020,.029,(.15,.915,-.19),'metal')
    handle('Tap lever',.215,.936,-.195,.07)


def wall_cabinet():
    box('Wall cabinet case',(.80,.70,.29),(0,.35,-.015),'oak',.003)
    for x in [-.20,.20]:
        shaker('Wall door',x,.35,.142,.391,.69)
        handle('Wall door pull',x+(.135 if x<0 else -.135),.23,.132,.19,True)


def bathroom_vanity():
    for x in [-.282,.282]:box('White cabinet side',(.02,.80,.538),(x,.40,-.01),'white',.004)
    box('White cabinet back',(.55,.80,.02),(0,.40,-.269),'white',.004)
    box('White cabinet bottom',(.55,.025,.52),(0,.0125,-.01),'white',.004)
    box('Single white drawer',(.57,.205,.025),(0,.637,.268),'white',.003)
    box('Cupboard door',(.57,.46,.025),(0,.296,.268),'white',.003)
    for y in [.63,.40]:handle('Small chrome pull',0,y,.27,.085)
    # Four separate butcher-block sections surround the round stainless bowl.
    box('Butcher block rear',(.60,.035,.115),(0,.8175,-.2325),'oak',.002)
    box('Butcher block front',(.60,.035,.125),(0,.8175,.2275),'oak',.002)
    box('Butcher block left',(.115,.035,.34),(-.2425,.8175,-.005),'oak',.002)
    box('Butcher block right',(.115,.035,.34),(.2425,.8175,-.005),'oak',.002)
    bowl('Single stainless bowl',.186,.112,(0,.835,-.005),'metal',ellipse=.97)
    cylinder('Basin waste',.022,.003,(0,.735,-.005),'silver')
    tube('Short chrome mixer',[(.21,.835,-.18),(.21,.872,-.18),(.17,.875,-.15),(.145,.868,-.13)],.011)
    cylinder('Mixer foot',.023,.025,(.21,.841,-.18),'metal')


def toilet():
    # Ceramic pedestal, real hollow bowl, lifted lid, cistern and flush button.
    sphere('Pedestal',(.255,.34,.34),(0,.17,.045),'ceramic')
    bowl('Ceramic bowl',.183,.20,(0,.407,.105),'ceramic',ellipse=1.20)
    torus('Seat ring',.163,.019,(0,.42,.105),'cream',scale=(1,1.2,1))
    box('Cistern',(.368,.357,.153),(0,.586,-.246),'ceramic',.025)
    box('Cistern lid',(.38,.03,.168),(0,.769,-.241),'ceramic',.012)
    cylinder('Flush button',.026,.004,(.09,.788,-.23),'silver')
    # Upright lid resembles the open seat in the evidence photograph.
    lid=sphere('Lifted lid',(.333,.015,.386),(0,.600,-.116),'cream')
    lid.rotation_euler[0]=math.radians(83)
    cylinder('Seat hinge',.010,.25,(0,.43,-.075),'silver','x')
    tube('Water feed',[(.19,.20,-.25),(.175,.20,-.25),(.175,.48,-.25)],.006,'silver')


def radiator():
    box('Rear heating body',(.876,.556,.043),(0,.303,-.021),'white',.012)
    for i in range(13):
        x=-.415+i*.069
        box('Vertical enamel element',(.066,.578,.050),(x,.300,.012),'white',.007)
        for j in range(6):box('Top vent groove',(.050,.001,.0025),(x,.593,-.008+j*.007),'charcoal',.001)
    tube('Lower connecting pipe',[(-.447,.056,-.018),(.447,.056,-.018)],.006,'white')
    for x in [-.437,.437]:cylinder('Valve stub',.011,.023,(x,.086,-.010),'metal','x')


def towel_rail():
    for x in [-.205,.205]:cylinder('Vertical collector',.012,.69,(x,.345,-.015),'white')
    for y in [.10,.145,.19,.235,.345,.39,.435,.48,.59,.635,.68]:
        tube('Rounded heated rail',[(-.20,y,-.015),(-.18,y,.020),(.18,y,.020),(.20,y,-.015)],.010,'white')
    for x in [-.205,.205]:
        cylinder('Valve',.015,.045,(x,.025,-.015),'white')
        for y in [.15,.59]:cylinder('Wall mount',.016,.05,(x,y,-.029),'white','z')


def glass_block_screen():
    box('White mortar base',(.80,.08,.08),(0,.04,0),'cream',.002)
    for i in range(4):
        for j in range(10):
            x=-.3+i*.2;y=.18+j*.20
            box('Translucent glass block',(.188,.188,.070),(x,y,0),'glass-block',.013)
            # Raised moulded perimeter refracts the light like the existing pavés.
            for dx in [-.079,.079]:box('Glass block vertical rim',(.008,.166,.077),(x+dx,y,0),'glass-block',.003)
            for dy in [-.079,.079]:box('Glass block horizontal rim',(.166,.008,.077),(x,y+dy,0),'glass-block',.003)
    for i in range(5):box('Mortar vertical',(.010,2.01,.08),(-.4+i*.2,1.085,0),'cream',.001)
    for j in range(11):box('Mortar horizontal',(.80,.01,.08),(0,.08+j*.20,0),'cream',.001)


def shower_tray():
    box('Tray base',(.80,.058,.80),(0,.029,0),'ceramic',.015)
    for x in [-.368,.368]:box('Raised rim',(.064,.085,.80),(x,.0775,0),'ceramic',.014)
    for z in [-.368,.368]:box('Raised rim',(.676,.085,.064),(0,.0775,z),'ceramic',.014)
    cylinder('Shower drain',.042,.004,(.245,.061,-.245),'silver')
    for i in range(4):box('Drain slot',(.044,.002,.003),(.245,.064,-.261+i*.011),'charcoal',.001)
    for j in range(5):box('Anti-slip rib',(.34,.0015,.005),(0,.059,-.10+j*.05),'cream',.002)


def electrical_panel():
    box('Aged ivory fuse cabinet',(.38,.52,.075),(0,.26,-.008),'cream',.01)
    for y in [.16,.365]:
        box('Recessed fuse rail',(.327,.108,.008),(0,y,.034),'charcoal',.001)
        for i in range(11):
            x=-.145+i*.029
            box('Circuit breaker',(.027,.084,.015),(x,y,.043),'white',.001)
            box('Breaker switch',(.017,.021,.006),(x,y+.007,.055),'silver',.001)
            box('Circuit label',(.025,.029,.001),(x,y-.064,.040),'paper',0)
    for x in [-.16,.16]:
        for y in [.025,.495]:cylinder('Case screw',.006,.004,(x,y,.032),'silver','z',16)


def low_table():
    box('Square wooden tabletop',(.65,.035,.65),(0,.4625,0),'oak',.005)
    for x in [-.27,.27]:
        for z in [-.27,.27]:box('Timber leg',(.047,.445,.047),(x,.2225,z),'oak',.002)
    for z in [-.27,.27]:box('Apron',(.54,.075,.027),(0,.402,z),'oak',.001)
    for x in [-.27,.27]:box('Apron',(.027,.075,.54),(x,.402,0),'oak',.001)


def wall_mirror():
    box('Mirror backing',(1.20,1.00,.025),(0,.50,-.005),'oak',.003)
    box('Silvered mirror face',(1.178,.975,.007),(0,.50,.012),'mirror',.001)


BUILDERS = {
 'fridge-freezer':fridge_freezer, 'washing-machine':washing_machine,
 'oven-cooktop':oven_cooktop,'microwave':microwave,'extractor-hood':extractor_hood,
 'boiler':boiler,'base-cabinet':base_cabinet,'sink-cabinet':sink_cabinet,
 'wall-cabinet':wall_cabinet,'bathroom-vanity':bathroom_vanity,'toilet':toilet,
 'radiator':radiator,'towel-rail':towel_rail,'glass-block-screen':glass_block_screen,
 'shower-tray':shower_tray,'electrical-panel':electrical_panel,'low-table':low_table,'wall-mirror':wall_mirror,
}
SPECS.append(('wall-mirror','Grand miroir de salle de bain',(1.20,1.00,.035),['photo-02']))
SPECS.append(('low-table','Petite table carrée en bois',(.65,.48,.65),['video-04@00:44']))


def setup():
    global scene, current_root
    OUT.mkdir(parents=True,exist_ok=True);SOURCE.parent.mkdir(parents=True,exist_ok=True)
    # Remove only generated data, never the user's default Scene or authored scene.
    for old in list(bpy.data.scenes):
        if old.get('owner')==OWNER:
            for o in list(old.objects):
                if o.get('owner')==OWNER:bpy.data.objects.remove(o,do_unlink=True)
            bpy.data.scenes.remove(old)
    for mats in [bpy.data.materials,bpy.data.images,bpy.data.meshes,bpy.data.curves]:
        for item in list(mats):
            if item.get('owner')==OWNER and item.users==0:mats.remove(item)
    scene=bpy.data.scenes.new(SCENE_NAME);scene['owner']=OWNER
    scene['dimensions_are_surveyed']=False
    scene['evidence']='Illustrative reconstruction; proportions estimated. Original private reference material is excluded.'
    bpy.context.window.scene=scene
    enum_set(scene.unit_settings,'system','METRIC');scene.unit_settings.scale_length=1
    current_root=None
    material('white',(.83,.85,.81),0,.30)
    material('cream',(.72,.72,.63),0,.40)
    material('ceramic',(.86,.87,.81),0,.20)
    material('metal',(.47,.52,.54),.90,.25)
    material('silver',(.57,.61,.60),.82,.37)
    material('charcoal',(.035,.041,.043),.15,.42)
    material('rubber',(.009,.012,.013),0,.58)
    material('dark-glass',(.020,.029,.031),.32,.13)
    material('glass-block',(.56,.68,.65),.12,.18)
    material('hob',(.010,.016,.020),.28,.10)
    material('burner',(.085,.09,.085),.45,.33)
    material('oak',(.56,.405,.23),0,.42)
    material('stone',(.065,.07,.075),0,.35)
    material('blue',(.012,.13,.28),.15,.28)
    material('red',(.27,.039,.028),0,.4)
    material('copper',(.46,.20,.085),.75,.42)
    material('paper',(.59,.48,.30),0,.75)
    material('mirror',(.76,.80,.80),1,.035)
    raster_texture('oak',True);raster_texture('stone',False)
    # Transmission is deliberately modest so the blocks remain legible in WebGL.
    n=next(n for n in materials['glass-block'].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    n.inputs['Transmission Weight'].default_value=.30
    n.inputs['IOR'].default_value=1.48
    print('T3_ASSET_SETUP_READY',len(SPECS),'assets; preserved scenes:',[s.name for s in bpy.data.scenes if s!=scene])


def actual_bounds(objects):
    bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in objects if o.type=='MESH' for v in o.data.vertices]
    mi=[min(v[i] for v in points) for i in range(3)]
    ma=[max(v[i] for v in points) for i in range(3)]
    return {'x':round(ma[0]-mi[0],5),'y':round(ma[2]-mi[2],5),'z':round(ma[1]-mi[1],5)}, {'x':mi[0],'y':mi[2],'z':-ma[1]}


def build_asset(asset_id):
    global current_root
    spec=next(s for s in SPECS if s[0]==asset_id)
    old_roots=[o for o in scene.objects if o.get('asset_id')==asset_id]
    for old in old_roots:
        for c in list(old.children):bpy.data.objects.remove(c,do_unlink=True)
        bpy.data.objects.remove(old,do_unlink=True)
    root=bpy.data.objects.new(asset_id,None);root['owner']=OWNER;root['asset_id']=asset_id
    root['dimensional_status']='estimated';scene.collection.objects.link(root);current_root=root
    BUILDERS[asset_id]()
    bpy.ops.object.select_all(action='DESELECT')
    parts=list(root.children)
    # Consolidate geometry by material to keep each asset practical for the web.
    by_mat={}
    for o in parts:
        if o.type=='MESH':
            bpy.context.view_layer.objects.active=o;o.select_set(True)
            for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
            o.select_set(False)
            name=o.data.materials[0].name if o.data.materials else 'none'
            by_mat.setdefault(name,[]).append(o)
    for name,objs in by_mat.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0]
        if len(objs)>1:bpy.ops.object.join()
        merged=bpy.context.object;merged.name=asset_id+' · '+name.split(' · ')[-1]
        merged.parent=root;merged['owner']=OWNER
    parts=list(root.children)
    dims,minimum=actual_bounds(parts)
    # Recenter and normalize to the declared metric bounds. Wall items also start at floor=0.
    target=spec[2]
    factors=(target[0]/dims['x'],target[2]/dims['z'],target[1]/dims['y'])
    center_x=minimum['x']+dims['x']/2;center_z=minimum['z']+dims['z']/2
    for o in parts:
        world=o.matrix_world.copy()
        for v in o.data.vertices:
            p=world@v.co
            v.co=((p.x-center_x)*factors[0],(p.y+center_z)*factors[1],(p.z-minimum['y'])*factors[2])
        o.location=(0,0,0);o.rotation_euler=(0,0,0);o.scale=(1,1,1);o.data.update()
    bpy.context.view_layer.update()
    for o in list(scene.objects):o.select_set(False)
    for o in [root,*parts]:o.select_set(True)
    bpy.context.view_layer.objects.active=root
    exp=bpy.ops.export_scene.gltf.get_rna_type().properties
    fmt=[i.identifier for i in exp['export_format'].enum_items]
    if not fmt:
        from io_scene_gltf2 import get_format_items
        fmt=[i[0] for i in get_format_items(scene,bpy.context)]
    mats=[i.identifier for i in exp['export_materials'].enum_items]
    if 'GLB' not in fmt or 'EXPORT' not in mats:raise RuntimeError('glTF exporter differs')
    bpy.ops.export_scene.gltf(filepath=str(OUT/(asset_id+'.glb')),export_format='GLB',
        use_selection=True,use_active_scene=True,export_yup=True,export_apply=True,
        export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True)
    built[asset_id]=root
    index=[s[0] for s in SPECS].index(asset_id)
    root.location=app_loc(((index%5)*1.40,(0),(index//5)*-1.50))
    current_root=None
    print('T3_ASSET_EXPORTED',asset_id,len(parts),'material groups',tuple(target))


def build_batch(ids):
    for asset_id in ids:build_asset(asset_id)


def finish(render=True):
    global current_root
    current_root=None
    entries=[]
    for aid,label,dims,evidence in SPECS:
        entries.append({'id':aid,'label':label,'url':f'/models/current/{aid}.glb',
          'dimensions':dict(zip(('x','y','z'),dims)), 'dimensionalStatus':'estimated',
          'evidence':evidence,'source':'Original Blender reconstruction from supplied photographs',
          'authoringScene':SCENE_NAME,'front':'+Z','origin':'floor-center',
          'notes':'Apariencia observada; dimensiones nominales por verificar.'})
    (OUT/'manifest.json').write_text(json.dumps({'version':1,'units':'metres','up':'+Y',
       'front':'+Z','license':'MIT',
       'assets':entries},ensure_ascii=False,indent=2)+'\n')
    world=bpy.data.worlds.new('T3 current · Neutral studio');world.use_nodes=True
    node=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    node.inputs[0].default_value=(.27,.30,.32,1);node.inputs[1].default_value=.7;scene.world=world
    # Studio floor is isolated from the exported asset selections.
    floor=box('T3 current · Studio floor',(8,.035,7),(2.8,-.06,-2.1),'cream',0)
    floor['studio_helper']=True
    data=bpy.data.cameras.new('T3 current · Library camera');camera=bpy.data.objects.new(data.name,data)
    scene.collection.objects.link(camera);camera['owner']=OWNER
    target=Vector((2.8,2.2,.5));camera.location=(9,-10,10)
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    enum_set(data,'type','ORTHO');data.ortho_scale=10.4;scene.camera=camera
    for name,pos,energy,size in [('Key',(-2,-4,8),1600,7),('Fill',(8,-1,5),1150,6),('Rim',(2,7,7),1300,6)]:
        ld=bpy.data.lights.new('T3 current · '+name,'AREA');ld.energy=energy;ld.size=size
        light=bpy.data.objects.new(ld.name,ld);scene.collection.objects.link(light);light['owner']=OWNER
        light.location=pos;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=1800;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
    enum_set(scene.render.image_settings,'file_format','PNG');scene.render.filepath="//" + PREVIEW.name;scene.render.use_stamp_filename=False
    scene.render.film_transparent=False
    # Keep the live viewport in an inspectable, photographic studio angle.
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.region_3d.view_distance=10
            area.spaces.active.region_3d.view_location=target
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            enum_set(area.spaces.active.shading,'type','MATERIAL')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.data.libraries.write(str(SOURCE),{scene},fake_user=True,compress=True)
    if render:
        scene.render.filepath=str(PREVIEW)
        bpy.ops.render.render(write_still=True)
    print('T3_LIBRARY_READY',str(SOURCE),str(PREVIEW),len(entries))


if __name__=='__main__':
    setup();build_batch([s[0] for s in SPECS]);finish()
