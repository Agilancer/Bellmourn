# The Sworn on the Universal Animation Library

Blackvigil Keep's knights (`src/fps/sworn.js`) move on Quaternius' **Universal Animation Libraries
1 and 2** (CC0 1.0), the same mannequin on the same skeleton, and so does every other person in the
game (the villagers, the open country's knights and sorcerers: `ualBody`). `trim.py` puts every clip
of both but the pistols, driving, the phone call and the T-poses (76) into one file with the
mannequin, dropping every channel that never moves (4.5 MB from 15):

    python tools/creatures/sworn_ual/trim.py templates/models/creatures/sworn/ual.glb "<...>/UAL2_Standard.glb" "<...>/UAL1_Standard.glb"

The game carries those clips onto each sworn body when it builds it (`src/fps/ual.js`):

- the mannequin's 65 bones map one to one onto the villager skeleton the Sworn are built on
  (pelvis, three spine bones, neck, head; clavicle, arm, forearm, hand, three joints of each finger;
  thigh, calf, foot); both stand in a T-pose facing +z, so each bone takes the mannequin bone's turn
  away from that pose in the world;
- the villager's thighs hang from its Body bone and its feet from the root (an IK rig), so after each
  frame they're put back on the hips and the knees (`legJoints`/`attach`; the knights' few old clips,
  the falls and crawls, get the same fix);
- standing clips keep the soles on the ground where the mannequin's are; the knockdown, death, get-up
  and leap keep the whole armoured body as far off the ground as the mannequin is;
- `RECIPES` says what each of the knights' clips is made of. The library has no walk, run or death,
  so the walk is the carrying walk under the shield guard, the run is that walk at double time with
  longer strides, and the death is the knockback. Hit frames, the shield arm easing into and out of
  the guard, and the paces the gaits go at are worked out there too.

`knight.html` (at the root) shows every move, beside the knight's old clips and the mannequin.
