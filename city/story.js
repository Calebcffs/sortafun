// City Sandbox, the story: "Halcyon". Every mission, in order (campaign.js
// runs them). The design, the characters and the whole plot are in
// city/CAMPAIGN.md.
//
//   story1.js  act 1, The Quiet: the opening, Last Delivery, Under, The Canopy
//   story2.js  act 2, Out There: Rush Hour, Cooling Towers, The Long Shot,
//              What Teo Did, Wings
//   story3.js  act 3, Signal: The Canopy Falls, Down the Line, Rhys Tower,
//              Kill the Signal, and the epilogue
//   storykit.js  what they share

import { ACT1 } from "./story1.js";
import { ACT2 } from "./story2.js";
import { ACT3 } from "./story3.js";

export const MISSIONS = [...ACT1, ...ACT2, ...ACT3];
