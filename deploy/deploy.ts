import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFundraiser = await deploy("ConfidentialFundraiser", {
    from: deployer,
    log: true,
  });

  console.log(`ConfidentialFundraiser contract: `, deployedFundraiser.address);
};
export default func;
func.id = "deploy_confidentialFundraiser"; // id required to prevent reexecution
func.tags = ["ConfidentialFundraiser"];
