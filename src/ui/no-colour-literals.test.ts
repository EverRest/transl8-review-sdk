import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Colour lives in tokens.ts and nowhere else. A literal that
 * creeps back into a component is how the SDK ended up with four accent
 * colours across five files in the first place.
 */
const UI_DIR = join(__dirname);
const EXEMPT = new Set(['tokens.ts']);

/**
 * The CSS named colours, which the hex/rgb() patterns below cannot see —
 * `color-mix(in oklch, var(--t8-accent) 88%, black)` shipped straight past
 * this guard. `transparent` and `currentColor` are deliberately absent:
 * they carry no colour of their own and are how the token mixes are
 * written.
 *
 * The lookarounds keep the match in value position: without them `white`
 * matches inside `white-space: nowrap` and `red` inside a hyphenated
 * identifier.
 */
const NAMED_COLOURS = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque',
  'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood',
  'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk',
  'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray',
  'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen',
  'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
  'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey',
  'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen',
  'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
  'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace',
  'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
  'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red',
  'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen',
  'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
  'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
  'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow',
  'yellowgreen',
];
const NAMED_COLOUR_RE = new RegExp(
  `(?<![-\\w#])(?:${NAMED_COLOURS.join('|')})(?![-\\w(])`,
  'i',
);

function componentSources(): string[] {
  return readdirSync(UI_DIR).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !EXEMPT.has(f),
  );
}

describe('token discipline', () => {
  it('finds component sources to check', () => {
    // Guards against the glob/path being wrong and this suite passing
    // vacuously over zero files.
    expect(componentSources().length).toBeGreaterThan(5);
  });

  it.each(componentSources())('%s declares no colour literal', (file) => {
    const source = readFileSync(join(UI_DIR, file), 'utf8');

    expect(source, `${file} contains a hex colour`).not.toMatch(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/);
    expect(source, `${file} contains an rgb()/rgba() colour`).not.toMatch(/\brgba?\(/);
    expect(source, `${file} contains a named CSS colour`).not.toMatch(NAMED_COLOUR_RE);
  });
});
