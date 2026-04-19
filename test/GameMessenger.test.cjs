const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("GameMessenger", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GameMessenger");
    const messenger = await Factory.deploy();
    await messenger.waitForDeployment();
    return { messenger, owner, alice, bob };
  }

  it("posts to global room and emits event", async function () {
    const { messenger, alice } = await deployFixture();
    const text = "hello global";
    const global = ethers.ZeroHash;

    await expect(messenger.connect(alice).postMessage(global, text))
      .to.emit(messenger, "MessagePosted")
      .withArgs(0n, alice.address, global, anyValue, text);

    expect(await messenger.totalMessages()).to.equal(1n);
  });

  it("rejects empty and too long messages", async function () {
    const { messenger, alice } = await deployFixture();
    const room = ethers.ZeroHash;
    await expect(
      messenger.connect(alice).postMessage(room, ""),
    ).to.be.revertedWith("Messenger: empty message");

    const longText = "a".repeat(181);
    await expect(
      messenger.connect(alice).postMessage(room, longText),
    ).to.be.revertedWith("Messenger: message too long");
  });

  it("allows only global or sender room", async function () {
    const { messenger, alice, bob } = await deployFixture();
    const aliceRoom = await messenger.walletRoomKey(alice.address);
    const bobRoom = await messenger.walletRoomKey(bob.address);

    await expect(
      messenger.connect(alice).postMessage(aliceRoom, "private"),
    ).to.not.be.reverted;

    await expect(
      messenger.connect(alice).postMessage(bobRoom, "intrude"),
    ).to.be.revertedWith("Messenger: invalid room");
  });

  it("reads recent messages by room and in chronological order", async function () {
    const { messenger, alice, bob } = await deployFixture();
    const global = ethers.ZeroHash;
    const aliceRoom = await messenger.walletRoomKey(alice.address);

    await messenger.connect(alice).postMessage(global, "g1");
    await messenger.connect(alice).postMessage(aliceRoom, "a1");
    await messenger.connect(bob).postMessage(global, "g2");
    await messenger.connect(alice).postMessage(aliceRoom, "a2");

    const globalRecent = await messenger.getRecentMessages(global, 10);
    expect(globalRecent.map((m) => m.text)).to.deep.equal(["g1", "g2"]);

    const roomRecent = await messenger.getRecentMessages(aliceRoom, 10);
    expect(roomRecent.map((m) => m.text)).to.deep.equal(["a1", "a2"]);
  });
});
