# Solar model

The exterior and apartment viewers use a shared local, dependency-free solar geometry module in `apps/web/src/lib/solar.ts`. There is no weather service or remote request when changing the date or time.

## Geometry and lighting

The implementation evaluates the Julian-century equations used by the [NOAA Solar Calculator](https://gml.noaa.gov/grad/solcalc/calcdetails.html): orbital longitude and anomaly, obliquity, solar declination, equation of time, then the observer's local hour angle. The [published NOAA implementation](https://gml.noaa.gov/grad/solcalc/main.js) was consulted on 2026-09-26. The arithmetic is implemented here without installing a package. NOAA attributes this method to Jean Meeus, *Astronomical Algorithms*; their calculator is no longer actively maintained.

`getSolarPosition(instant, latitude, longitude)` takes an absolute `Date` and WGS84 coordinates with east-positive longitude. It returns geometric altitude, azimuth measured clockwise from true north, and a unit direction **toward** the sun in the site's axes: **x east, y up, z south**. A Three.js directional light should be placed at `direction × distance` relative to its target. The apartment view uses the inverse rotation of the shared, explicitly estimated apartment-to-site placement to express this same physical direction in plan coordinates. This basis change is not a second solar calculation or a measured validation of the plan's orientation.

The direct solar light must turn off below altitude zero. Ambient or sky illumination can remain for navigation at night. Brightness, atmospheric colour and shadow softness in the viewer are artistic controls, not calculated irradiance. A facade's illumination and neighbouring-building shadows depend on the model geometry and real-world orientation, so approximate heights and unverified windows remain meaningful sources of uncertainty.

## Calendar and civil time

The UI's date and time are **Europe/Paris**, irrespective of the computer's current timezone. The [ECMAScript Internationalization API](https://tc39.es/ecma402/#sec-intl.datetimeformat.prototype.formattoparts) resolves local calendar components using the browser's [IANA time zone data](https://www.iana.org/time-zones). Future legal timezone changes require updated browser/OS timezone data. The supported civil-date range is 1900–2100.

`resolveLocalDateTime(date, minutes)` exposes the status and zero, one, or two matching UTC instants. A nonexistent spring time must be visibly rejected or explicitly moved by the UI; the library does not invent a timestamp. A repeated autumn time exposes both occurrences in UTC order. `localDateTimeToDate` rejects ambiguous values by default; callers can explicitly choose `earlier` or `later`. `getLocalDate` and `getLocalMinutes` convert an instant back to the location's calendar.

For example, Paris `2026-03-29 02:30` does not exist. Paris `2026-10-25 02:30` occurs at both `00:30Z` and `01:30Z`. The daily path walks actual instants, so these days contain 23 and 25 hours respectively.

## Daily events and accuracy

`getSolarDay` returns apparent sunrise and sunset, solar noon, daylight duration, and the full day's position samples every ten elapsed minutes. Sunrise and sunset use centre altitude **−0.833°** at a flat horizon, matching the standard allowance for refraction and the solar disc. See the [US Naval Observatory's definitions](https://aa.usno.navy.mil/faq/RST_defs). They describe the astronomical horizon, not the instant sunlight clears the neighbour's roof. The direct-light direction itself remains geometric and uses a zero-degree cutoff; apparent sunrise and the rendering cutoff therefore differ by a few minutes.

Crossings are bracketed at five-minute intervals and refined to less than one second. That is numerical resolution, not a claim about physical accuracy. Terrain, observer height, weather, atmospheric refraction, glazing, reflected light and measured radiation are not simulated. At high latitudes, a day with no crossing returns null events rather than a fabricated time.

The tests compare daytime angles against the [NREL/NLR SPA reference example](https://midcdmz.nlr.gov/spa/spa_tester.c), allowing 0.1° because that reference includes atmospheric and observer-height corrections. Its sunrise and sunset provide independent comparisons within two minutes. Tests also cover the regional example’s seasonal altitude/day-length contrast, direction signs, night, leap dates, invalid values and both Paris DST transitions. This is a visual sun-and-shadow study, not a certified insolation or energy report.

## Apartment integration

The registration in `apps/web/src/data/apartment-placement.ts` follows the user's marked courtyard facade and photo. It provisionally places the apartment on the third floor above ground (finished floor 9.30 m), with living/kitchen toward the southwest courtyard and bedrooms toward the northeast. See [Apartment registration](apartment-placement.md) for the assumptions and the full-depth building void required by the mismatched approximate plan/building depths. These coordinates preserve the plan's scale; they are not surveyed. The date and time state is shared by both views.

Visual cuts must not create false sunlight. Complete apartment walls with their window and doorway apertures, the ceiling, and surrounding building masses remain shadow casters. The ceiling, hidden wall portions and hidden building context use shadow-only rendering (`colorWrite=false`, `depthWrite=false`), while windows transmit the directional light rather than casting opaque pane shadows. Showing or hiding the building context changes its visible presentation; it does not turn off surrounding shadows. This lets the user inspect room sunlight through a cutaway while retaining the physical barriers represented by the model.

Seasonal placement tests check that the regional example’s 08:00 summer sun is in front of the northeast bedroom windows and its 15:00 winter sun is in front of the southwest living/kitchen windows after the same rotation. Those incidence checks do not assert unobstructed sunshine: neighboring masses and the reconstructed openings determine whether a sun patch reaches the room. Glazing transmission, diffuse interreflection, vegetation, clouds and measured irradiance remain outside this visual study.

## Offline Blender adapter

The versioned `assets/scenes/t3-project.json` persists the exact selected instant,
solar direction, estimated placement, physical wall solids and surrounding
building sections. `pnpm scene:snapshot` generates it deterministically; custom
dates/times and ambiguous-hour selection are supported. Daily samples use actual
elapsed time, including 92/100 samples on modern Paris clock-change days.

`scripts/blender/assemble_project.py` consumes this snapshot in a fresh background
process. It maps the same sun vector to Blender axes and uses Cycles camera-ray
visibility to expose the rooms while preserving full physical occluders. Clear
glazing, a single astronomical sun and an approximate diffuse sky replace the
old reference scene's studio lights. Cycles computes its own light transport;
materials and brightness are not measured or calibrated, and its appearance is
not expected to match the web pixel for pixel. The saved scene embeds the full
snapshot and its source hash. See [Blender workflow](../workflows/blender.md).
