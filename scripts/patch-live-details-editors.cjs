const fs = require('node:fs');

const liveTemplate = process.argv[2] || '/Users/paul/FoundryData/osp-test-captures/citadel-narlington-reference-20261005/updated/Data/systems/osp-houserules/templates/actors/character-sheet.html';
const apply = process.argv.includes('--apply');
const source = fs.readFileSync(liveTemplate, 'utf8');
const replacements = [
  ['appearance', '{{editor enrichedAppearance target="system.details.appearance" editable=editable button=false engine="prosemirror"}}', '<prose-mirror name="system.details.appearance" value="{{system.details.appearance}}" data-document-uuid="{{actor.uuid}}" {{#unless editable}}disabled{{/unless}}>{{{enrichedAppearance}}}</prose-mirror>'],
  ['goals', '{{editor enrichedGoals target="system.details.goals" editable=editable button=false engine="prosemirror"}}', '<prose-mirror name="system.details.goals" value="{{system.details.goals}}" data-document-uuid="{{actor.uuid}}" {{#unless editable}}disabled{{/unless}}>{{{enrichedGoals}}}</prose-mirror>'],
];

let output = source;
for (const [label, from, to] of replacements) {
  const count = output.split(from).length - 1;
  if (count === 1) output = output.replace(from, to);
  else if (count === 0 && output.includes(to)) continue;
  else throw new Error(`${label}: expected exactly one legacy editor, found ${count}`);
}
for (const [, , marker] of replacements) if (!output.includes(marker)) throw new Error('native Details editor verification failed');

if (apply) fs.writeFileSync(liveTemplate, output);
console.log(`${apply ? 'patched' : 'dry run'} ${liveTemplate}: appearance=1 goals=1 native=2`);
