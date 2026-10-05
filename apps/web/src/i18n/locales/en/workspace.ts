const workspace = {
  "rooms": {
    "bedroom-1": "Bedroom 1",
    "bedroom-2": "Bedroom 2",
    "living": "Living room / dining area",
    "entrance": "Entryway",
    "wc": "WC",
    "bathroom": "Bathroom",
    "kitchen": "Kitchen",
    "closet": "Closet",
    "balcony": "Balcony",
    "unknown": "Room"
  },
  "apartment": {
    "modelAria": "Apartment model with sunlight",
    "caption": "Our T3",
    "sunInDemo": "Sun in the demo",
    "cameraView": "Camera view",
    "perspective": "Perspective",
    "plan": "Floor plan",
    "resetView": "Reset view",
    "hideBuilding": "Hide building",
    "showBuilding": "Show building",
    "interiorSunlight": "Sunlight and indoor shadows",
    "ambientReference": "No direct sun · Ambient light reference",
    "navigationHelp": "Drag to orbit · Scroll to zoom · Right-click to pan",
    "modelLayers": "Model layers",
    "cutaway": "Cutaway",
    "fixtures": "Fixtures",
    "labels": "Labels",
    "inspectorAria": "Explore the apartment and sunlight",
    "insideEyebrow": "Inside the T3",
    "tagline": "Your home in daylight.",
    "inspectorContents": "Inspector contents",
    "sunTab": "Sun",
    "roomsTab": "Rooms",
    "assetsTab": "Fixtures",
    "observeLight": "Explore light by room",
    "lookAtLight": "Look at the light in",
    "focusRoom": "Focus room",
    "allApartment": "Entire T3",
    "living": "Living room",
    "bedroomOne": "Bedroom 1",
    "bedroomTwo": "Bedroom 2",
    "compareSeasons": "Compare seasons",
    "lightInstruction": "Change the time and compare seasons to see how far sunlight reaches through the windows.",
    "livingFacade": "Living room",
    "bedroomsFacade": "Bedrooms",
    "estimatedOrientation": "Estimated orientation",
    "buildingShadowTitle": "The building casts a shadow too.",
    "buildingShadowBody": "Showing or hiding it only changes the view. Its shadows and those of nearby buildings remain; the cutaway preserves the effect of the walls and roof.",
    "sunLocationPrecision": "Sun location and accuracy",
    "placementUnconfirmed": "Floor, position and orientation are still to be confirmed.",
    "sunMethod": "Solar position uses an approximate regional origin (48° N, 4° W) and Europe/Paris. Geometry is illustrative; this is not a property irradiance study.",
    "placementAssumption": "Illustrative placement: third floor, living room southwest and bedrooms northeast.",
    "unknownAsset": "Item",
    "sunSource": "Solar calculation · NOAA / Meeus ↗",
    "fullView": "Full view",
    "materials": "Existing materials",
    "roomArea": "{{area}}",
    "assetCountNote": "{{count}} placed items. Select one to see its dimensions and room.",
    "assetDimensions": "width × height × depth",
    "estimatedDimensions": "Estimated dimensions",
    "downloadGlb": "Download GLB ↗",
    "evidenceSources": "Sources and scope",
    "reportedArea": "{{area}}",
    "extraArea": "{{area}} · balcony area",
    "canvasFallback": "The apartment view requires WebGL. Enable your browser’s graphics acceleration.",
    "canvasAria": "3D apartment model with sunlight through its windows. Drag to orbit, scroll to zoom.",
    "roomLabelsAria": "Room names and reported areas",
    "parquet": "Existing parquet",
    "parquetRooms": "Living room and bedrooms",
    "darkTile": "Dark tile",
    "darkTileRooms": "Kitchen",
    "lightTile": "Light tile",
    "lightTileRooms": "Bathroom",
    "greenGrayFloor": "Green-gray floor",
    "greenGrayFloorRooms": "Entryway and WC",
    "blueGrayPaint": "Blue-gray paint",
    "blueGrayPaintRooms": "Service door frames",
    "footerTitle": "Apartment + sun",
    "footerDescription": "Preserved demonstration geometry with an approximate regional solar origin.",
    "wallHeight": "Height: {{height}}",
    "estimated": "estimated"
  },
  "assets": {
    "fridge-freezer": {
      "label": "Fridge-freezer",
      "evidence": "P06 / P11 · stainless steel, two doors"
    },
    "washing-machine": {
      "label": "Front-loading washing machine",
      "evidence": "P02 · white front-loader under the counter"
    },
    "oven-cooktop": {
      "label": "Oven and cooktop",
      "evidence": "P08 / V02 · black oven and four-zone cooktop"
    },
    "microwave": {
      "label": "Microwave",
      "evidence": "P08 / P11 · black, on the counter"
    },
    "extractor-hood": {
      "label": "Extractor hood",
      "evidence": "P08 · steel hood and flue"
    },
    "boiler": {
      "label": "Wall-mounted boiler",
      "evidence": "P06 / P11 · white casing"
    },
    "base-cabinet": {
      "label": "Kitchen base cabinet",
      "evidence": "P06 / P08 / V02 · oak, framed fronts"
    },
    "sink-cabinet": {
      "label": "Sink cabinet and drainer",
      "evidence": "P06 / P11 · single steel sink"
    },
    "wall-cabinet": {
      "label": "Wall cabinet",
      "evidence": "P06 / P11 · oak, two doors"
    },
    "bathroom-vanity": {
      "label": "Vanity and basin",
      "evidence": "P02 · one round steel basin; the second is a reflection"
    },
    "toilet": {
      "label": "Toilet",
      "evidence": "P03 / V04 · white ceramic"
    },
    "radiator": {
      "label": "Radiator",
      "evidence": "P07 / P10 / V04 · white panel"
    },
    "towel-rail": {
      "label": "Heated towel rail",
      "evidence": "P02 · white, visible in the mirror"
    },
    "glass-block-screen": {
      "label": "Glass-block shower screen",
      "evidence": "P02 / V04 · translucent blocks"
    },
    "shower-tray": {
      "label": "Shower tray",
      "evidence": "V04 03s · raised white tray"
    },
    "electrical-panel": {
      "label": "Electrical panel",
      "evidence": "P04 · above the entry-to-living passage"
    },
    "low-table": {
      "label": "Low wooden table",
      "evidence": "V04 44s · beside the balcony entrance"
    },
    "wall-mirror": {
      "label": "Bathroom mirror",
      "evidence": "P02 · above the basin and washing machine"
    }
  },
  "fixtures": {
    "retry": "Retry",
    "failed": "Could not load: {{label}}"
  },
  "reconstruction": {
    "note1": "Floors, colours, openings and fixtures reconstructed from 11 photos and 4 videos.",
    "note2": "Areas come from the floor plan. Linear dimensions, heights and positions are estimates.",
    "note3": "The U-shaped kitchen, balcony access and division between bedrooms were adjusted using the videos.",
    "note4": "The exact shower and screen layout awaits measured bathroom plans.",
    "note5": "Wear is representative; this model does not yet reproduce every crack or irregularity."
  },
  "building": {
    "sceneAria": "Building and surroundings in 3D",
    "locationEyebrow": "The building and its surroundings",
    "location": "Approximate regional reference · Europe/Paris",
    "camera": "Building camera",
    "navigationHelp": "Drag to orbit · Scroll to zoom",
    "buildingLayers": "Building layers",
    "neighbors": "Nearby buildings",
    "solarOrbit": "Solar path",
    "department": "Our apartment",
    "apartmentLocationTitle": "The T3 in context.",
    "apartmentFloor": "T3 · estimated floor {{floor}}",
    "courtyardAssumption": "Courtyard facade · Illustrative placement.",
    "buildingCuts": "Building cutaways",
    "wholeBuilding": "Whole building",
    "floorCut": "Floor cutaway",
    "interior": "Show interior",
    "wholeBuildingLink": "View the whole building ↗",
    "locateApartment": "Locate my apartment ↗",
    "exploreApartment": "Explore sunlight in the apartment",
    "solarStudy": "Solar study",
    "annualLightLine1": "Light through",
    "annualLightLine2": "the year.",
    "sharedMoment": "The same date and time in both views.",
    "evidencePrecision": "Sources and accuracy",
    "nationalBuildingRegister": "National Building Register ↗",
    "registerDescription": "Registry guide; the example uses its own identifiers. {{address}}.",
    "ignTopo": "IGN · BD TOPO ↗",
    "ignDescription": "Adapted and generalized geometry. Model height: {{height}}; {{floors}} storeys. Original uncertainty: {{planar}} horizontally and {{vertical}} vertically.",
    "cadastre": "Cadastral method · example {{label}} ↗",
    "parcelDescription": "Illustrative area of {{area}}; it does not identify a real plot.",
    "modelScope": "Local context of about {{radius}} retained for shadows. The solar origin does not geolocate the geometry. Ground, roofs and openings are approximate. {{assumption}}",
    "solarSource": "Solar calculation · NOAA / Meeus ↗",
    "solarDescription": "Astronomical sun position and shadows on this model. Clouds and vegetation are not included, and this is not a solar-irradiance study. Sunrise and sunset times use an ideal horizon.",
    "dataConsulted": "Geometry adapted from sources retrieved on {{date}}. {{attribution}}.",
    "canvasFallback": "The building view requires WebGL. Enable your browser’s graphics acceleration.",
    "canvasAria": "3D demonstration building and local context with solar shadows",
    "labelOverlayAria": "Building labels, compass directions and sun position",
    "apartmentLabel": "Our T3",
    "sunLabel": "Sun · {{altitude}}°",
    "north": "N",
    "south": "S",
    "east": "E",
    "west": "W",
    "buildingPart": "Building",
    "apartmentKey": "Our T3",
    "contextKey": "Surroundings",
    "footerTitle": "Building + sun",
    "footerDescription": "Preserved context geometry · Generalized identifiers · Illustrative T3 placement",
    "mapLink": "Geographic data method ↗",
    "demoName": "Demonstration building"
  },
  "solar": {
    "chartAria": "Sun altitude through the day; the marker shows the selected time",
    "dayOfYear": "Day of the year",
    "compareSeasons": "Compare seasons",
    "spring": "Spring",
    "summer": "Summer",
    "autumn": "Autumn",
    "winter": "Winter",
    "localTime": "Example time",
    "demoLocalTime": "Local time · Europe/Paris",
    "pauseDay": "Pause day timeline",
    "playDay": "Play day timeline",
    "moveTime": "Change the time of day",
    "daylight": "Sun above the horizon",
    "daylightDescription": "Direct light and shadows",
    "noDirectSun": "Sun below the horizon",
    "noDirectSunDescription": "No direct sunlight",
    "adjustedTime": "This time does not exist because of the clock change. Adjusted to {{time}}.",
    "ambiguousTime": "This time occurs twice. Showing the first occurrence, before the clock change.",
    "altitude": "Solar altitude",
    "azimuth": "Azimuth",
    "aboveHorizon": "Above the horizon",
    "trueNorth": "From true north",
    "dayPath": "Daily solar path",
    "dayPathTitle": "The day’s path",
    "daylightDuration": "{{hours}} h {{minutes}} min of daylight",
    "sunrise": "↑ Sunrise",
    "solarNoon": "Solar noon",
    "goToSolarNoon": "Go to solar noon",
    "sunset": "↓ Sunset",
    "dayProgress": "Playing through the day",
    "playFullDay": "Play a full day",
    "fullDaySpeed": "24 hours in 24 seconds",
    "noSunDirect": "No direct sun",
    "hours": "h"
  }
} as const

export default workspace
