const workspace = {
  "rooms": {
    "bedroom-1": "Chambre 1",
    "bedroom-2": "Chambre 2",
    "living": "Séjour / salle à manger",
    "entrance": "Entrée",
    "wc": "WC",
    "bathroom": "Salle de bains",
    "kitchen": "Cuisine",
    "closet": "Placard",
    "balcony": "Balcon",
    "unknown": "Pièce"
  },
  "apartment": {
    "modelAria": "Modèle de l’appartement avec la lumière du soleil",
    "caption": "Notre T3",
    "sunInDemo": "Soleil dans la démo",
    "cameraView": "Vue de la caméra",
    "perspective": "Perspective",
    "plan": "Plan",
    "resetView": "Réinitialiser la vue",
    "hideBuilding": "Masquer l’immeuble",
    "showBuilding": "Afficher l’immeuble",
    "interiorSunlight": "Soleil et ombres intérieures",
    "ambientReference": "Pas de soleil direct · Lumière ambiante de référence",
    "navigationHelp": "Faire glisser pour orbiter · Molette pour zoomer · Clic droit pour déplacer",
    "modelLayers": "Calques du modèle",
    "cutaway": "Coupe",
    "fixtures": "Équipements",
    "labels": "Étiquettes",
    "inspectorAria": "Explorer l’appartement et la lumière du soleil",
    "insideEyebrow": "À l’intérieur du T3",
    "tagline": "Votre chez-vous à la lumière du jour.",
    "inspectorContents": "Contenu du panneau",
    "sunTab": "Soleil",
    "roomsTab": "Pièces",
    "assetsTab": "Équipements",
    "observeLight": "Observer la lumière par pièce",
    "lookAtLight": "Observer la lumière dans",
    "focusRoom": "Centrer sur une pièce",
    "allApartment": "Tout le T3",
    "living": "Séjour",
    "bedroomOne": "Chambre 1",
    "bedroomTwo": "Chambre 2",
    "compareSeasons": "Comparer les saisons",
    "lightInstruction": "Faites varier l’heure et comparez les saisons pour voir jusqu’où le soleil entre par les fenêtres.",
    "livingFacade": "Séjour",
    "bedroomsFacade": "Chambres",
    "estimatedOrientation": "Orientation estimée",
    "buildingShadowTitle": "L’immeuble projette aussi son ombre.",
    "buildingShadowBody": "L’afficher ou le masquer ne change que la vue. Ses ombres et celles des immeubles voisins restent présentes ; la coupe conserve l’effet des murs et du toit.",
    "sunLocationPrecision": "Emplacement et précision du soleil",
    "placementUnconfirmed": "L’étage, la position et l’orientation restent à confirmer.",
    "sunMethod": "La position solaire utilise une origine régionale approximative (48° N, 4° O) et Europe/Paris. La géométrie est illustrative ; ce n’est pas une étude d’irradiation du bien.",
    "placementAssumption": "Placement illustratif : troisième étage, séjour au sud-ouest et chambres au nord-est.",
    "unknownAsset": "Élément",
    "sunSource": "Calcul solaire · NOAA / Meeus ↗",
    "fullView": "Vue d’ensemble",
    "materials": "Matériaux existants",
    "roomArea": "{{area}}",
    "assetCountNote": "{{count}} éléments placés. Sélectionnez-en un pour voir ses dimensions et la pièce correspondante.",
    "assetDimensions": "largeur × hauteur × profondeur",
    "estimatedDimensions": "Dimensions estimées",
    "downloadGlb": "Télécharger le GLB ↗",
    "evidenceSources": "Sources et périmètre",
    "reportedArea": "{{area}}",
    "extraArea": "{{area}} · balcon",
    "canvasFallback": "La vue de l’appartement nécessite WebGL. Activez l’accélération graphique du navigateur.",
    "canvasAria": "Modèle 3D de l’appartement avec la lumière du soleil par les fenêtres. Faire glisser pour orbiter, utiliser la molette pour zoomer.",
    "roomLabelsAria": "Noms des pièces et surfaces indiquées",
    "parquet": "Parquet existant",
    "parquetRooms": "Séjour et chambres",
    "darkTile": "Carrelage foncé",
    "darkTileRooms": "Cuisine",
    "lightTile": "Carrelage clair",
    "lightTileRooms": "Salle de bains",
    "greenGrayFloor": "Sol gris-vert",
    "greenGrayFloorRooms": "Entrée et WC",
    "blueGrayPaint": "Peinture bleu-gris",
    "blueGrayPaintRooms": "Encadrements des pièces de service",
    "footerTitle": "Appartement + soleil",
    "footerDescription": "Géométrie de démonstration conservée avec une origine solaire régionale approximative.",
    "wallHeight": "Hauteur : {{height}}",
    "estimated": "estimée"
  },
  "assets": {
    "fridge-freezer": {
      "label": "Réfrigérateur-congélateur",
      "evidence": "P06 / P11 · inox, deux portes"
    },
    "washing-machine": {
      "label": "Lave-linge à hublot",
      "evidence": "P02 · blanc, sous le plan de travail"
    },
    "oven-cooktop": {
      "label": "Four et plaque de cuisson",
      "evidence": "P08 / V02 · four noir et plaque à quatre foyers"
    },
    "microwave": {
      "label": "Micro-ondes",
      "evidence": "P08 / P11 · noir, posé sur le plan de travail"
    },
    "extractor-hood": {
      "label": "Hotte aspirante",
      "evidence": "P08 · hotte et conduit en acier"
    },
    "boiler": {
      "label": "Chaudière murale",
      "evidence": "P06 / P11 · habillage blanc"
    },
    "base-cabinet": {
      "label": "Meuble bas de cuisine",
      "evidence": "P06 / P08 / V02 · chêne, façades à cadres"
    },
    "sink-cabinet": {
      "label": "Meuble évier avec égouttoir",
      "evidence": "P06 / P11 · un bac en acier"
    },
    "wall-cabinet": {
      "label": "Meuble haut",
      "evidence": "P06 / P11 · chêne, deux portes"
    },
    "bathroom-vanity": {
      "label": "Meuble vasque et lavabo",
      "evidence": "P02 · une vasque ronde en acier ; la seconde est un reflet"
    },
    "toilet": {
      "label": "Cuvette de WC",
      "evidence": "P03 / V04 · céramique blanche"
    },
    "radiator": {
      "label": "Radiateur",
      "evidence": "P07 / P10 / V04 · panneau blanc"
    },
    "towel-rail": {
      "label": "Sèche-serviettes",
      "evidence": "P02 · blanc, visible dans le miroir"
    },
    "glass-block-screen": {
      "label": "Paroi en briques de verre",
      "evidence": "P02 / V04 · blocs translucides"
    },
    "shower-tray": {
      "label": "Receveur de douche",
      "evidence": "V04 03s · receveur blanc surélevé"
    },
    "electrical-panel": {
      "label": "Tableau électrique",
      "evidence": "P04 · au-dessus du passage entre entrée et séjour"
    },
    "low-table": {
      "label": "Table basse en bois",
      "evidence": "V04 44s · près de l’accès au balcon"
    },
    "wall-mirror": {
      "label": "Miroir de salle de bains",
      "evidence": "P02 · au-dessus du lavabo et du lave-linge"
    }
  },
  "fixtures": {
    "retry": "Réessayer",
    "failed": "Impossible de charger : {{label}}"
  },
  "reconstruction": {
    "note1": "Sols, couleurs, ouvertures et équipements reconstitués à partir de 11 photos et 4 vidéos.",
    "note2": "Les surfaces proviennent du plan. Les dimensions linéaires, hauteurs et positions sont estimées.",
    "note3": "La cuisine en U, l’accès au balcon et la séparation des chambres ont été ajustés à partir des vidéos.",
    "note4": "L’agencement exact de la douche et de la paroi reste à confirmer avec un relevé de la salle de bains.",
    "note5": "L’usure est représentative ; ce modèle ne reproduit pas encore chaque fissure ni chaque irrégularité."
  },
  "building": {
    "sceneAria": "Immeuble et environnement en trois dimensions",
    "locationEyebrow": "L’immeuble et ses alentours",
    "location": "Référence régionale approximative · Europe/Paris",
    "camera": "Caméra de l’immeuble",
    "navigationHelp": "Faire glisser pour orbiter · Molette pour zoomer",
    "buildingLayers": "Calques de l’immeuble",
    "neighbors": "Immeubles voisins",
    "solarOrbit": "Trajectoire du soleil",
    "department": "Notre appartement",
    "apartmentLocationTitle": "Le T3 dans son immeuble.",
    "apartmentFloor": "T3 · {{floor}}e étage estimé",
    "courtyardAssumption": "Façade sur cour · Placement illustratif.",
    "buildingCuts": "Coupes de l’immeuble",
    "wholeBuilding": "En entier",
    "floorCut": "Coupe d’étage",
    "interior": "Voir l’intérieur",
    "wholeBuildingLink": "Voir l’immeuble en entier ↗",
    "locateApartment": "Localiser mon appartement ↗",
    "exploreApartment": "Explorer la lumière dans l’appartement",
    "solarStudy": "Étude solaire",
    "annualLightLine1": "La lumière au fil",
    "annualLightLine2": "de l’année.",
    "sharedMoment": "La même date et la même heure dans les deux vues.",
    "evidencePrecision": "Sources et précision",
    "nationalBuildingRegister": "Registre national des bâtiments ↗",
    "registerDescription": "Guide du registre ; l’exemple utilise ses propres identifiants. {{address}}.",
    "ignTopo": "IGN · BD TOPO ↗",
    "ignDescription": "Géométrie adaptée et généralisée. Hauteur du modèle : {{height}} ; {{floors}} étages. Incertitude d’origine : {{planar}} en plan et {{vertical}} en hauteur.",
    "cadastre": "Méthode cadastrale · exemple {{label}} ↗",
    "parcelDescription": "Surface illustrative de {{area}} ; elle n’identifie pas de parcelle réelle.",
    "modelScope": "Contexte local d’environ {{radius}} conservé pour les ombres. L’origine solaire ne géolocalise pas la géométrie. Sol, toitures et ouvertures approximatifs. {{assumption}}",
    "solarSource": "Calcul solaire · NOAA / Meeus ↗",
    "solarDescription": "Position astronomique du soleil et ombres sur ce modèle. Les nuages et la végétation ne sont pas pris en compte ; il ne s’agit pas d’une étude de rayonnement. Les heures de lever et de coucher reposent sur un horizon idéal.",
    "dataConsulted": "Géométrie adaptée de sources consultées le {{date}}. {{attribution}}.",
    "canvasFallback": "La vue de l’immeuble nécessite WebGL. Activez l’accélération graphique du navigateur.",
    "canvasAria": "Modèle 3D de bâtiment de démonstration et contexte local avec ombres solaires",
    "labelOverlayAria": "Étiquettes de l’immeuble, points cardinaux et position du soleil",
    "apartmentLabel": "Notre T3",
    "sunLabel": "Soleil · {{altitude}}°",
    "north": "N",
    "south": "S",
    "east": "E",
    "west": "O",
    "buildingPart": "Immeuble",
    "apartmentKey": "Notre T3",
    "contextKey": "Environnement",
    "footerTitle": "Immeuble + soleil",
    "footerDescription": "Géométrie de contexte conservée · Identifiants généralisés · Placement illustratif du T3",
    "mapLink": "Méthode des données géographiques ↗",
    "demoName": "Bâtiment de démonstration"
  },
  "solar": {
    "chartAria": "Hauteur du soleil au fil de la journée ; le repère indique l’heure choisie",
    "dayOfYear": "Jour de l’année",
    "compareSeasons": "Comparer les saisons",
    "spring": "Printemps",
    "summer": "Été",
    "autumn": "Automne",
    "winter": "Hiver",
    "localTime": "Heure de l’exemple",
    "demoLocalTime": "Heure locale · Europe/Paris",
    "pauseDay": "Mettre le parcours en pause",
    "playDay": "Lire le parcours de la journée",
    "moveTime": "Modifier l’heure de la journée",
    "daylight": "Soleil au-dessus de l’horizon",
    "daylightDescription": "Lumière directe et ombres",
    "noDirectSun": "Soleil sous l’horizon",
    "noDirectSunDescription": "Pas de lumière directe du soleil",
    "adjustedTime": "Cette heure n’existe pas à cause du changement d’heure. Passage à {{time}}.",
    "ambiguousTime": "Cette heure se produit deux fois. Affichage de la première occurrence, avant le changement d’heure.",
    "altitude": "Hauteur du soleil",
    "azimuth": "Azimut",
    "aboveHorizon": "Au-dessus de l’horizon",
    "trueNorth": "Depuis le nord géographique",
    "dayPath": "Trajectoire solaire du jour",
    "dayPathTitle": "La trajectoire du jour",
    "daylightDuration": "{{hours}} h {{minutes}} min de lumière",
    "sunrise": "↑ Lever",
    "solarNoon": "Midi solaire",
    "goToSolarNoon": "Aller au midi solaire",
    "sunset": "↓ Coucher",
    "dayProgress": "Parcours de la journée en cours",
    "playFullDay": "Lire une journée complète",
    "fullDaySpeed": "24 h en 24 s",
    "noSunDirect": "Pas de soleil direct",
    "hours": "h"
  }
} as const

export default workspace
