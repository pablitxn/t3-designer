"""Assemble the canonical T3 data + original GLB fixture library in Blender.

Works in the live MCP session or Blender --background --python. Other scenes are
preserved. Upper walls are authored but hidden for the initial cutaway view;
toggle the 'Upper walls' collection to inspect the full 2.7 m envelope.
All linear geometry and asset placements remain estimates, not a survey.
"""
from pathlib import Path
import bpy
import json
import math
import random
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OWNER='t3.current-assembly.v1'
SOURCE=ROOT/'assets/blender/t3-current-state.blend'
PREVIEW=ROOT/'assets/blender/t3-current-state.png'
scene=None
materials={}
collections={}


def enum_set(obj,key,value):
    choices=[i.identifier for i in obj.bl_rna.properties[key].enum_items]
    if value not in choices:raise ValueError((key,value,choices))
    setattr(obj,key,value)


def xyz(p):return (p[0],-p[2],p[1])


def mat(name,color,rough=.58,metal=0):
    m=bpy.data.materials.new('T3 architecture · '+name);m['owner']=OWNER
    m.diffuse_color=(*color,1);m.use_nodes=True
    n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
    materials[name]=m;return m


def attach(obj,name,collection,material=None):
    obj.name=name;obj['owner']=OWNER
    for c in list(obj.users_collection):c.objects.unlink(obj)
    collections[collection].objects.link(obj)
    if material:obj.data.materials.append(materials[material])
    return obj


def box(name,dims,pos,material='plaster',collection='Architecture',rotation=0,bevel=.004):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos))
    o=bpy.context.object;o.dimensions=(dims[0],dims[2],dims[1]);o.rotation_euler.z=rotation
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    attach(o,name,collection,material)
    if bevel:
        mod=o.modifiers.new('Fine manufactured edges','BEVEL');mod.width=bevel;mod.segments=2
    return o


def setup():
    global scene
    for old in list(bpy.data.scenes):
        if old.get('owner')==OWNER:
            for o in list(old.objects):
                if o.get('owner')==OWNER:bpy.data.objects.remove(o,do_unlink=True)
            bpy.data.scenes.remove(old)
    scene=bpy.data.scenes.new('T3 · Current apartment · estimated geometry');scene['owner']=OWNER
    scene['dimensional_status']='estimated';scene['source']='docs/snapshots/t3-apartment.json + docs/snapshots/current-fixtures.json'
    bpy.context.window.scene=scene;enum_set(scene.unit_settings,'system','METRIC');scene.unit_settings.scale_length=1
    for name in ['Architecture','Upper walls · enable for full height','Floor finishes','Openings and trim','Current fixtures','Studio']:
        c=bpy.data.collections.new(name);c['owner']=OWNER;scene.collection.children.link(c);collections[name]=c
    mat('plaster',(.79,.78,.70),.8);mat('cut',(.88,.86,.79),.65)
    mat('white',(.85,.85,.78),.38);mat('gray',(.40,.46,.45),.49);mat('blue-gray',(.19,.31,.40),.47)
    mat('glass',(.45,.63,.70),.19,.28);mat('metal',(.45,.49,.51),.23,.85)
    mat('iron',(.045,.058,.058),.4,.75);mat('grout',(.30,.31,.27),.94)
    mat('entry',(.23,.27,.24),.95);mat('bath',(.65,.66,.56),.58);mat('kitchen',(.16,.17,.15),.59)
    mat('dark',(.018,.016,.012),.9);mat('wood-base',(.45,.26,.105),.59);mat('studio',(.74,.77,.76),.9)
    for i in range(12):
        r=random.Random(i+411);f=.77+r.random()*.35
        m=mat('pine-'+str(i),(.48*f,.255*f,.093*f),.40+r.random()*.16)
        nodes=m.node_tree.nodes;n=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        coords=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');enum_set(mapping,'operation','MULTIPLY')
        mapping.inputs[1].default_value=(65,2,3);noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=3;noise.inputs['Detail'].default_value=2.4
        ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.21;ramp.color_ramp.elements[1].position=.78
        ramp.color_ramp.elements[0].color=(.28*f,.13*f,.038*f,1);ramp.color_ramp.elements[1].color=(.56*f,.33*f,.14*f,1)
        m.node_tree.links.new(coords.outputs['Generated'],mapping.inputs[0]);m.node_tree.links.new(mapping.outputs['Vector'],noise.inputs['Vector'])
        m.node_tree.links.new(noise.outputs['Fac'],ramp.inputs[0]);m.node_tree.links.new(ramp.outputs[0],n.inputs['Base Color'])


def clipped(poly,axis,value,greater):
    out=[]
    for i,b in enumerate(poly):
        a=poly[i-1];ia=a[axis]>=value if greater else a[axis]<=value;ib=b[axis]>=value if greater else b[axis]<=value
        if ia!=ib:
            t=(value-a[axis])/(b[axis]-a[axis]);out.append([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])
        if ib:out.append(b)
    return out


def floor_mesh(name,poly,y,material):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata([(x,-z,y) for x,z in poly],[],[list(reversed(range(len(poly))))]);mesh.update()
    o=bpy.data.objects.new(name,mesh);collections['Floor finishes'].objects.link(o);o['owner']=OWNER;o.data.materials.append(materials[material]);return o


def floors(data):
    for room in data['rooms']:
        poly=room['polygon'];xs=[p[0] for p in poly];zs=[p[1] for p in poly];room_id=room['id']
        floor_mesh(room['name']+' · floor base',poly,-.018,'grout')
        wooden=room_id in ['bedroom-1','bedroom-2','living','closet']
        width,length=(.105,.84) if wooden else (.40,.40) if room_id=='kitchen' else (.30,.30)
        x=min(xs);col=0
        while x<max(xs)-.001:
            z=min(zs)-length*(.5 if col%2 else 0);row=0
            while z<max(zs)-.001:
                shape=poly
                for axis,value,greater in [(0,x+.001,True),(0,x+width-.001,False),(1,z+.001,True),(1,z+length-.001,False)]:
                    if shape:shape=clipped(shape,axis,value,greater)
                if len(shape)>=3:
                    material='pine-'+str(random.Random(col*537+row*71).randrange(12)) if wooden else 'kitchen' if room_id=='kitchen' else 'entry' if room_id in ['entrance','wc'] else 'bath'
                    o=floor_mesh(room['name']+f' · finish {col}-{row}',shape,.003,material)
                    o['room_id']=room_id
                z+=length;row+=1
            x+=width;col+=1
    p=data['perimeter'];mesh=bpy.data.meshes.new('Apartment slab')
    # Solid base slab with top and lower rings, including the characteristic stepped perimeter.
    verts=[(x,-z,y) for y in [-.16,-.023] for x,z in p];n=len(p)
    faces=[list(range(n)),list(reversed(range(n,2*n)))]
    for i in range(n):j=(i+1)%n;faces.append((i,j,j+n,i+n))
    mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Apartment slab',mesh);collections['Architecture'].objects.link(o);o['owner']=OWNER;o.data.materials.append(materials['white'])
    if data.get('balcony'):floor_mesh('Balcony floor',data['balcony']['polygon'],.0,'entry')


def wall_box(w,a,b,bottom,top,collection='Architecture',material='plaster',depth=None):
    if b-a<.001 or top-bottom<.001:return
    dx=w['to'][0]-w['from'][0];dz=w['to'][1]-w['from'][1];length=math.hypot(dx,dz);u=(dx/length,dz/length)
    p=(w['from'][0]+u[0]*(a+b)/2,(top+bottom)/2,w['from'][1]+u[1]*(a+b)/2)
    return box(w['id'],(b-a,top-bottom,depth or w['thickness']),p,material,collection,-math.atan2(dz,dx),.001)


def walls(data):
    for w in data['walls']:
        length=math.dist(w['from'],w['to']);openings=[]
        for o in data['doors']:
            if o['wallId']==w['id']:openings.append((o['offset'],o['offset']+o['width'],0,o['height']))
        for o in data['windows']:
            if o['wallId']==w['id']:openings.append((o['offset'],o['offset']+o['width'],o['sillHeight'],o['sillHeight']+o['height']))
        xs=sorted(set([0,length]+[x for op in openings for x in op[:2]]));ys=sorted(set([0,1.0,w['height']]+[y for op in openings for y in op[2:]]))
        for a,b in zip(xs,xs[1:]):
            for bottom,top in zip(ys,ys[1:]):
                mx,my=(a+b)/2,(bottom+top)/2
                if any(aa<mx<bb and lo<my<hi for aa,bb,lo,hi in openings):continue
                col='Upper walls · enable for full height' if bottom>=1.0 else 'Architecture'
                wall_box(w,a,b,bottom,top,col)
        # Skirting on both sides, interrupted at doors.
        for a,b in zip(xs,xs[1:]):
            if any(aa<(a+b)/2<bb and lo<.08 for aa,bb,lo,hi in openings):continue
            wall_box(w,a,b,0,.085,'Openings and trim','gray',w['thickness']+.023)
    collections['Upper walls · enable for full height'].hide_render=True
    collections['Upper walls · enable for full height'].hide_viewport=True


def wall_frame(w,o,is_window=False):
    dx=w['to'][0]-w['from'][0];dz=w['to'][1]-w['from'][1];ln=math.hypot(dx,dz);ux,uz=dx/ln,dz/ln;angle=-math.atan2(dz,dx)
    offset=o['offset'];width=o['width'];height=o['height'];sill=o.get('sillHeight',0);finish='white' if is_window else o.get('finish','gray')
    def part(name,localx,y,width,height,depth,mat=finish,normal=0):
        x=w['from'][0]+ux*(offset+localx)-uz*normal;z=w['from'][1]+uz*(offset+localx)+ux*normal
        return box(o['id']+' · '+name,(width,height,depth),(x,y,z),mat,'Openings and trim',angle,.002)
    for x in [0,width]:part('jamb',x,sill+height/2,.052,height+.03,w['thickness']+.042)
    part('header',width/2,sill+height,width+.065,.055,w['thickness']+.04)
    if is_window:
        part('sill',width/2,sill,width+.11,.045,w['thickness']+.115)
        part('meeting stile',width/2,sill+height/2,.046,height,.08)
        for leaf in [0,1]:
            center=width*(.25+.5*leaf)
            part('glazing',center,sill+height*.55,width/2-.072,height*.83,.009,'glass')
            for edge in [-1,1]:part('casement stile',center+edge*(width/4-.032),sill+height/2,.037,height-.055,.060)
            for y in [sill+.041,sill+height-.041]:part('casement rail',center,y,width/2-.055,.042,.06)
            part('window lever',width/2+(.07 if leaf else -.07),sill+height*.48,.013,.09,.026,'metal',-.07)
            if o['kind']=='balcony-door':part('opaque lower panel',center,sill+.29,width/2-.09,.49,.038,'white')
        part('roller shutter box',width/2,sill+height+.095,width+.05,.16,.17,'white')
        if o['kind']!='balcony-door':
            part('exterior safety rail',width/2,sill+.30,width,.021,.021,'iron',-.16)
            for x in [.10,width/2,width-.10]:part('guard vertical',x,sill+.13,.017,.36,.017,'iron',-.16)
    elif o.get('appearance')=='panel':
        # Door leaves are retained; the open WC leaf is rotated clear of its opening.
        leaf=part('painted door leaf',width/2,height/2,width-.055,height-.035,.034,finish)
        for y,h in [(.32,.40),(.86,.42),(1.47,.58)]:
            part('raised panel',width/2,y,width-.18,h,.044,finish)
        part('chrome lever',width-.14,.99,.12,.014,.025,'metal',-.045)
        if o.get('condition')=='damaged-panel':
            part('observed panel damage',width*.49,1.1,.075,.12,.047,'dark')
    part('threshold',width/2,.008,width,.013,w['thickness']+.04,'wood-base')


def openings(data):
    ws={w['id']:w for w in data['walls']}
    for o in data['doors']:wall_frame(ws[o['wallId']],o)
    for o in data['windows']:wall_frame(ws[o['wallId']],o,True)
    if data.get('balcony'):
        p=data['balcony']['polygon'];x1,x2=p[0][0],p[1][0];z=p[2][1]
        for y in [.10,.99]:box('Balcony metal rail',(x2-x1,.033,.033),((x1+x2)/2,y,z),'iron','Openings and trim')
        x=x1
        while x<x2+.01:
            box('Balcony baluster',(.018,.97,.018),(x,.5,z),'iron','Openings and trim',bevel=.001);x+=.14


def fixtures(data, asset_paths=None):
    for f in data['fixtures']:
        p=asset_paths[f['assetId']] if asset_paths is not None else ROOT/'apps/web/public/models/current'/(f['assetId']+'.glb')
        previous=set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(p))
        new=set(scene.objects)-previous
        parent=bpy.data.objects.new(f['id']+' · '+f['label'],None);parent['owner']=OWNER;parent['fixture_id']=f['id'];parent['estimated']=True
        collections['Current fixtures'].objects.link(parent)
        for o in new:
            for c in list(o.users_collection):c.objects.unlink(o)
            collections['Current fixtures'].objects.link(o);o['owner']=OWNER
            if not o.parent:o.parent=parent
        parent.location=xyz(f['position']);parent.rotation_euler.z=f['rotation']
    # Existing continuous timber counter continues over the washer.
    washer=next((f for f in data['fixtures'] if f['id']=='b-washer'),None)
    if washer:
        x,y,z=washer['position'];box('Timber worktop above washer',(.60,.028,.60),(x,y+.864,z),'wood-base','Current fixtures',washer['rotation'])
    # Kitchen black splashbacks documented along the north and west worktops.
    oven=next((f for f in data['fixtures'] if f['id']=='k-oven'),None)
    sink=next((f for f in data['fixtures'] if f['id']=='k-sink'),None)
    if oven:
        x,y,z=oven['position'];box('Black cooking splashback',(1.26,.47,.015),(x+.29,1.14,z-.297),'dark','Current fixtures')
    if sink:
        x,y,z=sink['position'];box('Black sink splashback',(.94,.43,.015),(x-.3,1.12,z),'dark','Current fixtures',math.pi/2)


def studio():
    target=Vector((3.2,-4.35,.55))
    world=bpy.data.worlds.new('T3 apartment · Daylight');world.use_nodes=True
    n=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');n.inputs[0].default_value=(.50,.57,.63,1);n.inputs[1].default_value=.65;scene.world=world
    box('Studio ground',(200,.05,200),(3.2,-.25,4.2),'studio','Studio',bevel=0)
    camera_data=bpy.data.cameras.new('T3 · Axonometric current state');camera=bpy.data.objects.new(camera_data.name,camera_data);collections['Studio'].objects.link(camera);camera['owner']=OWNER
    camera.location=(12,-17,14);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();enum_set(camera_data,'type','ORTHO');camera_data.ortho_scale=13.1;scene.camera=camera
    for name,pos,power,size in [('Daylight',(-4,-10,13),2100,8),('Fill',(10,-1,12),1800,8),('North daylight',(2,6,10),1500,7)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;o=bpy.data.objects.new(name,data);o['owner']=OWNER;collections['Studio'].objects.link(o);o.location=pos;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=1900;scene.render.resolution_y=1600;scene.render.resolution_percentage=100;enum_set(scene.render.image_settings,'file_format','PNG');scene.render.filepath="//" + PREVIEW.name;scene.render.use_stamp_filename=False
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.overlay.show_overlays=False;area.spaces.active.region_3d.view_location=target;area.spaces.active.region_3d.view_distance=12
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion();enum_set(area.spaces.active.shading,'type','MATERIAL')
    bpy.ops.object.select_all(action='DESELECT')


def main(render=True):
    apartment=json.loads((ROOT/'docs/snapshots/t3-apartment.json').read_text());placed=json.loads((ROOT/'docs/snapshots/current-fixtures.json').read_text())
    setup();floors(apartment);walls(apartment);openings(apartment);fixtures(placed);studio()
    SOURCE.parent.mkdir(parents=True,exist_ok=True)
    bpy.data.libraries.write(str(SOURCE),{scene},fake_user=True,compress=True)
    if render:
        scene.render.filepath=str(PREVIEW)
        bpy.ops.render.render(write_still=True)
    print('T3_ASSEMBLY_READY',len(apartment['rooms']),'rooms',len(placed['fixtures']),'fixtures',str(SOURCE))


if __name__=='__main__':main()
