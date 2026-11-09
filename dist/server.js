import { createApp } from "./app.js";
import { connect } from "./db/index.js";
import { settings } from "./config.js";
const c = connect(settings.database), app = createApp(c);
const server = app.listen(settings.port, "127.0.0.1", () => console.log(`StudyFlow API: http://127.0.0.1:${settings.port}`));
for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close(() => {
        app.locals.sessionStore.close();
        c.sqlite.close();
        process.exit(0);
    }));
