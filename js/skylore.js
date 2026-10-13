// An Aboriginal view of the southern sky, shown when "Sky culture" is set to Aboriginal.
//
// This is a small, simplified selection from published accounts, not a complete or authoritative
// record. Every nation has its own sky and its own stories; the ones here are:
//  - Boorong star names (Wergaia people, north-west Victoria), recorded by William Stanbridge in 1857
//  - the Emu in the Sky, seen by many peoples in the dark clouds of the Milky Way
//  - Djulpan, the canoe in Orion, from the Yolŋu of Arnhem Land
// See Hamacher & Frew (2010) and Norris & Norris, "Emu Dreaming" (2009).
const SKY_LORE = {
  // catalogue name → [name, who or what it is]
  stars: {
    'Canopus': ['War', 'the Crow, who first brought fire to people'],
    'Sirius': ['Warepil', 'the Wedge-tailed Eagle, chief of the old spirits and brother of War'],
    'Arcturus': ['Marpeankurrk', 'who found the wood-ant larvae; when she is in the north in the evening, they are coming into season'],
    'Vega': ['Neilloan', 'the Mallee fowl; when she leaves the evening sky, the birds are laying their eggs'],
    'Antares': ['Djuit', 'son of Marpeankurrk; the stars on either side are his wives'],
    'Altair': ['Totyarguil', 'son of Neilloan; the stars on either side are his wives'],
    'Achernar': ['Yerrerdetkurrk', 'mother of Totyarguil\'s wives'],
    'Aldebaran': ['Gellarlec', 'an old man chanting and beating time for the dancers'],
    'Capella': ['Purra', 'the Kangaroo, chased by the two hunters Yurree and Wanjel'],
    'Castor': ['Yurree', 'one of two young hunters who chase Purra the Kangaroo'],
    'Pollux': ['Wanjel', 'one of two young hunters who chase Purra the Kangaroo'],
    'Gacrux': ['Bunya', 'the Possum, who ran up a tree to escape Tchingal the Emu'],
    'Rigil Kentaurus': ['Berm-berm-gle', 'two brave brothers, with Hadar, who speared Tchingal the Emu'],
    'Hadar': ['Berm-berm-gle', 'two brave brothers, with Rigil Kentaurus, who speared Tchingal the Emu'],
  },
  people: 'Boorong (Wergaia)',

  // labelled places: name, RA, Dec, note
  places: [
    ['Larnankurrk', 56.75, 24.12, 'The Pleiades: a group of young women playing for the dancers. Across the continent these stars are the Seven Sisters.', 'Boorong (Wergaia)'],
    ['Kourt-chin', 80.89, -69.76, 'The Magellanic Clouds: a pair of brolgas, the larger cloud the male and the smaller the female.', 'Boorong (Wergaia)'],
    ['Kulkunbulla', 83.8, -3.5, 'The Belt and Sword of Orion: a group of young men dancing.', 'Boorong (Wergaia)'],
  ],

  // figures drawn in the sky. "outline" is a closed shape in galactic longitude and latitude;
  // "lines" are chains of RA/Dec points.
  figures: [
    {
      name: 'Emu in the Sky', people: 'many peoples',
      note: 'An emu made not of stars but of the dark clouds of the Milky Way, its head the Coalsack beside the Southern Cross. '
        + 'It is Gawarrgay to the Kamilaroi, Gugurmin to the Wiradjuri and Tchingal to the Boorong. Its position through the year tells when emus are laying.',
      label: [322, -4],
      outline: [
        [299.0, -1.2], [301.5, 1.2], [304.5, 1.6], [307, 0.9], [312, 0.6], [318, 0.9], [324, 1.4], [329, 2.4],   // head and neck
        [334, 4.2], [340, 5.2], [346, 5.0], [351, 3.8], [355, 2.0],                                             // back
        [358, 0.5], [363, -0.5], [369, -1.5], [375, -2.5], [380, -3.0], [375, -4.0], [368, -3.5], [362, -3.0], [358, -2.5],   // first leg
        [362, -5.5], [368, -7.5], [373, -9.0], [367, -9.0], [360, -7.0], [354, -4.5],                           // second leg
        [349, -3.2], [343, -3.6], [337, -2.8], [331, -1.4], [326, -0.8], [320, -1.0], [313, -1.2], [307, -1.4], // belly and throat
        [304, -2.2], [301.5, -2.4],
      ],
    },
    {
      name: 'Djulpan', people: 'Yolŋu',
      note: 'A canoe. Three brothers sit side by side in it (Orion\'s Belt), with Betelgeuse at the bow and Rigel at the stern. '
        + 'The Orion Nebula is the fish they caught, and the Sword is their fishing line.',
      label: [86.5, 3.5],
      lines: [
        [[88.793, 7.407], [85.190, -1.943], [84.053, -1.202], [83.002, -0.299], [78.634, -8.202]],
        [[84.053, -1.202], [83.82, -5.39]],
      ],
    },
  ],
};
