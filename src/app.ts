// import serverlessExpress from '@codegenie/serverless-express';
import { default as express } from "express";
import { doPublish, doSchedule, readDocuments, renderDashboard } from './index';

export const createApp = (): express.Application => {

    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: true }));

    function serverError(response: express.Response) {
        response.status(500).json({ error: "Internal server error"})
    }

    server.get("/documents", (_, response) => {
        readDocuments(undefined, undefined).then((r) => {
            response.json(r);
        }).catch(() => serverError(response))
    });

    server.get("/", (_, response) => {
        renderDashboard().then((r) => {
            response.send(r);
        }).catch(() => serverError(response))
    });

    server.post("/schedule", (_, response) => {
        doSchedule().then((r) => {
            response.json({
                result: r
            })
        }).catch(() => serverError(response))
    });

    server.post("/publish", (request: express.Request<unknown, unknown, { id: string}>, response) => {
        const fileId = request.body.id;
        doPublish(fileId).then((r) => {
            response.json({
                result: r
            })
        }).catch(() => serverError(response))
    });

    return server
}

// process.on('uncaughtException', err => {
//     console.log(err)
// })

// // exports.handler = serverlessExpress({ app: server })

// const PORT = 3030;
// server.listen(PORT, () => console.log(`Listening on port ${PORT}`));