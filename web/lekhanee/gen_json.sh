#!/usr/bin/env bash

PDF_DIR="./pdfs"
THUMB_DIR="./thumbnails"
OUTPUT="library.json"

echo '{ "books": [' > "$OUTPUT"

id=1
first=1

for pdf in "$PDF_DIR"/*.pdf; do
  filename=$(basename -- "$pdf")
  name="${filename%.*}"
  thumb="${name}.jpg"

  # Get page count
  pages=$(pdfinfo "$pdf" | grep Pages | awk '{print $2}')

  # Get file size MB
  size_bytes=$(stat -c%s "$pdf")
  size_mb=$(echo "scale=1; $size_bytes/1024/1024" | bc)

  # Extract text of first page and guess language
  text=$(pdftotext -f 1 -l 1 "$pdf" - | head -c 500)

  if echo "$text" | grep -q "[कखगघ]"; then
    language="Marathi"
  elif echo "$text" | grep -qi "[a-z]"; then
    language="English"
  else
    language="Unknown"
  fi

  # Comma between entries except first
  if [ $first -eq 0 ]; then
    echo "," >> "$OUTPUT"
  fi
  first=0

  cat <<EOF >> "$OUTPUT"
  {
    "id": $id,
    "title": "$name",
    "author": "Unknown",
    "category": "History",
    "pdf": "$filename",
    "thumbnail": "$thumb",
    "pages": $pages,
    "size": "${size_mb} MB",
    "description": "$name (auto-generated)"
  }
EOF

  id=$((id + 1))
done

echo "]}" >> "$OUTPUT"

echo "✅ Done: $OUTPUT"

