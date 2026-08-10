import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`${env.NODE_ENV} server listening on http://localhost:${env.PORT}`);
});
