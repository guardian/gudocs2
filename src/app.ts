// import serverlessExpress from '@codegenie/serverless-express';
import { default as express } from "express";
import { doPublish, doSchedule, readDocuments, renderDashboard } from './actions';

export const createApp = (): express.Application => {

    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: true }));

    function serverError(err: unknown, response: express.Response) {
        console.error(`Unhandled error: ${JSON.stringify(err)}`)
        response.status(500).json({ error: "Internal server error"})
    }

    server.get("/documents", (_, response) => {
        readDocuments(undefined, undefined).then((r) => {
            response.json(r);
        }).catch((err) => serverError(err, response))
    });

    server.get("/", (_, response) => {
        renderDashboard().then((r) => {
            response.send(r);
        }).catch((err) => serverError(err, response))
    });

    server.post("/schedule", (_, response) => {
        doSchedule().then((r) => {
            response.json({
                result: r
            })
        }).catch((err) => serverError(err, response))
    });

    server.post("/publish", (request: express.Request<unknown, unknown, { id: string}>, response) => {
        const fileId = request.body.id;
        doPublish(fileId).then((r) => {
            response.json({
                result: r
            })
        }).catch((err) => serverError(err, response))
    });

    return server
}

// process.on('uncaughtException', err => {
//     console.log(err)
// })

// // exports.handler = serverlessExpress({ app: server })

// const PORT = 3030;
// server.listen(PORT, () => console.log(`Listening on port ${PORT}`));