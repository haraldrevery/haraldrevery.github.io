// Transpile the .jsx sources to plain .js (React.createElement) using the
// local Babel-standalone — no CDN, no runtime Babel on the page.
// Run after editing any .jsx:   node build.js
const fs = require("fs");
const path = require("path");

// babel.min.js is a UMD bundle; requiring it returns the Babel object.
const Babel = require("./babel.min.js");

const files = ["picker.jsx", "theme-tools.jsx", "app.jsx"];
for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, f), "utf8");
  const out = Babel.transform(src, {
    presets: ["react"],
    filename: f,
  }).code;
  const dest = f.replace(/\.jsx$/, ".js");
  fs.writeFileSync(path.join(__dirname, dest), out, "utf8");
  console.log(`  ${f} -> ${dest} (${out.length} chars)`);
}
console.log("Build complete. Reload color_theme.html.");
