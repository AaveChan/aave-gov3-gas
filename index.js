const ethers = require("ethers");
const fs = require("fs").promises;
require("dotenv").config();

const AAVE_GOVERNANCE = "0x9AEE0B04504CeF83A65AC3f0e838D0593BCb2BC7";
const AAVE_ETH_PAYLOAD_CONTROLLER =
  "0xdAbad81aF85554E9ae636395611C58F7eC1aAEc5";
const CONTRACT_0x914d = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";

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
  await getProposalsStats();
  if (payloads) await getPayloadsStats();
  await getOtherInteractions();
  await writeOutput();
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

async function writeOutput() {
  console.log("Writing output to file...");

  for (let i = 0; i < delegates.length; i++) {
    delegates[i].total = ethers.utils.formatEther(
      delegates[i].deposits
        .add(delegates[i].creationPayloads)
        .add(delegates[i].executionPayloads)
        .add(delegates[i].proposals)
        .add(delegates[i].otherGouvernanceInteractions)
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

  await fs.writeFile("./data/output.json", JSON.stringify(file, null, "\t"));
}

async function parseDelegates() {
  console.log("Parsing delegates from input file...");
  let data = await fs.readFile("./data/delegates.json", "utf-8");
  data = JSON.parse(data);

  for (let i = 0; i < data.length; i++) {
    delegates.push({
      name: data[i].name,
      addresses: data[i].addresses,
      proposals: ethers.BigNumber.from(0),
      creationPayloads: ethers.BigNumber.from(0),
      executionPayloads: ethers.BigNumber.from(0),
      otherInteractions: ethers.BigNumber.from(0),
      otherGouvernanceInteractions: ethers.BigNumber.from(0),
      deposits: ethers.BigNumber.from(0),
      withdrawals: ethers.BigNumber.from(0),
      total: ethers.BigNumber.from(0),
    });
  }
}

main();
