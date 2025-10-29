import dotenv from "dotenv";

// Determine environment
const NODE_ENV = process.env.NODE_ENV || "development";
console.log(`🌍 Loading environment: ${NODE_ENV}`);

// Load environment-specific configuration
dotenv.config({ path: `.env.${NODE_ENV}` });
dotenv.config({ path: ".env" }); // Fallback to base .env

const environment = {
  // Environment
  NODE_ENV,

  // Server Configuration
  PORT: Number(process.env.PORT) || 3000,

  // Cardano Node
  CARDANO: {
    SOCKET_PATH:
      process.env.CARDANO_NODE_SOCKET_PATH || "/path/to/cardano/socket",
    NETWORK: process.env.CARDANO_NETWORK || "preprod",
    NETWORK_MAGIC: Number(process.env.CARDANO_NETWORK_MAGIC) || 1,
    CLI_PATH: process.env.CARDANO_CLI_PATH || "cardano-cli",
  },

  // Hydra Node
  HYDRA: {
    HOST: process.env.HYDRA_HOST || "127.0.0.1",
    PORT1: Number(process.env.HYDRA_PORT_1) || 4001,
    PORT2: Number(process.env.HYDRA_PORT_2) || 4002,
    WS_URL: process.env.HYDRA_WS_URL || "ws://127.0.0.1:4001",
    WS_URL_PEER: process.env.HYDRA_WS_URL_PEER || "ws://127.0.0.1:4002",
  },

  // Platform Credentials
  PLATFORM: {
    HYDRA_SIGNING_KEY:
      process.env.PLATFORM_HYDRA_SIGNING_KEY || "/path/to/platform-hydra.sk",
    CARDANO_SIGNING_KEY:
      process.env.PLATFORM_CARDANO_SIGNING_KEY || "/path/to/platform-funds.sk",

    ADDRESS_FILE:
      process.env.PLATFORM_CARDANO_ADDRESS || "/path/to/platform-address.addr",
    PEER_ADDRESS_FILE:
      process.env.PLATFORM_PEER_CARDANO_ADDRESS ||
      "/path/to/platform-peer-address.addr",
  },

  // Blockfrost (optional)
  BLOCKFROST: {
    PROJECT_ID: process.env.BLOCKFROST_PROJECT_ID || "",
    NETWORK: process.env.BLOCKFROST_NETWORK || "preprod",
  },

  // Database (MySQL)
  DATABASE: {
    HOST: process.env.DB_HOST || "localhost",
    USER: process.env.DB_USER || "root",
    PASSWORD: process.env.DB_PASSWORD || "root",
    NAME: process.env.DB_NAME || "hydra_gateway",
    PORT: Number(process.env.DB_PORT) || 3306,
  },

  // JWT Configuration
  JWT: {
    SECRET: process.env.JWT_SECRET || "your_jwt_secret",
    COOKIE_NAME: process.env.JWT_COOKIE_NAME || "token",
  },
};

export default environment;
