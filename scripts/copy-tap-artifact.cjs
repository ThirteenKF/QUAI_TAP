/**
 * Копирует артефакты после compile — фронт импортирует json из `src/`.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const pairs = [
  [
    "artifacts/contracts/TapCounter.sol/TapCounter.json",
    "src/tapCounterArtifact.json",
  ],
  [
    "artifacts/contracts/MinersRoomDonate.sol/MinersRoomDonate.json",
    "src/minersRoomDonateArtifact.json",
  ],
  [
    "artifacts/contracts/GameMessenger.sol/GameMessenger.json",
    "src/gameMessengerArtifact.json",
  ],
];

let ok = true;
for (const [relSrc, relDest] of pairs) {
  const src = path.join(root, relSrc);
  const dest = path.join(root, relDest);
  if (!fs.existsSync(src)) {
    console.error("Нет файла:", src, "— сначала npx hardhat compile");
    ok = false;
    continue;
  }
  fs.copyFileSync(src, dest);
  console.log("OK:", relDest);
}
if (!ok) {
  process.exit(1);
}
