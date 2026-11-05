import { createDb } from "../src/db/client";
import { migrateDb } from "./migrate";

migrateDb(createDb())
  .then(() => {
    console.log("Migrazioni applicate.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
