"""Reusable bounded upholstery geometry and original tileable textile texture.

Local web axes: X width, Y thickness (tufted face at +Y), Z depth. Rotate a
horizontal cushion about X to use it as a backrest. Never product-specific CAD.
"""
import math


def signed_power(value, exponent):
    return math.copysign(abs(value) ** exponent, value)


def cushion_mesh(dimensions, options):
    width, height, depth = dimensions
    exponent = options.get('roundness', .35)
    rows, columns = options.get('tuftRows', 0), options.get('tuftColumns', 0)
    tufts = [(width * (.9 * (c + 1) / (columns + 1) - .45),
              depth * (.9 * (r + 1) / (rows + 1) - .45))
             for r in range(rows) for c in range(columns)]
    vertices, faces = [], []
    subdivisions, segments = 32, 96
    radius = min(width, depth) * .08
    # A subdivided cube projected onto a superellipsoid samples the broad face
    # uniformly. Latitude rings cluster at the perimeter of square cushions,
    # leaving too few vertices to represent the central tuft depressions.
    power = 2 / exponent
    for axis in range(3):
        other = [index for index in range(3) if index != axis]
        for sign in (-1, 1):
            start = len(vertices)
            for j in range(subdivisions + 1):
                for i in range(subdivisions + 1):
                    point = [0., 0., 0.]
                    point[axis] = sign
                    point[other[0]] = -1 + 2 * i / subdivisions
                    point[other[1]] = -1 + 2 * j / subdivisions
                    norm = sum(abs(value)**power for value in point)**(1 / power)
                    x, y, z = [point[k] * dimensions[k] / (2 * norm) for k in range(3)]
                    if y > 0:
                        depression = sum(math.exp(-((x - tx)**2 + (z - tz)**2) / radius**2) for tx, tz in tufts)
                        y -= height * .23 * depression * (y / (height / 2))**4
                    vertices.append((x, -z, y))
            for j in range(subdivisions):
                for i in range(subdivisions):
                    a = start + j * (subdivisions + 1) + i
                    faces.append((a, a+1, a+subdivisions+2, a+subdivisions+1))

    # Piping follows the broad silhouette, joined to the same bounded mesh.
    piping_radius = min(.0015, height * .025)
    start = len(vertices)
    for i in range(segments):
        angle = math.tau * i / segments
        x = width / 2 * signed_power(math.cos(angle), exponent)
        z = depth / 2 * signed_power(math.sin(angle), exponent)
        outward = (math.cos(angle), math.sin(angle))
        for k in range(6):
            phase = math.tau * k / 6
            vertices.append((x + outward[0] * piping_radius * math.cos(phase),
                             -z - outward[1] * piping_radius * math.cos(phase),
                             height * .02 + piping_radius * math.sin(phase)))
    for i in range(segments):
        for k in range(6):
            faces.append((start + i*6+k, start + ((i+1) % segments)*6+k,
                          start + ((i+1) % segments)*6+(k+1) % 6, start + i*6+(k+1) % 6))

    # Small fabric-covered buttons occupy the tuft hollows, not free-floating discs.
    button_radius = min(.009, width * .015, depth * .015)
    for tx, tz in tufts:
        start = len(vertices)
        for j in range(9):
            latitude = -math.pi / 2 + math.pi * j / 8
            for i in range(16):
                longitude = math.tau * i / 16
                vertices.append((tx + button_radius * math.cos(latitude) * math.cos(longitude),
                                 -tz + button_radius * math.cos(latitude) * math.sin(longitude),
                                 height * .28 + button_radius * .3 * math.sin(latitude)))
        for j in range(8):
            for i in range(16):
                a, b = start + j*16+i, start + j*16+(i+1) % 16
                faces.append((a, b, b+16, a+16))
    # Weld coincident poles and discard zero-area pole quads, producing closed
    # shells even for very square profiles with small superellipse exponents.
    unique, mapping, indices = [], {}, []
    for vertex in vertices:
        key = tuple(round(value, 12) for value in vertex)
        if key not in mapping:
            mapping[key] = len(unique)
            unique.append(vertex)
        indices.append(mapping[key])
    welded_faces = []
    for face in faces:
        welded = tuple(dict.fromkeys(indices[index] for index in face))
        if len(welded) >= 3:
            welded_faces.append(welded)
    return unique, welded_faces


def textile(material, texture_kind):
    if texture_kind == 'plain':
        return
    import bpy
    size = 256
    color = tuple(material.diffuse_color[:3])
    image = bpy.data.images.new(f'Original {texture_kind} textile', width=size, height=size)
    pixels = []
    for y in range(size):
        for x in range(size):
            noise = math.sin(x * 127.1 + y * 311.7) * 43758.5453 % 1
            ribs = (.76 + .24 * (.5 + .5 * math.cos(x * math.tau / 16))**.4)
            weave = .90 + .06 * math.sin(x * math.pi / 2) * math.cos(y * math.pi / 2)
            shade = (ribs if texture_kind == 'corduroy' else weave) * (.94 + .06 * noise)
            pixels.extend((*[component * shade for component in color], 1))
    image.pixels.foreach_set(pixels)
    image.pack()
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Sheen Weight'].default_value = .25
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .3
    bump.inputs['Distance'].default_value = .0007
    links.new(texture.outputs['Color'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def add_uv(obj):
    uv = obj.data.uv_layers.new(name='Textile scale in metres')
    for face in obj.data.polygons:
        normal = face.normal
        axis = max(range(3), key=lambda index: abs(normal[index]))
        axes = [(1, 2), (0, 2), (0, 1)][axis]
        for loop in face.loop_indices:
            point = obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv = (point[axes[0]] * 10, point[axes[1]] * 10)
