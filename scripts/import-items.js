/**
 * Import Items from JSON to Compendium
 * 
 * This script imports items from JSON files into Foundry compendium packs.
 * 
 * USAGE:
 * 1. In Foundry, create compendium packs in the settings (Gear icon > Configure Settings > Compendium Packs)
 *    - Create "osp-houserules.weapons"
 *    - Create "osp-houserules.armor"
 *    - Create "osp-houserules.gear"
 * 
 * 2. Copy this script content and run it in the browser console (F12), OR
 *    Run it as a macro in Foundry VTT
 * 
 * 3. The script will prompt you to select files
 */

async function importItemsFromJSON() {
  // File data - paste your JSON content here or use file picker
  const datasets = {
    weapons: [], // Paste weapons.json content here
    armor: [],   // Paste armor.json content here
    gear: [] // Paste gear.json content here
  };

  // Prompt for which pack to import to
  const packName = await Dialog.prompt({
    title: "Import Items",
    content: `
      <form>
        <div class="form-group">
          <label>Select Pack:</label>
          <select name="pack-select" id="pack-select">
            <option value="osp-houserules.weapons">Weapons</option>
            <option value="osp-houserules.armor">Armor</option>
            <option value="osp-houserules.gear">Gear</option>
          </select>
        </div>
        <div class="form-group">
          <label>JSON Data:</label>
          <textarea name="json-data" rows="10" style="width: 100%; font-family: monospace;"></textarea>
        </div>
      </form>
    `,
    callback: (html) => {
      return {
        pack: html.find('[name="pack-select"]').val(),
        data: html.find('[name="json-data"]').val()
      };
    },
    rejectClose: false
  });

  if (!packName) {
    ui.notifications.warn("Import cancelled");
    return;
  }

  try {
    const items = JSON.parse(packName.data);
    const pack = game.packs.get(packName.pack);
    
    if (!pack) {
      ui.notifications.error(`Pack ${packName.pack} not found! Please create it first.`);
      return;
    }

    ui.notifications.info(`Importing ${items.length} items into ${packName.pack}...`);

    for (const itemData of items) {
      await Item.create(itemData, { pack: pack.collection });
      console.log(`Imported: ${itemData.name}`);
    }

    ui.notifications.info(`Successfully imported ${items.length} items!`);
  } catch (error) {
    ui.notifications.error(`Import failed: ${error.message}`);
    console.error(error);
  }
}

// Run the import
importItemsFromJSON();
