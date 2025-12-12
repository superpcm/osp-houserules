/**
 * Client-side item card renderer using Canvas API
 * Adapted from npc-card-generator reference project for Foundry VTT
 * Handles Foundry-specific data structures (type, aac.value, lashable: boolean, tags: array)
 */

export class ItemCardRenderer {
  constructor() {
    this.CARD_WIDTH = 600;
    this.CARD_HEIGHT = 900;
    this.TEXT_COLOR = "#4B4B4B";
    
    // Font configuration (scaled from reference 300 PPI to 72 PPI for web)
    this.FONTS = {
      NAME_SIZE: 80,
      TYPE_SIZE: 24,
      DESC_SIZE: 24,
      METADATA_SIZE: 30,
      WEAPON_META_SIZE: 30
    };
    
    // Field coordinates adapted from field_coordinates_item.json
    this.COORDS = {
      item_image: [300, 170],    // Centered X, top Y
      item_name: [300, 85],       // Centered X, Y position (70px from top)
      item_type: [300, 50],       // Centered X, Y position (50px from top)
      description: [50, 550],     // Left X, top Y of description area (moved up 10px)
      equipment_metadata: [300, 835], // Centered X, bottom metadata line
      weapon_metadata_offset: 10  // Pixels below name for weapon stats
    };
    
    this.templateImage = null;
    this.fontLoaded = false;
    
    this._loadFont();
  }
  
  /**
   * Load the handwritten font
   * Uses system serif fonts as fallback until custom font is added
   */
  async _loadFont() {
    // Font loading would go here when custom font is available
    // For now, using system serif fonts which work well for cards
    this.fontLoaded = true;
  }
  
  /**
   * Load template image or create parchment background
   */
  async _loadTemplate() {
    if (this.templateImage) return this.templateImage;
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        this.templateImage = img;
        resolve(img);
      };
      
      img.onerror = (error) => {
        // Template not found - create programmatic parchment background
        this.templateImage = this._createParchmentTemplate();
        resolve(this.templateImage);
      };
      
      // Try to load template with aggressive cache busting
      img.src = `systems/osp-houserules/assets/character-sheet/item-card.webp?v=${Date.now()}&r=${Math.random()}`;
    });
  }
  
  /**
   * Create a parchment-style background programmatically
   */
  _createParchmentTemplate() {
    const canvas = document.createElement('canvas');
    canvas.width = this.CARD_WIDTH;
    canvas.height = this.CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    
    // Parchment background with slight gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, this.CARD_HEIGHT);
    gradient.addColorStop(0, '#F4E8D0');
    gradient.addColorStop(0.5, '#F0E4CC');
    gradient.addColorStop(1, '#EAD9B8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);
    
    // Add subtle border
    ctx.strokeStyle = '#C4A570';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, this.CARD_WIDTH - 20, this.CARD_HEIGHT - 20);
    
    // Inner decorative border
    ctx.strokeStyle = '#D4B580';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, 15, this.CARD_WIDTH - 30, this.CARD_HEIGHT - 30);
    
    // Return canvas directly - we'll draw from it
    return canvas;
  }
  
  /**
   * Render an item card
   * @param {Object} item - Foundry item document
   * @returns {Promise<HTMLCanvasElement>} Rendered canvas
   */
  async renderCard(item) {
    if (!this.fontLoaded) {
      await this._loadFont();
    }
    
    await this._loadTemplate();
    
    const canvas = document.createElement('canvas');
    canvas.width = this.CARD_WIDTH;
    canvas.height = this.CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    
    // Draw template (handles both Image and Canvas)
    if (this.templateImage instanceof HTMLCanvasElement) {
      ctx.drawImage(this.templateImage, 0, 0);
    } else {
      ctx.drawImage(this.templateImage, 0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);
    }
    
    // Draw text elements first to get positioning
    const nameBottomY = this._drawItemName(ctx, item.name);
    this._drawItemType(ctx, item.type);
    
    // Calculate image position - center between name and description
    const descriptionTopY = this.COORDS.description[1];
    const availableSpace = descriptionTopY - nameBottomY;
    
    // Load and draw item image centered in available space
    await this._drawItemImage(ctx, item, nameBottomY, availableSpace);
    
    this._drawDescription(ctx, item.system.description || '');
    
    // Type-specific metadata
    if (item.type === 'weapon') {
      this._drawWeaponMetadata(ctx, item, nameBottomY);
    } else if (item.type === 'armor') {
      this._drawArmorMetadata(ctx, item, nameBottomY);
    }
    
    // Common equipment metadata (cost, weight, capacity) with icons
    await this._drawEquipmentMetadata(ctx, item);
    
    return canvas;
  }
  
  /**
   * Load and draw item image (centered vertically in available space)
   */
  async _drawItemImage(ctx, item, topBoundary, availableHeight) {
    return new Promise((resolve) => {
      const img = new Image();
      
      img.onload = () => {
        const centerX = this.CARD_WIDTH / 2;
        const padding = 100;
        const maxWidth = this.CARD_WIDTH - (padding * 2);  // 400px
        const maxHeight = availableHeight * 0.9;  // Use 90% of available space
        
        let width = img.width;
        let height = img.height;
        
        // Scale down if needed
        if (width > maxWidth || height > maxHeight) {
          const widthScale = maxWidth / width;
          const heightScale = maxHeight / height;
          const scale = Math.min(widthScale, heightScale);
          width = Math.floor(width * scale);
          height = Math.floor(height * scale);
        }
        
        // Reduce by 10%
        width = Math.floor(width * 0.9);
        height = Math.floor(height * 0.9);
        
        // Center horizontally and vertically in available space
        const x = centerX - (width / 2);
        const y = topBoundary + (availableHeight - height) / 2;
        
        ctx.drawImage(img, x, y, width, height);
        resolve();
      };
      
      img.onerror = (error) => {
        // Draw placeholder if image fails
        this._drawPlaceholder(ctx, topBoundary, availableHeight);
        resolve();
      };
      
      // Use item image with aggressive cache busting, or placeholder
      let imgSrc = item.img || 'systems/osp-houserules/assets/character-sheet/item_placeholder.png';
      
      // Ensure proper system path prefix for relative paths
      if (imgSrc && !imgSrc.startsWith('systems/') && !imgSrc.startsWith('http')) {
        imgSrc = `systems/osp-houserules/${imgSrc}`;
      }
      
      // Use both timestamp and random to defeat all caching
      img.src = `${imgSrc}?v=${Date.now()}&r=${Math.random()}`;
    });
  }
  
  /**
   * Draw placeholder when no image available
   */
  _drawPlaceholder(ctx, topBoundary, availableHeight) {
    const centerX = this.CARD_WIDTH / 2;
    const size = Math.min(200, availableHeight * 0.8);
    const x = centerX - (size / 2);
    const y = topBoundary + (availableHeight - size) / 2;
    
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    
    // Draw "?" in center
    ctx.fillStyle = '#666666';
    ctx.font = 'bold 80px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', centerX, y + (size / 2));
  }
  
  /**
   * Draw item name (centered, scaled to fit)
   * @returns {number} Bottom Y coordinate of name text
   */
  _drawItemName(ctx, name) {
    const [centerX, y] = this.COORDS.item_name;
    const maxWidth = 460;
    
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    // Start with base font size - using handwritten style fonts
    let fontSize = this.FONTS.NAME_SIZE;
    ctx.font = `bold ${fontSize}px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive`;
    
    // Scale down if text too wide
    let textWidth = ctx.measureText(name).width;
    if (textWidth > maxWidth) {
      fontSize = Math.floor(fontSize * (maxWidth / textWidth));
      ctx.font = `bold ${fontSize}px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive`;
      textWidth = ctx.measureText(name).width;
    }
    
    ctx.fillText(name, centerX, y);
    
    // Return bottom Y (approximate height)
    return y + fontSize;
  }
  
  /**
   * Draw item type (centered)
   */
  _drawItemType(ctx, type) {
    const [centerX, y] = this.COORDS.item_type;
    
    // Capitalize type for display (weapon -> Weapon)
    const displayType = type.charAt(0).toUpperCase() + type.slice(1);
    
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.font = `${this.FONTS.TYPE_SIZE}px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(displayType, centerX, y);
  }
  
  /**
   * Draw description with text wrapping and justification
   */
  _drawDescription(ctx, description) {
    if (!description) return;
    
    const [leftX, topY] = this.COORDS.description;
    const padding = 50;
    const maxWidth = this.CARD_WIDTH - (padding * 2);
    const lineHeight = 30;
    
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.font = `${this.FONTS.DESC_SIZE}px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Word wrap
    const words = description.split(' ');
    const lines = [];
    let currentLine = [];
    
    for (const word of words) {
      const testLine = [...currentLine, word].join(' ');
      const testWidth = ctx.measureText(testLine).width;
      
      if (testWidth > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [word];
      } else {
        currentLine.push(word);
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    
    // Draw lines (justified except last line)
    let currentY = topY;
    lines.forEach((line, index) => {
      const isLastLine = (index === lines.length - 1);
      
      if (isLastLine || line.length === 1) {
        // Left-aligned
        ctx.fillText(line.join(' '), leftX, currentY);
      } else {
        // Justified - distribute space between words
        const lineText = line.join(' ');
        const textWidth = ctx.measureText(lineText).width;
        const totalSpace = maxWidth - textWidth;
        const spaceBetween = totalSpace / (line.length - 1);
        
        let x = leftX;
        line.forEach((word, i) => {
          ctx.fillText(word, x, currentY);
          const wordWidth = ctx.measureText(word).width;
          x += wordWidth + ctx.measureText(' ').width + spaceBetween;
        });
      }
      
      currentY += lineHeight;
    });
  }
  
  /**
   * Draw weapon metadata line (damage, type, size, speed, ROF)
   */
  _drawWeaponMetadata(ctx, item, nameBottomY) {
    const metadataY = nameBottomY + this.COORDS.weapon_metadata_offset;
    const centerX = this.CARD_WIDTH / 2;
    
    const parts = [];
    
    // Damage - handle both Foundry versatile structure and simple structure
    const damage = item.system.damage;
    if (damage) {
      if (damage.oneHanded && damage.twoHanded) {
        // Versatile weapon
        const oneNormal = damage.oneHanded.normal || '';
        const oneLarge = damage.oneHanded.large || '';
        const twoNormal = damage.twoHanded.normal || '';
        const twoLarge = damage.twoHanded.large || '';
        if (oneNormal && oneLarge && twoNormal && twoLarge) {
          parts.push(`${oneNormal}/${oneLarge} | ${twoNormal}/${twoLarge}`);
        }
      } else if (damage.oneHanded) {
        const normal = damage.oneHanded.normal || '';
        const large = damage.oneHanded.large || '';
        if (normal && large) {
          parts.push(`${normal}/${large}`);
        }
      } else if (damage.twoHanded) {
        const normal = damage.twoHanded.normal || '';
        const large = damage.twoHanded.large || '';
        if (normal && large) {
          parts.push(`${normal}/${large}`);
        }
      } else if (typeof damage === 'string') {
        // Simple string damage
        parts.push(damage);
      }
    }
    
    // Damage type
    if (item.system.damageType) {
      parts.push(`DT:${item.system.damageType}`);
    }
    
    // Size
    if (item.system.size) {
      parts.push(`SZ:${item.system.size}`);
    }
    
    // Speed factor
    if (item.system.speedFactor !== undefined && item.system.speedFactor !== '') {
      parts.push(`SF:${item.system.speedFactor}`);
    }
    
    // Rate of fire (only for missile weapons)
    if (item.system.missile === true && item.system.rof !== undefined && item.system.rof !== '') {
      parts.push(`RoF:${item.system.rof}`);
    }
    
    if (parts.length === 0) return;
    
    // Draw weapon metadata line with dynamic font sizing
    const maxWidth = 500; // Card width (600) minus padding
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const metadataText = parts.join(' • ');
    
    // Start with base font size
    let fontSize = this.FONTS.WEAPON_META_SIZE;
    ctx.font = `${fontSize}px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive`;
    
    // Scale down if text too wide
    let textWidth = ctx.measureText(metadataText).width;
    if (textWidth > maxWidth) {
      fontSize = Math.floor(fontSize * (maxWidth / textWidth));
      ctx.font = `${fontSize}px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive`;
    }
    
    ctx.fillText(metadataText, centerX, metadataY);
  }
  
  /**
   * Draw armor metadata line (AC value)
   */
  _drawArmorMetadata(ctx, item, nameBottomY) {
    const armorClass = item.system.aac?.value;
    if (!armorClass) return;
    
    const metadataY = nameBottomY + this.COORDS.weapon_metadata_offset;
    const centerX = this.CARD_WIDTH / 2;
    
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.font = `${this.FONTS.WEAPON_META_SIZE}px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`AC: ${armorClass}`, centerX, metadataY);
  }
  
  /**
   * Draw equipment metadata (cost, weight, capacity, lashable)
   */
  async _drawEquipmentMetadata(ctx, item) {
    const [centerX, y] = this.COORDS.equipment_metadata;
    const iconSize = 30;
    const iconPadding = 5;
    const itemSpacing = 20;
    
    const items = [];
    
    // Cost with coin icon
    if (item.system.cost !== undefined && item.system.cost !== '') {
      let costValue = item.system.cost;
      if (costValue >= 1000) {
        costValue = costValue.toLocaleString();
      }
      items.push({ icon: 'coin-icon.webp', text: `${costValue}sp` });
    }
    
    // Weight with weight icon (skip for livestock)
    if (item.type !== 'livestock' && item.system.unitWeight !== undefined && item.system.unitWeight !== '') {
      items.push({ icon: 'weight-icon.webp', text: `${item.system.unitWeight}lbs` });
    }
    
    // Stored size with capacity icon (skip for livestock)
    if (item.type !== 'livestock' && item.system.storedSize !== undefined && item.system.storedSize !== '') {
      items.push({ icon: 'stored-icon.webp', text: `${item.system.storedSize}S` });
    }
    
    // Container capacity with capacity icon
    if (item.type === 'container' && item.system.capacity !== undefined && item.system.capacity !== '') {
      items.push({ icon: 'capacity-icon.webp', text: `${item.system.capacity}C` });
    }
    
    if (items.length === 0 && item.system.lashable !== true) return;
    
    // Calculate total width needed
    ctx.font = `${this.FONTS.METADATA_SIZE}px "Segoe Script", "Comic Sans MS", "Bradley Hand", cursive`;
    let totalWidth = 0;
    for (const item of items) {
      const textWidth = ctx.measureText(item.text).width;
      totalWidth += iconSize + iconPadding + textWidth + itemSpacing;
    }
    
    // Add lashable icon width if needed
    if (item.system.lashable === true) {
      totalWidth += iconSize + itemSpacing;
    }
    
    totalWidth -= itemSpacing; // Remove last spacing
    
    // Start position (centered)
    let x = centerX - (totalWidth / 2);
    
    // Set text properties once before loop
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Draw each metadata item with icon
    for (const metaItem of items) {
      // Load and draw icon centered vertically at y
      const icon = await this._loadIcon(`systems/osp-houserules/assets/images/icons/${metaItem.icon}`);
      if (icon) {
        // Center icon vertically: y is middle, so top = y - (iconSize / 2)
        ctx.drawImage(icon, x, y - (iconSize / 2), iconSize, iconSize);
      }
      x += iconSize + iconPadding;
      
      // Draw text 3px lower than icon center
      ctx.fillText(metaItem.text, x, y + 3);
      
      const textWidth = ctx.measureText(metaItem.text).width;
      x += textWidth + itemSpacing;
    }
    
    // Draw lashable icon at the end if applicable, centered at y
    if (item.system.lashable === true) {
      const lashIcon = await this._loadIcon('systems/osp-houserules/assets/images/icons/lash-icon.webp');
      if (lashIcon) {
        ctx.drawImage(lashIcon, x, y - (iconSize / 2), iconSize, iconSize);
      }
    }
  }
  
  /**
   * Load an icon image
   */
  async _loadIcon(path) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `${path}?v=${Date.now()}`;
    });
  }
}
