import {
  resolveFullResolutionImagePath,
  resolveItemImagePath,
  withItemImageCacheBuster
} from './item-image-path.js';

/**
 * Client-side item card renderer using Canvas API
 * Adapted from npc-card-generator reference project for Foundry VTT
 * Handles Foundry-specific data structures (type, aac.value, lashable: boolean, tags: array)
 */

export class ItemCardRenderer {
  constructor() {
    this.CARD_WIDTH = 600;
    this.CARD_HEIGHT = 900;
    this.TEMPLATE_PATH = 'systems/osp-houserules/assets/character-sheet/item-card-journal.webp';
    this.BODY_TOP = 165;
    this.BASE_BODY_BOTTOM = 775;
    this.FOOTER_HEIGHT = 125;
    this.TEMPLATE_TOP = 170;
    this.TEMPLATE_BOTTOM = 130;
    this.TEXT_COLOR = '#2e2013';
    this.FONT_FAMILY = '"Cooper Std", "Cooper Standard", Georgia, serif';
    this.BODY_FONT_FAMILY = '"Handwritten", cursive';
    
    // Font configuration (scaled from reference 300 PPI to 72 PPI for web)
    this.FONTS = {
      NAME_SIZE: 54,
      TYPE_SIZE: 20,
      DESC_SIZE: 36,
      METADATA_SIZE: 32,
      WEAPON_META_SIZE: 32
    };
    this.LINE_HEIGHT = 40;
    
    // Field coordinates adapted from field_coordinates_item.json
    this.COORDS = {
      item_image: [300, 165],    // Centered X, top Y of the journal body
      item_name: [300, 48],       // Centered X, inside the green title band
      item_type: [300, 129],      // Three display pixels higher (canvas renders at 50%).
      description: [60, 550],     // Left X, calculated top Y of description area
      equipment_metadata: [300, 835], // Centered X, footer metadata line
      weapon_metadata_offset: 40  // Pixels below name for weapon stats
    };
    
    this.templateImage = null;
    this.templateTheme = null;
    this.fontLoaded = false;
    
    this.fontLoadPromise = this._loadFont();
  }
  
  /** Load the same Cooper face used by the character sheet before measuring text. */
  async _loadFont() {
    if (document.fonts?.load) {
      await document.fonts.load(`24px ${this.FONT_FAMILY}`);
      await document.fonts.load(`24px ${this.BODY_FONT_FAMILY}`);
    }
    this.fontLoaded = true;
  }
  
  /**
   * Load template image or create parchment background
   */
  async _loadTemplate(theme = 'parchment') {
    if (this.templateImage && this.templateTheme === theme) return this.templateImage;

    this.templateImage = await this._loadTemplateImage();
    if (!this.templateImage) this.templateImage = this._createParchmentTemplate(theme);
    this.templateTheme = theme;
    return this.templateImage;
  }

  _loadTemplateImage() {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = `${this.TEMPLATE_PATH}?v=${Date.now()}`;
    });
  }
  
  /**
   * Create a parchment-style background programmatically
   */
  _createParchmentTemplate(theme = 'parchment') {
    const canvas = document.createElement('canvas');
    canvas.width = this.CARD_WIDTH;
    canvas.height = this.CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    
    const greenTheme = theme === 'default' || theme === 'green';
    ctx.fillStyle = '#203229';
    ctx.fillRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);
    const gradient = ctx.createLinearGradient(14, 14, 14, this.CARD_HEIGHT - 14);
    if (greenTheme) {
      gradient.addColorStop(0, '#c8e7c4');
      gradient.addColorStop(0.5, '#b5ddb4');
      gradient.addColorStop(1, '#a7d0a5');
    } else {
      gradient.addColorStop(0, '#fff8dc');
      gradient.addColorStop(0.5, '#f4e7c3');
      gradient.addColorStop(1, '#ead7aa');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(14, 14, this.CARD_WIDTH - 28, this.CARD_HEIGHT - 28);

    // Keep the fallback legible when the journal image is unavailable.
    ctx.fillStyle = '#304b2a';
    ctx.fillRect(40, 30, this.CARD_WIDTH - 80, 72);
    ctx.strokeStyle = '#c9a87c';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 30, this.CARD_WIDTH - 80, 72);

    // Match the sheet's restrained double frame and small corner geometry.
    const frame = '#35563b';
    const accent = greenTheme ? '#6f9569' : '#c9a87c';
    const cornerAccent = greenTheme ? '#d4b16f' : '#c9a87c';
    ctx.strokeStyle = frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(13.5, 13.5, this.CARD_WIDTH - 27, this.CARD_HEIGHT - 27);
    ctx.strokeStyle = cornerAccent;
    ctx.lineWidth = 1;
    ctx.strokeRect(22, 22, this.CARD_WIDTH - 44, this.CARD_HEIGHT - 44);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(29, 29, this.CARD_WIDTH - 58, this.CARD_HEIGHT - 58);
    ctx.strokeStyle = cornerAccent;
    ctx.lineWidth = 1.5;
    for (const x of [17, this.CARD_WIDTH - 17]) {
      for (const y of [17, this.CARD_HEIGHT - 17]) {
        const directionX = x === 17 ? 1 : -1;
        const directionY = y === 17 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, y + directionY * 26);
        ctx.lineTo(x, y + directionY * 8);
        ctx.lineTo(x + directionX * 18, y + directionY * 8);
        ctx.stroke();
      }
    }
    
    // Return canvas directly - we'll draw from it
    return canvas;
  }
  
  /**
   * Render an item card
   * @param {Object} item - Foundry item document
   * @returns {Promise<HTMLCanvasElement>} Rendered canvas
   */
  async renderCard(item) {
    if (!this.fontLoaded) await this.fontLoadPromise;
    
    // sheetTheme is only ever set on "character" type actors (see the theme picker in
    // ose.js), so monster-owned and ownerless world items never carry a theme of their
    // own. Fall back through the controlled token's actor, then the viewing user's own
    // assigned character, before defaulting to parchment (the opt-out is explicit "default"/green).
    // NOTE: a local `const cardCanvas` (below) shadows the Foundry `canvas` global for
    // the rest of this function via TDZ, so the global must be captured up front.
    const foundryCanvas = window.canvas;
    const themeSources = [
      item.actor,
      foundryCanvas?.tokens?.controlled[0]?.actor,
      game.user?.character
    ];
    let theme;
    for (const source of themeSources) {
      theme = source?.getFlag(game.system.id, 'sheetTheme');
      if (theme) break;
    }
    theme ??= 'parchment';
    await this._loadTemplate(theme);

    const description = item.system.description || '';
    const measureCanvas = document.createElement('canvas');
    const measureContext = measureCanvas.getContext('2d');
    measureContext.font = `${this.FONTS.DESC_SIZE}px ${this.BODY_FONT_FAMILY}`;
    const descriptionLayout = this._calculateDescriptionLayout(measureContext, description);
    const { lines: descriptionLines, descriptionHeight, cardHeight, bodyBottom } = descriptionLayout;

    const cardCanvas = document.createElement('canvas');
    cardCanvas.width = this.CARD_WIDTH;
    cardCanvas.height = cardHeight;
    const ctx = cardCanvas.getContext('2d');

    this._drawTemplate(ctx, cardHeight);
    
    // Draw text elements first to get positioning
    const nameBottomY = this._drawItemName(ctx, item.name);
    
    // Calculate image position - center between name and description
    const descriptionTopY = bodyBottom - descriptionHeight;
    const imageTopY = Math.max(this.BODY_TOP, nameBottomY);
    const availableSpace = Math.max(0, descriptionTopY - imageTopY);
    
    // Load and draw item image centered in available space
    await this._drawItemImage(ctx, item, imageTopY, availableSpace);
    
    this._drawDescription(ctx, description, descriptionTopY, descriptionLines);
    
    // Type-specific metadata
    if (item.type === 'weapon') {
      this._drawWeaponMetadata(ctx, item, nameBottomY);
    } else if (item.type === 'armor') {
      this._drawArmorMetadata(ctx, item, nameBottomY);
    }
    
    // Common equipment metadata (cost, weight, capacity) with icons
    await this._drawEquipmentMetadata(ctx, item, cardHeight - 65);

    this._drawDecorativeCorners(ctx, cardHeight);

    return cardCanvas;
  }

  /** Restore the brass ornament pixels above the title and footer content. */
  _drawDecorativeCorners(ctx, height) {
    if (!this.templateImage) return;
    if (this.cornerOverlaySource !== this.templateImage) {
      const overlay = document.createElement('canvas');
      overlay.width = this.CARD_WIDTH;
      overlay.height = this.CARD_HEIGHT;
      const overlayContext = overlay.getContext('2d');
      overlayContext.drawImage(this.templateImage, 0, 0, overlay.width, overlay.height);
      const pixels = overlayContext.getImageData(0, 0, overlay.width, overlay.height);
      const mask = new Uint8Array(overlay.width * overlay.height);
      for (let y = 0; y < overlay.height; y++) {
        for (let x = 0; x < overlay.width; x++) {
          const corner = (y < 160 || y >= 760) && (x < 160 || x >= 440);
          if (!corner) continue;
          const offset = (y * overlay.width + x) * 4;
          const [red, green, blue] = pixels.data.subarray(offset, offset + 3);
          // Brass and its brown shadows are warmer than parchment or green leather.
          if (red > green * 1.15 && green > blue * 1.16) {
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < overlay.width && ny >= 0 && ny < overlay.height) {
                  mask[ny * overlay.width + nx] = 1;
                }
              }
            }
          }
        }
      }
      for (let index = 0; index < mask.length; index++) {
        if (!mask[index]) pixels.data[index * 4 + 3] = 0;
      }
      overlayContext.putImageData(pixels, 0, 0);
      this.cornerOverlay = overlay;
      this.cornerOverlaySource = this.templateImage;
    }
    const overlay = this.cornerOverlay;
    ctx.drawImage(overlay, 0, 0, this.CARD_WIDTH, 160, 0, 0, this.CARD_WIDTH, 160);
    ctx.drawImage(overlay, 0, 760, this.CARD_WIDTH, 140,
      0, height - 140, this.CARD_WIDTH, 140);
  }

  _drawTemplate(ctx, height) {
    const source = this.templateImage;
    if (!source) return;
    if (height === this.CARD_HEIGHT) {
      ctx.drawImage(source, 0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);
      return;
    }

    const sourceWidth = source.width || this.CARD_WIDTH;
    const sourceHeight = source.height || this.CARD_HEIGHT;
    const sourceScale = sourceWidth / this.CARD_WIDTH;
    const top = this.TEMPLATE_TOP;
    const bottom = this.TEMPLATE_BOTTOM;
    const sourceTop = top * sourceScale;
    const sourceBottom = bottom * sourceScale;
    const middleHeight = height - top - bottom;
    const sourceMiddleHeight = sourceHeight - sourceTop - sourceBottom;
    ctx.drawImage(source, 0, 0, sourceWidth, sourceTop, 0, 0, this.CARD_WIDTH, top);
    ctx.drawImage(source, 0, sourceTop, sourceWidth, sourceMiddleHeight, 0, top, this.CARD_WIDTH, middleHeight);
    ctx.drawImage(source, 0, sourceHeight - sourceBottom, sourceWidth, sourceBottom, 0, height - bottom, this.CARD_WIDTH, bottom);
  }
  
  /**
   * Load and draw item image (centered vertically in available space)
   */
  async _drawItemImage(ctx, item, topBoundary, availableHeight) {
    return new Promise((resolve) => {
      const img = new Image();
      
      img.onload = () => {
        const centerX = this.CARD_WIDTH / 2;
        const padding = 50; // Reduced padding for more space
        const maxWidth = this.CARD_WIDTH - (padding * 2);
        const maxHeight = availableHeight - 20; // Small margin to prevent overlap
        
        let width = img.width;
        let height = img.height;
        
        // Scale to fill available space while maintaining aspect ratio
        const widthScale = maxWidth / width;
        const heightScale = maxHeight / height;
        const scale = Math.min(widthScale, heightScale);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
        
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

      // Resolve legacy system paths, userdata uploads, and thumbnail siblings
      // without changing the path's storage root.
      imgSrc = resolveFullResolutionImagePath(resolveItemImagePath(imgSrc));

      // Use both timestamp and random to defeat all caching
      img.src = withItemImageCacheBuster(imgSrc, Date.now(), Math.random());
    });
  }
  
  /**
   * Draw placeholder when no image available
   */
  _drawPlaceholder(ctx, topBoundary, availableHeight) {
    const centerX = this.CARD_WIDTH / 2;
    const size = Math.min(availableHeight - 20, this.CARD_WIDTH - 100); // Fill space with small margin
    const x = centerX - (size / 2);
    const y = topBoundary + (availableHeight - size) / 2;
    
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    
    // Draw "?" in center
    ctx.fillStyle = '#666666';
    ctx.font = `bold 80px ${this.FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', centerX, y + (size / 2));
  }
  
  /**
   * Draw item name (centered, scaled to fit)
   * @returns {number} Bottom Y coordinate of name text
   */
  _drawItemName(ctx, name) {
    const [centerX] = this.COORDS.item_name;
    const maxWidth = 380;
    
    ctx.fillStyle = '#f6eac2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Start with the same display face used by the character sheet.
    let fontSize = this.FONTS.NAME_SIZE;
    ctx.font = `bold ${fontSize}px ${this.FONT_FAMILY}`;
    
    // Scale down if text too wide
    let textWidth = ctx.measureText(name).width;
    if (textWidth > maxWidth) {
      fontSize = Math.floor(fontSize * (maxWidth / textWidth));
      ctx.font = `bold ${fontSize}px ${this.FONT_FAMILY}`;
      textWidth = ctx.measureText(name).width;
    }
    
    // Center the visible letter shapes, rather than the font's em box.
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(name);
    const ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.75;
    const descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.2;
    ctx.fillText(name, centerX, 66 + (ascent - descent) / 2);
    
    // Return bottom Y (approximate height)
    return 105;
  }
  
  /**
   * Draw item type (centered)
   */
  _drawItemType(ctx, type) {
    const [centerX, y] = this.COORDS.item_type;
    
    // Capitalize type for display (weapon -> Weapon)
    const displayType = type.charAt(0).toUpperCase() + type.slice(1);
    
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.font = `${this.FONTS.TYPE_SIZE}px ${this.BODY_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(displayType, centerX, y);
  }
  
  /**
   * Draw description with text wrapping and justification
   */
  _wrapDescription(ctx, description) {
    if (!description) return [];
    const maxWidth = this.CARD_WIDTH - 120;
    const words = String(description).trim().split(/\s+/);
    const lines = [];
    let currentLine = [];
    for (const word of words) {
      const testLine = [...currentLine, word].join(' ');
      if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine.join(' '));
        currentLine = [word];
      } else {
        currentLine.push(word);
      }
    }
    if (currentLine.length > 0) lines.push(currentLine.join(' '));
    return lines;
  }

  _calculateDescriptionLayout(ctx, description) {
    const lines = this._wrapDescription(ctx, description);
    const descriptionHeight = lines.length * this.LINE_HEIGHT;
    const baseDescriptionTop = this.BASE_BODY_BOTTOM - descriptionHeight;
    const extraHeight = Math.max(0, this.BODY_TOP + 180 - baseDescriptionTop);
    return {
      lines,
      descriptionHeight,
      descriptionTop: this.BASE_BODY_BOTTOM + extraHeight - descriptionHeight,
      bodyBottom: this.BASE_BODY_BOTTOM + extraHeight,
      cardHeight: this.CARD_HEIGHT + extraHeight
    };
  }

  _drawDescription(ctx, description, topY = this.COORDS.description[1], wrappedLines = null) {
    if (!description) return;

    const [leftX] = this.COORDS.description;
    const lineHeight = this.LINE_HEIGHT;
    
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.font = `${this.FONTS.DESC_SIZE}px ${this.BODY_FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Draw lines left aligned to match the sheet's readable text blocks.
    let currentY = topY;
    (wrappedLines || this._wrapDescription(ctx, description)).forEach((line) => {
      ctx.fillText(line, leftX, currentY);
      currentY += lineHeight;
    });

  }
  
  /**
   * Draw weapon metadata line (damage, type, size, speed, ROF)
   */
  _drawWeaponMetadata(ctx, item, nameBottomY) {
    const [, metadataY] = this.COORDS.item_type;
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
    const maxWidth = 460; // Card width (600) minus padding (increased by 10px per side)
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const metadataText = parts.join(' • ');
    
    // Start with base font size
    let fontSize = this.FONTS.WEAPON_META_SIZE;
    ctx.font = `${fontSize}px ${this.BODY_FONT_FAMILY}`;
    
    // Scale down if text too wide
    let textWidth = ctx.measureText(metadataText).width;
    if (textWidth > maxWidth) {
      fontSize = Math.floor(fontSize * (maxWidth / textWidth));
      ctx.font = `${fontSize}px ${this.BODY_FONT_FAMILY}`;
    }
    
    ctx.fillText(metadataText, centerX, metadataY);
  }
  
  /**
   * Draw armor metadata line (AC value)
   */
  _drawArmorMetadata(ctx, item, nameBottomY) {
    const armorClass = item.system.aac?.value;
    if (!armorClass) return;
    
    const [, metadataY] = this.COORDS.item_type;
    const centerX = this.CARD_WIDTH / 2;
    
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.font = `${this.FONTS.WEAPON_META_SIZE}px ${this.BODY_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`AC: ${armorClass}`, centerX, metadataY);
  }
  
  /**
   * Draw equipment metadata (cost, weight, capacity, lashable)
   */
  async _drawEquipmentMetadata(ctx, item, footerY = this.COORDS.equipment_metadata[1]) {
    const [centerX] = this.COORDS.equipment_metadata;
    const y = footerY;
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
    ctx.font = `${this.FONTS.METADATA_SIZE}px ${this.BODY_FONT_FAMILY}`;
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
      
      // Raise values one display pixel without moving the icons.
      ctx.fillText(metaItem.text, x, y + 1);
      
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
