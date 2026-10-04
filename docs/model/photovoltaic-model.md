# Building photovoltaic scenarios

Solar installations belong to the target **building or house**, not to an
apartment fixture catalog. The optional `buildingEnergy` project value contains
its building ID, installation inputs, finance assumptions and currency. Older
projects remain valid without this field. It describes a proposed installation;
it is not evidence of an installed system, roof permission or structural capacity.

The reusable modules live in `apps/web/src/energy/{model,generation,finance}.ts`.
`packages/scene-schema/src/energy.ts` validates persisted inputs with finite,
bounded numbers. The rooftop layout supplies the **number of modules actually
fitted** to the generation model, so requested panels that do not fit cannot
earn energy or revenue. The renderer and the numerical study use the same
true-north orientation convention.

## Using the study

1. In the public demo, open **Building and sun → Solar energy**. The date and
   clock remain synchronized with the building's existing sun study.
2. Use **Panels** to set count, Wp, tilt, true-north azimuth, inverter limit and
   losses. The roof grid reports requested and fitted counts. A module is
   represented as 1.134 × 1.762 m, with a 0.6 m edge setback, 0.18 m column gap
   and 0.8 m row gap. These are schematic assumptions, not clearance rules.
3. **Day** shows power and daily energy; **Year** shows monthly energy and editable
   climate factors. Every chart has a data table. **Consumption** allocates
   generation to assumed local use and export. **Investment** adds costs,
   degradation, maintenance, cashflow, payback and NPV.
4. **Save scenario in this browser** explicitly saves the public example under
   `t3-designer.building-energy.v1`. Navigating between public workspaces retains
   the current draft, but reloading before saving loses unsaved edits. Reset
   changes the draft; save to persist it. Browser storage failures remain visible.
5. A private project has a **Building solar energy** section. It uses that
   project's roof and geographic data. Edits use the project's existing **Save
   changes** action and revision-conflict handling; viewers can explore results
   but cannot edit the inputs. Apartment variants share the building installation.

Panels are rendered procedurally by the web viewers. Existing Blender source
assets are not regenerated, and the offline Blender assembler does not yet
materialize photovoltaic racks from the optional scenario field.

## Scope and source quality

This is an offline **screening scenario**. It calculates solar geometry and
illustrates how installation and financial assumptions change outcomes. It is
not a weather forecast, engineering design, installer quote or guaranteed return.
In particular, monthly cloud attenuation is applied to a smooth solar curve;
individual cloudy hours and the coincidence of generation and demand are unknown.

The generalized regional example retains two horizontal-radiation series based
on the [NASA POWER climatology service](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/),
SYN1DEG for 2001–2020, from the original 2026-10-04 authoring study. The original
site query is private. The public origin (48° N, 4° W) is deliberately approximate:
it is **not** the original sample location or evidence of a fresh query there.
The monthly values remain reusable illustrative inputs in `REGIONAL_DEMO_CLIMATE`.
This preserves scenario behavior without presenting generalized coordinates as
an official source observation. Data represent a regional grid, not a rooftop.

| Month | All-sky GHI, kWh/m²/day | Clear-sky GHI, kWh/m²/day | Applied ratio |
| --- | ---: | ---: | ---: |
| Jan | 0.9648 | 1.7398 | 0.5545 |
| Feb | 1.7486 | 2.8896 | 0.6051 |
| Mar | 2.9585 | 4.5206 | 0.6544 |
| Apr | 4.6762 | 6.3067 | 0.7415 |
| May | 5.6323 | 7.6279 | 0.7384 |
| Jun | 5.9856 | 8.1415 | 0.7352 |
| Jul | 5.7314 | 7.7923 | 0.7355 |
| Aug | 4.8588 | 6.6581 | 0.7298 |
| Sep | 3.8275 | 5.0633 | 0.7559 |
| Oct | 2.2524 | 3.3250 | 0.6774 |
| Nov | 1.1983 | 2.0076 | 0.5969 |
| Dec | 0.7985 | 1.4323 | 0.5575 |

The model uses the all-sky/clear-sky **ratios**, not the absolute NASA radiation
totals. It does not claim to reproduce NASA annual GHI or a PVGIS typical-year
prediction. The generalized-example label appears only near the demo origin
and while the twelve factors match the retained example. Editing factors or
moving the site makes their provenance custom. Legacy saved site-specific NASA
labels are read as custom; their numeric inputs remain intact. Other locations
start with an explicitly illustrative 0.65 factor in every month.

For a new authorized location, query NASA POWER with your chosen coordinates,
record response metadata and permissions, and validate the new series. Do not
claim that a new query reproduces the preserved historical example merely
because both are regional.

## Radiation and electricity

The existing [solar model](solar-model.md) provides absolute solar positions:
X east, Y up, Z south; azimuth N=0°, E=90°, S=180°, W=270°. A panel's tilt is
0° horizontal and 90° vertical. Southern-hemisphere defaults face north.

The clear horizontal curve uses the
[Haurwitz equation documented by pvlib](https://pvlib-python.readthedocs.io/en/stable/_modules/pvlib/clearsky.html#haurwitz):
`GHI_clear = 1098 × sin(altitude) × exp(−0.059 / sin(altitude))` W/m², with zero
irradiance at or below the horizon. We use the shared geometric solar altitude;
we do not add a separate apparent/refraction correction. Monthly factors scale
this horizontal radiation before it is separated into direct and diffuse light.

[Erbs decomposition](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.irradiance.erbs.html)
estimates the diffuse fraction from the clearness index, using extraterrestrial
radiation with the Spencer Earth–Sun distance correction. Diffuse share rises as
the sky becomes cloudier. Below 3° altitude we treat the radiation as diffuse,
avoiding unstable direct-normal estimates. Monthly mean attenuation is not hourly
weather, so applying this hourly correlation remains an approximation.

Direct radiation is multiplied by the positive dot product of solar direction
and panel normal. Diffuse radiation uses the
[isotropic sky expression](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.irradiance.isotropic.html),
`DHI × (1 + cos(tilt)) / 2`. Ground reflection assumes albedo 0.2 and contributes
`GHI × 0.2 × (1 − cos(tilt)) / 2`.

```text
capacity_kWp = fitted_panel_count × panel_Wp / 1000
unclipped_kW = capacity_kWp × panel_irradiance_Wm2 / 1000
               × (1 − system_loss_pct / 100)
               × (1 − shading_loss_pct / 100)
output_kW = min(inverter_kW, unclipped_kW)
```

System loss is one aggregate allowance for electrical, conversion and other
unmodeled operational effects. There is no extra hidden inverter-efficiency
multiplier. Manual shading is another explicit allowance; the energy calculation
does **not** trace shadows through buildings, trees, roof equipment or neighboring
panel rows. The 3D shadow visualization does not prove quantified energy loss.
Cell temperature, wind, snow, soiling variability, optical/spectral losses,
bifacial gain, batteries and grid curtailment are not separately simulated.

The clear-sky comparison removes the monthly attenuation but retains all
installation parameters, losses and inverter limits. Because cloudiness changes
the direct/diffuse split, it is a comparison scenario, not a universal upper bound
for every possible panel orientation. Irradiation is reduced **before** inverter
clipping; multiplying already clipped energy by the cloud factor would be wrong.

Annual/monthly integration includes every day of the chosen year at 30-minute
midpoints. Days are partitioned in **local mean solar time** from longitude, so
legal time zones do not change annual energy. Month boundaries may differ from
civil boundaries for locations with sunlight around midnight. Daily curves use
the selected site's civil day and the existing 10-minute actual-instant samples,
including 23-hour and 25-hour DST days. These numerical resolutions are not claims
of physical accuracy. A bounded geometry cache avoids repeating annual solar
calculations when only panel or financial assumptions change.

## Independent plausibility checks

For a real authorized site, compare a documented scenario against an independent
service such as [PVGIS](https://re.jrc.ec.europa.eu/pvg_tools/en/). Record location,
weather period, installation type, tilt, orientation, capacity, losses and terrain
horizon. Different engines use different models and climate inputs; a single
comparison is neither a fitted correction nor an error guarantee.

Historical case-specific benchmark results are outside the public demo. Moving
the example solar origin changes output, so the former result must not be reused
as validation of the generalized origin. The engine does not call PVGIS at runtime.

## Financial scenario

Every currency amount must use the selected currency consistently; changing the
currency label does not convert tariffs or costs. Default tariffs, consumption,
installation cost, maintenance, discount and degradation are **editable examples**,
not a current offer, regulated tariff, grant entitlement or measured building load.

For each operating year:

```text
generation = first_year_kWh × (1 − degradation_pct / 100)^(year − 1)
self_consumed = min(generation × self_consumption_pct / 100, annual_demand)
exported = generation − self_consumed
imported = annual_demand − self_consumed
benefit = self_consumed × import_tariff + exported × export_tariff
net_cashflow = benefit − annual_maintenance
```

`selfConsumptionPct` is an explicit assumed **share of generation**. Annual energy
totals cannot establish simultaneous daytime demand, seasonal allocation, battery
behavior or apartment-by-apartment distribution of shared building electricity.
Savings from avoided purchases and export revenue are kept separate and never
count the same energy twice. Degradation starts in year two. Demand and tariffs
remain constant in the chosen currency basis throughout the horizon.

Year zero is `−max(0, capex − incentive)`; an incentive cannot create a cash windfall
beyond the installation cost. Maintenance and capital inputs are retained even
with zero installed panels. The user can explicitly change costs for that case.

Simple payback is the first nonnegative cumulative undiscounted cashflow, with a
fractional crossing assuming uniform benefit during that year. It is `null` if
the initial investment is not recovered within the chosen horizon; zero net
investment gives zero years. This first crossing can later be reversed by losses.
NPV discounts each operating year's net cashflow and subtracts the initial net
investment. Total net savings are cumulative operating cashflows minus investment.
Financing, taxes, inflation, tariff changes, equipment replacement and residual
value are outside this model. No result promises profitability.

## Verification

Run the focused physics and financial tests:

```sh
node --test apps/web/test/energy-generation.test.ts apps/web/test/energy-finance.test.ts
```

Tests cover published equations, coordinate conventions, hemisphere reversal,
cloud-dependent diffuse share, losses, inverter clipping order, zero systems,
night/polar behavior, leap years, DST chronology, source provenance, invalid
inputs, demand/production conservation, degradation, discounted cashflows and
payback that is absent within the selected horizon. They establish implementation
properties; they do not certify a building, electrical installation or forecast.
