import fs from "fs";
import { constants, ethers } from "ethers";
import "dotenv/config";
import { PromisePool } from "@supercharge/promise-pool";

const AAVE_GOVERNANCE = "0x9AEE0B04504CeF83A65AC3f0e838D0593BCb2BC7";
const AAVE_ETH_PAYLOAD_CONTROLLER =
  "0xdAbad81aF85554E9ae636395611C58F7eC1aAEc5";
const CONTRACT_0x914d = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";
const AAVE_POOL_V2 = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

const ACI_ETH = "0x57ab7ee15cE5ECacB1aB84EE42D5A9d0d8112922";
const AAVECHAN_ETH = "0x329c54289Ff5D6B7b7daE13592C6B1EDA1543eD4";
const DEPLOYER_21 = "0x3Cbded22F878aFC8d39dCD744d3Fe62086B76193";

const deposits = true;
const payloads = true;
const proposals = true;

const etherscanProvider = new ethers.providers.EtherscanProvider(
  ethers.providers.getNetwork("homestead"),
  process.env.ETHERSCAN_API_KEY
);

let delegates = [];

async function main() {
  await parseDelegates();
  console.log("Delegates parsed ✅");
  await getProposalsStats();
  console.log("Proposals stats fetched ✅");
  if (payloads) {
    await getPayloadsStats();
    console.log("Payloads stats fetched ✅");
  }
  await getOtherInteractions();
  console.log("Other interactions fetched ✅");
  await getSwapTovariableStats();
  console.log("Swap to variable stats fetched ✅");
  await getSafeWalletInteractions();
  console.log("SafeWallet interactions stats fetched ✅");
  await getGasFromAllTxs(DEPLOYER_21);
  console.log("Gas from all Deployer21 transactions fetched ✅");
  await writeOutput();
}

async function getProposalsStats() {
  const history = await etherscanProvider.getHistory(
    AAVE_GOVERNANCE,
    process.env.FROM_BLOCK,
    process.env.TO_BLOCK
  );

  for (let i = 0; i < history.length; i++) {
    const idx = findDelegateIndex(history[i].from);
    if (idx === -1) continue;
    // Manage createProposal function calls
    if (history[i].data.startsWith("0x3bec1bfc")) {
      if (proposals) {
        const receipt = await etherscanProvider.getTransactionReceipt(
          history[i].hash
        );
        const gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);

        delegates[idx].proposals = delegates[idx].proposals.add(gas);
      }

      if (deposits) {
        const value = history[i].value;

        delegates[idx].deposits = delegates[idx].deposits.add(value);
      }
    } else {
      const receipt = await etherscanProvider.getTransactionReceipt(
        history[i].hash
      );

      const gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      delegates[idx].otherGouvernanceInteractions =
        delegates[idx].otherGouvernanceInteractions.add(gas);

      // Manage redeemCancellationFee function calls
      if (history[i].data.startsWith("0x9043ffc3")) {
        const receipt = await etherscanProvider.getTransactionReceipt(
          history[i].hash
        );
        receipt.logs.forEach((log) => {
          if (
            log.data ==
            "0x00000000000000000000000000000000000000000000000000b1a2bc2ec50000"
          ) {
            delegates[idx].withdrawals = delegates[idx].withdrawals.add(
              log.data
            );
          }
        });
      }
    }
  }
}

async function getPayloadsStats() {
  const history = await etherscanProvider.getHistory(
    AAVE_ETH_PAYLOAD_CONTROLLER,
    process.env.FROM_BLOCK,
    process.env.TO_BLOCK
  );

  for (let i = 0; i < history.length; i++) {
    const idx = findDelegateIndex(history[i].from);
    if (idx === -1) continue;

    const receipt = await etherscanProvider.getTransactionReceipt(
      history[i].hash
    );
    const gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);

    // If it's an execute payload function
    if (history[i].data.startsWith("0x92cdb834")) {
      delegates[idx].executionPayloads =
        delegates[idx].executionPayloads.add(gas);
    }
    // If it's create payload function
    if (history[i].data.startsWith("0xe8733894")) {
      // const target = '0x' + history[i].data.slice(10 + 64*3, 10 +64*4).replace(/^0+/, '');
      //0xa9d439364f425e22ef04e71bef7647464774d551
      // const blockTx = await etherscanProvider.getBlockWithTransactions(history[i].blockNumber);
      // console.log(blockTx);
      // const payload = await etherscanProvider.getHistory(target, process.env.FROM_BLOCK, process.env.TO_BLOCK);
      delegates[idx].creationPayloads =
        delegates[idx].creationPayloads.add(gas);
    }
  }
}

async function getOtherInteractions() {
  const history = await etherscanProvider.getHistory(
    CONTRACT_0x914d,
    process.env.FROM_BLOCK,
    process.env.TO_BLOCK
  );

  for (let i = 0; i < history.length; i++) {
    const idx = findDelegateIndex(history[i].from);
    if (idx === -1) continue;

    const receipt = await etherscanProvider.getTransactionReceipt(
      history[i].hash
    );
    const gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);

    if (history[i].data.startsWith("0x76310000")) {
      delegates[idx].otherInteractions =
        delegates[idx].otherInteractions.add(gas);
    }
  }
}

async function getSwapTovariableStats() {
  const history = await etherscanProvider.getHistory(
    AAVE_POOL_V2,
    process.env.FROM_BLOCK,
    process.env.TO_BLOCK
  );

  await PromisePool.withConcurrency(2)
    .for(history)
    .process(async (tx) => {
      const idx = findDelegateIndex(tx.from);
      if (idx !== -1 && tx.data.startsWith("0x2520d5ee")) {
        const receipt = await etherscanProvider.getTransactionReceipt(tx.hash);
        const gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);
        delegates[idx].swapPositionsToVariableV2Mainnet =
          delegates[idx].swapPositionsToVariableV2Mainnet.add(gas);
      }
    });
}

async function getSafeWalletInteractions() {
  const safeWalletInteractions = async (address, idx) => {
    const history = await etherscanProvider.getHistory(
      address,
      process.env.FROM_BLOCK,
      process.env.TO_BLOCK
    );

    let addressesToCheck = history.map((tx) => {
      if (tx.from === ACI_ETH && tx.to) {
        return {
          address: tx.to,
          txHash: tx.hash,
        };
      } else {
        return null;
      }
    });
    addressesToCheck = addressesToCheck.filter((address) => address !== null); // remove nulls
    addressesToCheck = addressesToCheck.filter(
      (v, i, a) => a.findIndex((t) => t.address === v.address) === i
    ); // remove duplicates

    for (const user of addressesToCheck) {
      const address = await isSafeWallet(user.address);
      if (address) {
        const gas = await getGasFromTx(user.txHash);
        delegates[idx].safeWalletInteractions =
          delegates[idx].safeWalletInteractions.add(gas);
      }
    }
  };

  const addressesToCheck = [ACI_ETH, AAVECHAN_ETH];

  for (const address of addressesToCheck) {
    const idx = findDelegateIndex(address);
    if (idx === -1) continue;

    await safeWalletInteractions(address, idx);
  }
}

// Inspired from:
// - https://github.com/abipub/evm-proxy-detection
// - https://ethereum.stackexchange.com/a/141258
const isSafeWallet = async (proxyAddress) => {
  // found at https://github.com/safe-global/safe-deployments/tree/main/src/assets
  const singletonsAddressesMainnet = [
    "0x8942595a2dc5181df0465af0d7be08c8f23c93af", // v0.1.0 // found at https://help.safe.global/en/articles/40834-verify-safe-creation
    "0xb6029EA3B2c51D09a50B53CA8012FeEB05bDa35A", // v1.0.0
    "0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F", // v1.1.0
    "0x6851D6fDFAfD08c0295C392436245E5bc78B0185", // v1.2.0
    "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552", // v1.3.0 canonical
    "0x69f4D1788e39c87893C980c06EdF4b7f686e2938", // v1.3.0 eip155
    "0xB00ce5CCcdEf57e539ddcEd01DF43a13855d9910", // v1.3.0 zksync
    "0x3E5c63644E683549055b9Be8653de26E0B4CD36E", // v1.3.0 L2 canonical
    "0xfb1bffC9d739B8D520DaF37dF666da4C687191EA", // v1.3.0 L2 eip155
    "0x1727c2c531cf966f902E5927b98490fDFb3b2b70", // v1.3.0 L2 zksync
    "0x41675C099F32341bf84BFc5382aF534df5C7461a", // v1.4.1
    "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", // v1.4.1 L2
  ];

  const readAddress = (value) => {
    if (typeof value !== "string" || value === "0x") {
      // throw new Error(`Invalid address value: ${value}`);
      return null;
    }

    let address = value;
    if (address.length === 66) {
      address = "0x" + address.slice(-40);
    }

    if (address === constants.AddressZero) {
      // throw new Error("Empty address");
      return null;
    }

    if (
      !singletonsAddressesMainnet.includes(ethers.utils.getAddress(address))
    ) {
      return null;
    }

    return address;
  };

  const SAFE_PROXY_INTERFACE = [
    // bytes4(keccak256("masterCopy()")) padded to 32 bytes
    "0xa619486e00000000000000000000000000000000000000000000000000000000",
  ];

  const rpcProvider = new ethers.providers.JsonRpcProvider(
    "https://eth.llamarpc.com"
  );
  const requestFunc = ({ method, params }) => rpcProvider.send(method, params);

  try {
    // SafeProxy contract
    const pointedAddress = await requestFunc({
      method: "eth_call",
      params: [
        {
          to: proxyAddress,
          data: SAFE_PROXY_INTERFACE[0],
        },
        "latest",
      ],
    });
    return readAddress(pointedAddress);
  } catch (error) {
    // console.error("Catch Error: ", error);
    return null;
  }
};

const getGasFromAllTxs = async (address) => {
  const idx = findDelegateIndex(address, false);

  const history = await etherscanProvider.getHistory(
    address,
    process.env.FROM_BLOCK,
    process.env.TO_BLOCK
  );

  await PromisePool.withConcurrency(2)
    .for(history)
    .process(async (tx) => {
      const gas = await getGasFromTx(tx.hash);
      delegates[idx].allTxsGasDeployer21 =
        delegates[idx].allTxsGasDeployer21.add(gas);
    });
};

const findDelegateIndex = (address, skipD21 = true) => {
  // Find delegate index
  let idx = -1;

  // skip deployer 21 because we already taken into account all its txs
  if (skipD21 && address === DEPLOYER_21) return idx;

  for (let j = 0; j < delegates.length; j++) {
    if (delegates[j].addresses.includes(address)) idx = j;
  }

  return idx;
};

const getGasFromTx = async (txHash) => {
  const receipt = await etherscanProvider.getTransactionReceipt(txHash);
  const gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);
  return gas;
};

async function writeOutput() {
  console.log("Writing output to file...");

  for (let i = 0; i < delegates.length; i++) {
    delegates[i].total = ethers.utils.formatEther(
      delegates[i].deposits
        .add(delegates[i].creationPayloads)
        .add(delegates[i].executionPayloads)
        .add(delegates[i].proposals)
        .add(delegates[i].otherGouvernanceInteractions)
        .add(delegates[i].swapPositionsToVariableV2Mainnet)
        .add(delegates[i].safeWalletInteractions)
        .add(delegates[i].allTxsGasDeployer21)
        .add(delegates[i].otherInteractions)
        .sub(delegates[i].withdrawals)
    );

    // compute each actions
    for (const key in delegates[i]) {
      if (key !== "name" && key !== "addresses" && key !== "total") {
        delegates[i][key] = ethers.utils.formatEther(delegates[i][key]);
      }
    }
  }

  const file = {
    delegates: delegates,
    block_range: {
      from: process.env.FROM_BLOCK,
      to: process.env.TO_BLOCK,
    },
  };

  fs.writeFileSync("./data/output.json", JSON.stringify(file, null, "\t"));
}

async function parseDelegates() {
  console.log("Parsing delegates from input file...");
  const dataStringified = fs.readFileSync("./data/delegates.json", "utf-8");
  const data = JSON.parse(dataStringified);

  for (let i = 0; i < data.length; i++) {
    delegates.push({
      name: data[i].name,
      addresses: data[i].addresses,
      proposals: ethers.BigNumber.from(0),
      creationPayloads: ethers.BigNumber.from(0),
      executionPayloads: ethers.BigNumber.from(0),
      swapPositionsToVariableV2Mainnet: ethers.BigNumber.from(0),
      safeWalletInteractions: ethers.BigNumber.from(0),
      allTxsGasDeployer21: ethers.BigNumber.from(0),
      otherInteractions: ethers.BigNumber.from(0),
      otherGouvernanceInteractions: ethers.BigNumber.from(0),
      deposits: ethers.BigNumber.from(0),
      withdrawals: ethers.BigNumber.from(0),
      total: ethers.BigNumber.from(0),
    });
  }
}

main();
