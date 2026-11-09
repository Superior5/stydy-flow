import { settings } from "../config.js";
import { connect } from "./index.js";
const connection = connect(settings.database);
connection.sqlite.close();
console.log(`Миграции применены: ${settings.database}`);
