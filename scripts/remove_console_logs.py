#!/usr/bin/env python3
"""Remove console.log statements from JavaScript files while preserving code structure."""

import re
import sys

def remove_console_logs(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    output_lines = []
    skip_until_semicolon = False
    brace_count = 0
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Check if this line starts a console.log
        if 'console.log(' in line:
            # Count braces to handle multi-line console.log
            brace_count = line.count('{') - line.count('}')
            paren_count = line.count('(') - line.count(')')
            
            # If the console.log is complete on this line (ends with semicolon or closing paren+semicolon)
            if ';' in line and (paren_count == 0 or brace_count == 0):
                # Skip this entire line
                continue
            else:
                # Multi-line console.log, skip until we find the closing
                skip_until_semicolon = True
                continue
        
        # If we're skipping lines in a multi-line console.log
        if skip_until_semicolon:
            brace_count += line.count('{') - line.count('}')
            paren_count = line.count('(') - line.count(')')
            
            # Check if this line closes the console.log
            if ';' in line and brace_count <= 0:
                skip_until_semicolon = False
            continue
        
        # Keep this line
        output_lines.append(line)
    
    # Write back
    with open(filepath, 'w') as f:
        f.writelines(output_lines)
    
    return len(lines) - len(output_lines)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: remove_console_logs.py <filepath>")
        sys.exit(1)
    
    removed = remove_console_logs(sys.argv[1])
    print(f"Removed {removed} lines containing console.log statements")
