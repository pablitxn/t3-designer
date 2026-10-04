"""Photo-informed STRANDMON draft, authored from primitives and curved meshes.

Published envelope dimensions are enforced after authoring. Upholstery profiles,
seams, leg geometry, color and weave are inferred, not manufacturer CAD. The
published text and dimension illustration disagree about seat width/height.
"""
import math


def build(request, cloth):
    import bpy
    from mathutils import Vector

    parts = []
    buttons = []
    seat = request['parameters']['seatDimensions']
    # A published usable-seat width does not describe the outer cushion. The
    # photo shows the cushion continuing under the arms, almost apron-wide.
    cushion_width = request['dimensions'][0] * .76

    def web(point):
        return (point[0], -point[2], point[1])

    def mesh(name, vertices, faces, material=cloth):
        data = bpy.data.meshes.new(name)
        data.from_pydata([web(v) for v in vertices], [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(material)
        for face in data.polygons:
            face.use_smooth = True
        uv = data.uv_layers.new(name='Fabric weave')
        for face in data.polygons:
            for loop in face.loop_indices:
                coordinate = data.vertices[data.loops[loop].vertex_index].co
                uv.data[loop].uv = ((coordinate.x + coordinate.y) * 2, coordinate.z * 2)
        parts.append(obj)
        return obj

    def power(value, exponent):
        return math.copysign(abs(value) ** exponent, value)

    def pillow(name, dims, center, exponent=.35, deform=None):
        vertices, faces = [], []
        rings, segments = 32, 64
        for j in range(rings + 1):
            latitude = -math.pi / 2 + math.pi * j / rings
            for i in range(segments):
                longitude = math.tau * i / segments
                local = [dims[0] / 2 * power(math.cos(latitude), exponent) * power(math.cos(longitude), exponent),
                         dims[1] / 2 * power(math.sin(latitude), exponent),
                         dims[2] / 2 * power(math.cos(latitude), exponent) * power(math.sin(longitude), exponent)]
                point = [center[k] + local[k] for k in range(3)]
                vertices.append(deform(point, local) if deform else point)
        for j in range(rings):
            for i in range(segments):
                a, b = j * segments + i, j * segments + (i + 1) % segments
                faces.append((a, b, b + segments, a + segments))
        return mesh(name, vertices, faces)

    def catmull(points, steps=8, closed=False):
        values = [Vector(p) for p in points]
        expanded = [values[-1], *values, values[0], values[1]] if closed else [values[0], *values, values[-1]]
        result = []
        for i in range(1, len(expanded) - 2):
            a, b, c, d = expanded[i - 1:i + 3]
            for j in range(steps):
                t = j / steps
                point = .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t*t
                              + (-a + 3 * b - 3 * c + d) * t*t*t)
                result.append(tuple(point))
        if not closed:
            result.append(tuple(values[-1]))
        return result

    def tube(name, points, radius=.002, material=cloth, closed=False, smooth=True):
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '3D'
        curve.resolution_u = 1
        curve.bevel_depth = radius
        curve.bevel_resolution = 3
        spline = curve.splines.new('POLY')
        values = catmull(points, 6, closed) if smooth else points
        spline.points.add(len(values) - 1)
        for point, value in zip(spline.points, values):
            point.co = (*web(value), 1)
        spline.use_cyclic_u = closed
        obj = bpy.data.objects.new(name, curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(material)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target='MESH')
        for face in obj.data.polygons:
            face.use_smooth = True
        parts.append(obj)
        return obj

    # Original raster texture: no retail photo is copied into the model.
    size = 256
    color = tuple(cloth.diffuse_color[:3])
    image = bpy.data.images.new('Inferred woven charcoal fabric', width=size, height=size)
    pixels = []
    for y in range(size):
        for x in range(size):
            noise = math.sin(x * 127.1 + y * 311.7) * 43758.5453 % 1
            weave = .85 + .15 * noise + .055 * math.sin(x * math.pi) + .045 * math.cos(y * math.pi / 2)
            pixels.extend((*[component * weave for component in color], 1))
    image.pixels.foreach_set(pixels)
    image.pack()
    bsdf = cloth.node_tree.nodes.get('Principled BSDF')
    texture = cloth.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    cloth.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Sheen Weight'].default_value = .22
    piping = cloth.copy()
    piping.name = 'Charcoal stitched piping'
    wood = bpy.data.materials.new('Inferred black stained legs')
    wood.use_nodes = True
    wood.diffuse_color = (.009, .010, .010, 1)
    wood.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = wood.diffuse_color
    wood.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .4

    # Compact lower apron; four tapered, slightly splayed black legs.
    apron = pillow('Upholstered lower apron', (.64, .20, .73), (0, .26, .035), .22)
    for x in (-1, 1):
        for z in (-1, 1):
            bottom = Vector(web((x * .276, 0, z * .31)))
            top = Vector(web((x * .254, .195, z * .284)))
            bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=.014, radius2=.024,
                                           depth=(top - bottom).length, location=(top + bottom) / 2)
            leg = bpy.context.object
            leg.name = f'Tapered black leg {x} {z}'
            leg.rotation_euler = (top - bottom).to_track_quat('Z', 'Y').to_euler()
            leg.data.materials.append(wood)
            for face in leg.data.polygons:
                face.use_smooth = True
            parts.append(leg)

    # Separate cushion: useful seat width is provisional evidence; the wider
    # outer cushion is a photo-informed approximation, not a published measure.
    cushion = pillow('Separate seat cushion', (cushion_width, .105, seat[2]), (0, seat[1] - .0525, .16), .28)
    seat_parts = [cushion]
    for y in (seat[1] - .010, seat[1] - .095):
        exponent = .28
        local_y = y - (seat[1] - .0525)
        radius = (1 - (abs(local_y) / .0525) ** (2 / exponent)) ** (exponent / 2)
        boundary = [(cushion_width / 2 * radius * power(math.cos(math.tau*i/128), exponent), y,
                     .16 + seat[2]/2 * radius * power(math.sin(math.tau*i/128), exponent)) for i in range(128)]
        seat_parts.append(tube('Seat cushion welt', boundary, .0015, piping, True, False))

    # Back pillow leans rearward. Five real depressions accompany the buttons.
    button_y = .695
    button_x = [-.19, -.095, 0, .095, .19]

    def back_deform(point, local):
        point[2] -= (point[1] - .70) * .40
        if local[2] > 0:
            for x in button_x:
                distance = ((point[0] - x) / .023) ** 2 + ((point[1] - button_y) / .029) ** 2
                point[2] -= .012 * math.exp(-distance / 2)
        return point

    pillow('Tall buttoned back cushion', (.56, .59, .145), (0, .695, -.245), .30, back_deform)
    for x in button_x:
        y = button_y
        # A shallow fabric-covered button remains visible in its tufted dimple.
        z = -.245 + .0725 - (y - .70) * .40 - .006
        button = pillow('Fabric covered back button', (.022, .022, .006), (x, y, z), .85)
        buttons.append(button)

    # Continuous side panels trace the distinctive S curve from wing to arm.
    outline = [(.405, .17), (-.34, .18), (-.465, .89), (-.435, .985), (-.32, .996),
               (-.235, .972), (-.155, .83), (-.105, .705), (-.01, .606),
               (.22, .617), (.375, .647), (.438, .615), (.412, .54)]
    for sign in (-1, 1):
        contour = catmull([(0, y, z) for z, y in outline], 5, True)
        vertices = []
        for outer in (False, True):
            for _, y, z in contour:
                # A planar main panel avoids triangulation artefacts across a
                # large concave n-gon; the bevel and roll supply the soft edges.
                center = .324 + .014 * (z + .465) / .9 + .009 * (y - .65) / .35
                vertices.append((sign * (center + (.041 if outer else -.041)), y, z))
        n = len(contour)
        faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2*n))]
        faces.extend((i, (i+1) % n, (i+1) % n + n, i+n) for i in range(n))
        side = mesh(f'Continuous wing and arm side {sign}', vertices, faces)
        bpy.ops.object.select_all(action='DESELECT')
        side.select_set(True)
        bpy.context.view_layer.objects.active = side
        bevel = side.modifiers.new('Soft upholstered panel edge', 'BEVEL')
        bevel.width, bevel.segments = .021, 4
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        for face in side.data.polygons:
            if len(face.vertices) > 4:
                face.use_smooth = False
        # A generous welt roll follows the upper/front edge, curling at the arm.
        roll = [(sign*.345, .495, .411), (sign*.35, .572, .428), (sign*.36, .618, .446),
                (sign*.372, .652, .41), (sign*.375, .651, .355), (sign*.35, .625, .21),
                (sign*.326, .613, .04), (sign*.309, .65, -.077), (sign*.31, .775, -.137),
                (sign*.328, .939, -.22), (sign*.345, .985, -.29), (sign*.337, .999, -.38),
                (sign*.314, .963, -.445)]
        tube(f'Rolled wing and arm rim {sign}', roll, .027)
        tube(f'Visible side tailoring seam {sign}', [(sign*.375, .175, .392), (sign*.375, .48, .414),
                (sign*.383, .6, .426), (sign*.391, .634, .386), (sign*.368, .604, .23),
                (sign*.353, .591, .04), (sign*.35, .65, -.099), (sign*.359, .805, -.158),
                (sign*.372, .974, -.267)], .0016, piping)

    # Bake geometry to the metric floor-centred web envelope. No invisible
    # bounding boxes or export-only scaling supply the published dimensions.
    bpy.context.view_layer.update()
    all_points = [obj.matrix_world @ vertex.co for obj in parts for vertex in obj.data.vertices]
    lower = [min(p[i] for p in all_points) for i in range(3)]
    upper = [max(p[i] for p in all_points) for i in range(3)]
    target = (request['dimensions'][0], request['dimensions'][2], request['dimensions'][1])
    factors = [target[i] / (upper[i] - lower[i]) for i in range(3)]
    center = [(lower[0] + upper[0]) / 2, (lower[1] + upper[1]) / 2, lower[2]]
    for obj in parts:
        transform = obj.matrix_world.copy()
        for vertex in obj.data.vertices:
            point = transform @ vertex.co
            vertex.co = [(point[i] - center[i]) * factors[i] for i in range(3)]
        obj.matrix_world.identity()
    # Actual cushion bounds are reported separately; bounding-box normalization
    # is not evidence that an ambiguous nominal usable-seat dimension is exact.
    seat_points = [vertex.co for vertex in cushion.data.vertices]
    seat_min = [min(p[i] for p in seat_points) for i in range(3)]
    seat_max = [max(p[i] for p in seat_points) for i in range(3)]
    cushion_depth_center = (seat_min[1] + seat_max[1]) / 2
    forward_shift = request['dimensions'][2] / 2 - .003 - (seat[2] / 2 - cushion_depth_center)
    for obj in seat_parts:
        for vertex in obj.data.vertices:
            vertex.co.x /= factors[0]
            vertex.co.y = cushion_depth_center + (vertex.co.y - cushion_depth_center) / factors[1] - forward_shift
            vertex.co.z += seat[1] - seat_max[2]
    seat_points = [vertex.co for vertex in cushion.data.vertices]
    seat_min = [min(p[i] for p in seat_points) for i in range(3)]
    seat_max = [max(p[i] for p in seat_points) for i in range(3)]
    # Keep the apron beneath the advanced cushion, with a small overlap rather
    # than a dark unsupported gap. All changes stay inside the outer envelope.
    apron_points = [vertex.co for vertex in apron.data.vertices]
    apron_min = [min(p[i] for p in apron_points) for i in range(3)]
    apron_max = [max(p[i] for p in apron_points) for i in range(3)]
    apron_target_top = seat_min[2] + .005
    apron_forward_shift = (-seat_min[1] - .005) - (-apron_min[1])
    for vertex in apron.data.vertices:
        vertex.co.z = apron_min[2] + (vertex.co.z - apron_min[2]) * (apron_target_top - apron_min[2]) / (apron_max[2] - apron_min[2])
        vertex.co.y -= apron_forward_shift
    return parts, {'recipe': 'photo-informed-strandmon-draft', 'version': 1,
                   'fidelityStatus': 'draft-needs-visual-review', 'buttonCount': len(buttons),
                   'seatNominalTextDimensions': seat,
                   'cushionMeshDimensions': [seat_max[0]-seat_min[0], seat_max[2]-seat_min[2], seat_max[1]-seat_min[1]],
                   'cushionMeshTopHeight': seat_max[2],
                   'cushionWidthStatus': 'inferred; distinct from published usable seat width',
                   'normalizationScaleXYZ': [factors[0], factors[2], factors[1]],
                   'inferred': ['all unpublished upholstery profiles and seam positions',
                                'leg shape and splay', 'fabric color and generated weave',
                                'cushion outer width/thickness and apron contact profile; useful seat width is separate']}
