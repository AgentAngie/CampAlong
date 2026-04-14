#!/bin/bash
# Rename CampAlong → CampAlong throughout the codebase
# Run from project root: bash rename-campalong.sh

PROJECT_DIR="$(pwd)"
echo "Starting CampAlong → CampAlong rename in: $PROJECT_DIR"

find . \
  -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -name "*.png" \
  -not -name "*.jpg" \
  -not -name "*.jpeg" \
  -not -name "*.gif" \
  -not -name "*.ico" \
  -not -name "*.woff" \
  -not -name "*.woff2" \
  -not -name "*.ttf" \
  -not -name "*.eot" \
  -not -name "*.map" \
  | while read file; do
    if grep -qI "CampAlong\|campalong\|camp-along\|camp_along" "$file" 2>/dev/null; then
      echo "  Updating: $file"
      sed -i '' \
        -e 's/CampAlong/CampAlong/g' \
        -e 's/campalong/campalong/g' \
        -e 's/camp-along/camp-along/g' \
        -e 's/camp_along/camp_along/g' \
        -e 's/CAMPALONG/CAMPALONG/g' \
        "$file"
    fi
  done

find . \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  \( -name "*campalong*" -o -name "*camp-along*" -o -name "*camp_along*" \) \
  | while read file; do
    newname=$(echo "$file" | sed \
      -e 's/campalong/campalong/g' \
      -e 's/camp-along/camp-along/g' \
      -e 's/camp_along/camp_along/g')
    if [ "$file" != "$newname" ]; then
      echo "  Renaming file: $file → $newname"
      mv "$file" "$newname"
    fi
  done

echo ""
echo "Done. Verify with:"
echo "  grep -r 'CampAlong\|campalong' . --include='*.js' --include='*.html' --include='*.css' --include='*.json' | grep -v node_modules"
