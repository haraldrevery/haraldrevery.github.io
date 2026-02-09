#!/bin/bash
echo "Starting Tailwind Build Suite..."

# 1. Main Minified
./tw -i input.css -o main.css --watch --content "./*.html,./notebook_pages/**/*.{html,md}" --minify &

# 2. Main Unminified (Full)
./tw -i input.css -o main_max.css --watch --content "./*.html,./notebook_pages/**/*.{html,md}" &

# 3. Prose Minified
./tw -i input_prose.css -o prose.css --watch --content "./*.html,./notebook_pages/**/*.{html,md}" --minify &

# 4. Prose Unminified (Full)
echo "Watching Prose Max (Unminified)..."
./tw -i input_prose.css -o prose_max.css --watch --content "./*.html,./notebook_pages/**/*.{html,md}"
