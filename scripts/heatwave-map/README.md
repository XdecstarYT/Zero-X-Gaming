# Heatwave's map of Melbourne

`public/heatwave/melbourne.bin` is real Melbourne: about 7.9 km by 9.1 km from Kensington and
Fishermans Bend to Richmond, and from Carlton down to St Kilda. It is built from
[Overture Maps](https://overturemaps.org/) data.

**Attribution.** The map data is © OpenStreetMap contributors and the other Overture Maps
sources. It is available under the Open Database License (ODbL 1.0,
<https://opendatacommons.org/licenses/odbl/>). The packed file is a derived database under the
same licence. The game credits it on its title screen.

## What's in it

- Every road: its class, name, width, one-way flags and bridges. Each road is split at its
  junctions and bends into straight pieces. Signals sit at the junctions OSM tags as lit.
- Every building footprint, with its courtyards, height, base height, use, roof shape, material
  and colour. Building parts are used where a building has them. Footprints are trimmed back from
  the carriageways so no road runs through a wall.
- The tram and train rails, the elevated freeways, the piers, and street furniture points
  (benches, bins, lamps, stops, poles, fountains and so on).
- A 4 m ground raster: land, grass, sand, sports grounds, paving, ballast, decks, and water with
  its depth.

`src/games/heatwave/mapdata.ts` documents the binary layout ("HWM2", gzipped) and reads it.

## Building it

You need Python 3 with `pyarrow`, `numpy` and `shapely`. Reads are HTTP range requests on
Overture's public S3 bucket, so only the row groups covering Melbourne are downloaded.

```sh
cd scripts/heatwave-map
# For each theme: find the row groups in the box, then fetch the columns the build needs.
python3 probe.py theme=buildings/type=building
python3 fetch.py theme=buildings/type=building id,names,height,min_height,num_floors,subtype,class,facade_color,facade_material,roof_material,roof_shape,roof_color,roof_height,geometry,has_parts,is_underground
python3 probe.py theme=buildings/type=building_part
python3 fetch.py theme=buildings/type=building_part id,building_id,names,height,min_height,num_floors,min_floor,roof_shape,roof_height,facade_color,facade_material,roof_color,geometry
python3 probe.py theme=transportation/type=segment
python3 fetch.py theme=transportation/type=segment id,names,subtype,class,subclass,connectors,road_flags,rail_flags,level_rules,access_restrictions,routes,width_rules,geometry
python3 probe.py theme=base/type=water
python3 fetch.py theme=base/type=water id,names,subtype,class,is_salt,geometry
python3 probe.py theme=base/type=land_use
python3 fetch.py theme=base/type=land_use id,names,subtype,class,geometry
python3 probe.py theme=base/type=infrastructure
python3 fetch.py theme=base/type=infrastructure id,names,subtype,class,height,geometry
# Then pack it (about half a minute).
python3 build.py . ../../public/heatwave/melbourne.bin
```

`probe.py` pins the release (`2026-09-23.1`). Its projection is the one the game uses
(`geo()` in `world.ts`): local metres from the corner of Flinders and Swanston Sts, with x east
and z south.
