export class ImageHandler {
  constructor(html, actor) {
    this.html = html;
    this.actor = actor;
    this._isDragging = false;
    this._isResizing = false;
    this.startX = 0;
    this.startY = 0;
    this.startLeft = 0;
    this.startTop = 0;
    this.startWidth = 0;
    this.startHeight = 0;
    this.currentHandle = null;
  }

  get isDragging() {
    return this._isDragging;
  }

  set isDragging(value) {
    this._isDragging = value;
  }

  get isResizing() {
    return this._isResizing;
  }

  set isResizing(value) {
    this._isResizing = value;
  }

  initialize() {
    this.setupImageControls();
    this.setupEventListeners();
  }

  setupImageControls() {
    const container = this.html.find('.character-image-container');
    const image = this.html.find('.character-portrait');
    
    // Show controls on hover
    container.on('mouseenter', () => {
      this.html.find('.resize-handle, .image-controls').show();
    });
    
    container.on('mouseleave', () => {
      if (!this.isDragging && !this.isResizing) {
        this.html.find('.resize-handle, .image-controls').hide();
      }
    });

    // Load saved image transform
    this.loadImageTransform();
  }

  setupEventListeners() {
    const portraitElement = this.html.find('.character-portrait')[0];
    
    // Simple test event to verify the element is clickable
    this.html.find('.character-portrait').on('click', (event) => {
      // Click handler for basic functionality
    });
    
    if (portraitElement) {
      // Try native DOM events instead of jQuery
      portraitElement.addEventListener('mousedown', (event) => {
        // Only handle left click for dragging
        if (event.which === 1 || event.button === 0) {
          event.preventDefault();
          event.stopPropagation();
          this.startDrag(event);
        }
      });
      
      portraitElement.addEventListener('click', (event) => {
        if (this.isDragging || this.isResizing) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }
    
    // Also keep jQuery version as fallback
    this.html.find('.character-portrait').on('mousedown', (event) => {
      // Only handle left click for dragging
      if (event.which === 1) {
        event.preventDefault();
        event.stopPropagation();
        this.startDrag(event);
      }
    });
    
    // Prevent Foundry's default image click behavior
    this.html.find('.character-portrait').on('click', (event) => {
      if (this.isDragging || this.isResizing) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    
    // Double-click on image container (not image itself) to change image
    this.html.find('.character-image').on('dblclick', (event) => {
      event.preventDefault();
      this.openImagePicker();
    });
    
    // Resize handles
    this.html.find('.resize-handle').on('mousedown', this.startResize.bind(this));
    
    // Control buttons
    this.html.find('.reset-image').on('click', this.resetImage.bind(this));
    this.html.find('.fit-image').on('click', this.fitImage.bind(this));
    
    // DON'T bind global mouse events here - we'll bind them only when dragging starts
  }

  startDrag(event) {
    event.preventDefault();
    this.isDragging = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    
    const image = this.html.find('.character-portrait');
    const transform = this.getTransformValues(image);
    this.startLeft = transform.translateX;
    this.startTop = transform.translateY;
    
    // Change cursor and prevent controls from hiding
    image.css('cursor', 'grabbing');
    this.html.find('.resize-handle, .image-controls').show();
    
    // Add visual feedback to container
    this.html.find('.character-image').addClass('dragging');
    
    // NOW bind the global mouse events only when dragging starts
    $(document).on('mousemove.imageHandlerDrag', this.handleMouseMove.bind(this));
    $(document).on('mouseup.imageHandlerDrag', this.handleMouseUp.bind(this));
  }

  startResize(event) {
    event.preventDefault();
    event.stopPropagation();
    this.isResizing = true;
    this.currentHandle = $(event.target).attr('class').split(' ')[1]; // get resize direction
    this.startX = event.clientX;
    this.startY = event.clientY;
    
    const image = this.html.find('.character-portrait');
    const transform = this.getTransformValues(image);
    this.startWidth = transform.scaleX;
    this.startHeight = transform.scaleY;
    
    // Bind global mouse events for resizing
    console.log('ImageHandler: Binding global mouse events for resizing');
    $(document).on('mousemove.imageHandlerResize', this.handleMouseMove.bind(this));
    $(document).on('mouseup.imageHandlerResize', this.handleMouseUp.bind(this));
  }

  handleMouseMove(event) {
    if (this.isDragging) {
      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;
      const newLeft = this.startLeft + deltaX;
      const newTop = this.startTop + deltaY;
      
      this.applyTransform(newLeft, newTop, null, null);
    } else if (this.isResizing) {
      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;
      
      // Calculate the larger delta to maintain proportions
      const avgDelta = (Math.abs(deltaX) + Math.abs(deltaY)) / 2;
      let scaleFactor = 1;
      
      // Determine direction based on handle and calculate scale
      switch (this.currentHandle) {
        case 'resize-se':
          scaleFactor = this.startWidth + (avgDelta * 0.01 * Math.sign(deltaX + deltaY));
          break;
        case 'resize-sw':
          scaleFactor = this.startWidth + (avgDelta * 0.01 * Math.sign(-deltaX + deltaY));
          break;
        case 'resize-ne':
          scaleFactor = this.startWidth + (avgDelta * 0.01 * Math.sign(deltaX - deltaY));
          break;
        case 'resize-nw':
          scaleFactor = this.startWidth + (avgDelta * 0.01 * Math.sign(-deltaX - deltaY));
          break;
      }
      
      // Maintain minimum and maximum scale
      scaleFactor = Math.max(0.3, Math.min(3.0, scaleFactor));
      
      // Apply same scale to both X and Y to maintain proportions
      this.applyTransform(null, null, scaleFactor, scaleFactor);
    }
  }

  handleMouseUp() {
    if (this.isDragging || this.isResizing) {
      this.saveImageTransform();
      this.isDragging = false;
      this.isResizing = false;
      this.currentHandle = null;
      
      // Reset cursor and visual feedback
      this.html.find('.character-portrait').css('cursor', 'move');
      this.html.find('.character-image').removeClass('dragging');
      
      // Clean up global events (both drag and resize)
      $(document).off('mousemove.imageHandlerDrag');
      $(document).off('mouseup.imageHandlerDrag');
      $(document).off('mousemove.imageHandlerResize');
      $(document).off('mouseup.imageHandlerResize');
      
      // Hide controls after a brief delay
      setTimeout(() => {
        if (!this.isDragging && !this.isResizing) {
          this.html.find('.resize-handle, .image-controls').hide();
        }
      }, 100);
    }
  }

  applyTransform(translateX, translateY, scaleX, scaleY) {
    const image = this.html.find('.character-portrait');
    const current = this.getTransformValues(image);
    
    const newTranslateX = translateX !== null ? translateX : current.translateX;
    const newTranslateY = translateY !== null ? translateY : current.translateY;
    const newScaleX = scaleX !== null ? scaleX : current.scaleX;
    const newScaleY = scaleY !== null ? scaleY : current.scaleY;
    
    const transform = `translate(${newTranslateX}px, ${newTranslateY}px) scale(${newScaleX}, ${newScaleY})`;
    image.css('transform', transform);
  }

  getTransformValues(element) {
    const transform = element.css('transform');
    const defaultValues = { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 };
    
    if (!transform || transform === 'none') return defaultValues;
    
    const matrix = transform.match(/matrix.*\((.+)\)/);
    if (!matrix) return defaultValues;
    
    const values = matrix[1].split(', ').map(parseFloat);
    return {
      translateX: values[4] || 0,
      translateY: values[5] || 0,
      scaleX: values[0] || 1,
      scaleY: values[3] || 1
    };
  }

  resetImage() {
    this.html.find('.character-portrait').css('transform', 'translate(0px, 0px) scale(1, 1)');
    this.saveImageTransform();
  }

  fitImage() {
    this.html.find('.character-portrait').css('transform', 'translate(0px, 0px) scale(1, 1)');
    this.saveImageTransform();
  }

  openImagePicker() {
    // Use Foundry's file picker for image selection
    const picker = new FilePicker({
      type: "image",
      callback: (imagePath) => {
        this.actor.update({"img": imagePath});
      }
    });
    picker.render(true);
  }

  saveImageTransform() {
    const image = this.html.find('.character-portrait');
    const transform = this.getTransformValues(image);
    
    // Save to actor data
    this.actor.update({
      'system.imageTransform': {
        translateX: transform.translateX,
        translateY: transform.translateY,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY
      }
    });
  }

  loadImageTransform() {
    const transform = this.actor.system.imageTransform;
    if (transform) {
      this.applyTransform(
        transform.translateX || 0,
        transform.translateY || 0,
        transform.scaleX || 1,
        transform.scaleY || 1
      );
    }
  }

  destroy() {
    // Clean up event listeners
    $(document).off('mousemove.imageHandler');
    $(document).off('mouseup.imageHandler');
    $(document).off('mousemove.imageHandlerDrag');
    $(document).off('mouseup.imageHandlerDrag');
    $(document).off('mousemove.imageHandlerResize');
    $(document).off('mouseup.imageHandlerResize');
    console.log('ImageHandler: Destroyed and cleaned up all event listeners');
  }
}
