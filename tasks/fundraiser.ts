import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the ConfidentialFundraiser address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const fundraiser = await deployments.get("ConfidentialFundraiser");
    console.log("ConfidentialFundraiser address is " + fundraiser.address);
  },
);

task("task:campaign-info", "Print campaign information")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialFundraiser");
    const contract = await ethers.getContractAt("ConfidentialFundraiser", deployment.address);
    const info = await contract.getCampaignInfo();
    console.log(`Campaign: ${info[0]}`);
    console.log(`Target  : ${ethers.formatEther(info[1])} ETH`);
    console.log(`End time: ${info[2].toString()}`);
    console.log(`Owner   : ${info[3]}`);
    console.log(`Active  : ${info[4]}`);
    console.log(`Raised  : ${ethers.formatEther(info[5])} ETH`);
  });

task("task:create-campaign", "Create a new campaign")
  .addParam("name", "Campaign name")
  .addParam("target", "Target amount in ETH")
  .addParam("end", "End timestamp (unix seconds)")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialFundraiser");
    const contract = await ethers.getContractAt("ConfidentialFundraiser", deployment.address);
    const targetWei = ethers.parseEther(taskArguments.target);
    const endTimestamp = parseInt(taskArguments.end);
    const tx = await contract.createCampaign(taskArguments.name, targetWei, endTimestamp);
    console.log(`Creating campaign... tx=${tx.hash}`);
    await tx.wait();
    console.log("Campaign created.");
  });

task("task:contribute", "Contribute to the campaign")
  .addParam("value", "Contribution amount in ETH")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialFundraiser");
    const contract = await ethers.getContractAt("ConfidentialFundraiser", deployment.address);
    const [signer] = await ethers.getSigners();
    const valueWei = ethers.parseEther(taskArguments.value);
    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add128(valueWei)
      .encrypt();
    const tx = await contract
      .connect(signer)
      .contribute(encryptedInput.handles[0], encryptedInput.inputProof, { value: valueWei });
    console.log(`Contributing... tx=${tx.hash}`);
    await tx.wait();
    console.log("Contribution submitted.");
  });

task("task:decrypt-contribution", "Decrypt a contributor encrypted total")
  .addOptionalParam("user", "Contributor address (default: first signer)")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialFundraiser");
    const contract = await ethers.getContractAt("ConfidentialFundraiser", deployment.address);
    const [signer] = await ethers.getSigners();
    const user = taskArguments.user ?? signer.address;
    const encrypted = await contract.getEncryptedContribution(user);
    if (encrypted === ethers.ZeroHash) {
      console.log("Encrypted contribution: 0");
      return;
    }
    const clear = await fhevm.userDecryptEuint(FhevmType.euint128, encrypted, deployment.address, signer);
    console.log(`Encrypted contribution: ${encrypted}`);
    console.log(`Clear contribution     : ${clear}`);
  });

task("task:decrypt-points", "Decrypt contributor points")
  .addOptionalParam("user", "Contributor address (default: first signer)")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialFundraiser");
    const contract = await ethers.getContractAt("ConfidentialFundraiser", deployment.address);
    const [signer] = await ethers.getSigners();
    const user = taskArguments.user ?? signer.address;
    const encrypted = await contract.getEncryptedPoints(user);
    if (encrypted === ethers.ZeroHash) {
      console.log("Encrypted points: 0");
      return;
    }
    const clear = await fhevm.userDecryptEuint(FhevmType.euint128, encrypted, deployment.address, signer);
    console.log(`Encrypted points: ${encrypted}`);
    console.log(`Clear points     : ${clear}`);
  });
