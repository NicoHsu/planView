const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { version } = require("../package.json");
const directory = path.resolve(__dirname, "../dist");
const names = [
  ...["x64", "arm64"].flatMap((arch) => [
    `PlanView Focus Planner-${version}-${arch}-mac.dmg`,
    `PlanView Focus Planner-${version}-${arch}-mac.zip`,
    `PlanView Focus Planner-${version}-${arch}-win.exe`,
    `PlanView Focus Planner-${version}-${arch}-win.zip`
  ]),
  `PlanView Focus Planner-${version}-win.exe`
];
const artifacts = names.map((name) => {
  const data = fs.readFileSync(path.join(directory, name));
  return { name, bytes: data.length, sha256: crypto.createHash("sha256").update(data).digest("hex") };
});
fs.writeFileSync(path.join(directory, "release-manifest.json"), JSON.stringify({
  version, generatedAt: new Date().toISOString(), signed: false,
  note: "Unsigned testing builds. Windows binaries have not been executed on Windows.", artifacts
}, null, 2) + "\n");
fs.writeFileSync(path.join(directory, "SHA256SUMS"), artifacts.map((item) => `${item.sha256}  ${item.name}`).join("\n") + "\n");
console.log(`Verified ${artifacts.length} installer/archive files; wrote dist/release-manifest.json and dist/SHA256SUMS.`);
