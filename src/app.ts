// import serverlessExpress from '@codegenie/serverless-express';
import { default as express, type RequestHandler } from "express";
import { doPublish, doSchedule, getConfig, readDocuments, renderDashboard } from './actions';
import { getAuthMiddleware } from "./auth-midleware";
import { IS_RUNNING_LOCALLY } from "./awsIntegration";

export const createApp = async (): Promise<express.Application> => {

    const server = express();
    server.use(express.json());
    server.use(express.urlencoded({ extended: true }));

    function serverError(err: unknown, response: express.Response) {
        console.error(`Unhandled error: ${JSON.stringify(err)}`)
        response.status(500).json({ error: "Internal server error"})
    }

    const config = await getConfig();

    const authMiddleWare = getAuthMiddleware(config.baseUrl) as RequestHandler<object, unknown, unknown, unknown> // Maybe can remove this cast at some point. See https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871

    server.get("/documents", authMiddleWare, (_, response) => {
        readDocuments(config, undefined, undefined).then((r) => {
            response.json(r);
        }).catch((err) => serverError(err, response))
    });

    server.get("/", authMiddleWare, (_, response) => {
        renderDashboard(config).then((r) => {
            response.send(r);
        }).catch((err) => serverError(err, response))
    });

    if (IS_RUNNING_LOCALLY) {
        server.post("/schedule", (_, response) => {
            doSchedule(config).then((r) => {
                response.json({
                    result: r
                })
            }).catch((err) => serverError(err, response))
        });
    }

    server.post("/publish", authMiddleWare, (request: express.Request<unknown, unknown, { id: string}>, response) => {
        const fileId = request.body.id;
        doPublish(config, fileId).then(() => {
            response.redirect("/")
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