#!/usr/bin/env python3
"""
Script to remove all portrait-related code from character-sheet.html
"""

def clean_portrait_code():
    template_path = '/home/superpcm/narlingtondata/Data/systems/osp-houserules/templates/actors/character-sheet.html'
    
    with open(template_path, 'r') as f:
        content = f.read()
    
    # Find the start of portrait JS (after "// Ability Score Tooltips System")
    # and remove everything until the real "// Ability Score Tooltips System"
    
    lines = content.split('\n')
    new_lines = []
    skip_mode = False
    found_first_tooltip = False
    
    for line in lines:
        # Start skipping when we hit portrait JS
        if 'Try multiple selector strategies' in line:
            skip_mode = True
            continue
            
        # Stop skipping when we hit the real tooltip system
        if skip_mode and '// Ability Score Tooltips System' in line and found_first_tooltip:
            skip_mode = False
            new_lines.append(line)
            continue
            
        # Track if we've seen the first tooltip comment
        if '// Ability Score Tooltips System' in line:
            found_first_tooltip = True
            
        # Skip portrait-related lines
        if skip_mode:
            continue
            
        # Remove any remaining portrait HTML/JS references
        if any(term in line for term in [
            'character-image-container',
            'character-portrait', 
            'portraitPosition',
            'portraitBorder',
            'portraitFrame',
            'initializePortraitPositioning',
            'Portrait positioning',
            'character-image',
            'image-controls'
        ]):
            continue
            
        new_lines.append(line)
    
    # Write clean content back
    with open(template_path, 'w') as f:
        f.write('\n'.join(new_lines))
    
    print("Portrait code removed from character-sheet.html")

if __name__ == '__main__':
    clean_portrait_code()
