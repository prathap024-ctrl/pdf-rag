//require('dotenv').config({path: "./env"})
import dotenv from "dotenv";
import { app } from "./app.js";
import { sql } from "drizzle-orm";
import { db } from "./db/db.js";

dotenv.config({
  path: "./.env",
});

try {
  app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is running at port: ${process.env.PORT}`);
  });
} catch (error) {
  console.error("Failed to start server!");
}

(async () => {
  try {
    const result = await db.execute(sql`SELECT 1`);
    console.log("✅ Connected to DB:", result);
  } catch (err) {
    console.error("❌ DB Connection failed:", err);
  }
})();

// import express from "express"
// const app = express()

// (async()=>{
//   try {
//     await mongoose.connect(`${process.env.MONGODB_URL}/${DB_NAME}`)
//     app.on("error", (error)=>{
//       console.log("ERR: ", error);
//       throw error
//     })

//     app.listen(process.env.PORT, ()=>{
//       console.log(`APP is listening on Port ${process.env.PORT}`);
//     })
//   } catch (error) {
//     console.error("ERROR: ", error)
//   }
// })()
