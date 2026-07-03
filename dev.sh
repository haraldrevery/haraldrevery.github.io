#!/bin/bash
echo "Starting Tailwind Build Suite..."

<<<<<<< HEAD
# Pipe an infinite empty stream into the background processes 
# to keep stdin open and prevent Tailwind CLI from auto-exiting.

# 1. Main Minified
tail -f /dev/null | ./tailwindcss-linux-x64 -i input.css -o main.css --watch --content "./*.html,./html_extras/**/*.{html,md},./notebook_templates/**/*.{html,md}" --minify &

# 2. Main Unminified (Full)
tail -f /dev/null | ./tailwindcss-linux-x64 -i input.css -o main_max.css --watch --content "./*.html,./html_extras/**/*.{html,md},./notebook_templates/**/*.{html,md}" &

# 3. Prose Minified
tail -f /dev/null | ./tailwindcss-linux-x64 -i input_prose.css -o prose.css --watch --content "./*.html,./html_extras/**/*.{html,md},./notebook_templates/**/*.{html,md}" --minify &

# 4. Prose Unminified (Full)
# (This stays in the foreground, so it already has an open stdin and doesn't need the pipe)
echo "Watching Prose Max (Unminified)..."
./tailwindcss-linux-x64 -i input_prose.css -o prose_max.css --watch --content "./*.html,./html_extras/**/*.{html,md},./notebook_templates/**/*.{html,md}"
=======
# 1. Main Minified
./tw -i input.css -o main.css --watch --content "./*.html,./notebook_pages/**/*.{html,md}" --minify &

# 2. Main Unminified (Full)
./tw -i input.css -o main_max.css --watch --content "./*.html,./notebook_pages/**/*.{html,md}" &

# 3. Prose Minified
./tw -i input_prose.css -o prose.css --watch --content "./*.html,./notebook_pages/**/*.{html,md}" --minify &

# 4. Prose Unminified (Full)
echo "Watching Prose Max (Unminified)..."
./tw -i input_prose.css -o prose_max.css --watch --content "./*.html,./notebook_pages/**/*.{html,md}"
>>>>>>> 285f75cd7440e0b1dab144305a5e77fd6508707c
