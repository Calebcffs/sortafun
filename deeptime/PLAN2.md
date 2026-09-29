# DEEP TIME: PART 2 (Harlan)

Caleb's brief (2026-09-29): a level two in the city and the sewers. A local
town has been reporting strange animal sightings that fit velociraptors. A
different plot: collect samples (he picked "Samples" from four pitches, and
asked for **5 samples, with the effort on a map that's interesting and varied
underground**). City streets and back alleys as a short introduction, then
about 80% in the sewers and control rooms, with prehistoric jumpscares and
horror.

Page: `deeptime2.html`. Code: `deeptime/l2/` (map.js, level.js, pack.js,
main.js) plus part 1's shared `tape.js`, `audio.js`, `assets.js`, `dinos.js`.
Leaderboard key: `deeptime2` (samples * 10000 - seconds).

## Story

Present day, after part 1's "Hollow Creek, present day". A DOE "Office K"
body camera, unit 07. Harlan, Montana, 10.29.2026, 00:41. Missing dogs and
calves, something in the storm drains, a sewer crew that went down and didn't
come back. The file matched one closed in 1987. The technician collects five
samples. What the evidence bags say, in the order you find them:

1. not a bird, not in any database
2. serrated, dromaeosaur
3. carbon test: modern, less than four years old
4. growth medium in the tissue: someone grew these
5. (the lab) laser etched on the shell: US DOE K-66 CONTINUITY, BATCH 31

The ending: the fifth sample sets off the lab (alarm, red lights), the pack
comes through the pump hall door, you run south up the stair into the pump
house and out of its street door, which swings shut on the one behind you.
End card: "office k lab results, all five samples: dromaeosaurid. none of them
older than four years."

## The rule

**They hunt by sound.** Your noise (G.noise, shown as the MIC meter): still
0, walking 0.14 on concrete, 0.4 on metal, 0.7 in water, running 0.7 to 1.25.
A raptor hears you if its path distance down the tunnels (not through rock) is
under noise x 22m. It goes to about where the noise was and sniffs round.
**Your torch lets them see you**: 20m if the beam is on them, 10m if not; in
the dark 4m moving, 1.7m standing still. Seen: a screech (0.85s), then a
chase at 6.1 m/s (you run 5.8, walk 2.9; corners slow it). Break line of sight
for 1.3s and it goes to where it last saw you, prowls and sniffs for 7s, then
gives up. Caught at 1.35m. The painted warning at the culvert mouth says so.

How many: 0 before the first sample (or before 75s underground), then 1, 1, 2,
2, and all 3 in the finale. They spawn 15-29 cells away down the tunnels, out
of sight, with a call you hear. The pumps, once they start, drown your noise
in the pump hall (hear x 0.35) for 70s.

## The map (map.js: 64 x 60 cells of 3m)

Surface (rows 46-59, sky, rain): the street with the police cordon, the alley,
the fenced lot with the crew's searchlight and sample 1 on the fence, the flood
channel sloping down to the culvert mouth.

Underground (the floor is 9m down):

- **culvert**: modern concrete box, a trickle down the middle, slopes down
  from the channel; another runs from junction A up into the cistern, a third
  from the cistern east to the pump hall.
- **brick sewer** (old town): barrel vaults, a water channel with walkways
  either side, junctions with grates, two loops, a dead end with the dogs, a
  stub with an outflow pipe.
- **cistern**: 42 x 33m, 10m roof on 12 stone pillars, standing water (loud),
  a raised gantry round two sides (quiet) with stairs down, three street
  grates letting in shafts of light.
- **pipe gallery**: narrow, pipes both sides, red emergency lights, steam vents.
- **pump station**: 8m hall with pump units and a crane rail, a control room
  behind glass with CRTs, and the lab door.
- **cave**: a collapse off the gantry into a natural cave, roots through the
  roof, ferns that shouldn't grow, the nest with eggs and hatchlings.
- **lab** (behind the door, opens at 4 samples): incubators under heat lamps,
  the CCTV office, the cold room with jars and a tank, the stair up to the
  pump house.

Loops for losing them: the two brick loops; junction A > cistern > gantry >
brick north > junction A; junction A > gallery > pump hall > culvert > cistern.

## Set pieces (main.js scares(), each once a run)

alley: a bin goes over, something runs across the lot. culvert: the light
ahead dies, a call from below. junction A: rats run at you. outflow pipe: eyes.
cistern: a shape walks through a shaft of light. gallery: steam, then claws in
the pipes overhead. pump hall: the pumps start by themselves. control room:
something hits the glass. nest: hatchlings scatter from your light. CCTV
office: the monitors show you from behind, and what's behind you. cold room:
the thing in the tank twitches. Plus ambient drips, clanks, rats, distant
calls, dogs, sirens and cars up top.
