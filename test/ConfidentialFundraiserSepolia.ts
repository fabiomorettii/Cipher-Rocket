import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ConfidentialFundraiser } from "../types";

type Signers = {
  owner: HardhatEthersSigner;
};

describe("ConfidentialFundraiserSepolia", function () {
  let signers: Signers;
  let fundraiser: ConfidentialFundraiser;
  let fundraiserAddress: string;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("ConfidentialFundraiser");
      fundraiserAddress = deployment.address;
      fundraiser = await ethers.getContractAt("ConfidentialFundraiser", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { owner: ethSigners[0] };
  });

  it("reads campaign info and encrypted totals", async function () {
    const info = await fundraiser.getCampaignInfo();
    if (info[3] === ethers.ZeroAddress) {
      console.warn("No campaign configured on Sepolia yet.");
      return;
    }
    const totals = await fundraiser.getEncryptedTotals();

    if (totals[0] !== ethers.ZeroHash && info[3].toLowerCase() === signers.owner.address.toLowerCase()) {
      const clearTotal = await fhevm.userDecryptEuint(
        FhevmType.euint128,
        totals[0],
        fundraiserAddress,
        signers.owner,
      );
      console.log(`Decrypted total raised: ${clearTotal}`);
    }
  });
});
