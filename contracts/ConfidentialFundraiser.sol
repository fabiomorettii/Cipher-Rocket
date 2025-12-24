// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint128, externalEuint128} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialFundraiser
/// @notice A single-campaign fundraising contract with encrypted contributions and points.
contract ConfidentialFundraiser is ZamaEthereumConfig {
    uint64 public constant POINTS_DIVISOR = 1_000_000_000_000;

    struct Campaign {
        string name;
        uint256 targetAmount;
        uint256 endTimestamp;
        address fundraiser;
        bool isActive;
    }

    Campaign private _campaign;
    uint256 public totalRaised;

    euint128 private _encryptedTotalRaised;
    euint128 private _encryptedTotalPoints;

    mapping(address => euint128) private _encryptedContributions;
    mapping(address => euint128) private _encryptedPoints;

    event CampaignCreated(string name, uint256 targetAmount, uint256 endTimestamp, address indexed fundraiser);
    event ContributionReceived(address indexed contributor, uint256 amount);
    event CampaignEnded(address indexed fundraiser, uint256 amount, uint256 endedAt);

    error CampaignAlreadyCreated();
    error CampaignInactive();
    error CampaignAlreadyEnded();
    error InvalidCampaignConfig();
    error Unauthorized();
    error ZeroContribution();
    error WithdrawalFailed();

    function createCampaign(string calldata name, uint256 targetAmount, uint256 endTimestamp) external {
        if (_campaign.fundraiser != address(0)) {
            revert CampaignAlreadyCreated();
        }
        if (bytes(name).length == 0 || targetAmount == 0 || endTimestamp <= block.timestamp) {
            revert InvalidCampaignConfig();
        }

        _campaign = Campaign({
            name: name,
            targetAmount: targetAmount,
            endTimestamp: endTimestamp,
            fundraiser: msg.sender,
            isActive: true
        });

        emit CampaignCreated(name, targetAmount, endTimestamp, msg.sender);
    }

    function contribute(externalEuint128 encryptedAmount, bytes calldata inputProof) external payable {
        if (!_campaign.isActive) {
            revert CampaignInactive();
        }
        if (block.timestamp >= _campaign.endTimestamp) {
            revert CampaignAlreadyEnded();
        }
        if (msg.value == 0) {
            revert ZeroContribution();
        }

        euint128 amount = FHE.fromExternal(encryptedAmount, inputProof);

        euint128 updatedContribution = FHE.add(_encryptedContributions[msg.sender], amount);
        _encryptedContributions[msg.sender] = updatedContribution;

        euint128 contributionPoints = FHE.div(amount, uint128(POINTS_DIVISOR));
        euint128 updatedPoints = FHE.add(_encryptedPoints[msg.sender], contributionPoints);
        _encryptedPoints[msg.sender] = updatedPoints;

        _encryptedTotalRaised = FHE.add(_encryptedTotalRaised, amount);
        _encryptedTotalPoints = FHE.add(_encryptedTotalPoints, contributionPoints);

        totalRaised += msg.value;

        FHE.allowThis(updatedContribution);
        FHE.allow(updatedContribution, msg.sender);
        FHE.allowThis(updatedPoints);
        FHE.allow(updatedPoints, msg.sender);

        FHE.allowThis(_encryptedTotalRaised);
        FHE.allowThis(_encryptedTotalPoints);
        if (_campaign.fundraiser != address(0)) {
            FHE.allow(_encryptedTotalRaised, _campaign.fundraiser);
            FHE.allow(_encryptedTotalPoints, _campaign.fundraiser);
        }

        emit ContributionReceived(msg.sender, msg.value);
    }

    function endCampaign() external {
        if (msg.sender != _campaign.fundraiser) {
            revert Unauthorized();
        }
        if (!_campaign.isActive) {
            revert CampaignInactive();
        }

        _campaign.isActive = false;
        uint256 balance = address(this).balance;
        (bool success, ) = _campaign.fundraiser.call{value: balance}("");
        if (!success) {
            revert WithdrawalFailed();
        }

        emit CampaignEnded(_campaign.fundraiser, balance, block.timestamp);
    }

    function getCampaignInfo()
        external
        view
        returns (string memory name, uint256 targetAmount, uint256 endTimestamp, address fundraiser, bool isActive, uint256 raised)
    {
        Campaign memory campaign = _campaign;
        return (campaign.name, campaign.targetAmount, campaign.endTimestamp, campaign.fundraiser, campaign.isActive, totalRaised);
    }

    function getEncryptedContribution(address user) external view returns (euint128) {
        return _encryptedContributions[user];
    }

    function getEncryptedPoints(address user) external view returns (euint128) {
        return _encryptedPoints[user];
    }

    function getEncryptedTotals() external view returns (euint128 totalEncryptedRaised, euint128 totalEncryptedPoints) {
        return (_encryptedTotalRaised, _encryptedTotalPoints);
    }
}
