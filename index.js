// const fs = require("fs").promises;
// const ethers = require("ethers");
// require("dotenv").config();
import fs from "fs";
import { constants, ethers } from "ethers";
// import { configDotenv } from "dotenv";

import { InfuraProvider } from "@ethersproject/providers";
// import detectProxyTarget from "evm-proxy-detection";
// @ts-ignore
const { default: detectProxy } = detectProxyTarget;
// import { detectProxy } from "evm-proxy-detection";
// import detectProxy from "evm-proxy-detection";

const AAVE_GOVERNANCE = "0x9AEE0B04504CeF83A65AC3f0e838D0593BCb2BC7";
const AAVE_ETH_PAYLOAD_CONTROLLER =
  "0xdAbad81aF85554E9ae636395611C58F7eC1aAEc5";
const CONTRACT_0x914d = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";
const AAVE_POOL_V2 = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";

const ACI_ETH = "0x57ab7ee15cE5ECacB1aB84EE42D5A9d0d8112922";

const deposits = true;
const payloads = true;
const proposals = true;

const etherscanProvider = new ethers.providers.EtherscanProvider(
  ethers.providers.getNetwork("homestead"),
  process.env.ETHERSCAN_API_KEY
);

let delegates = [];

async function main() {
  // await parseDelegates();
  // await getProposalsStats();
  // if (payloads) await getPayloadsStats();
  // await getOtherInteractions();
  // await getSwapTovariableStats();
  // await writeOutput();
  await getSafeWalletInteractions();
}

async function getProposalsStats() {
  const history = await etherscanProvider.getHistory(
    AAVE_GOVERNANCE,
    process.env.FROM_BLOCK,
    process.env.TO_BLOCK
  );

  for (let i = 0; i < history.length; i++) {
    // Manage createProposal function calls
    if (history[i].data.startsWith("0x3bec1bfc")) {
      let idx = -1;

      // Find delegate index
      for (let j = 0; j < delegates.length; j++) {
        if (delegates[j].addresses.includes(history[i].from)) idx = j;
      }
      if (idx == -1) continue;

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
      let idx = -1;

      // Find delegate index
      for (let j = 0; j < delegates.length; j++) {
        if (delegates[j].addresses.includes(history[i].from)) idx = j;
      }
      if (idx == -1) continue;

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
    let idx = -1;

    // Find delegate index
    for (let j = 0; j < delegates.length; j++) {
      if (delegates[j].addresses.includes(history[i].from)) idx = j;
    }
    if (idx == -1) continue;

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
    let idx = -1;

    // Find delegate index
    for (let j = 0; j < delegates.length; j++) {
      if (delegates[j].addresses.includes(history[i].from)) idx = j;
    }
    if (idx == -1) continue;

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

  for (let i = 0; i < history.length; i++) {
    let idx = -1;

    // Find delegate index
    for (let j = 0; j < delegates.length; j++) {
      if (delegates[j].addresses.includes(history[i].from)) idx = j;
    }
    if (idx == -1) continue;

    const receipt = await etherscanProvider.getTransactionReceipt(
      history[i].hash
    );
    const gas = receipt.gasUsed.mul(receipt.effectiveGasPrice);

    if (history[i].data.startsWith("0x2520d5ee")) {
      delegates[idx].swapPositionsToVariableV2Mainnet =
        delegates[idx].swapPositionsToVariableV2Mainnet.add(gas);
    }
  }
}

async function getSafeWalletInteractions() {
  // const code = await etherscanProvider.getCode(
  //   "0xac140648435d03f784879cd789130F22Ef588Fcd"
  // );
  // // const code = await etherscanProvider.getCode(
  // //   "0xfb1bffc9d739b8d520daf37df666da4c687191ea"
  // // );
  // const code2 = await etherscanProvider.getCode(
  //   "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552"
  // );
  // etherscanProvider.im;
  // console.log("code: ", code);
  // console.log("code2: ", code2);

  // const safe = await isSafeWallet("0x464C71f6c2F760DdA6093dCB91C24c39e5d6e18c");
  // console.log("safe: ", safe);

  // const infuraProvider = new InfuraProvider(1, process.env.INFURA_API_KEY);
  // const requestFunc = ({ method, params }) =>
  //   infuraProvider.send(method, params);

  const history = await etherscanProvider.getHistory(
    ACI_ETH,
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
  // remove nulls
  addressesToCheck = addressesToCheck.filter((address) => address !== null);
  console.log("addressesToCheck 1", addressesToCheck);
  // remove duplicates
  addressesToCheck = addressesToCheck.filter(
    (v, i, a) => a.findIndex((t) => t.address === v.address) === i
  );

  console.log("addressesToCheck 2", addressesToCheck);

  for (const user of addressesToCheck) {
    const address = await isSafeWallet(user.address);
    console.log("user.address", user.address);
    console.log("pointedTo", address);
    if (address) {
      const gas = await getGasFromTx(user.txHash);
      console.log("address", address);
      console.log("gas", gas);
    }
  }

  // for (let i = 0; i < history.length; i++) {
  //   // console.log(history[i]);
  //   const to = history[i].to;
  //   // const target = await detectProxy(to, requestFunc);
  //   // console.log("target", target);
  //   const address = await isSafeWallet(to);
  //   console.log("to", to);
  //   // console.log("address", address);
  //   if (address) {
  //     const gas = await getGasFromTx(history[i].hash);
  //     console.log("to", to);
  //     console.log("gas", gas);
  //   }
  // }
}

// inspired from https://github.com/abipub/evm-proxy-detection
const isSafeWallet = async (proxyAddress) => {
  // https://github.com/safe-global/safe-deployments/tree/main/src/assets
  const canonicalAddressesMainnet = [
    "0x8942595a2dc5181df0465af0d7be08c8f23c93af", // v0.1.0 // found at https://help.safe.global/en/articles/40834-verify-safe-creation
    "0xb6029EA3B2c51D09a50B53CA8012FeEB05bDa35A", // v1.0.0
    "0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F", // v1.1.0
    "0x6851D6fDFAfD08c0295C392436245E5bc78B0185", // v1.2.0
    "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552", // v1.3.0
    "0x41675C099F32341bf84BFc5382aF534df5C7461a", // v1.4.0
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

    if (!canonicalAddressesMainnet.includes(address)) {
      return null;
    }

    return address;
  };

  const SAFE_PROXY_INTERFACE = [
    // bytes4(keccak256("masterCopy()")) padded to 32 bytes
    "0xa619486e00000000000000000000000000000000000000000000000000000000",
  ];

  const infuraProvider = new InfuraProvider(1, process.env.INFURA_API_KEY);
  const requestFunc = ({ method, params }) =>
    infuraProvider.send(method, params);

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
    // console.log("pointedAddress", pointedAddress);
    return readAddress(pointedAddress);
  } catch (error) {
    // console.error("Catch Error: ", error);
    return null;
  }
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
        .add(delegates[i].otherInteractions)
        .sub(delegates[i].withdrawals)
    );

    delegates[i].deposits = ethers.utils.formatEther(delegates[i].deposits);
    delegates[i].creationPayloads = ethers.utils.formatEther(
      delegates[i].creationPayloads
    );
    delegates[i].executionPayloads = ethers.utils.formatEther(
      delegates[i].executionPayloads
    );
    delegates[i].proposals = ethers.utils.formatEther(delegates[i].proposals);
    delegates[i].otherGouvernanceInteractions = ethers.utils.formatEther(
      delegates[i].otherGouvernanceInteractions
    );
    delegates[i].swapPositionsToVariableV2Mainnet = ethers.utils.formatEther(
      delegates[i].swapPositionsToVariableV2Mainnet
    );
    delegates[i].otherInteractions = ethers.utils.formatEther(
      delegates[i].otherInteractions
    );
    delegates[i].withdrawals = ethers.utils.formatEther(
      delegates[i].withdrawals
    );
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
      otherInteractions: ethers.BigNumber.from(0),
      otherGouvernanceInteractions: ethers.BigNumber.from(0),
      deposits: ethers.BigNumber.from(0),
      withdrawals: ethers.BigNumber.from(0),
      total: ethers.BigNumber.from(0),
    });
  }
}

main();
