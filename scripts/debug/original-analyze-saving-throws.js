// Saving Throw Analysis Script
// This script compares the current implementation with the provided JSON data

const fs = require('fs');

// Load the JSON data from the file
let jsonData = {};
try {
	jsonData = JSON.parse(fs.readFileSync('./saving_throws_in_use.json','utf8'));
} catch (e) {
	// If the JSON isn't available, keep an empty object for tooling.
}

function convertJsonToArrays(jsonClass) {
	const arrays = { death: [], wands: [], paralysis: [], breath: [], spells: [] };
	for (let level = 1; level <= 14; level++) {
		const levelData = jsonClass.levels.find(l => l.level === level);
		if (levelData) {
			arrays.death.push(levelData.D);
			arrays.wands.push(levelData.W);
			arrays.paralysis.push(levelData.P);
			arrays.breath.push(levelData.B);
			arrays.spells.push(levelData.S);
		} else {
			arrays.death.push(arrays.death[arrays.death.length - 1] || 15);
			arrays.wands.push(arrays.wands[arrays.wands.length - 1] || 15);
			arrays.paralysis.push(arrays.paralysis[arrays.paralysis.length - 1] || 15);
			arrays.breath.push(arrays.breath[arrays.breath.length - 1] || 15);
			arrays.spells.push(arrays.spells[arrays.spells.length - 1] || 15);
		}
	}
	return arrays;
}

module.exports = { jsonData, convertJsonToArrays };
