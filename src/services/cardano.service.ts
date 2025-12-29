import {
  applyDoubleCborEncoding,
  Blockfrost,
  Constr,
  Data,
  Lucid,
  Network,
  Provider,
  Validator,
  validatorToAddress,
} from "@evolution-sdk/lucid";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import environment from "../config/environment";

const execAsync = promisify(exec);

interface UTxO {
  txHash: string;
  txIndex: number;
  amount: {
    lovelace: number;
    assets?: Record<string, number>;
  };
  address: string;
  datumHash?: string;
  inlineDatum?: string;
}

interface TransactionOutput {
  address: string;
  amount: number;
  assets?: Record<string, number>;
}

interface BuildTransactionParams {
  inputs: UTxO[];
  outputs: TransactionOutput[];
  changeAddress: string;
  metadata?: Record<string, any>;
}

export class CardanoService {
  private cliPath: string;
  private network: string;
  private networkMagic?: number;
  private socketPath: string;
  private protocolParamsPath: string;

  constructor() {
    this.cliPath = environment.CARDANO.CLI_PATH || "cardano-cli";
    this.network = environment.CARDANO.NETWORK || "testnet";
    this.networkMagic = environment.CARDANO.NETWORK_MAGIC;
    this.socketPath = environment.CARDANO.SOCKET_PATH || "/tmp/node.socket";
    this.protocolParamsPath = path.join(
      process.cwd(),
      "protocol-parameters.json"
    );
  }

  /**
   * Get connection status for all nodes
   */
  getNodeStatus(): { network: string; socketPath: string } {
    return {
      network: environment.CARDANO.NETWORK,
      socketPath: environment.CARDANO.SOCKET_PATH,
    };
  }

  /**
   * Query UTxOs for a given address
   */
  async queryUtxos(address: string): Promise<UTxO[]> {
    try {
      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      const command = [
        this.cliPath,
        "query",
        "utxo",
        "--address",
        address,
        networkArg,
        "--socket-path",
        this.socketPath,
        "--output-json", // ADD THIS FLAG FOR JSON OUTPUT
      ].join(" ");

      const { stdout } = await execAsync(command);
      return this.parseUtxoOutput(stdout, address);
    } catch (error: any) {
      console.error("Error querying UTxOs:", error);
      throw new Error(`Failed to query UTxOs: ${error.message}`);
    }
  }

  /**
   * Get total balance for an address (in lovelace)
   */
  async getAddressBalance(
    address: string
  ): Promise<{ balance: number; utxos: UTxO[] }> {
    const utxos = await this.queryUtxos(address);
    const balance: number = utxos.reduce(
      (total, utxo) => total + utxo.amount.lovelace,
      0
    );
    return { balance, utxos };
  }

  /**
   * Parse UTxO output from cardano-cli
   */
  private parseUtxoOutput(output: string, address: string): UTxO[] {
    try {
      // Handle empty output
      if (!output || output.trim() === "" || output.trim() === "{}") {
        return [];
      }

      const data = JSON.parse(output);
      const utxos: UTxO[] = [];

      for (const [key, value] of Object.entries(data)) {
        const [txHash, txIndex] = key.split("#");
        const utxoData = value as any;

        const utxo: UTxO = {
          txHash,
          txIndex: parseInt(txIndex),
          amount: {
            lovelace: 0,
          },
          address,
        };

        // Parse value - cardano-cli returns it as an object with "lovelace" key
        if (utxoData.value) {
          if (typeof utxoData.value === "number") {
            // Old format: just a number
            utxo.amount.lovelace = utxoData.value;
          } else if (typeof utxoData.value === "object") {
            // New format: object with lovelace and optional assets
            utxo.amount.lovelace = utxoData.value.lovelace || 0;

            // Parse native assets if present
            const assets: Record<string, number> = {};
            for (const [assetKey, assetValue] of Object.entries(
              utxoData.value
            )) {
              if (assetKey !== "lovelace") {
                assets[assetKey] = assetValue as number;
              }
            }
            if (Object.keys(assets).length > 0) {
              utxo.amount.assets = assets;
            }
          }
        }

        // Parse datum if present
        if (utxoData.inlineDatum) {
          utxo.inlineDatum = JSON.stringify(utxoData.inlineDatum);
        }

        if (utxoData.inlineDatumhash) {
          utxo.datumHash = utxoData.inlineDatumhash;
        } else if (utxoData.datumHash) {
          utxo.datumHash = utxoData.datumHash;
        }

        utxos.push(utxo);
      }

      return utxos;
    } catch (error) {
      console.error("Error parsing UTxO output:", error);
      console.error("Raw output:", output.substring(0, 500)); // Log first 500 chars
      return [];
    }
  }

  /**
   * Get protocol parameters
   */
  async getProtocolParameters(): Promise<any> {
    try {
      const data = await fs.readFile(this.protocolParamsPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      // If file doesn't exist, query and save it
      return await this.updateProtocolParameters();
    }
  }

  /**
   * Update protocol parameters from the network
   */
  async updateProtocolParameters(): Promise<any> {
    try {
      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      const command = [
        this.cliPath,
        "query",
        "protocol-parameters",
        networkArg,
        "--socket-path",
        this.socketPath,
        "--out-file",
        this.protocolParamsPath,
      ].join(" ");

      await execAsync(command);

      const data = await fs.readFile(this.protocolParamsPath, "utf-8");
      return JSON.parse(data);
    } catch (error: any) {
      throw new Error(`Failed to update protocol parameters: ${error.message}`);
    }
  }

  /**
   * Build a transaction draft to calculate fees
   */
  async buildTransactionDraft(params: BuildTransactionParams): Promise<string> {
    const draftFile = `/tmp/tx-draft-${Date.now()}.raw`;

    try {
      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      // Build tx-in arguments
      const txInArgs = params.inputs
        .map((input) => `--tx-in ${input.txHash}#${input.txIndex}`)
        .join(" ");

      // Build tx-out arguments
      const txOutArgs = params.outputs
        .map((output) => {
          let amountStr = `${output.amount}`;
          if (output.assets) {
            for (const [asset, quantity] of Object.entries(output.assets)) {
              amountStr += `+"${quantity} ${asset}"`;
            }
          }
          return `--tx-out ${output.address}+${amountStr}`;
        })
        .join(" ");

      const command = [
        this.cliPath,
        "conway",
        "transaction",
        "build-raw",
        txInArgs,
        txOutArgs,
        "--fee 0",
        `--out-file ${draftFile}`,
      ].join(" ");

      await execAsync(command);
      return draftFile;
    } catch (error: any) {
      throw new Error(`Failed to build transaction draft: ${error.message}`);
    }
  }

  /**
   * Calculate transaction fee
   */
  async calculateFee(
    draftTxFile: string,
    txInCount: number,
    txOutCount: number,
    witnessCount: number = 1
  ): Promise<number> {
    try {
      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      const command = [
        this.cliPath,
        "conway",
        "transaction",
        "calculate-min-fee",
        `--tx-body-file ${draftTxFile}`,
        `--tx-in-count ${txInCount}`,
        `--tx-out-count ${txOutCount}`,
        `--witness-count ${witnessCount}`,
        networkArg,
        `--protocol-params-file ${this.protocolParamsPath}`,
      ].join(" ");

      const { stdout } = await execAsync(command);
      // Output format: "123456 Lovelace"
      const fee = parseInt(stdout.trim().split(" ")[0]);
      return fee;
    } catch (error: any) {
      throw new Error(`Failed to calculate fee: ${error.message}`);
    }
  }

  /**
   * Build a complete transaction with proper fee calculation
   */
  async buildTransaction(
    params: BuildTransactionParams
  ): Promise<{ txBodyFile: string; fee: number }> {
    const txBodyFile = `/tmp/tx-body-${Date.now()}.raw`;

    try {
      // First, build a draft to calculate fees
      const draftFile = await this.buildTransactionDraft(params);

      // Calculate the fee
      const fee = await this.calculateFee(
        draftFile,
        params.inputs.length,
        params.outputs.length + 1 // +1 for change output
      );

      console.log("fee", fee);

      // Calculate total input
      const totalInput = params.inputs.reduce(
        (sum, input) => sum + input.amount.lovelace,
        0
      );

      // Calculate total output
      const totalOutput = params.outputs.reduce(
        (sum, output) => sum + output.amount,
        0
      );

      // Calculate change
      const change = totalInput - totalOutput - fee;

      if (change < 0) {
        throw new Error(
          `Insufficient funds. Need ${
            totalOutput + fee
          } lovelace, have ${totalInput} lovelace`
        );
      }

      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      // Get current slot
      const tip = await this.queryTip();
      const ttl = tip.slot + 1000; // Valid for ~1000 slots (~20 minutes)

      // Build tx-in arguments
      const txInArgs = params.inputs
        .map((input) => `--tx-in ${input.txHash}#${input.txIndex}`)
        .join(" ");

      // Build tx-out arguments (including change)
      const allOutputs = [
        ...params.outputs,
        { address: params.changeAddress, amount: change },
      ];

      const txOutArgs = allOutputs
        .map((output) => {
          let amountStr = `${output.amount}`;
          if (output.assets) {
            for (const [asset, quantity] of Object.entries(output.assets)) {
              amountStr += `+"${quantity} ${asset}"`;
            }
          }
          return `--tx-out ${output.address}+${amountStr}`;
        })
        .join(" ");

      // Build metadata arguments if present
      const metadataArgs = params.metadata
        ? `--metadata-json-file ${await this.writeMetadata(params.metadata)}`
        : "";

      const command = [
        this.cliPath,
        "conway",
        "transaction",
        "build-raw",
        txInArgs,
        txOutArgs,
        `--fee ${fee}`,
        `--invalid-hereafter ${ttl}`,
        metadataArgs,
        `--out-file ${txBodyFile}`,
      ].join(" ");

      await execAsync(command);

      // Clean up draft file
      await fs.unlink(draftFile).catch(() => {});

      return { txBodyFile, fee };
    } catch (error: any) {
      throw new Error(`Failed to build transaction: ${error.message}`);
    }
  }

  /**
   * Sign a transaction
   */
  async signTransaction(
    txBodyFile: string,
    signingKeyFiles: string[]
  ): Promise<string> {
    const signedTxFile = `/tmp/tx-signed-${Date.now()}.signed`;

    try {
      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      const signingKeyArgs = signingKeyFiles
        .map((keyFile) => `--signing-key-file ${keyFile}`)
        .join(" ");

      const command = [
        this.cliPath,
        "conway",
        "transaction",
        "sign",
        `--tx-body-file ${txBodyFile}`,
        signingKeyArgs,
        networkArg,
        `--out-file ${signedTxFile}`,
      ].join(" ");

      await execAsync(command);
      return signedTxFile;
    } catch (error: any) {
      throw new Error(`Failed to sign transaction: ${error.message}`);
    }
  }

  /**
   * Submit a signed transaction
   */
  async submitTransaction(signedTxFile: string): Promise<string> {
    try {
      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      const command = [
        this.cliPath,
        "conway",
        "transaction",
        "submit",
        `--tx-file ${signedTxFile}`,
        networkArg,
        "--socket-path",
        this.socketPath,
      ].join(" ");

      const { stdout } = await execAsync(command);

      // Extract transaction ID from the signed file
      const txId = await this.getTxIdFromFile(signedTxFile);

      // Clean up temporary files
      await fs.unlink(signedTxFile).catch(() => {});

      return txId;
    } catch (error: any) {
      throw new Error(`Failed to submit transaction: ${error.message}`);
    }
  }

  /**
   * Get transaction ID from signed transaction file
   */
  async getTxIdFromFile(signedTxFile: string): Promise<string> {
    try {
      const command = [
        this.cliPath,
        "transaction",
        "txid",
        `--tx-file ${signedTxFile}`,
      ].join(" ");

      const { stdout } = await execAsync(command);
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Failed to get transaction ID: ${error.message}`);
    }
  }

  /**
   * Query chain tip
   */
  /**
   * Query chain tip
   */
  async queryTip(): Promise<{
    slot: number;
    block: number;
    epoch: number;
    era: string;
    hash: string;
    slotInEpoch: number;
    slotsToEpochEnd: number;
    syncProgress: string;
  }> {
    try {
      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      const command = [
        this.cliPath,
        "query",
        "tip",
        networkArg,
        "--socket-path",
        this.socketPath,
      ].join(" ");

      const { stdout } = await execAsync(command);
      const tip = JSON.parse(stdout);

      return {
        slot: tip.slot,
        block: tip.block,
        epoch: tip.epoch,
        era: tip.era,
        hash: tip.hash,
        slotInEpoch: tip.slotInEpoch,
        slotsToEpochEnd: tip.slotsToEpochEnd,
        syncProgress: tip.syncProgress,
      };
    } catch (error: any) {
      throw new Error(`Failed to query tip: ${error.message}`);
    }
  }

  /**
   * Write metadata to temporary file
   */
  private async writeMetadata(metadata: Record<string, any>): Promise<string> {
    const metadataFile = `/tmp/metadata-${Date.now()}.json`;
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    return metadataFile;
  }

  /**
   * Monitor address for incoming transactions (for deposits)
   */
  async monitorDeposits(
    address: string,
    callback: (utxos: UTxO[]) => void,
    pollInterval: number = 10000
  ): Promise<() => void> {
    let previousUtxos: Set<string> = new Set();

    const poll = async () => {
      try {
        const currentUtxos = await this.queryUtxos(address);
        const currentUtxoKeys = new Set(
          currentUtxos.map((u) => `${u.txHash}#${u.txIndex}`)
        );

        // Find new UTxOs
        const newUtxos = currentUtxos.filter(
          (utxo) => !previousUtxos.has(`${utxo.txHash}#${utxo.txIndex}`)
        );

        if (newUtxos.length > 0) {
          callback(newUtxos);
        }

        previousUtxos = currentUtxoKeys;
      } catch (error) {
        console.error("Error monitoring deposits:", error);
      }
    };

    // Initial poll
    await poll();

    // Set up interval
    const intervalId = setInterval(poll, pollInterval);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }

  /**
   * Read address from file (for platform wallets)
   */
  async readAddressFromFile(filePath: string): Promise<string> {
    try {
      const address = await fs.readFile(filePath, "utf-8");
      return address.trim();
    } catch (error: any) {
      throw new Error(`Failed to read address file: ${error.message}`);
    }
  }

  /**
   * Helper: Build and submit a payment transaction (ADA only)
   * - Uses ALL UTxOs from fromAddress
   * - Uses `cardano-cli conway transaction build` (auto fee + change)
   */
  async sendPayment(
    fromAddress: string,
    toAddress: string,
    amount: number, // in lovelace
    signingKeyFile: string,
    platformFee: number
  ): Promise<string> {
    try {
      // 1) Collect all UTxOs for the sender
      const { utxos, balance } = await this.getAddressBalance(fromAddress);

      if (utxos.length === 0) {
        throw new Error("No UTxOs available for payment");
      }

      console.log(`Total input: ${balance} lovelace`);
      const withdrawalAmount = amount - platformFee;

      if (balance < amount) {
        throw new Error(
          `Insufficient funds: have ${balance} lovelace, need at least ${amount}`
        );
      }

      // Build `--tx-in` args like: "--tx-in hash0#ix0 --tx-in hash1#ix1 ..."
      const txInArgs = utxos
        .map((u) => `--tx-in ${u.txHash}#${u.txIndex}`)
        .join(" ");

      const networkArg =
        this.network === "mainnet"
          ? "--mainnet"
          : `--testnet-magic ${this.networkMagic}`;

      const txBodyFile = `/tmp/tx-body-${Date.now()}.raw`;
      const signedTxFile = `/tmp/tx-signed-${Date.now()}.signed`;

      // 2) Build the transaction (fee + change auto-calculated)
      // Equivalent to your bash:
      // cardano-cli conway transaction build \
      //   $NETWORK \
      //   --tx-in ... \
      //   --tx-out "TO_ADDR+AMOUNT" \
      //   --change-address FROM_ADDR \
      //   --out-file tx.body
      const buildCmd = [
        this.cliPath,
        "conway",
        "transaction",
        "build",
        networkArg,
        "--socket-path",
        this.socketPath,
        txInArgs,
        `--tx-out ${toAddress}+${withdrawalAmount}`,
        `--change-address ${fromAddress}`,
        `--out-file ${txBodyFile}`,
      ].join(" ");

      console.log("BUILD CMD:", buildCmd);

      try {
        const { stdout, stderr } = await execAsync(buildCmd);
        if (stderr && stderr.trim().length > 0) {
          console.log("build stderr:", stderr);
        }
        if (stdout && stdout.trim().length > 0) {
          console.log("build stdout:", stdout);
        }
      } catch (e: any) {
        throw new Error(
          `Failed to build transaction.\nCMD: ${buildCmd}\nERR: ${
            e.message
          }\nSTDERR: ${e.stderr ?? ""}`
        );
      }

      // 3) Sign the transaction
      const networkArgForSign = networkArg; // same flag

      const signCmd = [
        this.cliPath,
        "conway",
        "transaction",
        "sign",
        "--tx-body-file",
        txBodyFile,
        "--signing-key-file",
        signingKeyFile,
        networkArgForSign,
        "--out-file",
        signedTxFile,
      ].join(" ");

      console.log("SIGN CMD:", signCmd);

      try {
        const { stdout, stderr } = await execAsync(signCmd);
        if (stderr && stderr.trim().length > 0) {
          console.log("sign stderr:", stderr);
        }
        if (stdout && stdout.trim().length > 0) {
          console.log("sign stdout:", stdout);
        }
      } catch (e: any) {
        throw new Error(
          `Failed to sign transaction.\nCMD: ${signCmd}\nERR: ${
            e.message
          }\nSTDERR: ${e.stderr ?? ""}`
        );
      }

      // 4) Submit the transaction
      const submitCmd = [
        this.cliPath,
        "conway",
        "transaction",
        "submit",
        networkArg,
        "--socket-path",
        this.socketPath,
        "--tx-file",
        signedTxFile,
      ].join(" ");

      console.log("SUBMIT CMD:", submitCmd);

      try {
        const { stdout, stderr } = await execAsync(submitCmd);
        if (stderr && stderr.trim().length > 0) {
          console.log("submit stderr:", stderr);
        }
        if (stdout && stdout.trim().length > 0) {
          console.log("submit stdout:", stdout);
        }
      } catch (e: any) {
        throw new Error(
          `Failed to submit transaction.\nCMD: ${submitCmd}\nERR: ${
            e.message
          }\nSTDERR: ${e.stderr ?? ""}`
        );
      }

      // 5) Get tx id (like your bash script)
      const txIdCmd = [
        this.cliPath,
        "conway",
        "transaction",
        "txid",
        "--tx-file",
        signedTxFile,
      ].join(" ");

      const { stdout: txIdStdout } = await execAsync(txIdCmd);
      const txId = txIdStdout.trim();
      console.log("TX ID:", txId);

      // Cleanup
      await fs.unlink(txBodyFile).catch(() => {});
      await fs.unlink(signedTxFile).catch(() => {});

      return txId;
    } catch (error: any) {
      throw new Error(`Payment failed: ${error.message}`);
    }
  }

  // Lock utxo's from platform fund to always sucess smart contract
  async lockUtxos(): Promise<string> {
    try {
      const cbor = environment.SMART_CONTRACT.ALWAYS_SUCCESS;

      const Script = applyDoubleCborEncoding(cbor);

      const validator: Validator = {
        type: "PlutusV3",
        script: Script,
      };

      console.log(validator);

      const validatorAddress = validatorToAddress("Preprod", validator);

      console.log(validatorAddress);

      // let's use lucid as well

      const BLOCKFROST_API_URL = "https://cardano-preprod.blockfrost.io/api/v0";
      const BLOCKFROST_API_KEY = "preprodN1EZYj11zL89jJeaAjeRybxYMLp7grmn";

      const provider: Provider = new Blockfrost(
        BLOCKFROST_API_URL,
        BLOCKFROST_API_KEY
      );

      const network: Network = "Preprod";

      const lucid = await Lucid(provider, network);
      lucid.selectWallet.fromSeed(
        "zebra shoot wealth song goose marine surround image school social famous solution odor praise time ski cliff marble young upset inch day search exercise"
      );

      // const tx = await lucid
      //   .newTx()
      //   .pay.ToAddressWithData(
      //     validatorAddress,
      //     undefined,
      //     { lovelace: 200_000_000n },
      //     validator
      //   )
      //   .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
      //   .complete();

      // const txSigned = await tx.sign.withWallet().complete();
      // const txHash = await txSigned.submit();

      // console.log(txHash);

      return "txHash";
    } catch (error: any) {
      throw new Error(`Failed to lock utxos: ${error.message}`);
    }
  }

  async unlockUtxos(): Promise<string> {
    try {
      const cbor = environment.SMART_CONTRACT.ALWAYS_SUCCESS;

      const Script = applyDoubleCborEncoding(cbor);

      const validator: Validator = {
        type: "PlutusV3",
        script: Script,
      };
      const validatorAddress = validatorToAddress("Preprod", validator);

      console.log(validatorAddress);

      // let's use lucid as well

      const BLOCKFROST_API_URL = "https://cardano-preprod.blockfrost.io/api/v0";
      const BLOCKFROST_API_KEY = "preprodN1EZYj11zL89jJeaAjeRybxYMLp7grmn";

      const provider: Provider = new Blockfrost(
        BLOCKFROST_API_URL,
        BLOCKFROST_API_KEY
      );

      const network: Network = "Preprod";

      const lucid = await Lucid(provider, network);
      lucid.selectWallet.fromSeed(
        "zebra shoot wealth song goose marine surround image school social famous solution odor praise time ski cliff marble young upset inch day search exercise"
      );

      const validatorUtxo = await lucid.utxosAt(validatorAddress);
      console.log(validatorUtxo.length);

      const tx = await lucid
        .newTx()
        .collectFrom(validatorUtxo, Data.to(new Constr(0, [])))
        .attach.Script(validator)
        .complete();

      const txSigned = await tx.sign.withWallet().complete();
      const txHash = await txSigned.submit();

      console.log(txHash);

      return txHash;
    } catch (error: any) {
      console.log(error);
      throw new Error(`Failed to lock utxos: ${error.message}`);
    }
  }
}
