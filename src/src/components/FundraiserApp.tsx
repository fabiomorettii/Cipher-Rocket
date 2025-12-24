import {  useEffect, useMemo, useState } from 'react';
import type{ FormEvent } from 'react';
import { Contract, ethers } from 'ethers';
import { useAccount } from 'wagmi';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { publicClient } from '../config/viemClient';
import '../styles/FundraiserApp.css';

type CampaignInfo = {
  name: string;
  targetAmount: bigint;
  endTimestamp: bigint;
  fundraiser: `0x${string}`;
  isActive: boolean;
  raised: bigint;
};

type EncryptedStats = {
  contribution: `0x${string}`;
  points: `0x${string}`;
};

type DecryptedStats = {
  contribution: bigint;
  points: bigint;
};

type EncryptedTotals = {
  raised: `0x${string}`;
  points: `0x${string}`;
};

type DecryptedTotals = {
  raised: bigint;
  points: bigint;
};

const contractAddress = CONTRACT_ADDRESS as `0x${string}`;
const isConfigured = CONTRACT_ADDRESS !== ethers.ZeroAddress;

export function FundraiserApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [campaignInfo, setCampaignInfo] = useState<CampaignInfo | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [campaignError, setCampaignError] = useState('');

  const [encryptedStats, setEncryptedStats] = useState<EncryptedStats | null>(null);
  const [decryptedStats, setDecryptedStats] = useState<DecryptedStats | null>(null);
  const [encryptedTotals, setEncryptedTotals] = useState<EncryptedTotals | null>(null);
  const [decryptedTotals, setDecryptedTotals] = useState<DecryptedTotals | null>(null);

  const [campaignName, setCampaignName] = useState('');
  const [campaignTarget, setCampaignTarget] = useState('');
  const [campaignEnd, setCampaignEnd] = useState('');
  const [contributionAmount, setContributionAmount] = useState('');

  const [actionStatus, setActionStatus] = useState('');
  const [actionError, setActionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const refresh = () => setRefreshIndex((value) => value + 1);

  const isFundraiser = useMemo(() => {
    if (!campaignInfo || !address) {
      return false;
    }
    return campaignInfo.fundraiser.toLowerCase() === address.toLowerCase();
  }, [campaignInfo, address]);

  const hasCampaign = useMemo(() => {
    return campaignInfo ? campaignInfo.fundraiser !== ethers.ZeroAddress : false;
  }, [campaignInfo]);

  const progressPercentage = useMemo(() => {
    if (!campaignInfo || campaignInfo.targetAmount === 0n) {
      return 0;
    }
    const percent = Number((campaignInfo.raised * 10000n) / campaignInfo.targetAmount) / 100;
    return Math.min(Math.max(percent, 0), 100);
  }, [campaignInfo]);

  const campaignStatus = useMemo(() => {
    if (!campaignInfo || !hasCampaign) {
      return { label: 'Not created', tone: 'neutral' };
    }
    const now = Math.floor(Date.now() / 1000);
    const ended = now >= Number(campaignInfo.endTimestamp);
    if (!campaignInfo.isActive || ended) {
      return { label: 'Closed', tone: 'closed' };
    }
    return { label: 'Open', tone: 'open' };
  }, [campaignInfo, hasCampaign]);

  useEffect(() => {
    const loadCampaign = async () => {
      setCampaignLoading(true);
      setCampaignError('');
      if (!isConfigured) {
        setCampaignInfo(null);
        setCampaignError('Contract address is not configured.');
        setCampaignLoading(false);
        return;
      }
      try {
        const info = (await publicClient.readContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'getCampaignInfo',
        })) as readonly [string, bigint, bigint, `0x${string}`, boolean, bigint];

        setCampaignInfo({
          name: info[0],
          targetAmount: info[1],
          endTimestamp: info[2],
          fundraiser: info[3],
          isActive: info[4],
          raised: info[5],
        });

        const totals = (await publicClient.readContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'getEncryptedTotals',
        })) as readonly [`0x${string}`, `0x${string}`];

        setEncryptedTotals({ raised: totals[0], points: totals[1] });
      } catch (error) {
        console.error('Failed to load campaign:', error);
        setCampaignError('Unable to load campaign data.');
      } finally {
        setCampaignLoading(false);
      }
    };

    void loadCampaign();
  }, [refreshIndex]);

  useEffect(() => {
    const loadUserStats = async () => {
      if (!address) {
        setEncryptedStats(null);
        setDecryptedStats(null);
        return;
      }
      if (!isConfigured) {
        return;
      }
      try {
        const [contribution, points] = (await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: CONTRACT_ABI,
            functionName: 'getEncryptedContribution',
            args: [address],
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: CONTRACT_ABI,
            functionName: 'getEncryptedPoints',
            args: [address],
          }),
        ])) as [`0x${string}`, `0x${string}`];

        setEncryptedStats({ contribution, points });
      } catch (error) {
        console.error('Failed to load encrypted stats:', error);
      }
    };

    void loadUserStats();
  }, [address, refreshIndex]);

  const decryptHandles = async (handles: `0x${string}`[]) => {
    if (!instance || !address || !signerPromise) {
      throw new Error('Missing encryption prerequisites');
    }
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Wallet signer is not ready');
    }

    const keypair = instance.generateKeypair();
    const handlePairs = handles.map((handle) => ({
      handle,
      contractAddress: CONTRACT_ADDRESS,
    }));
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const contractAddresses = [CONTRACT_ADDRESS];
    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message,
    );

    return instance.userDecrypt(
      handlePairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );
  };

  const handleDecryptStats = async () => {
    if (!encryptedStats || encryptedStats.contribution === ethers.ZeroHash) {
      setDecryptedStats({ contribution: 0n, points: 0n });
      return;
    }
    setIsDecrypting(true);
    setActionError('');
    try {
      const result = await decryptHandles([encryptedStats.contribution, encryptedStats.points]);
      const contribution = BigInt(result[encryptedStats.contribution] ?? 0);
      const points = BigInt(result[encryptedStats.points] ?? 0);
      setDecryptedStats({ contribution, points });
    } catch (error) {
      console.error('Failed to decrypt stats:', error);
      setActionError('Unable to decrypt your stats.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleDecryptTotals = async () => {
    if (!encryptedTotals || encryptedTotals.raised === ethers.ZeroHash) {
      setDecryptedTotals({ raised: 0n, points: 0n });
      return;
    }
    setIsDecrypting(true);
    setActionError('');
    try {
      const result = await decryptHandles([encryptedTotals.raised, encryptedTotals.points]);
      const raised = BigInt(result[encryptedTotals.raised] ?? 0);
      const points = BigInt(result[encryptedTotals.points] ?? 0);
      setDecryptedTotals({ raised, points });
    } catch (error) {
      console.error('Failed to decrypt totals:', error);
      setActionError('Unable to decrypt campaign totals.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleCreateCampaign = async (event: FormEvent) => {
    event.preventDefault();
    if (!campaignName.trim() || !campaignTarget || !campaignEnd) {
      setActionError('Please fill in all campaign fields.');
      return;
    }
    if (!signerPromise) {
      setActionError('Connect your wallet to create a campaign.');
      return;
    }

    setIsSubmitting(true);
    setActionError('');
    setActionStatus('Preparing campaign transaction...');
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }
      const endTimestamp = Math.floor(new Date(campaignEnd).getTime() / 1000);
      if (Number.isNaN(endTimestamp) || endTimestamp <= Math.floor(Date.now() / 1000)) {
        throw new Error('End time must be in the future');
      }
      const targetWei = ethers.parseEther(campaignTarget);
      if (targetWei <= 0n) {
        throw new Error('Target must be greater than zero');
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createCampaign(campaignName.trim(), targetWei, endTimestamp);
      setActionStatus('Waiting for confirmation...');
      await tx.wait();
      setActionStatus('Campaign created.');
      refresh();
    } catch (error) {
      console.error('Failed to create campaign:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to create campaign.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContribute = async (event: FormEvent) => {
    event.preventDefault();
    if (!contributionAmount || !address) {
      setActionError('Enter a contribution amount.');
      return;
    }
    if (campaignStatus.label === 'Closed') {
      setActionError('The campaign is closed.');
      return;
    }
    if (!instance) {
      setActionError('Encryption service is still loading.');
      return;
    }
    if (!signerPromise) {
      setActionError('Connect your wallet to contribute.');
      return;
    }

    setIsSubmitting(true);
    setActionError('');
    setActionStatus('Encrypting your contribution...');
    try {
      const valueWei = ethers.parseEther(contributionAmount);
      if (valueWei <= 0n) {
        throw new Error('Contribution must be greater than zero.');
      }

      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add128(valueWei);
      const encryptedInput = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.contribute(encryptedInput.handles[0], encryptedInput.inputProof, { value: valueWei });
      setActionStatus('Waiting for confirmation...');
      await tx.wait();
      setActionStatus('Contribution submitted.');
      setContributionAmount('');
      setDecryptedStats(null);
      refresh();
    } catch (error) {
      console.error('Failed to contribute:', error);
      setActionError(error instanceof Error ? error.message : 'Contribution failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndCampaign = async () => {
    if (!signerPromise) {
      setActionError('Connect your wallet to end the campaign.');
      return;
    }
    setIsSubmitting(true);
    setActionError('');
    setActionStatus('Ending campaign...');
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.endCampaign();
      setActionStatus('Waiting for confirmation...');
      await tx.wait();
      setActionStatus('Campaign ended.');
      refresh();
    } catch (error) {
      console.error('Failed to end campaign:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to end campaign.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCampaignDetails = () => {
    if (campaignLoading) {
      return <div className="card-state">Loading campaign data...</div>;
    }
    if (campaignError) {
      return <div className="card-state error">{campaignError}</div>;
    }
    if (!isConfigured) {
      return (
        <div className="card-state">
          <p className="card-state-title">Contract not configured</p>
          <p className="card-state-copy">Update the contract address to load the campaign.</p>
        </div>
      );
    }
    if (!campaignInfo || !hasCampaign) {
      return (
        <div className="card-state">
          <p className="card-state-title">No campaign yet</p>
          <p className="card-state-copy">Create the first campaign to start accepting encrypted contributions.</p>
        </div>
      );
    }

    const endDate = new Date(Number(campaignInfo.endTimestamp) * 1000);
    const timeLeftSeconds = Math.max(Number(campaignInfo.endTimestamp) - Math.floor(Date.now() / 1000), 0);
    const hoursLeft = Math.floor(timeLeftSeconds / 3600);
    const daysLeft = Math.floor(hoursLeft / 24);
    const displayTimeLeft = timeLeftSeconds === 0 ? 'Ended' : `${daysLeft}d ${hoursLeft % 24}h`;

    return (
      <>
        <div className="campaign-name-row">
          <h2>{campaignInfo.name || 'Unnamed Campaign'}</h2>
          <span className={`status-pill ${campaignStatus.tone}`}>{campaignStatus.label}</span>
        </div>
        <div className="campaign-grid">
          <div>
            <p className="label">Target</p>
            <p className="value">{ethers.formatEther(campaignInfo.targetAmount)} ETH</p>
          </div>
          <div>
            <p className="label">Raised</p>
            <p className="value">{ethers.formatEther(campaignInfo.raised)} ETH</p>
          </div>
          <div>
            <p className="label">Time left</p>
            <p className="value">{displayTimeLeft}</p>
          </div>
          <div>
            <p className="label">Ends</p>
            <p className="value">{endDate.toLocaleString()}</p>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${progressPercentage}%` }} />
        </div>
        <div className="progress-caption">{progressPercentage.toFixed(2)}% of target funded</div>
        <div className="fundraiser-meta">
          <span>Fundraiser</span>
          <span>{campaignInfo.fundraiser}</span>
        </div>
      </>
    );
  };

  const renderActionCard = () => {
    if (!isConfigured) {
      return (
        <div className="card-state">
          <p className="card-state-title">Connect to the deployed contract</p>
          <p className="card-state-copy">Set the contract address first to create or support a campaign.</p>
        </div>
      );
    }
    if (!hasCampaign) {
      return (
        <form className="action-form" onSubmit={handleCreateCampaign}>
          <h3>Create a campaign</h3>
          <label>
            Campaign name
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              placeholder="Mission: Silent Launch"
              required
            />
          </label>
          <label>
            Target (ETH)
            <input
              type="number"
              min="0"
              step="0.01"
              value={campaignTarget}
              onChange={(event) => setCampaignTarget(event.target.value)}
              placeholder="5"
              required
            />
          </label>
          <label>
            End time
            <input
              type="datetime-local"
              value={campaignEnd}
              onChange={(event) => setCampaignEnd(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create campaign'}
          </button>
        </form>
      );
    }

    return (
      <form className="action-form" onSubmit={handleContribute}>
        <h3>Contribute with encrypted tracking</h3>
        <label>
          Amount (ETH)
          <input
            type="number"
            min="0"
            step="0.001"
            value={contributionAmount}
            onChange={(event) => setContributionAmount(event.target.value)}
            placeholder="0.5"
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting || campaignStatus.label === 'Closed'}>
          {isSubmitting ? 'Submitting...' : campaignStatus.label === 'Closed' ? 'Campaign closed' : 'Contribute'}
        </button>
        <p className="hint">
          {zamaLoading
            ? 'Loading encryption engine...'
            : zamaError
              ? zamaError
              : 'Rewards scale at 1 ETH = 1,000,000 encrypted points.'}
        </p>
      </form>
    );
  };

  return (
    <div className="fundraiser-app">
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Confidential fundraising</p>
          <h1>Fuel your mission with encrypted contributions.</h1>
          <p className="hero-copy">
            Track every deposit privately with Zama FHE, reward supporters with encrypted points, and settle instantly
            when you close the campaign.
          </p>
        </div>
      </section>

      <section className="content-grid">
        <div className="card campaign-card reveal">{renderCampaignDetails()}</div>
        <div className="card action-card reveal delay-1">{renderActionCard()}</div>
      </section>

      <section className="content-grid secondary">
        <div className="card stats-card reveal delay-2">
          <h3>Your encrypted stats</h3>
          <div className="stats-row">
            <div>
              <p className="label">Contribution (encrypted)</p>
              <p className="value monospace">
                {encryptedStats?.contribution && encryptedStats.contribution !== ethers.ZeroHash
                  ? `${encryptedStats.contribution.slice(0, 12)}...`
                  : 'Not available'}
              </p>
            </div>
            <div>
              <p className="label">Points (encrypted)</p>
              <p className="value monospace">
                {encryptedStats?.points && encryptedStats.points !== ethers.ZeroHash
                  ? `${encryptedStats.points.slice(0, 12)}...`
                  : 'Not available'}
              </p>
            </div>
          </div>
          {decryptedStats ? (
            <div className="decrypted-box">
              <p>
                <strong>Decrypted contribution:</strong> {ethers.formatEther(decryptedStats.contribution)} ETH
              </p>
              <p>
                <strong>Decrypted points:</strong> {decryptedStats.points.toString()}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDecryptStats}
              disabled={!address || isDecrypting || !instance || !encryptedStats}
            >
              {isDecrypting ? 'Decrypting...' : address ? 'Decrypt my stats' : 'Connect wallet to decrypt'}
            </button>
          )}
        </div>

        <div className="card stats-card reveal delay-3">
          <h3>Campaign totals</h3>
          <div className="stats-row">
            <div>
              <p className="label">Encrypted raised</p>
              <p className="value monospace">
                {encryptedTotals?.raised && encryptedTotals.raised !== ethers.ZeroHash
                  ? `${encryptedTotals.raised.slice(0, 12)}...`
                  : 'Not available'}
              </p>
            </div>
            <div>
              <p className="label">Encrypted points</p>
              <p className="value monospace">
                {encryptedTotals?.points && encryptedTotals.points !== ethers.ZeroHash
                  ? `${encryptedTotals.points.slice(0, 12)}...`
                  : 'Not available'}
              </p>
            </div>
          </div>
          {decryptedTotals ? (
            <div className="decrypted-box">
              <p>
                <strong>Decrypted raised:</strong> {ethers.formatEther(decryptedTotals.raised)} ETH
              </p>
              <p>
                <strong>Decrypted points:</strong> {decryptedTotals.points.toString()}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDecryptTotals}
              disabled={!isFundraiser || isDecrypting || !instance || !encryptedTotals}
            >
              {isFundraiser ? 'Decrypt totals' : 'Only fundraiser can decrypt totals'}
            </button>
          )}
          {isFundraiser && hasCampaign && campaignStatus.label === 'Open' ? (
            <button type="button" className="end-button" onClick={handleEndCampaign} disabled={isSubmitting}>
              {isSubmitting ? 'Ending...' : 'End campaign & withdraw'}
            </button>
          ) : null}
        </div>
      </section>

      {(actionStatus || actionError) && (
        <section className="status-banner">
          {actionStatus && <p className="status">{actionStatus}</p>}
          {actionError && <p className="error">{actionError}</p>}
        </section>
      )}
    </div>
  );
}
