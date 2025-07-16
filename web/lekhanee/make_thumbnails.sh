#!/bin/bash

PDF_DIR="./pdfs"
THUMB_DIR="./thumbnails"

mkdir -p "$THUMB_DIR"

for pdf in "$PDF_DIR"/*.pdf; do
  filename=$(basename -- "$pdf")
  name="${filename%.*}"

  # High quality thumbnail from first page only, DPI 300
  pdftoppm -jpeg -f 0 -singlefile -r 300 "$pdf" "$THUMB_DIR/$name"
done

