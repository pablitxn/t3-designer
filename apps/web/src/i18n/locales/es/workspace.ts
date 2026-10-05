const workspace = {
  "rooms": {
    "bedroom-1": "Habitación 1",
    "bedroom-2": "Habitación 2",
    "living": "Living / comedor",
    "entrance": "Entrada",
    "wc": "WC",
    "bathroom": "Baño",
    "kitchen": "Cocina",
    "closet": "Placard",
    "balcony": "Balcón",
    "unknown": "Ambiente"
  },
  "apartment": {
    "modelAria": "Modelo del departamento con luz solar",
    "caption": "Nuestro T3",
    "sunInDemo": "Sol en la demo",
    "cameraView": "Vista de cámara",
    "perspective": "Perspectiva",
    "plan": "Planta",
    "resetView": "Reiniciar vista",
    "hideBuilding": "Ocultar edificio",
    "showBuilding": "Mostrar edificio",
    "interiorSunlight": "Luz solar y sombras interiores",
    "ambientReference": "Sin sol directo · Luz ambiental de referencia",
    "navigationHelp": "Arrastrar: orbitar · Rueda: zoom · Botón derecho: desplazar",
    "modelLayers": "Capas del modelo",
    "cutaway": "Corte",
    "fixtures": "Equipamiento",
    "labels": "Rótulos",
    "inspectorAria": "Explorar el departamento y la luz solar",
    "insideEyebrow": "Adentro del T3",
    "tagline": "Tu casa, a la luz del día.",
    "inspectorContents": "Contenido del inspector",
    "sunTab": "Sol",
    "roomsTab": "Ambientes",
    "assetsTab": "Equipamiento",
    "observeLight": "Observar la luz por ambiente",
    "lookAtLight": "Mirar la luz en",
    "focusRoom": "Enfocar ambiente",
    "allApartment": "Todo el T3",
    "living": "Living",
    "bedroomOne": "Habitación 1",
    "bedroomTwo": "Habitación 2",
    "compareSeasons": "Comparar estaciones",
    "lightInstruction": "Mové la hora y compará estaciones para ver hasta dónde entra el sol por las ventanas.",
    "livingFacade": "Living",
    "bedroomsFacade": "Habitaciones",
    "estimatedOrientation": "Orientación estimada",
    "buildingShadowTitle": "El edificio también da sombra.",
    "buildingShadowBody": "Mostrarlo u ocultarlo solo cambia la vista. Sus sombras y las de los vecinos siguen presentes; el corte conserva el efecto de muros y techo.",
    "sunLocationPrecision": "Ubicación y precisión del sol",
    "placementUnconfirmed": "Piso, posición y orientación quedan por confirmar.",
    "sunMethod": "La posición solar usa un origen regional aproximado (48° N, 4° O) y Europe/Paris. La geometría es ilustrativa; no representa un estudio de radiación del inmueble.",
    "placementAssumption": "Posición ilustrativa: tercera planta, living al suroeste y habitaciones al noreste.",
    "unknownAsset": "Elemento",
    "sunSource": "Cálculo solar · NOAA / Meeus ↗",
    "fullView": "Vista completa",
    "materials": "Materiales existentes",
    "roomArea": "{{area}}",
    "assetCountNote": "{{count}} elementos colocados. Elegí un elemento para ver sus dimensiones y su ambiente.",
    "assetDimensions": "ancho × alto × fondo",
    "estimatedDimensions": "Dimensiones estimadas",
    "downloadGlb": "Descargar GLB ↗",
    "evidenceSources": "Fuentes y alcance",
    "reportedArea": "{{area}}",
    "extraArea": "{{area}} · balcón",
    "canvasFallback": "La vista del departamento necesita WebGL. Activá la aceleración gráfica del navegador.",
    "canvasAria": "Modelo 3D del departamento con luz solar por sus ventanas. Arrastrar para orbitar, rueda para acercar.",
    "roomLabelsAria": "Nombres de ambientes y superficies declaradas",
    "parquet": "Parquet existente",
    "parquetRooms": "Living y dormitorios",
    "darkTile": "Cerámica oscura",
    "darkTileRooms": "Cocina",
    "lightTile": "Cerámica clara",
    "lightTileRooms": "Baño",
    "greenGrayFloor": "Piso gris verdoso",
    "greenGrayFloorRooms": "Entrada y WC",
    "blueGrayPaint": "Pintura azul gris",
    "blueGrayPaintRooms": "Marcos de servicio",
    "footerTitle": "Departamento + sol",
    "footerDescription": "Geometría de demostración conservada, con origen solar regional aproximado.",
    "wallHeight": "Altura: {{height}}",
    "estimated": "estimada"
  },
  "assets": {
    "fridge-freezer": {
      "label": "Heladera con freezer",
      "evidence": "P06 / P11 · acero inoxidable, dos puertas"
    },
    "washing-machine": {
      "label": "Lavarropas frontal",
      "evidence": "P02 · frontal blanco bajo mesada"
    },
    "oven-cooktop": {
      "label": "Horno y placa",
      "evidence": "P08 / V02 · horno negro y placa de cuatro zonas"
    },
    "microwave": {
      "label": "Microondas",
      "evidence": "P08 / P11 · negro, sobre mesada"
    },
    "extractor-hood": {
      "label": "Campana extractora",
      "evidence": "P08 · campana y chimenea de acero"
    },
    "boiler": {
      "label": "Caldera mural",
      "evidence": "P06 / P11 · carcasa blanca"
    },
    "base-cabinet": {
      "label": "Mueble bajo de cocina",
      "evidence": "P06 / P08 / V02 · roble, frentes enmarcados"
    },
    "sink-cabinet": {
      "label": "Mueble con pileta y escurridor",
      "evidence": "P06 / P11 · una pileta de acero"
    },
    "wall-cabinet": {
      "label": "Alacena",
      "evidence": "P06 / P11 · roble, dos hojas"
    },
    "bathroom-vanity": {
      "label": "Vanitory y lavabo",
      "evidence": "P02 · un lavabo circular de acero; el segundo es un reflejo"
    },
    "toilet": {
      "label": "Inodoro",
      "evidence": "P03 / V04 · cerámica blanca"
    },
    "radiator": {
      "label": "Radiador",
      "evidence": "P07 / P10 / V04 · panel blanco"
    },
    "towel-rail": {
      "label": "Toallero radiador",
      "evidence": "P02 · blanco, visible en espejo"
    },
    "glass-block-screen": {
      "label": "Mampara de bloques de vidrio",
      "evidence": "P02 / V04 · bloques translúcidos"
    },
    "shower-tray": {
      "label": "Receptor de ducha",
      "evidence": "V04 03s · receptor elevado blanco"
    },
    "electrical-panel": {
      "label": "Tablero eléctrico",
      "evidence": "P04 · sobre paso entrada–living"
    },
    "low-table": {
      "label": "Mesa baja de madera",
      "evidence": "V04 44s · junto al acceso al balcón"
    },
    "wall-mirror": {
      "label": "Espejo de baño",
      "evidence": "P02 · sobre lavabo y lavarropas"
    }
  },
  "fixtures": {
    "retry": "Reintentar",
    "failed": "No se pudo cargar: {{label}}"
  },
  "reconstruction": {
    "note1": "Pisos, colores, aberturas y equipamiento reconstruidos con 11 fotos y 4 videos.",
    "note2": "Las superficies provienen del plano. Medidas lineales, alturas y posiciones son estimaciones.",
    "note3": "Cocina en U, acceso al balcón y separación entre dormitorios ajustados según los videos.",
    "note4": "La distribución precisa de la ducha y la mampara queda pendiente de un plano medido del baño.",
    "note5": "Desgaste representativo; esta base todavía no reproduce cada rotura o irregularidad."
  },
  "building": {
    "sceneAria": "Edificio y entorno en tres dimensiones",
    "locationEyebrow": "El edificio y su entorno",
    "location": "Referencia regional aproximada · Europe/Paris",
    "camera": "Cámara del edificio",
    "navigationHelp": "Arrastrar para orbitar · Rueda para acercar",
    "buildingLayers": "Capas del edificio",
    "neighbors": "Vecinos",
    "solarOrbit": "Órbita solar",
    "department": "Nuestro departamento",
    "apartmentLocationTitle": "El T3, en su lugar.",
    "apartmentFloor": "T3 · {{floor}}.er piso estimado",
    "courtyardAssumption": "Fachada al patio · Posición ilustrativa.",
    "buildingCuts": "Cortes del edificio",
    "wholeBuilding": "Completo",
    "floorCut": "Corte de piso",
    "interior": "Ver interior",
    "wholeBuildingLink": "Ver edificio completo ↗",
    "locateApartment": "Ubicar mi departamento ↗",
    "exploreApartment": "Explorar luz en el departamento",
    "solarStudy": "Estudio solar",
    "annualLightLine1": "La luz, a lo largo",
    "annualLightLine2": "del año.",
    "sharedMoment": "La misma fecha y hora en ambas vistas.",
    "evidencePrecision": "Fuentes y precisión",
    "nationalBuildingRegister": "Registro Nacional de Edificios ↗",
    "registerDescription": "Guía del registro; el ejemplo usa identificadores propios. {{address}}.",
    "ignTopo": "IGN · BD TOPO ↗",
    "ignDescription": "Geometría adaptada y generalizada. Altura del modelo: {{height}}; {{floors}} plantas. Incertidumbre original: {{planar}} en planta y {{vertical}} en altura.",
    "cadastre": "Método catastral · ejemplo {{label}} ↗",
    "parcelDescription": "Área ilustrativa de {{area}}; no identifica una parcela real.",
    "modelScope": "Contexto local de unos {{radius}} conservado para sombras. El origen solar no geolocaliza la geometría. Suelo, cubiertas y aberturas aproximados. {{assumption}}",
    "solarSource": "Cálculo solar · NOAA / Meeus ↗",
    "solarDescription": "Posición solar astronómica y sombras sobre este modelo. No incluye nubes ni vegetación, y no es un estudio de radiación. Los horarios de salida y puesta usan un horizonte ideal.",
    "dataConsulted": "Geometría adaptada de fuentes consultadas el {{date}}. {{attribution}}.",
    "canvasFallback": "La vista del edificio necesita WebGL. Activá la aceleración gráfica del navegador.",
    "canvasAria": "Modelo 3D de edificio de demostración y contexto local con sombras solares",
    "labelOverlayAria": "Rótulos del edificio, puntos cardinales y posición del sol",
    "apartmentLabel": "Nuestro T3",
    "sunLabel": "Sol · {{altitude}}°",
    "north": "N",
    "south": "S",
    "east": "E",
    "west": "O",
    "buildingPart": "Edificio",
    "apartmentKey": "Nuestro T3",
    "contextKey": "Entorno",
    "footerTitle": "Edificio + sol",
    "footerDescription": "Geometría de contexto conservada · Identificadores generalizados · Posición ilustrativa del T3",
    "mapLink": "Método de datos geográficos ↗",
    "demoName": "Edificio de demostración"
  },
  "solar": {
    "chartAria": "Altura del sol a lo largo del día; la marca señala la hora elegida",
    "dayOfYear": "Día del año",
    "compareSeasons": "Comparar estaciones",
    "spring": "Primavera",
    "summer": "Verano",
    "autumn": "Otoño",
    "winter": "Invierno",
    "localTime": "Hora del ejemplo",
    "demoLocalTime": "Hora local · Europe/Paris",
    "pauseDay": "Pausar recorrido del día",
    "playDay": "Reproducir recorrido del día",
    "moveTime": "Mover la hora del día",
    "daylight": "Sol sobre el horizonte",
    "daylightDescription": "Luz directa y sombras",
    "noDirectSun": "Sol bajo el horizonte",
    "noDirectSunDescription": "Sin iluminación solar directa",
    "adjustedTime": "Esta hora no existe por el cambio de horario. Ajustamos a las {{time}}.",
    "ambiguousTime": "Esta hora ocurre dos veces. Se muestra la primera, antes del cambio de horario.",
    "altitude": "Altura solar",
    "azimuth": "Azimut",
    "aboveHorizon": "Sobre el horizonte",
    "trueNorth": "Desde el norte real",
    "dayPath": "Recorrido solar del día",
    "dayPathTitle": "El recorrido del día",
    "daylightDuration": "{{hours}} h {{minutes}} min de luz",
    "sunrise": "↑ Salida",
    "solarNoon": "Mediodía solar",
    "goToSolarNoon": "Ir al mediodía solar",
    "sunset": "↓ Puesta",
    "dayProgress": "Recorriendo el día",
    "playFullDay": "Reproducir un día completo",
    "fullDaySpeed": "24 h en 24 s",
    "noSunDirect": "Sin sol directo",
    "hours": "h"
  }
} as const

export default workspace
