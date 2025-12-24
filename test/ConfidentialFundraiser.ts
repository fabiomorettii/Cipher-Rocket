import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ConfidentialFundraiser, ConfidentialFundraiser__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ConfidentialFundraiser")) as ConfidentialFundraiser__factory;
  const fundraiser = (await factory.deploy()) as ConfidentialFundraiser;
  const fundraiserAddress = await fundraiser.getAddress();
  return { fundraiser, fundraiserAddress };
}

describe("ConfidentialFundraiser", function () {
  let signers: Signers;
  let fundraiser: ConfidentialFundraiser;
  let fundraiserAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
    ({ fundraiser, fundraiserAddress } = await deployFixture());
  });

  async function createCampaign() {
    const block = await ethers.provider.getBlock("latest");
    const endTimestamp = Number(block?.timestamp ?? 0) + 3600;
    const targetWei = ethers.parseEther("5");
    await fundraiser.connect(signers.deployer).createCampaign("Rocket Launch", targetWei, endTimestamp);
    return { endTimestamp, targetWei };
  }

  it("creates a campaign with config", async function () {
    const { endTimestamp, targetWei } = await createCampaign();
    const info = await fundraiser.getCampaignInfo();
    expect(info[0]).to.eq("Rocket Launch");
    expect(info[1]).to.eq(targetWei);
    expect(info[2]).to.eq(endTimestamp);
    expect(info[3]).to.eq(signers.deployer.address);
    expect(info[4]).to.eq(true);
    expect(info[5]).to.eq(0);
  });

  it("records encrypted contributions and points", async function () {
    await createCampaign();
    const amountWei = ethers.parseEther("1");

    const encryptedInput = await fhevm
      .createEncryptedInput(fundraiserAddress, signers.alice.address)
      .add128(amountWei)
      .encrypt();

    const tx = await fundraiser
      .connect(signers.alice)
      .contribute(encryptedInput.handles[0], encryptedInput.inputProof, { value: amountWei });
    await tx.wait();

    const info = await fundraiser.getCampaignInfo();
    expect(info[5]).to.eq(amountWei);

    const encryptedContribution = await fundraiser.getEncryptedContribution(signers.alice.address);
    const clearContribution = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedContribution,
      fundraiserAddress,
      signers.alice,
    );
    expect(clearContribution).to.eq(amountWei);

    const encryptedPoints = await fundraiser.getEncryptedPoints(signers.alice.address);
    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      encryptedPoints,
      fundraiserAddress,
      signers.alice,
    );
    const expectedPoints = amountWei / 1_000_000_000_000n;
    expect(clearPoints).to.eq(expectedPoints);

    const totals = await fundraiser.getEncryptedTotals();
    const totalRaised = await fhevm.userDecryptEuint(
      FhevmType.euint128,
      totals[0],
      fundraiserAddress,
      signers.deployer,
    );
    expect(totalRaised).to.eq(amountWei);
  });

  it("allows the fundraiser to end and withdraw", async function () {
    await createCampaign();
    const amountWei = ethers.parseEther("0.5");

    const encryptedInput = await fhevm
      .createEncryptedInput(fundraiserAddress, signers.alice.address)
      .add128(amountWei)
      .encrypt();
    const tx = await fundraiser
      .connect(signers.alice)
      .contribute(encryptedInput.handles[0], encryptedInput.inputProof, { value: amountWei });
    await tx.wait();

    const balanceBefore = await ethers.provider.getBalance(fundraiserAddress);
    expect(balanceBefore).to.eq(amountWei);

    const endTx = await fundraiser.connect(signers.deployer).endCampaign();
    await endTx.wait();

    const balanceAfter = await ethers.provider.getBalance(fundraiserAddress);
    expect(balanceAfter).to.eq(0);

    const info = await fundraiser.getCampaignInfo();
    expect(info[4]).to.eq(false);
  });

  it("rejects non-fundraiser ending", async function () {
    await createCampaign();
    await expect(fundraiser.connect(signers.bob).endCampaign()).to.be.revertedWithCustomError(
      fundraiser,
      "Unauthorized",
    );
  });
});
