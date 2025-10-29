import { Sequelize } from "sequelize";
import environment from "../config/environment";

const sequelize = new Sequelize(
  environment.DATABASE.NAME!,
  environment.DATABASE.USER!,
  environment.DATABASE.PASSWORD!,
  {
    host: environment.DATABASE.HOST,
    port: environment.DATABASE.PORT,
    dialect: "mysql",

    logging: (msg) => {
      // Only log actual SQL error messages, not column names containing "error"
      if (
        msg.toLowerCase().includes("sql error") ||
        msg.toLowerCase().includes("mysql error") ||
        msg.toLowerCase().includes("syntax error")
      ) {
        console.error("Sequelize Error:", msg);
      }
    },

    pool: {
      max: environment.NODE_ENV === "production" ? 20 : 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

export default sequelize;
